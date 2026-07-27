import { useCallback, useEffect, useState } from "react";
import { authFetch } from "./auth";
import type { FilterCategory, FilterSeverity } from "./data";

export interface ServerFilterRule {
  id: string;
  name: string;
  category: FilterCategory;
  severity: FilterSeverity;
  enabled: boolean;
  keywords: string[];
  description: string;
  matchCount: number;
  createdAt: string;
}

export interface NewRuleInput {
  name: string;
  category: FilterCategory;
  severity: FilterSeverity;
  description: string;
  keywords: string[];
}

/**
 * Rules now live server-side (server/routes/rules.js) instead of
 * localStorage — they're evaluated for real by the content scan engine, so
 * they need to be shared state the server can actually read, not just a
 * per-browser mirror.
 */
export function useServerRules() {
  const [rules, setRules] = useState<ServerFilterRule[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await authFetch("/api/rules");
    if (res.ok) {
      const data = await res.json();
      setRules(data.rules);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createRule = async (input: NewRuleInput) => {
    const res = await authFetch("/api/rules", { method: "POST", body: JSON.stringify(input) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create rule");
    setRules((prev) => [...prev, data.rule]);
  };

  const updateRule = async (id: string, patch: Partial<NewRuleInput & { enabled: boolean }>) => {
    const res = await authFetch(`/api/rules/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update rule");
    setRules((prev) => prev.map((r) => (r.id === id ? data.rule : r)));
  };

  const deleteRule = async (id: string) => {
    const res = await authFetch(`/api/rules/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to delete rule");
    }
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  return { rules, loading, createRule, updateRule, deleteRule, refresh };
}
