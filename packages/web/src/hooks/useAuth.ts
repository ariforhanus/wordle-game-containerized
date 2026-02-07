import { useState, useCallback, useEffect } from "react";
import {
  isAuthenticated,
  saveToken,
  clearToken,
  authApi,
  type UserProfile,
} from "@wordle/api";

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
        return { success: true };
      } catch (err: unknown) {
        return { success: false, error: err };
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
        return { success: true };
      } catch (err: unknown) {
        return { success: false, error: err };
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
