// Client
export {
  setBaseUrl,
  getBaseUrl,
  getToken,
  saveToken,
  clearToken,
  isAuthenticated,
  ApiError,
  get,
  post,
  postForm,
} from "./client.js";

// APIs
export * as wordApi from "./wordApi.js";
export * as scoreApi from "./scoreApi.js";
export * as authApi from "./authApi.js";

// Types
export type {
  WordDto,
  ScoreRequest,
  ScoreResponse,
  DailyStatus,
  UserProfile,
  UserStats,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
} from "./types.js";

export { getAvatarDataUrl } from "./types.js";
