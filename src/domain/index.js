/**
 * src/domain/index.js
 * 导出所有领域对象的工厂函数和类
 */

export { Sudoku, createSudoku, createSudokuFromJSON } from './sudoku.js';
export { Game, createGame, createGameFromJSON } from './game.js';
export { ExploreSession, ExploreBranch } from './exploreSession.js';
export {
  HINT_LEVEL_DEFS,
  buildHintAction,
  fillCellByHint,
  normalizeHintLevel,
} from './hintService.js';
