import { useCallback, useEffect, useState } from "react";
import { authFetch } from "./auth";
import type { ActivityStatus, FilterCategory, FilterSeverity } from "./data";

export interface ServerActivityEvent {
  id: string;
  platformId: string;
  platformName: string;
  status: ActivityStatus;
  content: string;
  ruleMatched: string;
  category: FilterCategory;
  severity: FilterSeverity;
  sender: string;
  timestamp: string;
}

export interface ContentStats {
  totalFiltered: number;
  blocked: number;
  flagged: number;
  allowed: number;
  byCategory: Partial<Record<FilterCategory, number>>;
  byPlatform: Record<string, number>;
  dailyStats: { date: string; blocked: number; flagged: number; allowed: number }[];
}

export function useActivity() {
  const [events, setEvents] = useState<ServerActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await authFetch("/api/content/activity");
    if (res.ok) {
      const data = await res.json();
      setEvents(data.events);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { events, loading, refresh };
}

export function useContentStats() {
  const [stats, setStats] = useState<ContentStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await authFetch("/api/content/stats");
    if (res.ok) {
      const data = await res.json();
      setStats(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stats, loading, refresh };
}

export interface ScanInput {
  platformId: string;
  platformName: string;
  sender: string;
  content: string;
}

export async function scanContent(input: ScanInput): Promise<{
  event: ServerActivityEvent;
  matchedRule: { id: string; name: string } | null;
}> {
  const res = await authFetch("/api/content/scan", { method: "POST", body: JSON.stringify(input) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to scan content");
  return data;
}

/** Formats an ISO timestamp as a short relative label, e.g. "2 min ago". */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
