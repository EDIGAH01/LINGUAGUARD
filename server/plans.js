/**
 * Single source of truth for plan configuration server-side. Keep in sync
 * with src/lib/plan.ts (the client mirror used for UX gating — real
 * enforcement always happens here on the server).
 */

// Sandbox test amounts (KES) — swap for real pricing when you go to production.
const PLAN_PRICES = { pro: 2999, enterprise: 9999 };

// Used to tell upgrades (require payment) from downgrades (free to apply).
const PLAN_PRIORITY = { free: 0, pro: 1, enterprise: 2 };

// Max filter rules per plan — mirrors planLimits.maxRules in src/lib/plan.ts.
const RULE_LIMITS = { free: 2, pro: Infinity, enterprise: Infinity };

module.exports = { PLAN_PRICES, PLAN_PRIORITY, RULE_LIMITS };
