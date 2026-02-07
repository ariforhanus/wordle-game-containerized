/**
 * Central theme configuration.
 *
 * To add a new theme:
 *  1. Create a JSON word file at public/themes/<id>.json  →  {"words":["WORD1","WORD2",...]}
 *  2. Add an entry to the THEMES array below.
 *  3. Done — it will appear on the theme selection page automatically.
 */

export interface ThemeConfig {
  /** URL slug (e.g. "marvel") */
  id: string;
  /** Display name (e.g. "Marvel") */
  name: string;
  /** FontAwesome icon class (e.g. "fa-mask") */
  icon: string;
  /** Primary gradient color (e.g. "#e23636") */
  color: string;
  /** Secondary gradient color — defaults to a darker shade of `color` */
  colorEnd?: string;
  /** Word length (default 5) */
  wordLength: number;
  /** Path to the JSON word file served from public/ */
  wordsFile: string;
}

// ── Theme registry ──────────────────────────────────────────

export const THEMES: ThemeConfig[] = [
  {
    id: "marvel",
    name: "Marvel",
    icon: "fa-mask",
    color: "#e23636",
    colorEnd: "#b71c1c",
    wordLength: 5,
    wordsFile: "/themes/marvel.json",
  },
  {
    id: "football",
    name: "Football",
    icon: "fa-futbol",
    color: "#00b894",
    colorEnd: "#00796b",
    wordLength: 5,
    wordsFile: "/themes/football.json",
  },
];

/** Look up a theme by its id, returns undefined if not found */
export function getTheme(id: string): ThemeConfig | undefined {
  return THEMES.find((t) => t.id === id);
}
