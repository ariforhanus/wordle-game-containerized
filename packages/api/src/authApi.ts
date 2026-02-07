import { get, post, postForm } from "./client.js";
import type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  UserProfile,
} from "./types.js";

export function login(data: LoginRequest): Promise<AuthResponse> {
  return post<AuthResponse>("/api/v1/auth/login", data);
}

export async function register(
  data: RegisterRequest
): Promise<AuthResponse & { success: boolean; message: string }> {
  return post("/api/v1/auth/register", data);
}

export function getMe(): Promise<UserProfile> {
  return get<UserProfile>("/api/v1/auth/me");
}

export function updateProfile(
  data: Partial<Pick<UserProfile, "username" | "firstName" | "lastName" | "nationality">>
): Promise<UserProfile> {
  return post<UserProfile>("/api/v1/auth/profile", data);
}

export function uploadAvatar(file: File): Promise<void> {
  const fd = new FormData();
  fd.append("file", file);
  return postForm("/api/v1/auth/avatar", fd);
}
