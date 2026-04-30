import { createSudokuFromJSON } from './sudoku.js';

const ACTIVE_STATUS = 'active';
const CONFLICT_STATUS = 'conflict';
const REVISITED_FAILED_STATUS = 'revisited-failed';
const VALID_STATUSES = new Set([ACTIVE_STATUS, CONFLICT_STATUS, REVISITED_FAILED_STATUS]);

export function cloneHistory(history = []) {
  return history.map(operation => ({
    type: operation.type,
    move: { ...operation.move },
    previousValue: operation.previousValue,
  }));
}

function normalizeBranchLabel(label, fallback) {
  return typeof label === 'string' && label.trim() ? label.trim() : fallback;
}

function gridFingerprint(grid) {
  return grid.flat().join('');
}

export class ExploreBranch {
  constructor({ id, parentId, label, sudoku, history, index }) {
    if (!Number.isInteger(id)) {
      throw new Error('ExploreBranch requires an integer id');
    }
    if (!sudoku || typeof sudoku.clone !== 'function') {
      throw new Error('ExploreBranch requires a Sudoku snapshot');
    }

    this.id = id;
    this.parentId = Number.isInteger(parentId) ? parentId : null;
    this.label = normalizeBranchLabel(label, `branch-${id}`);
    this.sudoku = sudoku.clone();
    this.history = cloneHistory(history);
    this.index = Number.isInteger(index) ? index : 0;
  }

  static fromJSON(payload, fallbackIndex) {
    if (!payload || typeof payload !== 'object' || !Number.isInteger(payload.id) || !payload.sudoku) {
      return null;
    }

    return new ExploreBranch({
      id: payload.id,
      parentId: typeof payload.parentId === 'number' ? payload.parentId : null,
      label: String(payload.label || `branch-${payload.id}`),
      sudoku: createSudokuFromJSON(payload.sudoku),
      history: Array.isArray(payload.history) ? payload.history : [],
      index: Number.isInteger(payload.index) ? payload.index : fallbackIndex,
    });
  }

  updateFromGame(sudoku, history, index) {
    this.sudoku = sudoku.clone();
    this.history = cloneHistory(history);
    this.index = index;
  }

  restoreSnapshot() {
    return {
      sudoku: this.sudoku.clone(),
      history: cloneHistory(this.history),
      index: this.index,
    };
  }

  toListItem(currentBranchId, depth = 0) {
    return {
      id: this.id,
      parentId: this.parentId,
      label: this.label,
      depth,
      current: this.id === currentBranchId,
    };
  }

  toJSON() {
    return {
      id: this.id,
      parentId: this.parentId,
      label: this.label,
      sudoku: this.sudoku.toJSON(),
      history: cloneHistory(this.history),
      index: this.index,
    };
  }
}

export class ExploreSession {
  constructor({
    startSudoku,
    startHistory,
    startIndex,
    failedFingerprints = new Set(),
    status = ACTIVE_STATUS,
    branches,
    currentBranchId = 0,
    nextBranchId = 1,
  }) {
    if (!startSudoku || typeof startSudoku.clone !== 'function') {
      throw new Error('ExploreSession requires a start Sudoku snapshot');
    }
    if (!Number.isInteger(startIndex) || startIndex < 0) {
      throw new Error('ExploreSession requires a valid start index');
    }

    this.startSudoku = startSudoku.clone();
    this.startHistory = cloneHistory(startHistory);
    this.startIndex = startIndex;
    this.failedFingerprints = new Set(failedFingerprints);
    this.status = VALID_STATUSES.has(status) ? status : ACTIVE_STATUS;
    this.branches = branches instanceof Map ? new Map(branches) : new Map();
    this.currentBranchId = Number.isInteger(currentBranchId) ? currentBranchId : 0;
    this.nextBranchId = Number.isInteger(nextBranchId) && nextBranchId > 0 ? nextBranchId : 1;

    if (!this.branches.size) {
      this.branches.set(0, new ExploreBranch({
        id: 0,
        parentId: null,
        label: 'root',
        sudoku: this.startSudoku,
        history: this.startHistory,
        index: this.startIndex,
      }));
      this.currentBranchId = 0;
      this.nextBranchId = Math.max(this.nextBranchId, 1);
    }

    if (!this.branches.has(this.currentBranchId)) {
      this.currentBranchId = 0;
    }
  }

  static start(sudoku, history, index) {
    return new ExploreSession({
      startSudoku: sudoku,
      startHistory: history,
      startIndex: index,
    });
  }

