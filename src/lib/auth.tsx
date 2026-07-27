import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { enforcePlanLimits } from "./store";

export type UserRole = "user" | "admin";
export type PlanTier = "free" | "pro" | "enterprise";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  plan: PlanTier;
  status: "active" | "banned";
  createdAt: string;
  twoFactorEnabled: boolean;
}

const TOKEN_KEY = "linguaguard-token";

export function getToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

/** fetch wrapper that attaches the current session token, for use outside the auth context (Settings, Connections, Admin). */
export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(path, { ...options, headers });
}

export interface RequiresTwoFactor {
  requires2FA: true;
  pendingToken: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<RequiresTwoFactor | void>;
  confirmLoginTwoFactor: (pendingToken: string, code: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function parseError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Sets the authenticated user and reconciles their connected platforms
   * against their plan's limits. This has to happen here — the top-level
   * ancestor of every page — rather than in a page-level effect: pages only
   * mount (and read localStorage for their own platform list) after this
   * resolves, so there's no event-listener race to worry about.
   */
  const applyUser = (nextUser: AuthUser) => {
    setUser(nextUser);
    const removed = enforcePlanLimits(nextUser.plan);
    if (removed.length > 0) {
      toast.info("Some connected platforms exceeded your plan's limit", {
        description: `Disconnected: ${removed.join(", ")}`,
      });
    }
  };

  const refreshUser = async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const res = await authFetch("/api/auth/me");
      if (!res.ok) throw new Error("session invalid");
      const data = await res.json();
      applyUser(data.user);
    } catch {
      window.localStorage.removeItem(TOKEN_KEY);
      setUser(null);
    }
  };

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(await parseError(res, "Login failed"));
    const data = await res.json();
    if (data.requires2FA) {
      return { requires2FA: true as const, pendingToken: data.pendingToken as string };
    }
    window.localStorage.setItem(TOKEN_KEY, data.token);
    applyUser(data.user);
  };

  const confirmLoginTwoFactor = async (pendingToken: string, code: string) => {
    const res = await fetch("/api/auth/login/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingToken, code }),
    });
    if (!res.ok) throw new Error(await parseError(res, "Incorrect code"));
    const data = await res.json();
    window.localStorage.setItem(TOKEN_KEY, data.token);
    applyUser(data.user);
  };

  const signup = async (name: string, email: string, password: string) => {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok) throw new Error(await parseError(res, "Signup failed"));
    const data = await res.json();
    window.localStorage.setItem(TOKEN_KEY, data.token);
    applyUser(data.user);
  };

  const logout = () => {
    const token = getToken();
    window.localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    // Best-effort — revokes the session server-side so it stops showing up
    // under Active Sessions, but the client is already logged out either way.
    if (token) {
      fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, confirmLoginTwoFactor, signup, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export async function requestPasswordReset(
  email: string,
  method: "email" | "sms" = "email",
  phone?: string
): Promise<string> {
  const res = await fetch("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, method, phone }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "We couldn't complete that request. Please try again.");
  return data.message as string;
}

/** For an already-authenticated user changing their password from Settings (not the forgot-password flow). */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await authFetch("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to change password");
  window.localStorage.setItem(TOKEN_KEY, data.token);
}

export async function confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void> {
  const res = await fetch("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "We couldn't complete that request. Please try again.");
}
