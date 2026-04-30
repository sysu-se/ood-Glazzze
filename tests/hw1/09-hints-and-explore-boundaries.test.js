import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../src/node_modules/@sudoku/constants.js'
import { loadDomainApi, makePuzzle } from './helpers/domain-api.js'

function createLocalStorageStub() {
  const values = new Map()

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null
    },
    setItem(key, value) {
      values.set(key, String(value))
    },
    removeItem(key) {
      values.delete(key)
    },
    clear() {
      values.clear()
    },
  }
}

function readStore(store) {
  let currentValue
  const unsubscribe = store.subscribe(value => {
    currentValue = value
  })
  unsubscribe()
  return currentValue
}

const SOLVED_GRID = [
  [5, 3, 4, 6, 7, 8, 9, 1, 2],
  [6, 7, 2, 1, 9, 5, 3, 4, 8],
  [1, 9, 8, 3, 4, 2, 5, 6, 7],
  [8, 5, 9, 7, 6, 1, 4, 2, 3],
  [4, 2, 6, 8, 5, 3, 7, 9, 1],
  [7, 1, 3, 9, 2, 4, 8, 5, 6],
  [9, 6, 1, 5, 3, 7, 2, 8, 4],
  [2, 8, 7, 4, 1, 9, 6, 3, 5],
  [3, 4, 5, 2, 8, 6, 1, 7, 9],
]

