export interface WordDto {
  word: string;
  definition: string;
}

export interface ScoreRequest {
  attempts: number;
  durationMs: number;
  word: string;
  won: boolean;
}

export interface ScoreResponse {
  id: number;
  username: string;
  score: number;
  attempts: number;
  durationMs: number;
  language: string;
  playedAt: string;
  currentStreak?: number;
}

export interface DailyStatus {
  played: boolean;
  score?: ScoreResponse;
}

export interface UserProfile {
  emailVerified: boolean;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  nationality?: string;
  role: string;
  /** Base64-encoded avatar bytes (from backend) */
  avatar?: string | null;
  /** MIME type of the avatar (e.g. "image/jpeg") */
  avatarContentType?: string | null;
}

/** Helper: build a data-URI from the backend's base64 avatar fields */
export function getAvatarDataUrl(profile: UserProfile): string | null {
  if (profile.avatar && profile.avatarContentType) {
    return `data:${profile.avatarContentType};base64,${profile.avatar}`;
  }
  return null;
}

export interface UserStats {
  totalGames: number;
  bestScore: number;
  averageScore: number;
  averageDurationSeconds: number;
  gamesPerLanguage: Record<string, number>;
  currentStreak: number;
  bestStreak: number;
  guessDistribution: Record<string, number>;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  nationality?: string;
}

export interface AuthResponse {
  token: string;
  expiresIn: number;
}
