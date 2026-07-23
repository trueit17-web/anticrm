import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import { api, ApiError, clearToken, getToken, setActiveBranchId, setToken } from "../api/client";
import { AuthUser } from "../types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  // Bumped by every operation that decides the session's identity
  // (mount-time bootstrap, login, logout) — each such operation checks its
  // own captured generation before applying its result, so a slow /auth/me
  // response can't land after a fresh login and either overwrite the new
  // user with the old one, or — worse — its failure branch clearing the
  // brand-new token because the *old* one it was checking is invalid.
  const authGeneration = useRef(0);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    const generation = ++authGeneration.current;
    api
      .get<{ user: AuthUser }>("/auth/me")
      .then((res) => {
        if (generation !== authGeneration.current) return;
        setUser(res.user);
      })
      .catch((err) => {
        if (generation !== authGeneration.current) return;
        // Only a confirmed "this token is invalid" (401) should clear it —
        // a network hiccup or transient 5xx shouldn't silently sign out
        // someone whose token might still be perfectly valid.
        if (err instanceof ApiError && err.status === 401) {
          clearToken();
        }
      })
      .finally(() => {
        if (generation === authGeneration.current) setLoading(false);
      });
  }, []);

  async function login(username: string, password: string) {
    const generation = ++authGeneration.current;
    const res = await api.post<{ token: string; user: AuthUser }>("/auth/login", {
      username,
      password,
    });
    if (generation !== authGeneration.current) return; // superseded by a newer login/logout
    setToken(res.token);
    setUser(res.user);
  }

  function logout() {
    authGeneration.current++;
    clearToken();
    setActiveBranchId(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