describe('HW2 hint behavior and explore boundaries', () => {
  it('returns structured cell hints for filled, candidate, and single-candidate cells', async () => {
    const { createSudoku } = await loadDomainApi()
    const sudoku = createSudoku(makePuzzle())

    expect(sudoku.getCellHint(0, 0)).toEqual(expect.objectContaining({
      row: 0,
      col: 0,
      mode: 'filled',
      value: null,
      candidates: [],
    }))

    expect(sudoku.getCellHint(0, 2)).toEqual(expect.objectContaining({
      row: 0,
      col: 2,
      mode: 'candidates',
      value: null,
      candidates: [1, 2, 4],
    }))

    expect(sudoku.getCellHint(4, 4)).toEqual(expect.objectContaining({
      row: 4,
      col: 4,
      mode: 'single',
      value: 5,
      candidates: [5],
    }))
  })

  it('keeps L1 and L2 hints explanatory without changing the board', async () => {
    globalThis.localStorage = createLocalStorageStub()
    globalThis.localStorage.setItem('settings', JSON.stringify(DEFAULT_SETTINGS))

    const { createGameStore } = await import('../../src/stores/gameStore.js')
    const gameStore = createGameStore({ initialGrid: makePuzzle() })

    gameStore.setHintLevel(1)
    expect(gameStore.requestHint(null, null)).toBe(true)
    expect(readStore(gameStore.grid)[4][4]).toBe(0)
    expect(readStore(gameStore.highlightedNextHint)).toEqual({ row: 4, col: 4 })
    expect(readStore(gameStore.explanation).text).toContain('L1 观察级')

    gameStore.setHintLevel(2)
    expect(gameStore.requestHint(0, 2)).toBe(true)
    expect(readStore(gameStore.grid)[0][2]).toBe(0)
    expect(readStore(gameStore.candidateHintsEnabled)).toBe(true)
    expect(readStore(gameStore.candidateHintTarget)).toEqual({ row: 0, col: 2 })
    expect(readStore(gameStore.explanation).text).toContain('L2 候选+推理级')
    expect(readStore(gameStore.explanation).text).not.toContain('逐一尝试候选值')
  })

  it('lets L3 fill a decidable target with an explanation', async () => {
    globalThis.localStorage = createLocalStorageStub()
    globalThis.localStorage.setItem('settings', JSON.stringify(DEFAULT_SETTINGS))

    const { createGameStore } = await import('../../src/stores/gameStore.js')
    const gameStore = createGameStore({ initialGrid: makePuzzle() })

    gameStore.setHintLevel(3)
    expect(gameStore.requestHint(4, 4)).toBe(true)

    expect(readStore(gameStore.grid)[4][4]).toBe(5)
    expect(readStore(gameStore.explanation).text).toContain('L3 决策级：已确定该格答案是 5')
    expect(readStore(gameStore.explanation).text).toContain('已通过当前行/列/宫约束校验')
  })

  it('lets L3 decide a non-single selected empty cell', async () => {
    globalThis.localStorage = createLocalStorageStub()
    globalThis.localStorage.setItem('settings', JSON.stringify(DEFAULT_SETTINGS))

    const { createGameStore } = await import('../../src/stores/gameStore.js')
    const gameStore = createGameStore({ initialGrid: makePuzzle() })

    gameStore.setHintLevel(3)
    expect(gameStore.requestHint(0, 2)).toBe(true)

    expect(readStore(gameStore.grid)[0][2]).toBe(4)
    expect(readStore(gameStore.explanation).text).toContain('完整局面求解')
  })

  it('does not fill L3 decisions when the current board has conflicts', async () => {
    globalThis.localStorage = createLocalStorageStub()
    globalThis.localStorage.setItem('settings', JSON.stringify(DEFAULT_SETTINGS))

    const { createGameStore } = await import('../../src/stores/gameStore.js')
    const gameStore = createGameStore({ initialGrid: makePuzzle() })

    gameStore.guess(0, 2, 5)
    gameStore.setHintLevel(3)

    expect(gameStore.requestHint(0, 3)).toBe(true)
    expect(readStore(gameStore.grid)[0][3]).toBe(0)
    expect(readStore(gameStore.explanation).text).toContain('当前局面存在冲突')
  })

  it('returns false when no hint target exists', async () => {
    globalThis.localStorage = createLocalStorageStub()
    globalThis.localStorage.setItem('settings', JSON.stringify(DEFAULT_SETTINGS))

    const { createGameStore } = await import('../../src/stores/gameStore.js')
    const gameStore = createGameStore({ initialGrid: SOLVED_GRID })

    gameStore.setHintLevel(1)
    expect(gameStore.requestHint(null, null)).toBe(false)
    expect(readStore(gameStore.explanation)).toBeNull()
  })

  it('keeps ordinary undo and redo inside the explore boundary', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    game.guess({ row: 0, col: 2, value: 4 })
    expect(game.startExplore()).toBe(true)
    game.guess({ row: 0, col: 3, value: 6 })

    game.undo()
    expect(game.getSudoku().getGrid()[0][2]).toBe(4)
    expect(game.getSudoku().getGrid()[0][3]).toBe(0)
    expect(game.canUndo()).toBe(false)

    game.undo()
    expect(game.getSudoku().getGrid()[0][2]).toBe(4)

    game.redo()
    expect(game.getSudoku().getGrid()[0][3]).toBe(6)
  })

  it('exposes explore branches as a reactive store for the UI', async () => {
    globalThis.localStorage = createLocalStorageStub()
    globalThis.localStorage.setItem('settings', JSON.stringify(DEFAULT_SETTINGS))

    const { createGameStore } = await import('../../src/stores/gameStore.js')
    const gameStore = createGameStore({ initialGrid: makePuzzle() })

    expect(gameStore.startExplore()).toBe(true)
    expect(readStore(gameStore.exploreBranches)).toEqual([
      expect.objectContaining({ id: 0, label: 'root', current: true }),
    ])

    const branchId = gameStore.createExploreBranch('UI branch')
    expect(branchId).toBe(1)
    expect(readStore(gameStore.exploreBranches)).toEqual([
      expect.objectContaining({ id: 0, current: true }),
      expect.objectContaining({ id: 1, parentId: 0, label: 'UI branch', current: false }),
    ])

    expect(gameStore.switchExploreBranch(branchId)).toBe(true)
    expect(readStore(gameStore.exploreBranches)).toEqual([
      expect.objectContaining({ id: 0, current: false }),
      expect.objectContaining({ id: 1, current: true }),
    ])
  })
})
