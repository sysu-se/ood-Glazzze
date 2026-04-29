/**
 * Game 类 - 代表一场数独游戏的核心逻辑
 * 职责：
 * - 持有当前的 Sudoku 实例
 * - 管理操作历史（Undo/Redo）
 * - 提供游戏级别的接口（guess, undo, redo）
 * - 追踪游戏状态
 */

import { Sudoku, createSudokuFromJSON } from './sudoku.js';

export class Game {
  /**
   * @param {Object} options - 配置对象
   * @param {Sudoku} options.sudoku - 初始的 Sudoku 实例
   */
  constructor(options) {
    const { sudoku } = options;

    if (!sudoku || !(sudoku instanceof Sudoku)) {
      throw new Error('Game requires a Sudoku instance');
    }

    // 持有当前 Sudoku：当前游戏的 Sudoku 状态
    this.currentSudoku = sudoku;

    // 保留初始 Sudoku，供序列化和恢复使用
    this.initialSudoku = sudoku.clone();

    // 管理历史：只存储可重放的操作日志，而不是整盘快照
    this.history = [];

    // 当前位置指针：表示已经应用了多少条操作
    this.currentIndex = 0;

    // 探索会话：仅在进入 explore 模式后存在
    this.exploreSession = null;
  }

  /**
   * 用户猜测 - 修改棋盘并记录历史
   * @param {Object} move - { row, col, value }
   */
  //对外提供面向 UI 的游戏操作入口：guess() 方法，用户输入数字，修改 userGrid，并记录历史
  guess(move) {
    if (!move || typeof move !== 'object') {
      throw new Error('Invalid move: expected { row, col, value } object');
    }

    const { row, col } = move;
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 8 || col < 0 || col > 8) {
      throw new Error(`Invalid move position: row=${row}, col=${col}`);
    }

    const previousValue = this.currentSudoku.getGrid()[row][col];

    // 执行 guess；若领域规则拒绝该 move，保持历史不变
    this.currentSudoku.guess(move);

    const nextValue = this.currentSudoku.getGrid()[row][col];

    // 没有实际变化时，不写入历史，也不清空 redo 历史
    if (previousValue === nextValue) {
      return;
    }

    // 仅在成功且有实际变化时才清空 redo 栈
    if (this.currentIndex < this.history.length) {
      this.history = this.history.slice(0, this.currentIndex);
    }

    // 当前操作加入历史
    this.history.push({
      type: 'guess',
      move: { ...move },
      previousValue,
    });
    this.currentIndex++;

