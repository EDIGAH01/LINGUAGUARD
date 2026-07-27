const crypto = require("crypto");

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

/**
 * Evaluates content against a user's rules, bumps the matched rule's
 * matchCount, and appends a real ActivityEvent to `data` — mutates `data` in
 * place; the caller is responsible for calling save(data) (batched callers
 * like the Telegram poll loop process several messages before one save()).
 */
function scanAndRecord(data, { userId, platformId, platformName, sender, content }) {
  const rules = data.filterRules.filter((r) => r.userId === userId);
  const { status, rule } = evaluateContent(content, rules);

  if (rule) {
    rule.matchCount = (rule.matchCount || 0) + 1;
  }

  const event = {
    id: crypto.randomUUID(),
    userId,
    platformId: platformId || "manual",
    platformName: platformName || "Manual Test",
    status,
    content: content.trim().slice(0, 2000),
    ruleMatched: rule ? rule.name : "—",
    category: rule ? rule.category : "custom",
    severity: rule ? rule.severity : "low",
    sender: sender || "Test input",
    timestamp: new Date().toISOString(),
  };
  data.activityEvents.push(event);

  return { event, matchedRule: rule ? { id: rule.id, name: rule.name } : null };
}

module.exports = { evaluateContent, scanAndRecord };
