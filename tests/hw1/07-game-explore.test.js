import { describe, expect, it } from 'vitest'
import { loadDomainApi, makePuzzle } from './helpers/domain-api.js'

describe('HW2 explore mode basics', () => {
  it('enters explore mode and reports active status', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    expect(game.isExploring()).toBe(false)
    expect(game.startExplore()).toBe(true)
    expect(game.isExploring()).toBe(true)

    const status = game.getExploreStatus()
    expect(status.active).toBe(true)
    expect(status.status).toBe('active')
    expect(status.hasConflict).toBe(false)
  })

  it('marks explore status as conflict when the board becomes invalid', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    game.startExplore()
    game.guess({ row: 0, col: 2, value: 5 })

    const status = game.getExploreStatus()
    expect(status.active).toBe(true)
    expect(status.hasConflict).toBe(true)
    expect(status.status).toBe('conflict')
  })

  it('can backtrack to the explore starting board quickly', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    const beforeExplore = game.getSudoku().getGrid()
    game.startExplore()

    game.guess({ row: 0, col: 2, value: 4 })
    game.guess({ row: 1, col: 1, value: 7 })

    expect(game.getSudoku().getGrid()).not.toEqual(beforeExplore)

    expect(game.backtrackExplore()).toBe(true)
    expect(game.getSudoku().getGrid()).toEqual(beforeExplore)

    const status = game.getExploreStatus()
    expect(status.active).toBe(true)
    expect(status.status).toBe('active')
    expect(status.hasConflict).toBe(false)
  })

  it('reports revisited-failed when replaying a known failed path', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    game.startExplore()

    game.guess({ row: 0, col: 2, value: 5 })
    expect(game.getExploreStatus().status).toBe('conflict')

    game.backtrackExplore()
    game.guess({ row: 0, col: 2, value: 5 })

    const status = game.getExploreStatus()
    expect(status.hasConflict).toBe(true)
    expect(status.revisitedFailedPath).toBe(true)
    expect(status.status).toBe('revisited-failed')
  })

  it('commits explore result and exits explore mode', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    game.startExplore()
    game.guess({ row: 0, col: 2, value: 4 })

    expect(game.commitExplore()).toBe(true)
    expect(game.isExploring()).toBe(false)
    expect(game.getSudoku().getGrid()[0][2]).toBe(4)
    expect(game.getExploreStatus().active).toBe(false)
  })

  it('cancels explore result, restores start board, and exits explore mode', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    const beforeExplore = game.getSudoku().getGrid()
    game.startExplore()
    game.guess({ row: 0, col: 2, value: 4 })

    expect(game.cancelExplore()).toBe(true)
    expect(game.isExploring()).toBe(false)
    expect(game.getSudoku().getGrid()).toEqual(beforeExplore)
    expect(game.getExploreStatus().active).toBe(false)
  })

  it('does not commit an invalid explore board', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    game.startExplore()
    game.guess({ row: 0, col: 2, value: 5 })

    expect(game.commitExplore()).toBe(false)
    expect(game.isExploring()).toBe(true)
    expect(game.getExploreStatus().hasConflict).toBe(true)
  })
})
