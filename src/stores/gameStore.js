/**
 * src/stores/gameStore.js
 * Store Adapter - 连接领域对象 (Game/Sudoku) 与 Svelte 响应式系统
 * 
 * 职责：
 * - 内部持有 Game 实例（领域对象）
 * - 对外暴露响应式状态（grid, invalidCells, won 等）
 * - 对外暴露命令方法（guess, undo, redo 等）
 * - UI 通过这个 adapter 消费领域对象
 */



import { writable, derived, get } from 'svelte/store';//典型Svelte 3 风格
import { createGame, createSudoku, createGameFromJSON } from '../domain/index.js';
import { generateHintExplanation } from '../domain/agent.js';
import { generateSudoku, solveSudoku } from '@sudoku/sudoku';
import { decodeSencode, validateSencode } from '@sudoku/sencode';
import { cursor } from '@sudoku/stores/cursor';
import { candidates } from '@sudoku/stores/candidates';
import { hints } from '@sudoku/stores/hints';
import { notes } from '@sudoku/stores/notes';
import { timer } from '@sudoku/stores/timer';

/**
 * 创建游戏 Store Adapter（⾯向 Svelte 的适配层）
 * @param {Object} options
 * @param {number[][]} options.initialGrid - 初始棋盘
 * @returns {Object} - 包含响应式状态和命令的店铺对象
 */
