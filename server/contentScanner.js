const crypto = require("crypto");
const { moderate } = require("./aiModeration");

/**
 * Real keyword-based evaluation, shared by every real ingestion point
 * (the manual test-scanner in server/routes/content.js, and real incoming
 * Telegram messages in server/telegram.js). Case-insensitive substring match
 * against each enabled rule's keyword list; the highest severity match wins
 * ties.
 */
function evaluateContent(content, rules) {
  const lower = content.toLowerCase();
  const severityRank = { high: 3, medium: 2, low: 1 };
  let best = null;

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const hit = rule.keywords.some((kw) => kw && lower.includes(kw.toLowerCase()));
    if (!hit) continue;
    if (!best || severityRank[rule.severity] > severityRank[best.severity]) {
      best = rule;
    }
  }

  if (!best) return { status: "allowed", rule: null };
  const status = best.severity === "high" ? "blocked" : "flagged";
  return { status, rule: best };
}

const STATUS_RANK = { blocked: 3, flagged: 2, allowed: 1 };

/**
 * Evaluates content against a user's rules, optionally augments the verdict
 * with the AI moderation layer, bumps the matched rule's matchCount, and
 * appends a real ActivityEvent to `data` — mutates `data` in place; the caller
 * is responsible for calling save(data) (batched callers like the Telegram
 * poll loop process several messages before one save()).
 *
 * Async because the optional OpenAI call is. When OPENAI_API_KEY is unset —
 * or the call fails/times out/returns 429 — moderate() resolves to null and
 * this behaves exactly as the keyword-only scanner always did.
 */
async function scanAndRecord(data, { userId, platformId, platformName, sender, content }) {
  const rules = data.filterRules.filter((r) => r.userId === userId);
  const keyword = evaluateContent(content, rules); // { status, rule }

  // Start from the keyword verdict.
  let status = keyword.status;
  let category = keyword.rule ? keyword.rule.category : "custom";
  let ruleMatched = keyword.rule ? keyword.rule.name : "—";
  let severity = keyword.rule ? keyword.rule.severity : "low";

  // Optional AI layer. It can only ESCALATE — the user's own rules stay
  // authoritative for what they explicitly cover (a keyword block/flag is
  // never downgraded), but the AI can flag content the rules missed
  // (allowed → flagged). It intentionally never hard-blocks on its own; a
  // hard block requires a user rule.
  const ai = await moderate(content);
  if (ai && ai.flagged && STATUS_RANK.flagged > STATUS_RANK[status]) {
    status = "flagged";
    category = ai.category;
    ruleMatched = `AI moderation: ${ai.openaiCategory}`;
    severity = "medium";
  }

  // matchCount belongs to keyword rules only — an AI-only flag matched no rule.
  if (keyword.rule) {
    keyword.rule.matchCount = (keyword.rule.matchCount || 0) + 1;
  }

  const event = {
    id: crypto.randomUUID(),
    userId,
    platformId: platformId || "manual",
    platformName: platformName || "Manual Test",
    status,
    content: content.trim().slice(0, 2000),
    ruleMatched,
    category,
    severity,
    sender: (sender || "Test input").trim().slice(0, 200),
    timestamp: new Date().toISOString(),
  };
  data.activityEvents.push(event);

  return { event, matchedRule: keyword.rule ? { id: keyword.rule.id, name: keyword.rule.name } : null };
}

module.exports = { evaluateContent, scanAndRecord };
