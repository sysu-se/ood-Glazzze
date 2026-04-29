import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../src/node_modules/@sudoku/constants.js'

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

describe('HW1 game store session reset', () => {
  it('clears session-scoped UI state when starting a new game', async () => {
    globalThis.localStorage = createLocalStorageStub()
    globalThis.localStorage.setItem('settings', JSON.stringify(DEFAULT_SETTINGS))

    const { makePuzzle } = await import('./helpers/domain-api.js')
    const { createGameStore } = await import('../../src/stores/gameStore.js')
    const { cursor } = await import('../../src/node_modules/@sudoku/stores/cursor.js')
    const { candidates } = await import('../../src/node_modules/@sudoku/stores/candidates.js')
    const { hints, usedHints } = await import('../../src/node_modules/@sudoku/stores/hints.js')
    const { notes } = await import('../../src/node_modules/@sudoku/stores/notes.js')

    const gameStore = createGameStore({ initialGrid: makePuzzle() })

    cursor.set(3, 4)
    candidates.add({ x: 2, y: 1 }, 7)
    notes.toggle()
    hints.useHint()

    gameStore.newGame(makePuzzle())

    expect(readStore(cursor)).toEqual({ x: null, y: null })
    expect(readStore(candidates)).toEqual({})
    expect(readStore(notes)).toBe(false)
    expect(readStore(hints)).toBe(DEFAULT_SETTINGS.hints)
    expect(readStore(usedHints)).toBe(0)
    expect(readStore(gameStore.paused)).toBe(true)
  })

  it('applyHint fills the selected cell even when it has multiple candidates', async () => {
    globalThis.localStorage = createLocalStorageStub()
    globalThis.localStorage.setItem('settings', JSON.stringify(DEFAULT_SETTINGS))

    const { makePuzzle } = await import('./helpers/domain-api.js')
    const { createGameStore } = await import('../../src/stores/gameStore.js')

    const gameStore = createGameStore({ initialGrid: makePuzzle() })

    const applied = gameStore.applyHint(0, 2)

    expect(applied).toBe(true)
    expect(readStore(gameStore.grid)[0][2]).toBe(4)
  })

  it('exposes computed candidates and next hint for the UI', async () => {
    globalThis.localStorage = createLocalStorageStub()
    globalThis.localStorage.setItem('settings', JSON.stringify(DEFAULT_SETTINGS))

    const { makePuzzle } = await import('./helpers/domain-api.js')
    const { createGameStore } = await import('../../src/stores/gameStore.js')

    const gameStore = createGameStore({ initialGrid: makePuzzle() })

    const candidates = readStore(gameStore.computedCandidates)
    const nextHint = readStore(gameStore.nextHint)

    expect(candidates['2,0']).toEqual([1, 2, 4])
    expect(nextHint).toEqual({ row: 4, col: 4, value: 5, candidates: [5] })
  })

  it('toggles candidate hint mode and highlighted next hint state', async () => {
    globalThis.localStorage = createLocalStorageStub()
    globalThis.localStorage.setItem('settings', JSON.stringify(DEFAULT_SETTINGS))

    const { makePuzzle } = await import('./helpers/domain-api.js')
    const { createGameStore } = await import('../../src/stores/gameStore.js')

    const gameStore = createGameStore({ initialGrid: makePuzzle() })

    expect(readStore(gameStore.candidateHintsEnabled)).toBe(false)
    expect(readStore(gameStore.highlightedNextHint)).toBeNull()

    gameStore.enableCandidateHints()
    expect(readStore(gameStore.candidateHintsEnabled)).toBe(true)
    expect(readStore(gameStore.highlightedNextHint)).toBeNull()

    gameStore.highlightNextHint(4, 4)
      expect(readStore(gameStore.candidateHintsEnabled)).toBe(true)
    expect(readStore(gameStore.highlightedNextHint)).toEqual({ row: 4, col: 4 })
  })

  it('locks candidate hints to the clicked cell target', async () => {
    globalThis.localStorage = createLocalStorageStub()
    globalThis.localStorage.setItem('settings', JSON.stringify(DEFAULT_SETTINGS))

    const { makePuzzle } = await import('./helpers/domain-api.js')
    const { createGameStore } = await import('../../src/stores/gameStore.js')
    const { cursor } = await import('../../src/node_modules/@sudoku/stores/cursor.js')

    const gameStore = createGameStore({ initialGrid: makePuzzle() })

    cursor.set(2, 0)
    gameStore.enableCandidateHints(0, 2)

    expect(readStore(gameStore.candidateHintTarget)).toEqual({ row: 0, col: 2 })

    cursor.set(4, 4)
    expect(readStore(gameStore.candidateHintTarget)).toEqual({ row: 0, col: 2 })
  })

  it('keeps candidate hints visible after showing next hint', async () => {
    globalThis.localStorage = createLocalStorageStub()
    globalThis.localStorage.setItem('settings', JSON.stringify(DEFAULT_SETTINGS))

    const { makePuzzle } = await import('./helpers/domain-api.js')
    const { createGameStore } = await import('../../src/stores/gameStore.js')

    const gameStore = createGameStore({ initialGrid: makePuzzle() })

    gameStore.enableCandidateHints(0, 2)
    gameStore.highlightNextHint(4, 4)

    expect(readStore(gameStore.candidateHintsEnabled)).toBe(true)
    expect(readStore(gameStore.candidateHintTarget)).toEqual({ row: 0, col: 2 })
    expect(readStore(gameStore.highlightedNextHint)).toEqual({ row: 4, col: 4 })
  })
})
