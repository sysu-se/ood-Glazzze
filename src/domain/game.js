/**
 * Game 类 - 代表一场数独游戏的核心逻辑
 * 职责：
 * - 持有当前的 Sudoku 实例
 * - 管理操作历史（Undo/Redo）
 * - 提供游戏级别的接口（guess, undo, redo）
 * - 追踪游戏状态
 */

import { ExploreSession, cloneHistory } from './exploreSession.js';
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

    this.exploreSession = ExploreSession.start(this.currentSudoku, this.history, this.currentIndex);

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

    this._restoreSnapshot(this.exploreSession.backtrackToStart());
    this._syncCurrentExploreBranchSnapshot();

    return true;
  }

  /**
   * 探索模式内是否可撤销
   * @returns {boolean}
   */
  canExploreUndo() {
    return !!this.exploreSession && this.exploreSession.canUndo(this.currentIndex);
  }

  /**
   * 探索模式内是否可重做
   * @returns {boolean}
   */
  canExploreRedo() {
    return !!this.exploreSession && this.exploreSession.canRedo(this.currentIndex, this.history);
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

    return this.exploreSession.createBranch(label, this.currentSudoku, this.history, this.currentIndex);
  }

  /**
   * 切换到指定探索分支
   * @param {number} branchId
   * @returns {boolean}
   */
  switchExploreBranch(branchId) {
    if (!this.exploreSession) {
      return false;
    }

    const snapshot = this.exploreSession.switchToBranch(branchId);
    if (!snapshot) {
      return false;
    }

    this._restoreSnapshot(snapshot);
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

    return this.exploreSession.listBranches();
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

    return this.exploreSession.getStatus(this.canExploreUndo(), this.canExploreRedo());
  }

  /**
   * undo：撤销上一步操作
   */
  undo() {
    if (this.exploreSession) {
      this.exploreUndo();
      return;
    }

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
    if (this.exploreSession) {
      this.exploreRedo();
      return;
    }

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
    if (this.exploreSession) {
      return this.canExploreUndo();
    }

    return this.currentIndex > 0;
  }

  /**
   * 检查是否可以重做
   * @returns {boolean}
   */
  canRedo() {
    if (this.exploreSession) {
      return this.canExploreRedo();
    }

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
    this.exploreSession.updateAfterMove(
      this.currentSudoku.getGrid(),
      !this.currentSudoku.validate().valid,
    );
  }

  /**
   * 在 undo/redo 等时间线跳转后刷新探索状态
   * @private
   */
  _refreshExploreStatusAfterTimelineMove() {
    if (!this.exploreSession) {
      return;
    }

    this.exploreSession.refreshAfterTimelineMove(
      this.currentSudoku.getGrid(),
      !this.currentSudoku.validate().valid,
    );
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

    return this.exploreSession.toJSON();
  }

  /**
   * 将当前局面写回当前探索分支快照
   * @private
   */
  _syncCurrentExploreBranchSnapshot() {
    if (!this.exploreSession) {
      return;
    }

    this.exploreSession.captureCurrentBranch(this.currentSudoku, this.history, this.currentIndex);
  }

  /**
   * 从快照恢复当前局面和时间线
   * @private
   */
  _restoreSnapshot(snapshot) {
    this.currentSudoku = snapshot.sudoku;
    this.history = cloneHistory(snapshot.history);
    this.currentIndex = snapshot.index;
  }

  /**
   * 克隆历史记录
   * @private
   */
  _cloneHistory(history) {
    return cloneHistory(history);
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

  const exploreSession = ExploreSession.fromJSON(exploreJson);
  if (!exploreSession) {
    return;
  }

  if (exploreSession.startIndex > game.history.length) {
    throw new Error('Invalid Game JSON payload: explore.startIndex out of bounds');
  }

  game.exploreSession = exploreSession;
}
