import { solveSudoku } from '@sudoku/sudoku';
import { generateHintExplanation } from './agent.js';

export const HINT_LEVEL_DEFS = Object.freeze({
  1: { level: 1, name: 'L1 观察级', desc: '只指出值得关注的位置，并说明原因。' },
  2: { level: 2, name: 'L2 候选级', desc: '显示候选集合，并解释排除依据（行/列/宫）。' },
  3: { level: 3, name: 'L3 决策级', desc: '可确定时直接给出可填数字。' },
});

export function normalizeHintLevel(level) {
  const num = Number(level);
  return HINT_LEVEL_DEFS[num] ? num : 1;
}

export function buildHintAction(game, level, row, col) {
  const normalizedLevel = normalizeHintLevel(level);

  if (normalizedLevel === 1) {
    return buildObservationAction(game);
  }

  if (normalizedLevel === 2) {
    return buildCandidateAction(game, row, col);
  }

  return buildDecisionAction(game, row, col);
}

export function findHintTarget(game, row, col) {
  const grid = game.getSudoku().getGrid();
  if (isEmptyCell(grid, row, col)) {
    return { row, col };
  }

  const next = game.getNextHint();
  if (next && next.row !== undefined && next.col !== undefined) {
    return { row: next.row, col: next.col };
  }

  return null;
}

export function findDecisionTarget(game, row, col) {
  const grid = game.getSudoku().getGrid();
  if (isEmptyCell(grid, row, col)) {
    return { row, col };
  }

  for (let nextRow = 0; nextRow < 9; nextRow++) {
    for (let nextCol = 0; nextCol < 9; nextCol++) {
      if (grid[nextRow][nextCol] === 0) {
        return { row: nextRow, col: nextCol };
      }
    }
  }

  return null;
}

export function solveCell(game, row, col) {
  const sudoku = game.getSudoku();
  const validation = sudoku.validate();

  if (!validation.valid) {
    return {
      value: null,
      candidates: [],
      verified: false,
      reason: 'conflict',
    };
  }

  const grid = sudoku.getGrid();
  if (!isEmptyCell(grid, row, col)) {
    return {
      value: null,
      candidates: [],
      verified: false,
      reason: 'filled',
    };
  }

  try {
    const solvedGrid = solveSudoku(grid);
    const solvedValue = solvedGrid?.[row]?.[col];
    const candidates = game.getCandidates(row, col) || [];

    if (!Number.isInteger(solvedValue) || solvedValue < 1 || solvedValue > 9) {
      return {
        value: null,
        candidates,
        verified: false,
        reason: 'unsolved',
      };
    }

    const verificationSudoku = sudoku.clone();
    verificationSudoku.guess({ row, col, value: solvedValue });

    if (!verificationSudoku.validate().valid) {
      return {
        value: null,
        candidates,
        verified: false,
        reason: 'verification-failed',
      };
    }

    return {
      value: solvedValue,
      candidates,
      verified: true,
      reason: 'solved',
    };
  } catch (error) {
    return {
      value: null,
      candidates: [],
      verified: false,
      reason: 'solver-error',
    };
  }
}

export function buildDecisionExplanation(decision) {
  const candidateText = decision.candidates.length
    ? `当前候选为 ${decision.candidates.join('、')}。`
    : '';

  return `L3 决策级：已确定该格答案是 ${decision.value}。${candidateText}该数字来自完整局面求解，已通过当前行/列/宫约束校验；若需要查看候选排除过程，请切换到 L2。`;
}

export function fillCellByHint(game, row, col) {
  const decision = solveCell(game, row, col);
  if (decision.value !== null && decision.verified) {
    game.guess({ row, col, value: decision.value });
    return true;
  }

  try {
    const candidates = game.getCandidates(row, col) || [];
    if (candidates.length === 1) {
      game.guess({ row, col, value: candidates[0] });
      return true;
    }
  } catch (error) {
    // A hint failure should not break the store update cycle.
  }

  return false;
}

function buildObservationAction(game) {
  const next = game.getNextHint();
  if (!next) {
    return emptyHintAction();
  }

  const candidates = game.getCandidates(next.row, next.col) || [];
  const reason = candidates.length === 1
    ? `该格当前唯一候选是 ${candidates[0]}，所以值得优先观察。`
    : '该格是系统推断出的优先观察位置。';

  return {
    acted: true,
    highlight: { row: next.row, col: next.col },
    explanation: {
      row: next.row,
      col: next.col,
      text: `L1 观察级：建议先关注该位置。原因：${reason}`,
    },
  };
}

function buildCandidateAction(game, row, col) {
  const target = findHintTarget(game, row, col);
  if (!target) {
    return emptyHintAction();
  }

  return {
    acted: true,
    candidateTarget: target,
    explanation: {
      row: target.row,
      col: target.col,
      text: `L2 候选级：${generateHintExplanation(game, target.row, target.col)}`,
    },
  };
}

function buildDecisionAction(game, row, col) {
  const target = findDecisionTarget(game, row, col);
  if (!target) {
    return emptyHintAction();
  }

  const decision = solveCell(game, target.row, target.col);
  if (decision.value === null || !decision.verified) {
    return {
      acted: true,
      highlight: target,
      explanation: {
        row: target.row,
        col: target.col,
        text: buildDecisionFailureExplanation(decision.reason),
      },
    };
  }

  return {
    acted: true,
    highlight: target,
    fillMove: {
      row: target.row,
      col: target.col,
      value: decision.value,
    },
    explanation: {
      row: target.row,
      col: target.col,
      text: buildDecisionExplanation(decision),
    },
  };
}

function buildDecisionFailureExplanation(reason) {
  if (reason === 'conflict') {
    return 'L3 决策级：当前局面存在冲突，已停止填入数字。请先修正冲突后再请求确定答案。';
  }

  return 'L3 决策级：当前局面无法求出该格的确定数字，请检查棋盘是否存在冲突。';
}

function emptyHintAction() {
  return {
    acted: false,
  };
}

function isEmptyCell(grid, row, col) {
  return row !== null
    && row !== undefined
    && col !== null
    && col !== undefined
    && grid[row]?.[col] === 0;
}