export function createGameStore(options = {}) {
  // 如果没有提供初始棋盘，默认生成一局 easy 题面
  const { initialGrid = generateSudoku('easy') } = options;

  // 创建初始的 Sudoku 和 Game并持有
  const sudoku = createSudoku(initialGrid);
  const game = createGame({ sudoku });
  // 内部可写 store：持有当前的 Game 实例（典型Svelte 3 风格）
  const gameInstance = writable(game);
  const paused = writable(true);
  const candidateHintsEnabled = writable(false);
  const candidateHintTarget = writable(null);
  const highlightedNextHint = writable(null);
  // explanation state for hint explanations (由本地 Agent 生成)
  const explanation = writable(null);

  function setPaused(nextPaused) {
    paused.set(nextPaused);
    if (nextPaused) {
      timer.stop();
    } else {
      timer.start();
    }
  }

  function resetSessionState() {
    cursor.reset();
    candidates.reset();
    notes.reset();
    hints.reset();
    candidateHintsEnabled.set(false);
    candidateHintTarget.set(null);
    highlightedNextHint.set(null);
    timer.reset();
    setPaused(true);
  }
  
  //对外暴露可被 Svelte 消费的响应式状态

  // 响应式 store：当前棋盘网格
  // 每当 game 变化时，自动更新 grid
  //UI 的 grid 来自 Game -> Sudoku 的导出状态，满足UI 中看到的 grid 必须来自你的领域对象，或来自由你的领域对象导出的响应式视图状态的要求
  const grid = derived(gameInstance, $game => 
    $game.getSudoku().getGrid()
  );

  // 响应式 store：初始题面（给定数字）
  const givenGrid = derived(gameInstance, $game =>
    $game.getSudoku().getInitialGrid()
  );
  
  // 响应式 store：无效单元格集合
  const invalidCells = derived(gameInstance, $game => {
    const validation = $game.getSudoku().validate();
    return validation.invalidCells;
  });
  
  // 响应式 store：游戏是否已赢
  const won = derived(gameInstance, $game => $game.isWon());

  // 响应式 store：探索模式状态
  const exploreStatus = derived(gameInstance, $game => $game.getExploreStatus());
  
  //canUndo/canRedo 也是由领域对象派生，按钮状态会联动刷新
  // 响应式 store：是否可以撤销
  const canUndo = derived(gameInstance, $game => 
    $game.canUndo()
  );
  
  // 响应式 store：是否可以重做
  const canRedo = derived(gameInstance, $game => 
    $game.canRedo()
  );

  // 响应式 store：为 UI 提供每个空格的领域候选（key = 'x,y'）
  // 这里不临时拼 UI 数据，直接把 Sudoku 计算出的候选结果整理成视图层可订阅的 store。
  const computedCandidates = derived(gameInstance, $game => {
    const map = {};
    const grid = $game.getSudoku().getGrid();

    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (grid[row][col] === 0) {
          try {
            const cands = $game.getCandidates(row, col);
            if (cands && cands.length > 0) {
              map[col + ',' + row] = cands;
            }
          } catch (e) {
            // ignore
          }
        }
      }
    }

    return map;
  });

  // 响应式 store：下一步可填的提示（来自领域对象）
  // UI 只消费这个派生结果，不负责判断“下一步”是否成立。
  const nextHint = derived(gameInstance, $game => $game.getNextHint());


  //对外暴露 UI 可调用的方法（命令）
  /**
   * UI 命令：用户猜测
   * @param {number} row
   * @param {number} col
   * @param {number} value
   */
  //gameStore.guess 再转发到领域对象 Game.guess
  function guess(row, col, value) {
    gameInstance.update($game => {
      $game.guess({ row, col, value });
      return $game;
    });
  }

  //gameStore 转发到 Game.undo/redo
  /**
   * UI 命令：撤销
   */
  function undo() {
    gameInstance.update($game => {
      $game.undo();
      return $game;
    });
  }

  /**
   * UI 命令：重做
   */
  function redo() {
    gameInstance.update($game => {
      $game.redo();
      return $game;
    });
  }

  /**
   * UI 命令：新游戏
   * @param {number[][]} newInitialGrid - 新的初始棋盘
   */
  function newGame(newInitialGrid) {
    const newSudoku = createSudoku(newInitialGrid);
    const newGame = createGame({ sudoku: newSudoku });
    gameInstance.set(newGame);
    resetSessionState();
  }

  /**
   * UI 命令：按难度开始新游戏
   * @param {('veryeasy'|'easy'|'medium'|'hard')} difficulty
   */
  function startNew(difficulty = 'easy') {
    newGame(generateSudoku(difficulty));
  }

  /**
   * UI 命令：从 sencode 开始自定义游戏
   * @param {string} sencode
   */
  //创建或加载Sudoku
  function startCustom(sencode) {
    newGame(decodeSencode(sencode));
  }

  function pause() {
    setPaused(true);
  }

  function resume() {
    setPaused(false);
  }

  function togglePause() {
    setPaused(!get(paused));
  }

  /**
   * UI 命令：进入探索模式
   * @returns {boolean}
   */
  function startExplore() {
    let started = false;
    gameInstance.update($game => {
      started = $game.startExplore();
      return $game;
    });
    return started;
  }

  /**
   * UI 命令：回溯到探索起点
   * @returns {boolean}
   */
  function backtrackExplore() {
    let backtracked = false;
    gameInstance.update($game => {
      backtracked = $game.backtrackExplore();
      return $game;
    });
    return backtracked;
  }

  /**
   * UI 命令：探索内撤销
   */
  function exploreUndo() {
    let ok = false;
    gameInstance.update($game => {
      ok = $game.exploreUndo();
      return $game;
    });
    return ok;
  }

  /**
   * UI 命令：探索内重做
   */
  function exploreRedo() {
    let ok = false;
    gameInstance.update($game => {
      ok = $game.exploreRedo();
      return $game;
    });
    return ok;
  }

  /**
   * UI 命令：创建探索分支
   */
  function createExploreBranch(label) {
    let id = null;
    gameInstance.update($game => {
      id = $game.createExploreBranch(label);
      return $game;
    });
    return id;
  }

  /**
   * UI 命令：切换探索分支
   */
  function switchExploreBranch(id) {
    let ok = false;
    gameInstance.update($game => {
      ok = $game.switchExploreBranch(id);
      return $game;
    });
    return ok;
  }

  /**
   * UI 查询：列出分支
   */
  function listExploreBranches() {
    return get(gameInstance).listExploreBranches();
  }

  /**
   * UI 命令：提交探索结果并退出探索模式
   * @returns {boolean}
   */
  function commitExplore() {
    let committed = false;
    gameInstance.update($game => {
      committed = $game.commitExplore();
      return $game;
    });
    return committed;
  }

  /**
   * UI 命令：放弃探索结果并退出探索模式
   * @returns {boolean}
   */
  function cancelExplore() {
    let cancelled = false;
    gameInstance.update($game => {
      cancelled = $game.cancelExplore();
      return $game;
    });
    return cancelled;
  }

  /**
   * UI 命令：将当前游戏完整序列化为 JSON 字符串
   * @returns {string}
   */
  function serialize() {
    return JSON.stringify(getGame().toJSON());
  }

  /**
   * 校验导入代码是否可被当前系统识别
   * 支持：完整 JSON（包含历史）或 legacy sencode
   * @param {string} code
   * @returns {boolean}
   */
  function canImportCode(code) {
    const text = (code || '').trim();
    if (!text) return false;

    if (validateSencode(text)) {
      return true;
    }

    try {
      const payload = JSON.parse(text);
      createGameFromJSON(payload);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * UI 命令：从导入代码恢复游戏
   * 支持：完整 JSON（优先）与 legacy sencode（兼容）
   * @param {string} code
   */
  function importCode(code) {
    const text = (code || '').trim();
    if (!text) {
      throw new Error('Import code cannot be empty.');
    }

    // 先尝试完整 JSON 恢复；失败后回退到 sencode。
    try {
      const payload = JSON.parse(text);
      const restoredGame = createGameFromJSON(payload);
      gameInstance.set(restoredGame);
      resetSessionState();
      return;
    } catch (jsonError) {
      if (validateSencode(text)) {
        startCustom(text);
        return;
      }
      throw new Error('Invalid import code: expected serialized game JSON or sencode.');
    }
  }

  /**
   * UI 命令：在指定位置应用提示
   * @param {number|null} row
   * @param {number|null} col
   * @returns {boolean} 是否成功应用提示
   */
  function applyHint(row, col) {
    if (row === null || col === null) {
      return false;
    }

    let applied = false;
    gameInstance.update($game => {
      const current = $game.getSudoku().getGrid();
      if (current[row][col] !== 0) {
        return $game;
      }

      try {
        const solvedGrid = solveSudoku(current);
        const solvedValue = solvedGrid?.[row]?.[col];

        if (Number.isInteger(solvedValue) && solvedValue >= 1 && solvedValue <= 9) {
          $game.guess({ row, col, value: solvedValue });
          applied = true;
        }
      } catch (error) {
        try {
          const candidates = $game.getCandidates(row, col);
          if (candidates.length === 1) {
            $game.guess({ row, col, value: candidates[0] });
            applied = true;
          }
        } catch (fallbackError) {
          // 无法求解时忽略提示请求
        }
      }

      return $game;
    });

    // 触发解释生成（不改变提示的应用逻辑）
    try {
      explainHint(row, col);
    } catch (e) {
      // ignore
    }

    return applied;
  }

  // 调用本地 AI Agent 生成提示解释并保存在 explanation store
  function explainHint(row, col) {
    try {
      const expl = generateHintExplanation(getGame(), row, col);
      explanation.set({ row, col, text: expl });
    } catch (e) {
      explanation.set({ row, col, text: '无法生成解释' });
    }
  }

  function closeExplanation() { explanation.set(null); }

  function enableCandidateHints(row, col) {
    candidateHintsEnabled.set(true);
    candidateHintTarget.set(row === null || col === null ? null : { row, col });
    highlightedNextHint.set(null);
  }

  function highlightNextHint(row, col) {
    highlightedNextHint.set(row === null || col === null ? null : { row, col });
  }

  /**
   * 获取当前 Game 实例（内部使用）
   */
  function getGame() {
    return get(gameInstance);
  }

  // 返回给 UI 使用的接口
  return {
    // === 响应式状态 ===
    // UI 可以订阅这些 store，当 Game 状态变化时自动更新
    grid: { subscribe: grid.subscribe },
    givenGrid: { subscribe: givenGrid.subscribe },
    invalidCells: { subscribe: invalidCells.subscribe },
    won: { subscribe: won.subscribe },
    exploreStatus: { subscribe: exploreStatus.subscribe },
    paused: { subscribe: paused.subscribe },
    canUndo: { subscribe: canUndo.subscribe },
    canRedo: { subscribe: canRedo.subscribe },
    computedCandidates: { subscribe: computedCandidates.subscribe },
    nextHint: { subscribe: nextHint.subscribe },
    candidateHintsEnabled: { subscribe: candidateHintsEnabled.subscribe },
    candidateHintTarget: { subscribe: candidateHintTarget.subscribe },
    highlightedNextHint: { subscribe: highlightedNextHint.subscribe },
    explanation: { subscribe: explanation.subscribe },
    
    // === 命令方法 ===
    // UI 调用这些方法来修改游戏状态
    guess,
    undo,
    redo,
    newGame,
    startNew,
    startCustom,
    pause,
    resume,
    togglePause,
    startExplore,
    backtrackExplore,
    commitExplore,
    cancelExplore,
    exploreUndo,
    exploreRedo,
    createExploreBranch,
    switchExploreBranch,
    listExploreBranches,
    serialize,
    canImportCode,
    importCode,
    applyHint,
    enableCandidateHints,
    highlightNextHint,
    explainHint,
    closeExplanation,
    
    // === 内部访问 ===
    // 测试或高级使用场景
    getGame,
  };
}
