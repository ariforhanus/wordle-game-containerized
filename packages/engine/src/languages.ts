/**
 * Central language configuration.
 *
 * To add a new language:
 *  1. Add an entry here (keyboard, alphabet, locale, etc.)
 *  2. Add a translation JSON in @wordle/i18n/locales/<code>.json
 *  3. Export it from @wordle/i18n/src/index.ts
 *  4. (Backend) Add the word list for that language
 *  5. (Optional) Add /public/words_<code>_possible.txt for client-side validation
 *
 * That's it — the entire frontend will pick it up automatically.
 */

export interface LanguageConfig {
  /** ISO language code (e.g. "en", "tr", "de") */
  code: string;
  /** Native display name (e.g. "Türkçe") */
  name: string;
  /** Flag emoji */
  flag: string;
  /** BCP-47 locale for toUpperCase / toLocaleLowerCase (e.g. "tr-TR") */
  locale: string;
  /** Regex pattern that matches a single valid letter in this language */
  letterPattern: RegExp;
  /** Keyboard layout — array of rows, each row is array of key labels */
  keyboard: string[][];
  /** Whether the backend has definition / hint support for this language */
  hasHints: boolean;
  /** Word length (default 5) */
  wordLength?: number;
}

// ────────────────────────────────────────────────────────────

const ENGLISH: LanguageConfig = {
  code: "en",
  name: "English",
  flag: "🇬🇧",
  locale: "en-US",
  letterPattern: /^[a-zA-Z]$/,
  keyboard: [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "⌫"],
  ],
  hasHints: true,
};

const TURKISH: LanguageConfig = {
  code: "tr",
  name: "Türkçe",
  flag: "🇹🇷",
  locale: "tr-TR",
  letterPattern: /^[a-zA-ZçÇğĞıİöÖşŞüÜ]$/,
  keyboard: [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "Ğ", "Ü"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ş", "İ"],
    ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "Ö", "Ç", "⌫"],
  ],
  hasHints: false,
};

// ── Registry ────────────────────────────────────────────────

/** All supported languages, keyed by language code */
export const LANGUAGES: Record<string, LanguageConfig> = {
  en: ENGLISH,
  tr: TURKISH,
};

/** Ordered list of language codes (controls UI order) */
export const LANGUAGE_CODES: string[] = Object.keys(LANGUAGES);

/** Get config for a language code, falls back to English */
export function getLanguage(code: string): LanguageConfig {
  return LANGUAGES[code] ?? LANGUAGES["en"];
}

/** Get the default language code */
export const DEFAULT_LANG = "en";
