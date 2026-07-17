import { useEffect, useState } from "react";

export type PlanTier = "free" | "pro" | "enterprise";

export interface PlanLimits {
  label: string;
  maxPlatforms: number; // Infinity = unlimited
  maxRules: number; // Infinity = unlimited
  retentionDays: number;
  advancedReports: boolean;
  aiAgents: boolean;
}

// Keep in sync with planFeatures in src/pages/Settings.tsx
export const planLimits: Record<PlanTier, PlanLimits> = {
  free: {
    label: "Free Plan",
    maxPlatforms: 3,
    maxRules: 2,
    retentionDays: 7,
    advancedReports: false,
    aiAgents: false,
  },
  pro: {
    label: "Pro Plan",
    maxPlatforms: 10,
    maxRules: Infinity,
    retentionDays: 90,
    advancedReports: true,
    aiAgents: true,
  },
  enterprise: {
    label: "Enterprise Plan",
    maxPlatforms: Infinity,
    maxRules: Infinity,
    retentionDays: 365,
    advancedReports: true,
    aiAgents: true,
  },
};

export const formatLimit = (n: number): string =>
  n === Infinity ? "Unlimited" : String(n);

const isPlanTier = (v: unknown): v is PlanTier =>
  v === "free" || v === "pro" || v === "enterprise";

export function getStoredPlan(): PlanTier {
  try {
    const stored = window.localStorage.getItem("linguaguard-profile");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (isPlanTier(parsed.currentPlan)) return parsed.currentPlan;
    }
  } catch {
    // corrupt storage — fall back to default
  }
  return "pro";
}

/**
 * Current subscription tier + its limits. Re-renders when the plan is
 * changed on the Settings page (custom event) or in another tab (storage).
 */
export function usePlan() {
  const [plan, setPlan] = useState<PlanTier>(getStoredPlan);

  useEffect(() => {
    const sync = () => setPlan(getStoredPlan());
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && isPlanTier(detail.currentPlan)) setPlan(detail.currentPlan);
      else sync();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "linguaguard-profile") sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("linguaguard-profile-changed", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("linguaguard-profile-changed", onCustom as EventListener);
    };
  }, []);

  return { plan, limits: planLimits[plan] };
}
