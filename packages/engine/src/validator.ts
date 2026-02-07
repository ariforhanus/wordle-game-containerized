import type { LetterStatus, GuessResult } from "./types.js";
import { getLanguage } from "./languages.js";

/**
 * Build a frequency map of characters in a string.
 */
export function makeCharMap(word: string): Record<string, number> {
  const map: Record<string, number> = {};
  for (const ch of word) {
    map[ch] = (map[ch] ?? 0) + 1;
  }
  return map;
}

/**
 * Evaluate a guess against the correct answer.
 * Returns the status of each letter position.
 *
 * Algorithm (two-pass, handles duplicate letters correctly):
 *  Pass 1: Mark exact matches (correct)
 *  Pass 2: Mark present/absent for remaining letters
 */
export function evaluateGuess(guess: string, answer: string): GuessResult {
  const len = answer.length;
  const statuses: LetterStatus[] = new Array(len).fill("absent");
  const remaining = makeCharMap(answer);

  // Pass 1: exact matches
  for (let i = 0; i < len; i++) {
    if (guess[i] === answer[i]) {
      statuses[i] = "correct";
      remaining[answer[i]]--;
    }
  }

  // Pass 2: present (right letter, wrong position)
  for (let i = 0; i < len; i++) {
    if (statuses[i] === "correct") continue;
    if (remaining[guess[i]] && remaining[guess[i]] > 0) {
      statuses[i] = "present";
      remaining[guess[i]]--;
    }
    // else stays "absent"
  }

  return { guess, statuses };
}

/**
 * Check if a character is a valid letter for the given language.
 * Uses the language config's letterPattern.
 */
export function isValidLetter(ch: string, lang?: string): boolean {
  if (lang) {
    return getLanguage(lang).letterPattern.test(ch);
  }
  // Fallback: accept any letter from any configured language
  return /^[a-zA-ZçÇğĞıİöÖşŞüÜ]$/.test(ch);
}

/**
 * Uppercase a string, respecting the language's locale rules.
 */
export function toUpperCase(str: string, lang: string): string {
  const config = getLanguage(lang);
  return str.toLocaleUpperCase(config.locale);
}

/**
 * Accumulate keyboard statuses from all guesses.
 * Priority: correct > present > absent
 */
export function buildKeyboardState(
  guesses: GuessResult[]
): Record<string, LetterStatus> {
  const kb: Record<string, LetterStatus> = {};

  for (const { guess, statuses } of guesses) {
    for (let i = 0; i < guess.length; i++) {
      const letter = guess[i];
      const newStatus = statuses[i];
      const existing = kb[letter];

      if (!existing) {
        kb[letter] = newStatus;
      } else if (newStatus === "correct") {
        kb[letter] = "correct";
      } else if (newStatus === "present" && existing !== "correct") {
        kb[letter] = "present";
      }
      // "absent" never overwrites
    }
  }

  return kb;
}
