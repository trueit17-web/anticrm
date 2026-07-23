import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";
import { api, ApiError, BRANCH_KEY, clearToken, getToken, setActiveBranchId, setToken, TOKEN_KEY } from "../api/client";
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

  // localStorage is shared across every tab on this origin — every request
  // already reads the token/branch fresh from it, so logging in/out or
  // switching branch in one tab silently changes what *this* tab's next
  // request will actually be scoped to, even though its UI still shows the
  // old identity/branch. `storage` only fires in tabs other than the one
  // that made the change, so this can't loop with BranchSwitcher's own
  // same-tab reload. Reloading is the same recovery this app already uses
  // for a same-tab branch switch (see useBranchSwitcher's step()) — simplest
  // way to fully re-sync everything at once rather than trying to patch
  // every open page's in-flight state individually.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === TOKEN_KEY || e.key === BRANCH_KEY) {
        window.location.reload();
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
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
