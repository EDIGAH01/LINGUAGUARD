import { useAuth } from "./auth";

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

/**
 * Current subscription tier + its limits, sourced from the authenticated
 * user's account (server-authoritative — this is what an admin changes when
 * they manage a user's subscription from the Admin page).
 */
export function usePlan() {
  const { user } = useAuth();
  const plan: PlanTier = user?.plan ?? "free";
  return { plan, limits: planLimits[plan] };
}
