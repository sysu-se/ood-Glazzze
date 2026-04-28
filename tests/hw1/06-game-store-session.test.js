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
})
