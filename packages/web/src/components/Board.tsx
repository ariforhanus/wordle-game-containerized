import { useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GameState } from "@wordle/engine";
import "./Board.css";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { feedbackSymbols } from "../utils/feedback";

interface BoardProps {
  state: GameState;
  shakeRow?: boolean;
  /** In blind mode, hide status colors until game ends */
  blindMode?: boolean;
}

export default function Board({ state, shakeRow, blindMode }: BoardProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const { guesses, currentGuess, maxAttempts, wordLength, status } = state;

  // Are colors hidden? Only in blind mode while still playing
  const hideColors = blindMode && status === "playing";

  // Track which row is currently revealing (just submitted)
  const prevGuessCount = useRef(guesses.length);
  const [revealingRow, setRevealingRow] = useState<number | null>(null);
  const [revealedCells, setRevealedCells] = useState<Set<number>>(new Set());

  useEffect(() => {
    const prev = prevGuessCount.current;
    const curr = guesses.length;
    prevGuessCount.current = curr;

    const timers: ReturnType<typeof setTimeout>[] = [];
    if (reducedMotion) { setRevealingRow(null); setRevealedCells(new Set()); }
    if (!reducedMotion && curr > prev && curr > 0) {
      // A new guess was just submitted — reveal row (curr - 1)
      const rowIdx = curr - 1;
      setRevealingRow(rowIdx);
      setRevealedCells(new Set());

      // Reveal each cell one by one
      for (let c = 0; c < wordLength; c++) {
        timers.push(
          setTimeout(
            () => {
              setRevealedCells((s) => new Set(s).add(c));
            },
            c * 300 + 250,
          ),
        );
      }

      // Clear revealing state after all animations done
      timers.push(
        setTimeout(
          () => {
            setRevealingRow(null);
            setRevealedCells(new Set());
          },
          wordLength * 300 + 400,
        ),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [guesses.length, wordLength, reducedMotion]);

  const rows: React.ReactNode[] = [];

  for (let r = 0; r < maxAttempts; r++) {
    const cells: React.ReactNode[] = [];

    if (r < guesses.length) {
      // Submitted guess row
      const { guess, statuses } = guesses[r];
      const isRevealing = !reducedMotion && r === revealingRow;

      for (let c = 0; c < wordLength; c++) {
        if (isRevealing && !hideColors) {
          // Currently revealing: stagger flip animation (not in blind mode)
          const hasRevealed = revealedCells.has(c);
          const statusClass = hasRevealed ? `cell-${statuses[c]}` : "";
          cells.push(
            <div
              role="gridcell"
              key={c}
              className={`cell cell-filled cell-reveal ${statusClass}`}
              aria-label={`${guess[c]}: ${t(`feedback.${statuses[c]}`)}`}
              data-feedback-symbol={hasRevealed ? feedbackSymbols[statuses[c]] : undefined}
              style={{ animationDelay: `${c * 300}ms` }}
            >
              {guess[c]}
            </div>,
          );
        } else if (hideColors) {
          // Blind mode: show letter but no color feedback
          cells.push(
            <div
              role="gridcell"
              key={c}
              className="cell cell-filled cell-blind"
              aria-label={`${guess[c]}: ${t("feedback.hidden")}`}
            >
              {guess[c]}
            </div>,
          );
        } else {
          // Already revealed (previous rows) — show final state
          cells.push(
            <div role="gridcell" key={c} className={`cell cell-${statuses[c]}`}
              aria-label={`${guess[c]}: ${t(`feedback.${statuses[c]}`)}`}
              data-feedback-symbol={feedbackSymbols[statuses[c]]}>
              {guess[c]}
            </div>,
          );
        }
      }
    } else if (r === guesses.length) {
      // Current input row
      for (let c = 0; c < wordLength; c++) {
        const letter = currentGuess[c] ?? "";
        const popClass = letter ? "cell-pop" : "";
        cells.push(
          <div
            role="gridcell"
            key={c}
            className={`cell ${letter ? "cell-filled" : ""} ${popClass} ${
              shakeRow ? "shake" : ""
            }`}
          >
            {letter}
          </div>,
        );
      }
    } else {
      // Empty future row
      for (let c = 0; c < wordLength; c++) {
        cells.push(<div role="gridcell" key={c} className="cell" />);
      }
    }

    rows.push(
      <div role="row" key={r} className="board-row" aria-label={t("feedback.row", { row: r + 1 })}>
        {cells}
      </div>,
    );
  }

  const last = guesses[guesses.length - 1];
  const announcement = last ? `${t("feedback.row", { row: guesses.length })}: ${last.guess}. ${hideColors
    ? t("feedback.hidden")
    : Array.from(last.guess).map((letter, index) => `${letter}: ${t(`feedback.${last.statuses[index]}`)}`).join("; ")}` : "";
  return (
    <div className="board-container">
      <div className="board" role="grid" tabIndex={0} aria-readonly="true" aria-rowcount={maxAttempts} aria-colcount={wordLength}
        aria-label={t("game.enterGuess")}>
        {rows}
      </div>
      <p className="feedback-legend">{hideColors ? t("feedback.hidden") : t("feedback.legend")}</p>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
    </div>
  );
}
