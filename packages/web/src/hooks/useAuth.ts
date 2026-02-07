import { useState, useCallback, useEffect } from "react";
import {
  isAuthenticated,
  saveToken,
  clearToken,
  authApi,
  ApiError,
  type UserProfile,
} from "@wordle/api";

/** Extract the error code from an ApiError body, if available */
function extractErrorCode(err: unknown): string | undefined {
  if (err instanceof ApiError && err.body && typeof err.body === "object") {
    const body = err.body as Record<string, unknown>;
    if (typeof body.error === "string") return body.error;
  }
  return undefined;
}

export function useAuth() {
  const [loggedIn, setLoggedIn] = useState(isAuthenticated);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchUser = useCallback(async () => {
    if (!isAuthenticated()) {
      setUser(null);
      setLoggedIn(false);
      return;
    }
    try {
      const profile = await authApi.getMe();
      setUser(profile);
      setLoggedIn(true);
    } catch {
      setUser(null);
      setLoggedIn(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = useCallback(
    async (username: string, password: string) => {
      setLoading(true);
      try {
        const res = await authApi.login({ username, password });
        saveToken(res.token, res.expiresIn);
        setLoggedIn(true);
        await fetchUser();
        return { success: true } as const;
      } catch (err: unknown) {
        const code = extractErrorCode(err);
        return { success: false, errorCode: code } as const;
      } finally {
        setLoading(false);
      }
    },
    [fetchUser]
  );

  const register = useCallback(
    async (data: Parameters<typeof authApi.register>[0]) => {
      setLoading(true);
      try {
        const res = await authApi.register(data);
        if (res.token) {
          saveToken(res.token, res.expiresIn);
          setLoggedIn(true);
          await fetchUser();
        }
        return { success: true } as const;
      } catch (err: unknown) {
        const code = extractErrorCode(err);
        return { success: false, errorCode: code } as const;
      } finally {
        setLoading(false);
      }
    },
    [fetchUser]
  );

  const logout = useCallback(() => {
    clearToken();
    setLoggedIn(false);
    setUser(null);
  }, []);

  return { loggedIn, user, loading, login, register, logout, fetchUser };
}
