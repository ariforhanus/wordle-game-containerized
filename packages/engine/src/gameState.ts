import type { GameState, GameStatus, GuessResult } from "./types.js";
import { evaluateGuess, buildKeyboardState, toUpperCase } from "./validator.js";

const DEFAULT_WORD_LENGTH = 5;
const DEFAULT_MAX_ATTEMPTS = 6;

/**
 * Create initial game state.
 */
export function createGame(
  answer: string,
  definition: string,
  lang: string,
  opts?: { maxAttempts?: number; wordLength?: number }
): GameState {
  return {
    answer: toUpperCase(answer, lang),
    definition,
    guesses: [],
    currentGuess: "",
    status: "playing",
    maxAttempts: opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    wordLength: opts?.wordLength ?? DEFAULT_WORD_LENGTH,
    lang,
    keyboard: {},
    startedAt: Date.now(),
  };
}

/**
 * Add a letter to the current guess.
 * Returns a new state (immutable).
 */
export function addLetter(state: GameState, letter: string): GameState {
  if (state.status !== "playing") return state;
  if (state.currentGuess.length >= state.wordLength) return state;

  const upper = toUpperCase(letter, state.lang);
  return {
    ...state,
    currentGuess: state.currentGuess + upper,
  };
}

/**
 * Remove the last letter from the current guess.
 */
export function removeLetter(state: GameState): GameState {
  if (state.status !== "playing") return state;
  if (state.currentGuess.length === 0) return state;

  return {
    ...state,
    currentGuess: state.currentGuess.slice(0, -1),
  };
}

/**
 * Submit the current guess.
 * Validates against validWords set, evaluates against answer.
 * Returns new state + an error message if invalid.
 */
export function submitGuess(
  state: GameState,
  validWords: Set<string>
): { state: GameState; error?: string } {
  if (state.status !== "playing") {
    return { state };
  }

  const guess = toUpperCase(state.currentGuess, state.lang);

  if (guess.length !== state.wordLength) {
    return { state, error: "not_enough_letters" };
  }

  if (!validWords.has(guess)) {
    return { state, error: "invalid_word" };
  }

  const result: GuessResult = evaluateGuess(guess, state.answer);
  const newGuesses = [...state.guesses, result];
  const keyboard = buildKeyboardState(newGuesses);

  let status: GameStatus = "playing";
  if (guess === state.answer) {
    status = "won";
  } else if (newGuesses.length >= state.maxAttempts) {
    status = "lost";
  }

  return {
    state: {
      ...state,
      guesses: newGuesses,
      currentGuess: "",
      status,
      keyboard,
    },
  };
}

/**
 * Replay a list of previously submitted guesses onto a fresh game state.
 * Used to restore a game session from saved data.
 * The validWords set is bypassed during replay (we trust saved guesses).
 */
export function replayGuesses(
  state: GameState,
  guesses: string[]
): GameState {
  let current = state;
  // Create a permissive validWords set from the guesses themselves
  const replaySet = new Set(guesses.map((g) => toUpperCase(g, state.lang)));
  for (const guess of guesses) {
    const upper = toUpperCase(guess, state.lang);
    // Set current guess
    current = { ...current, currentGuess: upper };
    // Submit
    const result = submitGuess(current, replaySet);
    current = result.state;
  }
  return current;
}

/**
 * Get elapsed time in milliseconds since game started.
 */
export function getElapsedMs(state: GameState): number {
  return Date.now() - state.startedAt;
}

/**
 * Get number of attempts used.
 */
export function getAttempts(state: GameState): number {
  return state.guesses.length;
}