  static fromJSON(payload) {
    if (!payload || typeof payload !== 'object' || payload.active !== true) {
      return null;
    }

    const startSudoku = createSudokuFromJSON(payload.startSudoku);
    if (!Number.isInteger(payload.startIndex) || payload.startIndex < 0) {
      throw new Error('Invalid Game JSON payload: explore.startIndex out of bounds');
    }

    const branches = new Map();
    let nextBranchId = 1;

    if (Array.isArray(payload.branches)) {
      for (const branchPayload of payload.branches) {
        const branch = ExploreBranch.fromJSON(branchPayload, payload.startIndex);
        if (!branch) {
          continue;
        }

        branches.set(branch.id, branch);
        nextBranchId = Math.max(nextBranchId, branch.id + 1);
      }
    }

    if (Number.isInteger(payload.nextBranchId) && payload.nextBranchId > nextBranchId) {
      nextBranchId = payload.nextBranchId;
    }

    return new ExploreSession({
      startSudoku,
      startHistory: Array.isArray(payload.startHistory) ? payload.startHistory : [],
      startIndex: payload.startIndex,
      failedFingerprints: Array.isArray(payload.failedFingerprints)
        ? payload.failedFingerprints.filter(item => typeof item === 'string')
        : [],
      status: payload.status,
      branches,
      currentBranchId: Number.isInteger(payload.currentBranchId) ? payload.currentBranchId : 0,
      nextBranchId,
    });
  }

  backtrackToStart() {
    this.status = ACTIVE_STATUS;
    this.currentBranchId = 0;

    return {
      sudoku: this.startSudoku.clone(),
      history: cloneHistory(this.startHistory),
      index: this.startIndex,
    };
  }

  canUndo(currentIndex) {
    return currentIndex > this.startIndex;
  }

  canRedo(currentIndex, history) {
    return currentIndex < history.length;
  }

  createBranch(label, sudoku, history, index) {
    const branchId = this.nextBranchId++;
    this.branches.set(branchId, new ExploreBranch({
      id: branchId,
      parentId: this.currentBranchId,
      label: normalizeBranchLabel(label, `branch-${branchId}`),
      sudoku,
      history,
      index,
    }));

    return branchId;
  }

  switchToBranch(branchId) {
    if (!Number.isInteger(branchId)) {
      return null;
    }

    const branch = this.branches.get(branchId);
    if (!branch) {
      return null;
    }

    this.currentBranchId = branchId;
    return branch.restoreSnapshot();
  }

  listBranches() {
    const sortedBranches = Array.from(this.branches.values()).sort((a, b) => a.id - b.id);
    const depthById = new Map();

    const getDepth = branch => {
      if (depthById.has(branch.id)) {
        return depthById.get(branch.id);
      }

      if (branch.parentId === null || !this.branches.has(branch.parentId)) {
        depthById.set(branch.id, 0);
        return 0;
      }

      const parentDepth = getDepth(this.branches.get(branch.parentId));
      const depth = parentDepth + 1;
      depthById.set(branch.id, depth);
      return depth;
    };

    return sortedBranches.map(branch => branch.toListItem(this.currentBranchId, getDepth(branch)));
  }

  captureCurrentBranch(sudoku, history, index) {
    const currentBranch = this.branches.get(this.currentBranchId);
    if (!currentBranch) {
      return;
    }

    currentBranch.updateFromGame(sudoku, history, index);
  }

  updateAfterMove(grid, isConflict) {
    this._updateStatus(grid, isConflict, true);
  }

  refreshAfterTimelineMove(grid, isConflict) {
    this._updateStatus(grid, isConflict, false);
  }

  getStatus(canExploreUndo, canExploreRedo) {
    return {
      active: true,
      status: this.status,
      hasConflict: this.status === CONFLICT_STATUS || this.status === REVISITED_FAILED_STATUS,
      revisitedFailedPath: this.status === REVISITED_FAILED_STATUS,
      startIndex: this.startIndex,
      currentBranchId: this.currentBranchId,
      branchCount: this.branches.size,
      canExploreUndo,
      canExploreRedo,
    };
  }

  toJSON() {
    return {
      active: true,
      status: this.status,
      startSudoku: this.startSudoku.toJSON(),
      startHistory: cloneHistory(this.startHistory),
      startIndex: this.startIndex,
      failedFingerprints: Array.from(this.failedFingerprints),
      currentBranchId: this.currentBranchId,
      nextBranchId: this.nextBranchId,
      branches: Array.from(this.branches.values()).map(branch => branch.toJSON()),
    };
  }

  _updateStatus(grid, isConflict, rememberFailure) {
    if (!isConflict) {
      this.status = ACTIVE_STATUS;
      return;
    }

    const fingerprint = gridFingerprint(grid);
    if (this.failedFingerprints.has(fingerprint)) {
      this.status = REVISITED_FAILED_STATUS;
      return;
    }

    if (rememberFailure) {
      this.failedFingerprints.add(fingerprint);
    }
    this.status = CONFLICT_STATUS;
  }
}
