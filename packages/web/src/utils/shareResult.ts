import type { GameState, GuessResult } from "@wordle/engine";

const EMOJI_MAP = {
  correct: "🟩",
  present: "🟨",
  absent: "⬛",
} as const;

/**
 * Build the emoji grid string for sharing a Wordle result.
 */
export function buildEmojiGrid(guesses: GuessResult[]): string {
  return guesses
    .map((g) => g.statuses.map((s) => EMOJI_MAP[s]).join(""))
    .join("\n");
}

/**
 * Build a full shareable text for the game result.
 */
export function buildShareText(
  state: GameState,
  mode: "practice" | "daily" | "themed",
  extra?: { themeName?: string }
): string {
  const won = state.status === "won";
  const attempts = won ? `${state.guesses.length}/${state.maxAttempts}` : `X/${state.maxAttempts}`;

  let title = "Wordle";
  if (mode === "daily") {
    title = "Wordle Daily";
  } else if (mode === "themed" && extra?.themeName) {
    title = `Wordle ${extra.themeName}`;
  }

  const grid = buildEmojiGrid(state.guesses);

  return `${title} ${attempts}\n\n${grid}`;
}

/**
 * Copy text to clipboard. Returns true on success.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }
}
