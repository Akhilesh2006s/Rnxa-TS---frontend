import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Permission, type User } from "./api";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Super admin: switch to another user's view without reloading the page. */
  impersonate: (userId: string) => Promise<void>;
  stopImpersonating: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const r = await api.get<{ user: User | null }>("/auth/me");
    setUser(r.user);
  }, []);

  useEffect(() => {
    refresh()
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    // Session expired mid-use: drop to the sign-in screen.
    const onExpired = () => setUser(null);
    window.addEventListener("rnxa:unauthenticated", onExpired);
    return () => window.removeEventListener("rnxa:unauthenticated", onExpired);
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.post<{ user: User }>("/auth/login", { email, password });
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined);
    setUser(null);
  }, []);

  const impersonate = useCallback(
    async (userId: string) => {
      await api.post("/auth/impersonate", { userId });
      await refresh();
    },
    [refresh],
  );

  const stopImpersonating = useCallback(async () => {
    await api.post("/auth/impersonate/stop");
    await refresh();
  }, [refresh]);

  return <AuthContext.Provider value={{ user, loading, login, logout, impersonate, stopImpersonating }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

/** Whether the signed-in user holds a permission (the super admin holds all). */
export function useCan(permission: Permission): boolean {
  const { user } = useAuth();
  return !!user && (!!user.isSuperAdmin || !!user.permissions?.includes(permission));
}

/** The signed-in user; only call inside authenticated routes. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error("useUser without a signed-in user");
  return user;
}