    if (this.exploreSession) {
      this._updateExploreStatusAfterMove();
      this._syncCurrentExploreBranchSnapshot();
    }
  }

  /**
   * 进入探索模式
   * @returns {boolean}
   */
  startExplore() {
    if (this.exploreSession) {
      return false;
    }

    const rootBranch = {
      id: 0,
      parentId: null,
      label: 'root',
      sudoku: this.currentSudoku.clone(),
      history: this._cloneHistory(this.history),
      index: this.currentIndex,
    };

    this.exploreSession = {
      startSudoku: this.currentSudoku.clone(),
      startHistory: this._cloneHistory(this.history),
      startIndex: this.currentIndex,
      failedFingerprints: new Set(),
      status: 'active',
      branches: new Map([[rootBranch.id, rootBranch]]),
      currentBranchId: rootBranch.id,
      nextBranchId: 1,
    };

    return true;
  }

  /**
   * 当前是否处于探索模式
   * @returns {boolean}
   */
  isExploring() {
    return this.exploreSession !== null;
  }

  /**
   * 回溯到本次探索的起点
   * @returns {boolean}
   */
  backtrackExplore() {
    if (!this.exploreSession) {
      return false;
    }

    this.currentSudoku = this.exploreSession.startSudoku.clone();
    this.history = this._cloneHistory(this.exploreSession.startHistory);
    this.currentIndex = this.exploreSession.startIndex;
    this.exploreSession.status = 'active';
    this.exploreSession.currentBranchId = 0;
    this._syncCurrentExploreBranchSnapshot();

    return true;
  }

  /**
   * 探索模式内是否可撤销
   * @returns {boolean}
   */
  canExploreUndo() {
    return !!this.exploreSession && this.currentIndex > this.exploreSession.startIndex;
  }

  /**
   * 探索模式内是否可重做
   * @returns {boolean}
   */
  canExploreRedo() {
    return !!this.exploreSession && this.currentIndex < this.history.length;
  }

  /**
   * 探索模式内撤销（不会越过探索起点）
   * @returns {boolean}
   */
  exploreUndo() {
    if (!this.canExploreUndo()) {
      return false;
    }

    const operation = this.history[this.currentIndex - 1];
    this.currentSudoku.guess({
      row: operation.move.row,
      col: operation.move.col,
      value: operation.previousValue,
    });
    this.currentIndex--;
    this._refreshExploreStatusAfterTimelineMove();
    this._syncCurrentExploreBranchSnapshot();

    return true;
  }

  /**
   * 探索模式内重做
   * @returns {boolean}
   */
  exploreRedo() {
    if (!this.canExploreRedo()) {
      return false;
    }

    const operation = this.history[this.currentIndex];
    this.currentSudoku.guess({
      row: operation.move.row,
      col: operation.move.col,
      value: operation.move.value,
    });
    this.currentIndex++;
    this._refreshExploreStatusAfterTimelineMove();
    this._syncCurrentExploreBranchSnapshot();

    return true;
  }

  /**
   * 从当前局面创建探索分支
   * @param {string} label
   * @returns {number|null}
   */
  createExploreBranch(label = '') {
    if (!this.exploreSession) {
      return null;
    }

    const branchId = this.exploreSession.nextBranchId++;
    this.exploreSession.branches.set(branchId, {
      id: branchId,
      parentId: this.exploreSession.currentBranchId,
      label: typeof label === 'string' && label.trim() ? label.trim() : `branch-${branchId}`,
      sudoku: this.currentSudoku.clone(),
      history: this._cloneHistory(this.history),
      index: this.currentIndex,
    });

    return branchId;
  }

  /**
   * 切换到指定探索分支
   * @param {number} branchId
   * @returns {boolean}
   */
  switchExploreBranch(branchId) {
    if (!this.exploreSession || !Number.isInteger(branchId)) {
      return false;
    }

    const branch = this.exploreSession.branches.get(branchId);
    if (!branch) {
      return false;
    }

    this.currentSudoku = branch.sudoku.clone();
    this.history = this._cloneHistory(branch.history);
    this.currentIndex = branch.index;
    this.exploreSession.currentBranchId = branchId;
    this._refreshExploreStatusAfterTimelineMove();

    return true;
  }

  /**
   * 列出探索分支树（扁平结构）
   * @returns {Array<{id:number,parentId:number|null,label:string,current:boolean}>}
   */
  listExploreBranches() {
    if (!this.exploreSession) {
      return [];
    }

    return Array.from(this.exploreSession.branches.values())
      .sort((a, b) => a.id - b.id)
      .map(branch => ({
        id: branch.id,
        parentId: branch.parentId,
        label: branch.label,
        current: branch.id === this.exploreSession.currentBranchId,
      }));
  }

  /**
   * 提交探索结果：保留当前局面并退出探索模式
   * @returns {boolean}
   */
  commitExplore() {
    if (!this.exploreSession) {
      return false;
    }

    if (!this.currentSudoku.validate().valid) {
      return false;
    }

    this._syncCurrentExploreBranchSnapshot();

    this.exploreSession = null;
    return true;
  }

  /**
   * 放弃探索结果：恢复到探索起点并退出探索模式
   * @returns {boolean}
   */
  cancelExplore() {
    if (!this.exploreSession) {
      return false;
    }

    this.currentSudoku = this.exploreSession.startSudoku.clone();
    this.history = this._cloneHistory(this.exploreSession.startHistory);
    this.currentIndex = this.exploreSession.startIndex;
    this.exploreSession = null;

    return true;
  }

  /**
   * 获取探索状态
   * @returns {{ active: boolean, status: string, hasConflict: boolean, revisitedFailedPath: boolean, startIndex: number|null }}
   */
  getExploreStatus() {
    if (!this.exploreSession) {
      return {
        active: false,
        status: 'idle',
        hasConflict: false,
        revisitedFailedPath: false,
        startIndex: null,
        currentBranchId: null,
        branchCount: 0,
        canExploreUndo: false,
        canExploreRedo: false,
      };
    }

    const status = this.exploreSession.status;
    return {
      active: true,
      status,
      hasConflict: status === 'conflict' || status === 'revisited-failed',
      revisitedFailedPath: status === 'revisited-failed',
      startIndex: this.exploreSession.startIndex,
      currentBranchId: this.exploreSession.currentBranchId,
      branchCount: this.exploreSession.branches.size,
      canExploreUndo: this.canExploreUndo(),
      canExploreRedo: this.canExploreRedo(),
    };
  }

  /**
   * undo：撤销上一步操作
   */
  undo() {
    if (this.canUndo()) {
      const operation = this.history[this.currentIndex - 1];
      this.currentSudoku.guess({
        row: operation.move.row,
        col: operation.move.col,
        value: operation.previousValue,
      });
      this.currentIndex--;

      this._refreshExploreStatusAfterTimelineMove();
      this._syncCurrentExploreBranchSnapshot();
    }
  }

  /**
   * redo：重做下一步操作
   */
  redo() {
    if (this.canRedo()) {
      const operation = this.history[this.currentIndex];
      this.currentSudoku.guess({
        row: operation.move.row,
        col: operation.move.col,
        value: operation.move.value,
      });
      this.currentIndex++;

      this._refreshExploreStatusAfterTimelineMove();
      this._syncCurrentExploreBranchSnapshot();
    }
  }

  /**
   * 检查是否可以撤销
   * @returns {boolean}
   */
  canUndo() {
    return this.currentIndex > 0;
  }

  /**
   * 检查是否可以重做
   * @returns {boolean}
   */
  canRedo() {
    return this.currentIndex < this.history.length;
  }

  /**
   * 获取当前的 Sudoku 实例
   * @returns {Sudoku}
   */
  getSudoku() {
    return this.currentSudoku;
  }

  /**
   * 获取指定单元格的候选数
   * @param {number} row
   * @param {number} col
   * @returns {number[]}
   */
  getCandidates(row, col) {
    // Game 不自己重复计算候选数，只把当前局面的查询转发给 Sudoku。
    return this.currentSudoku.getCandidates(row, col);
  }

  /**
   * 获取单元格提示（含解释）
   * @param {number} row
   * @param {number} col
   * @returns {{ row: number, col: number, candidates: number[], value: number|null, mode: string, reason: string }}
   */
  getCellHint(row, col) {
    return this.currentSudoku.getCellHint(row, col);
  }

  /**
   * 获取下一步可确定的提示
   * @returns {{ row: number, col: number, value: number, candidates: number[] } | null}
   */
  getNextHint() {
    // 下一步提示属于当前局面的推导结果，Game 只负责代理当前 Sudoku。
    return this.currentSudoku.getNextHint();
  }

  /**
   * 生成供 AI Agent 使用的上下文
   * @returns {{ grid: number[][], nextHint: object|null, explore: object, prompt: string }}
   */
  buildAiAssistContext() {
    const grid = this.currentSudoku.getGrid();
    const nextHint = this.getNextHint();
    const explore = this.getExploreStatus();

    return {
      grid,
      nextHint,
      explore,
      prompt: '请基于当前数独局面给出下一步建议，并简要解释原因。若存在冲突，请指出冲突位置。',
    };
  }

  /**
   * 当前局面是否胜利：满盘且无冲突
   * @returns {boolean}
   */
  isWon() {
    const grid = this.currentSudoku.getGrid();

    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (grid[row][col] === 0) {
          return false;
        }
      }
    }

    return this.currentSudoku.validate().valid;
  }

  /**
   * 序列化为 JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      initialSudoku: this.initialSudoku.toJSON(),
      // 兼容旧消费方：同时暴露当前盘面
      currentSudoku: this.currentSudoku.toJSON(),
      // 记录可重放的历史操作，而不是整盘快照
      history: this.history.map(operation => ({
        type: operation.type,
        move: { ...operation.move },
        previousValue: operation.previousValue,
      })),
      currentIndex: this.currentIndex,
      explore: this._serializeExploreSession(),
    };
  }

  /**
   * 转换为字符串
   * @returns {string}
   */
  toString() {
    const mode = this.exploreSession ? this.exploreSession.status : 'idle';
    return `Game(currentIndex: ${this.currentIndex}, historyLength: ${this.history.length}, explore: ${mode})\n${this.currentSudoku.toString()}`;
  }

  /**
   * 更新探索状态（在探索中的每次实际落子后）
   * @private
   */
  _updateExploreStatusAfterMove() {
    const fingerprint = this._gridFingerprint(this.currentSudoku.getGrid());
    const isConflict = !this.currentSudoku.validate().valid;

    if (!isConflict) {
      this.exploreSession.status = 'active';
      return;
    }

    if (this.exploreSession.failedFingerprints.has(fingerprint)) {
      this.exploreSession.status = 'revisited-failed';
      return;
    }

    this.exploreSession.failedFingerprints.add(fingerprint);
    this.exploreSession.status = 'conflict';
  }

  /**
   * 在 undo/redo 等时间线跳转后刷新探索状态
   * @private
   */
  _refreshExploreStatusAfterTimelineMove() {
    if (!this.exploreSession) {
      return;
    }

    const fingerprint = this._gridFingerprint(this.currentSudoku.getGrid());
    const isConflict = !this.currentSudoku.validate().valid;

    if (!isConflict) {
      this.exploreSession.status = 'active';
      return;
    }

    this.exploreSession.status = this.exploreSession.failedFingerprints.has(fingerprint)
      ? 'revisited-failed'
      : 'conflict';
  }

  /**
   * 序列化探索会话
   * @private
   */
  _serializeExploreSession() {
    if (!this.exploreSession) {
      return {
        active: false,
        status: 'idle',
      };
    }

    return {
      active: true,
      status: this.exploreSession.status,
      startSudoku: this.exploreSession.startSudoku.toJSON(),
      startHistory: this._cloneHistory(this.exploreSession.startHistory),
      startIndex: this.exploreSession.startIndex,
      failedFingerprints: Array.from(this.exploreSession.failedFingerprints),
      currentBranchId: this.exploreSession.currentBranchId,
      nextBranchId: this.exploreSession.nextBranchId,
      branches: Array.from(this.exploreSession.branches.values()).map(branch => ({
        id: branch.id,
        parentId: branch.parentId,
        label: branch.label,
        sudoku: branch.sudoku.toJSON(),
        history: this._cloneHistory(branch.history),
        index: branch.index,
      })),
    };
  }

  /**
   * 将当前局面写回当前探索分支快照
   * @private
   */
  _syncCurrentExploreBranchSnapshot() {
    if (!this.exploreSession) {
      return;
    }

    const currentBranch = this.exploreSession.branches.get(this.exploreSession.currentBranchId);
    if (!currentBranch) {
      return;
    }

    currentBranch.sudoku = this.currentSudoku.clone();
    currentBranch.history = this._cloneHistory(this.history);
    currentBranch.index = this.currentIndex;
  }

  /**
   * 克隆历史记录
   * @private
   */
  _cloneHistory(history) {
    return history.map(operation => ({
      type: operation.type,
      move: { ...operation.move },
      previousValue: operation.previousValue,
    }));
  }

  /**
   * 为棋盘生成稳定签名
   * @private
   */
  _gridFingerprint(grid) {
    return grid.flat().join('');
  }
}

