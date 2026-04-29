import { describe, expect, it } from 'vitest'
import { loadDomainApi, makePuzzle } from './helpers/domain-api.js'

describe('HW2 explore branch extras', () => {
  it('creates a tree of explore branches and can switch between them', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    expect(game.startExplore()).toBe(true)

    game.guess({ row: 0, col: 2, value: 4 })
    const firstBranchId = game.createExploreBranch('first attempt')
    expect(firstBranchId).toBe(1)

    expect(game.switchExploreBranch(firstBranchId)).toBe(true)
    game.guess({ row: 1, col: 1, value: 7 })
    const secondBranchId = game.createExploreBranch('second attempt')
    expect(secondBranchId).toBe(2)

    const branches = game.listExploreBranches()
    expect(branches).toEqual([
      expect.objectContaining({ id: 0, parentId: null, label: 'root', current: false }),
      expect.objectContaining({ id: 1, parentId: 0, label: 'first attempt', current: true }),
      expect.objectContaining({ id: 2, parentId: 1, label: 'second attempt', current: false }),
    ])

    expect(game.switchExploreBranch(firstBranchId)).toBe(true)
    expect(game.getSudoku().getGrid()[1][1]).toBe(7)
    expect(game.getExploreStatus().currentBranchId).toBe(firstBranchId)

    expect(game.switchExploreBranch(secondBranchId)).toBe(true)
    expect(game.getSudoku().getGrid()[1][1]).toBe(7)
    expect(game.getExploreStatus().currentBranchId).toBe(secondBranchId)
  })

  it('supports branch-local undo and redo inside explore mode', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    game.startExplore()
    game.guess({ row: 0, col: 2, value: 4 })
    game.guess({ row: 1, col: 1, value: 7 })

    const branchId = game.createExploreBranch('undo-redo branch')
    expect(branchId).toBe(1)

    expect(game.canExploreUndo()).toBe(true)
    expect(game.canExploreRedo()).toBe(false)

    expect(game.exploreUndo()).toBe(true)
    expect(game.getSudoku().getGrid()[1][1]).toBe(0)
    expect(game.canExploreRedo()).toBe(true)

    expect(game.exploreRedo()).toBe(true)
    expect(game.getSudoku().getGrid()[1][1]).toBe(7)

    expect(game.backtrackExplore()).toBe(true)
    expect(game.getSudoku().getGrid()[0][2]).toBe(0)
    expect(game.getSudoku().getGrid()[1][1]).toBe(0)
    expect(game.canExploreUndo()).toBe(false)
    expect(game.canExploreRedo()).toBe(false)
  })

  it('restores explore branches from serialized JSON', async () => {
    const { createGame, createSudoku, createGameFromJSON } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    game.startExplore()
    game.guess({ row: 0, col: 2, value: 4 })
    const branchId = game.createExploreBranch('serialized branch')
    expect(branchId).toBe(1)
    expect(game.switchExploreBranch(branchId)).toBe(true)
    game.guess({ row: 1, col: 1, value: 7 })

    const restored = createGameFromJSON(game.toJSON())

    expect(restored.isExploring()).toBe(true)
    expect(restored.getExploreStatus().branchCount).toBe(2)
    expect(restored.getExploreStatus().currentBranchId).toBe(1)
    expect(restored.listExploreBranches()).toEqual([
      expect.objectContaining({ id: 0, parentId: null, label: 'root', current: false }),
      expect.objectContaining({ id: 1, parentId: 0, label: 'serialized branch', current: true }),
    ])
    expect(restored.getSudoku().getGrid()[1][1]).toBe(7)
  })
})