import type { LetterStatus } from "@wordle/engine";
import { getLanguage } from "@wordle/engine";
import { useTranslation } from "react-i18next";
import "./Keyboard.css";

interface KeyboardProps {
  keyboard: Record<string, LetterStatus>;
  onKey: (key: string) => void;
  onEnter: () => void;
  onBackspace: () => void;
  disabled?: boolean;
  /** Hide key status colors (for blind mode) */
  blindMode?: boolean;
  /** Override language for keyboard layout (instead of i18n) */
  lang?: string;
}

export default function Keyboard({
  keyboard,
  onKey,
  onEnter,
  onBackspace,
  disabled,
  blindMode,
  lang: langOverride,
}: KeyboardProps) {
  const { i18n } = useTranslation();
  const langConfig = getLanguage(langOverride ?? i18n.language);
  const rows = langConfig.keyboard;

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
            const status = blindMode ? undefined : keyboard[key];
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
