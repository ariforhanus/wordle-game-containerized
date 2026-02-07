import type { GameState } from "@wordle/engine";
import "./Board.css";

interface BoardProps {
  state: GameState;
  shakeRow?: boolean;
}

export default function Board({ state, shakeRow }: BoardProps) {
  const { guesses, currentGuess, maxAttempts, wordLength } = state;
  const rows: React.ReactNode[] = [];

  for (let r = 0; r < maxAttempts; r++) {
    const cells: React.ReactNode[] = [];

    if (r < guesses.length) {
      // Submitted guess
      const { guess, statuses } = guesses[r];
      for (let c = 0; c < wordLength; c++) {
        cells.push(
          <div key={c} className={`cell cell-${statuses[c]} flip`}>
            {guess[c]}
          </div>
        );
      }
    } else if (r === guesses.length) {
      // Current input row
      for (let c = 0; c < wordLength; c++) {
        const letter = currentGuess[c] ?? "";
        cells.push(
          <div
            key={c}
            className={`cell ${letter ? "cell-filled" : ""} ${
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
        cells.push(<div key={c} className="cell" />);
      }
    }

    rows.push(
      <div key={r} className="board-row">
        {cells}
      </div>
    );
  }

  return <div className="board">{rows}</div>;
}