/**
 * 工厂函数：创建新的 Game 实例
 * @param {Object} options - { sudoku }
 * @returns {Game}
 */
export function createGame(options) {
  return new Game(options);
}

/**
 * 工厂函数：从 JSON 数据恢复 Game 实例
 * @param {Object} json - 序列化的 Game 数据
 * @returns {Game}
 */
export function createGameFromJSON(json) {
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid Game JSON payload');
  }

  // 新格式：{ initialSudoku, history: operation[], currentIndex }
  // 旧格式：{ currentSudoku, history: sudokuSnapshot[], currentIndex }
  const isOperationHistory = Array.isArray(json.history) && json.history.every(op => op && typeof op === 'object' && op.type === 'guess');
  const isSnapshotHistory = Array.isArray(json.history) && json.history.every(s => s && typeof s === 'object' && (Array.isArray(s.userGrid) || Array.isArray(s.userMoves)));

  if (!Array.isArray(json.history)) {
    throw new Error('Invalid Game JSON payload: history must be an array');
  }

  if (isOperationHistory) {
    if (!Number.isInteger(json.currentIndex) || json.currentIndex < 0 || json.currentIndex > json.history.length) {
      throw new Error('Invalid Game JSON payload: currentIndex out of bounds');
    }

    const initialSudoku = createSudokuFromJSON(json.initialSudoku);
    const game = new Game({ sudoku: initialSudoku.clone() });

    game.initialSudoku = initialSudoku;

    game.history = json.history.map(operation => {
      if (!operation || typeof operation !== 'object') {
        throw new Error('Invalid Game JSON payload: malformed history operation');
      }
      if (operation.type !== 'guess') {
        throw new Error(`Invalid Game JSON payload: unsupported operation type ${operation.type}`);
      }
      if (!operation.move || typeof operation.move !== 'object') {
        throw new Error('Invalid Game JSON payload: malformed move');
      }

      const { row, col, value } = operation.move;
      if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 8 || col < 0 || col > 8) {
        throw new Error('Invalid Game JSON payload: move position out of range');
      }
      if (!Number.isInteger(value) || value < 0 || value > 9) {
        throw new Error('Invalid Game JSON payload: move value out of range');
      }
      if (!Number.isInteger(operation.previousValue) || operation.previousValue < 0 || operation.previousValue > 9) {
        throw new Error('Invalid Game JSON payload: previousValue out of range');
      }

      return {
        type: operation.type,
        move: { ...operation.move },
        previousValue: operation.previousValue,
      };
    });

    game.currentIndex = json.currentIndex;
    game.currentSudoku = initialSudoku.clone();

    for (let index = 0; index < game.currentIndex; index++) {
      const operation = game.history[index];
      game.currentSudoku.guess(operation.move);
    }

    restoreExploreSessionIfPresent(game, json.explore);

    return game;
  }

  if (isSnapshotHistory) {
    if (!Number.isInteger(json.currentIndex) || json.currentIndex < 0 || json.currentIndex >= json.history.length) {
      throw new Error('Invalid legacy Game JSON payload: currentIndex out of bounds');
    }

    const snapshots = json.history.map(snapshot => createSudokuFromJSON(snapshot));
    const initialSudoku = snapshots[0].clone();
    const game = new Game({ sudoku: initialSudoku.clone() });
    game.initialSudoku = initialSudoku;

    // 将旧快照历史转换为可重放的操作历史
    game.history = [];
    for (let index = 1; index < snapshots.length; index++) {
      const prev = snapshots[index - 1].getGrid();
      const next = snapshots[index].getGrid();

      let diff = null;
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          if (prev[row][col] !== next[row][col]) {
            if (diff !== null) {
              throw new Error('Invalid legacy Game JSON payload: snapshot step has multiple cell changes');
            }
            diff = { row, col, previousValue: prev[row][col], value: next[row][col] };
          }
        }
      }

      if (diff === null) {
        throw new Error('Invalid legacy Game JSON payload: snapshot step has no changes');
      }

      game.history.push({
        type: 'guess',
        move: { row: diff.row, col: diff.col, value: diff.value },
        previousValue: diff.previousValue,
      });
    }

    game.currentIndex = json.currentIndex;
    game.currentSudoku = initialSudoku.clone();
    for (let index = 0; index < game.currentIndex; index++) {
      game.currentSudoku.guess(game.history[index].move);
    }

    restoreExploreSessionIfPresent(game, json.explore);

    return game;
  }

  throw new Error('Invalid Game JSON payload: unsupported history format');
}

