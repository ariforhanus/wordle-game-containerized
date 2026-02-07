import { useState, useCallback, useEffect, useRef } from "react";
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
  onWin?: (state: GameState) => void;
  onLose?: (state: GameState) => void;
}

export function useGame({
  answer,
  definition,
  lang,
  validWords,
  onWin,
  onLose,
}: UseGameOptions) {
  const [state, setState] = useState<GameState>(() =>
    createGame(answer, definition, lang)
  );
  const [shakeRow, setShakeRow] = useState(false);
  const onWinRef = useRef(onWin);
  const onLoseRef = useRef(onLose);
  onWinRef.current = onWin;
  onLoseRef.current = onLose;

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

      const { state: next, error } = engineSubmitGuess(prev, validWords);

      if (error) {
        setShakeRow(true);
        setTimeout(() => setShakeRow(false), 600);
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

  // Keyboard handler
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (state.status !== "playing") return;

      const key = e.key;
      if (key === "Enter") {
        submit();
      } else if (key === "Backspace") {
        removeLetter();
      } else if (isValidLetter(key, state.lang)) {
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
    addLetter,
    removeLetter,
    submit,
    shakeRow,
    reset,
  };
}
