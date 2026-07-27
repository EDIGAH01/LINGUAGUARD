import { useCallback, useState } from "react";
import { authFetch } from "./auth";

export interface ServerSession {
  id: string;
  device: string;
  ip: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export function useSessions() {
  const [sessions, setSessions] = useState<ServerSession[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await authFetch("/api/auth/sessions");
    if (res.ok) {
      const data = await res.json();
      setSessions(data.sessions);
    }
    setLoading(false);
  }, []);

  const revoke = async (id: string) => {
    const res = await authFetch(`/api/auth/sessions/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to sign out session");
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  return { sessions, loading, refresh, revoke };
}

export interface ServerApiKey {
  id: string;
  label: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export function useApiKeys() {
  const [keys, setKeys] = useState<ServerApiKey[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await authFetch("/api/apikeys");
    if (res.ok) {
      const data = await res.json();
      setKeys(data.keys);
    }
    setLoading(false);
  }, []);

  /** Returns the raw key — the only time it's ever visible; the caller must show/copy it immediately. */
  const create = async (label: string): Promise<string> => {
    const res = await authFetch("/api/apikeys", { method: "POST", body: JSON.stringify({ label }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create API key");
    setKeys((prev) => [...prev, data.key]);
    return data.rawKey;
  };

  const revoke = async (id: string) => {
    const res = await authFetch(`/api/apikeys/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to revoke API key");
    }
    setKeys((prev) => prev.filter((k) => k.id !== id));
  };

  return { keys, loading, refresh, create, revoke };
}

export interface TwoFactorSetup {
  secret: string;
  qrDataUrl: string;
}

export async function startTwoFactorSetup(): Promise<TwoFactorSetup> {
  const res = await authFetch("/api/auth/2fa/setup", { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to start 2FA setup");
  return data;
}

export async function confirmTwoFactorSetup(code: string): Promise<void> {
  const res = await authFetch("/api/auth/2fa/confirm", { method: "POST", body: JSON.stringify({ code }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Incorrect code");
}

export async function disableTwoFactor(code: string): Promise<void> {
  const res = await authFetch("/api/auth/2fa/disable", { method: "POST", body: JSON.stringify({ code }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Incorrect code");
}