function restoreExploreSessionIfPresent(game, exploreJson) {
  if (!exploreJson || typeof exploreJson !== 'object' || exploreJson.active !== true) {
    return;
  }

  if (!Number.isInteger(exploreJson.startIndex) || exploreJson.startIndex < 0 || exploreJson.startIndex > game.history.length) {
    throw new Error('Invalid Game JSON payload: explore.startIndex out of bounds');
  }

  const startSudoku = createSudokuFromJSON(exploreJson.startSudoku);
  const startHistory = Array.isArray(exploreJson.startHistory)
    ? exploreJson.startHistory.map(operation => {
      if (!operation || typeof operation !== 'object' || operation.type !== 'guess' || !operation.move) {
        throw new Error('Invalid Game JSON payload: malformed explore.startHistory operation');
      }

      const { row, col, value } = operation.move;
      if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 8 || col < 0 || col > 8) {
        throw new Error('Invalid Game JSON payload: explore move position out of range');
      }
      if (!Number.isInteger(value) || value < 0 || value > 9) {
        throw new Error('Invalid Game JSON payload: explore move value out of range');
      }
      if (!Number.isInteger(operation.previousValue) || operation.previousValue < 0 || operation.previousValue > 9) {
        throw new Error('Invalid Game JSON payload: explore previousValue out of range');
      }

      return {
        type: 'guess',
        move: { ...operation.move },
        previousValue: operation.previousValue,
      };
    })
    : [];

  const failedFingerprints = Array.isArray(exploreJson.failedFingerprints)
    ? new Set(exploreJson.failedFingerprints.filter(item => typeof item === 'string'))
    : new Set();

  const allowedStatus = new Set(['active', 'conflict', 'revisited-failed']);
  const status = allowedStatus.has(exploreJson.status) ? exploreJson.status : 'active';

  const branches = new Map();
  let currentBranchId = 0;
  let nextBranchId = 1;

  if (Array.isArray(exploreJson.branches)) {
    for (const b of exploreJson.branches) {
      if (!b || typeof b !== 'object' || !Number.isInteger(b.id)) continue;
      const branchSudoku = createSudokuFromJSON(b.sudoku);
      branches.set(b.id, {
        id: b.id,
        parentId: typeof b.parentId === 'number' ? b.parentId : null,
        label: String(b.label || `branch-${b.id}`),
        sudoku: branchSudoku,
        history: Array.isArray(b.history) ? b.history.map(op => ({ ...op })) : [],
        index: Number.isInteger(b.index) ? b.index : exploreJson.startIndex,
      });
      currentBranchId = b.id === exploreJson.currentBranchId ? b.id : currentBranchId;
      nextBranchId = Math.max(nextBranchId, b.id + 1);
    }
  }

  if (!branches.size) {
    branches.set(0, {
      id: 0,
      parentId: null,
      label: 'root',
      sudoku: startSudoku.clone(),
      history: startHistory.slice(),
      index: exploreJson.startIndex,
    });
    currentBranchId = 0;
    nextBranchId = 1;
  }

  game.exploreSession = {
    startSudoku,
    startHistory,
    startIndex: exploreJson.startIndex,
    failedFingerprints,
    status,
    branches,
    currentBranchId,
    nextBranchId,
  };
}
