// Types
export type {
  LetterStatus,
  GuessResult,
  GameStatus,
  GameState,
  GameMode,
} from "./types.js";
export { GAME_MODES } from "./types.js";

// Language configuration
export type { LanguageConfig } from "./languages.js";
export {
  LANGUAGES,
  LANGUAGE_CODES,
  getLanguage,
  DEFAULT_LANG,
} from "./languages.js";

// Theme configuration
export type { ThemeConfig } from "./themes.js";
export { THEMES, getTheme } from "./themes.js";

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
