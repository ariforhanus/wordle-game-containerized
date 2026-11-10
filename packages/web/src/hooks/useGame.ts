import { useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
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
 * same position, letters revealed as present must appear somewhere.
 * Returns null if OK, or a translated error key + params if violated.
 */
function checkHardMode(
  state: GameState,
  guess: string
): { key: string; params: Record<string, string> } | null {
  for (const prev of state.guesses) {
    for (let i = 0; i < prev.statuses.length; i++) {
      const status = prev.statuses[i];
      const letter = prev.guess[i];

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
  const [state, setState] = useState<GameState>(() =>
    createGame(answer, definition, lang)
  );
  const [shakeRow, setShakeRow] = useState(false);
  const onWinRef = useRef(onWin);
  const onLoseRef = useRef(onLose);
  const onInvalidWordRef = useRef(onInvalidWord);
  const onHardModeErrorRef = useRef(onHardModeError);
  const hardModeRef = useRef(hardMode);
  onWinRef.current = onWin;
  onLoseRef.current = onLose;
  onInvalidWordRef.current = onInvalidWord;
  onHardModeErrorRef.current = onHardModeError;
  hardModeRef.current = hardMode;

  // Reset game when answer changes
  useEffect(() => {
    setState(createGame(answer, definition, lang));
  }, [answer, definition, lang]);

  const addLetter = useCallback(
    (letter: string) => {
      setState((s) => {
        if (s.status !== "playing") return s;
        const upper = toUpperCase(letter, s.lang);
        if (!isValidLetter(upper, s.lang)) return s;
        return engineAddLetter(s, upper);
      });
    },
    []
  );

  const removeLetter = useCallback(() => {
    setState((s) => engineRemoveLetter(s));
  }, []);

  const submit = useCallback(() => {
    setState((prev) => {
      if (prev.currentGuess.length !== prev.wordLength) return prev;

      // Hard mode check
      if (hardModeRef.current && prev.guesses.length > 0) {
        const guess = toUpperCase(prev.currentGuess, prev.lang);
        const violation = checkHardMode(prev, guess);
        if (violation) {
          setShakeRow(true);
          setTimeout(() => setShakeRow(false), 600);
          onHardModeErrorRef.current?.(
            `${violation.key}|${JSON.stringify(violation.params)}`
          );
          return prev;
        }
      }

      const { state: next, error } = engineSubmitGuess(prev, validWords);

      if (error) {
        setShakeRow(true);
        setTimeout(() => setShakeRow(false), 600);
        onInvalidWordRef.current?.();
        return prev;
      }

      if (next.status === "won") {
        setTimeout(() => onWinRef.current?.(next), 300);
      } else if (next.status === "lost") {
        setTimeout(() => onLoseRef.current?.(next), 300);
      }

      return next;
    });
  }, [validWords]);

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
  }, [state.status, addLetter, removeLetter, submit]);

  const reset = useCallback(
    (newAnswer: string, newDef: string) => {
      setState(createGame(newAnswer, newDef, lang));
    },
    [lang]
  );

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
