import { get } from "./client.js";
import type { WordDto } from "./types.js";

export function getRandomWord(lang: string): Promise<WordDto> {
  return get<WordDto>(`/api/v1/word/random?lang=${lang}`);
}

export function getDailyWord(lang: string): Promise<WordDto> {
  return get<WordDto>(`/api/v1/word/daily?lang=${lang}`);
}
