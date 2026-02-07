import { get, put, del } from "./client.js";

// ── Types ────────────────────────────────────────────────

export interface AdminStats {
  totalUsers: number;
  totalGames: number;
  todayPlayers: number;
  activeUsers: number;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
  nationality?: string | null;
  createdAt?: string | null;
  totalGames: number;
}

export interface DailyWordInfo {
  [lang: string]: { word: string; definition?: string } | { error: string };
}

// ── API calls ────────────────────────────────────────────

export function getStats(): Promise<AdminStats> {
  return get<AdminStats>("/api/v1/admin/stats");
}

export function getUsers(search?: string): Promise<AdminUser[]> {
  const q = search ? `?search=${encodeURIComponent(search)}` : "";
  return get<AdminUser[]>(`/api/v1/admin/users${q}`);
}

export function getUser(id: number): Promise<AdminUser> {
  return get<AdminUser>(`/api/v1/admin/users/${id}`);
}

export function changeRole(id: number, role: string): Promise<{ id: number; username: string; role: string }> {
  return put(`/api/v1/admin/users/${id}/role`, { role });
}

export function deleteUser(id: number): Promise<{ deleted: boolean; id: number }> {
  return del(`/api/v1/admin/users/${id}`);
}

export function getDailyWord(): Promise<DailyWordInfo> {
  return get<DailyWordInfo>("/api/v1/admin/daily-word");
}
