/**
 * Score display utility.
 *
 * Backend stores scores as integers in 0–9999 range.
 * Displayed as a whole number directly.
 *
 * Examples:
 *   9984 → "9984"
 *   8399 → "8399"
 *   6699 → "6699"
 *      0 → "0"
 */
export function formatScore(score: number): string {
  return score.toString();
}
