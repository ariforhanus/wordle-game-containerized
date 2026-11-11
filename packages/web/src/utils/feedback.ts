import type { LetterStatus } from "@wordle/engine";
export const feedbackSymbols: Record<LetterStatus, string> = {
  correct: "✓", present: "•", absent: "×",
};
