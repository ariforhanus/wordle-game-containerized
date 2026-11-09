// Client
export {
  setBaseUrl,
  getBaseUrl,
  getToken,
  saveToken,
  clearToken,
  isAuthenticated,
  getTokenUsername,
  ApiError,
  get,
  post,
  put,
  del,
  postForm,
} from "./client.js";

// APIs
export * as wordApi from "./wordApi.js";
export * as scoreApi from "./scoreApi.js";
export * as authApi from "./authApi.js";
export * as adminApi from "./adminApi.js";

// Types
export type {
  WordDto,
  ScoreRequest,
  ScoreResponse,
  LeaderboardTotal,
  DailyStatus,
  UserProfile,
  UserStats,
  LanguageStats,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
} from "./types.js";

export { getAvatarDataUrl } from "./types.js";

export type { AdminStats, AdminUser, DailyWordInfo } from "./adminApi.js";

export * as dailyGameApi from "./dailyGameApi.js";
export type { DailyGame, DailyGameStatus } from "./dailyGameApi.js";
export type { AuditEntry } from "./adminApi.js";
