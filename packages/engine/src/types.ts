/** Status of a single letter in a guess */
export type LetterStatus = "correct" | "present" | "absent";

/** Result of evaluating a single guess against the answer */
export interface GuessResult {
  guess: string;
  statuses: LetterStatus[];
}

/** Overall game status */
export type GameStatus = "playing" | "won" | "lost";

/** Immutable snapshot of game state */
export interface GameState {
  /** The correct answer (uppercase) */
  answer: string;
  /** Definition / hint text */
  definition: string;
  /** All submitted guesses with their results */
  guesses: GuessResult[];
  /** Current in-progress guess (not yet submitted) */
  currentGuess: string;
  /** Game status */
  status: GameStatus;
  /** Maximum number of attempts allowed */
  maxAttempts: number;
  /** Word length */
  wordLength: number;
  /** Language code */
  lang: string;
  /** Keyboard letter statuses (accumulated from all guesses) */
  keyboard: Record<string, LetterStatus>;
  /** Timestamp when game started (ms) */
  startedAt: number;
}

/** Game mode configuration */
export interface GameMode {
  id: string;
  /** Whether scores should be submitted */
  trackScore: boolean;
  /** Whether replay is allowed */
  allowReplay: boolean;
  /** Whether a timer should be shown */
  showTimer: boolean;
}

/** Available game modes */
export const GAME_MODES: Record<string, GameMode> = {
  practice: {
    id: "practice",
    trackScore: false,
    allowReplay: true,
    showTimer: false,
  },
  daily: {
    id: "daily",
    trackScore: true,
    allowReplay: false,
    showTimer: true,
  },
  themed: {
    id: "themed",
    trackScore: false,
    allowReplay: true,
    showTimer: false,
  },
};
