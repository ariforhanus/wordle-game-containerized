import { useRef, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GameState } from "@wordle/engine";
import "./Board.css";

interface BoardProps {
  state: GameState;
  shakeRow?: boolean;
  /** In blind mode, hide status colors until game ends */
  blindMode?: boolean;
}

export default function Board({ state, shakeRow, blindMode }: BoardProps) {
  const { t } = useTranslation();
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

    if (curr > prev && curr > 0) {
      // A new guess was just submitted — reveal row (curr - 1)
      const rowIdx = curr - 1;
      setRevealingRow(rowIdx);
      setRevealedCells(new Set());

      // Reveal each cell one by one
      for (let c = 0; c < wordLength; c++) {
        setTimeout(() => {
          setRevealedCells((s) => new Set(s).add(c));
        }, c * 300 + 250);
      }

      // Clear revealing state after all animations done
      setTimeout(() => {
        setRevealingRow(null);
        setRevealedCells(new Set());
      }, wordLength * 300 + 400);
    }
  }, [guesses.length, wordLength]);

  const rows: React.ReactNode[] = [];

  for (let r = 0; r < maxAttempts; r++) {
    const cells: React.ReactNode[] = [];

    if (r < guesses.length) {
      // Submitted guess row
      const { guess, statuses } = guesses[r];
      const isRevealing = r === revealingRow;

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
              style={{ animationDelay: `${c * 300}ms` }}
            >
              {guess[c]}
            </div>
          );
        } else if (hideColors) {
          // Blind mode: show letter but no color feedback
          cells.push(
            <div role="gridcell" key={c} className="cell cell-filled cell-blind">
              {guess[c]}
            </div>
          );
        } else {
          // Already revealed (previous rows) — show final state
          cells.push(
            <div role="gridcell" key={c} className={`cell cell-${statuses[c]}`}>
              {guess[c]}
            </div>
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
          </div>
        );
      }
    } else {
      // Empty future row
      for (let c = 0; c < wordLength; c++) {
        cells.push(<div role="gridcell" key={c} className="cell" />);
      }
    }

    rows.push(
      <div role="row" key={r} className="board-row">
        {cells}
      </div>
    );
  }

  return <div className="board" role="grid" aria-label={t("game.enterGuess") as string}>{rows}</div>;
}
