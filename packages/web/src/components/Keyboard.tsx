import type { LetterStatus } from "@wordle/engine";
import { useTranslation } from "react-i18next";
import "./Keyboard.css";

const ROWS_EN = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "⌫"],
];

const ROWS_TR = [
  ["E", "R", "T", "Y", "U", "I", "O", "P", "Ğ", "Ü"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ş", "İ"],
  ["ENTER", "Z", "C", "V", "B", "N", "M", "Ö", "Ç", "⌫"],
];

interface KeyboardProps {
  keyboard: Record<string, LetterStatus>;
  onKey: (key: string) => void;
  onEnter: () => void;
  onBackspace: () => void;
  disabled?: boolean;
}

export default function Keyboard({
  keyboard,
  onKey,
  onEnter,
  onBackspace,
  disabled,
}: KeyboardProps) {
  const { i18n } = useTranslation();
  const rows = i18n.language === "tr" ? ROWS_TR : ROWS_EN;

  function handleClick(key: string) {
    if (disabled) return;
    if (key === "ENTER") onEnter();
    else if (key === "⌫") onBackspace();
    else onKey(key);
  }

  return (
    <div className="keyboard">
      {rows.map((row, i) => (
        <div key={i} className="keyboard-row">
          {row.map((key) => {
            const status = keyboard[key];
            const isSpecial = key === "ENTER" || key === "⌫";
            return (
              <button
                key={key}
                className={`key ${status ? `key-${status}` : ""} ${
                  isSpecial ? "key-wide" : ""
                }`}
                onClick={() => handleClick(key)}
                disabled={disabled}
              >
                {key}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
