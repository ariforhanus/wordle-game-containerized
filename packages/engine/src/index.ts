// Types
export type {
  LetterStatus,
  GuessResult,
  GameStatus,
  GameState,
  GameMode,
} from "./types.js";
export { GAME_MODES } from "./types.js";

// Game state management
export {
  createGame,
  addLetter,
  removeLetter,
  submitGuess,
  getElapsedMs,
  getAttempts,
} from "./gameState.js";

// Validation utilities
export {
  evaluateGuess,
  makeCharMap,
  isValidLetter,
  toUpperCase,
  buildKeyboardState,
} from "./validator.js";
