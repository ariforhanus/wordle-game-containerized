import { useState, useCallback, useLayoutEffect, useRef, type SetStateAction } from "react";
import {
  createGame,
  addLetter as engineAddLetter,
  removeLetter as engineRemoveLetter,
  submitGuess as engineSubmitGuess,
  isValidLetter,
  toUpperCase,
  type GameState,
} from "@wordle/engine";

interface UseGameOptions {
  answer: string;
  definition: string;
  lang: string;
  validWords: Set<string>;
  hardMode?: boolean;
  onWin?: (state: GameState) => void;
  onLose?: (state: GameState) => void;
  onInvalidWord?: () => void;
  onHardModeError?: (msg: string) => void;
}

/**
 * Check hard-mode constraints: letters revealed as correct must stay in the
 * same position; present letters may appear anywhere. Each row establishes a
 * minimum multiplicity. Take the maximum across rows, never their sum, and do
 * not count gray copies or infer an upper bound from them.
 * Returns null if OK, or a translated error key + params if violated.
 */
function checkHardMode(
  state: GameState,
  guess: string
): { key: string; params: Record<string, string> } | null {
  const minimums = new Map<string, number>();
  for (const prev of state.guesses) {
    const revealed = new Map<string, number>();
    for (let i = 0; i < prev.statuses.length; i++) {
      const status = prev.statuses[i];
      const letter = prev.guess[i];
      if (status === "correct" || status === "present") {
        revealed.set(letter, (revealed.get(letter) ?? 0) + 1);
      }

      if (status === "correct") {
        // Must be in the same position
        if (guess[i] !== letter) {
          return {
            key: "game.hardModeCorrect",
            params: { pos: String(i + 1), letter },
          };
        }
      } else if (status === "present") {
        // Must appear somewhere in the guess
        if (!guess.includes(letter)) {
          return {
            key: "game.hardModePresent",
            params: { letter },
          };
        }
      }
    }
    for (const [letter, count] of revealed) {
      minimums.set(letter, Math.max(minimums.get(letter) ?? 0, count));
    }
  }
  for (const [letter, count] of minimums) {
    if (Array.from(guess).filter((value) => value === letter).length < count) {
      return { key: "game.hardModeCount", params: { letter, count: String(count) } };
    }
  }
  return null;
}

export function useGame({
  answer,
  definition,
  lang,
  validWords,
  hardMode = false,
  onWin,
  onLose,
  onInvalidWord,
  onHardModeError,
}: UseGameOptions) {
  const [state, setRenderedState] = useState<GameState>(() =>
    createGame(answer, definition, lang)
  );
  // Serialize input handlers even when React batches typing and Enter together.
  // React receives values, so replaying an updater cannot replay notifications.
  const stateRef = useRef(state);
  const setState = useCallback((update: SetStateAction<GameState>) => {
    const next = typeof update === "function" ? update(stateRef.current) : update;
    stateRef.current = next;
    setRenderedState(next);
  }, []);
  const [shakeRow, setShakeRow] = useState(false);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const terminalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onWinRef = useRef(onWin);
  const onLoseRef = useRef(onLose);
  const onInvalidWordRef = useRef(onInvalidWord);
  const onHardModeErrorRef = useRef(onHardModeError);
  useLayoutEffect(() => {
    onWinRef.current = onWin;
    onLoseRef.current = onLose;
    onInvalidWordRef.current = onInvalidWord;
    onHardModeErrorRef.current = onHardModeError;
  });

  const clearTimers = useCallback(() => {
    if (shakeTimer.current !== null) clearTimeout(shakeTimer.current);
    if (terminalTimer.current !== null) clearTimeout(terminalTimer.current);
    shakeTimer.current = terminalTimer.current = null;
  }, []);

  const reset = useCallback((newAnswer: string, newDef: string) => {
    clearTimers();
    setShakeRow(false);
    setState(createGame(newAnswer, newDef, lang));
  }, [lang, clearTimers, setState]);

  // Reset before input can reach a board for the previous answer/language.
  useLayoutEffect(() => {
    reset(answer, definition);
    return clearTimers;
  }, [answer, definition, reset, clearTimers]);

  const addLetter = useCallback(
    (letter: string) => {
      const current = stateRef.current;
      if (!current.answer || current.status !== "playing") return;
      const upper = toUpperCase(letter, current.lang);
      if (isValidLetter(upper, current.lang)) setState(engineAddLetter(current, upper));
    },
    [setState]
  );

  const removeLetter = useCallback(() => {
    setState(engineRemoveLetter(stateRef.current));
  }, [setState]);

  const shake = useCallback(() => {
    if (shakeTimer.current !== null) clearTimeout(shakeTimer.current);
    setShakeRow(true);
    shakeTimer.current = setTimeout(() => {
      shakeTimer.current = null;
      setShakeRow(false);
    }, 600);
  }, []);

  const submit = useCallback(() => {
    const prev = stateRef.current;
    if (!prev.answer || prev.status !== "playing" || prev.currentGuess.length !== prev.wordLength) return;

    // Hard mode check
    if (hardMode && prev.guesses.length > 0) {
      const guess = toUpperCase(prev.currentGuess, prev.lang);
      const violation = checkHardMode(prev, guess);
      if (violation) {
        shake();
        onHardModeErrorRef.current?.(
          `${violation.key}|${JSON.stringify(violation.params)}`
        );
        return;
      }
    }

    const { state: next, error } = engineSubmitGuess(prev, validWords);

    if (error) {
      shake();
      onInvalidWordRef.current?.();
      return;
    }

    setState(next);
    if (next.status === "won" || next.status === "lost") {
      terminalTimer.current = setTimeout(() => {
        terminalTimer.current = null;
        if (next.status === "won") onWinRef.current?.(next);
        else onLoseRef.current?.(next);
      }, 300);
    }
  }, [validWords, hardMode, setState, shake]);

  // Install before paint, so the visible board and keyboard handler agree.
  useLayoutEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (state.status !== "playing" || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (e.target instanceof HTMLElement &&
          (e.target.closest("input, textarea, select, header, [role=dialog]") ||
           (e.key === "Enter" && e.target.closest("button, a, summary")))) return;

      const key = e.key;
      if (key === "Enter") {
        submit();
      } else if (key === "Backspace") {
        removeLetter();
      } else if (isValidLetter(key, state.lang)) {
        if (e.target instanceof HTMLElement && e.target.closest("button, a, summary"))
          document.querySelector<HTMLElement>(".board")?.focus({ preventScroll: true });
        addLetter(key);
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [state.status, state.lang, addLetter, removeLetter, submit]);

  return {
    state,
    setState,
    addLetter,
    removeLetter,
    submit,
    shakeRow,
    reset,
  };
}
