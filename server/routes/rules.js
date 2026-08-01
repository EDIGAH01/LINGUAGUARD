const express = require("express");
const crypto = require("crypto");
const { requireAuth } = require("../auth");
const { load, save } = require("../db");

const router = express.Router();
router.use(requireAuth);

// Enforced server-side so a user can't get more rules than their plan allows
// by calling this API directly — the same gap the M-Pesa plan-upgrade
// endpoint had before it was locked down.
const { RULE_LIMITS } = require("../plans");

const CATEGORIES = ["hate_speech", "harassment", "explicit", "spam", "misinformation", "custom"];
const SEVERITIES = ["low", "medium", "high"];

function toSafeRule(rule) {
  const { userId, ...safe } = rule;
  return safe;
}

router.get("/", (req, res) => {
  const data = load();
  const rules = data.filterRules.filter((r) => r.userId === req.auth.sub);
  res.json({ rules: rules.map(toSafeRule) });
});

router.post("/", (req, res) => {
  const { name, category, severity, description, keywords } = req.body || {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Rule name is required." });
  }
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "Invalid category." });
  }
  if (!SEVERITIES.includes(severity)) {
    return res.status(400).json({ error: "Invalid severity." });
  }

  const data = load();
  const user = data.users.find((u) => u.id === req.auth.sub);
  const existingCount = data.filterRules.filter((r) => r.userId === req.auth.sub).length;
  const limit = RULE_LIMITS[user.plan] ?? RULE_LIMITS.free;
  if (existingCount >= limit) {
    return res.status(402).json({ error: "You've reached your plan's filter rule limit. Upgrade for more." });
  }

  const rule = {
    id: crypto.randomUUID(),
    userId: req.auth.sub,
    name: name.trim(),
    category,
    severity,
    enabled: true,
    keywords: Array.isArray(keywords) ? keywords.map((k) => String(k).trim()).filter(Boolean) : [],
    description: typeof description === "string" ? description.trim() : "",
    matchCount: 0,
    createdAt: new Date().toISOString(),
  };
  data.filterRules.push(rule);
  save(data);
  res.status(201).json({ rule: toSafeRule(rule) });
});

router.patch("/:id", (req, res) => {
  const data = load();
  const rule = data.filterRules.find((r) => r.id === req.params.id && r.userId === req.auth.sub);
  if (!rule) return res.status(404).json({ error: "Rule not found." });

  const { name, category, severity, description, keywords, enabled } = req.body || {};
  if (name !== undefined) rule.name = String(name).trim();
  if (category !== undefined) {
    if (!CATEGORIES.includes(category)) return res.status(400).json({ error: "Invalid category." });
    rule.category = category;
  }
  if (severity !== undefined) {
    if (!SEVERITIES.includes(severity)) return res.status(400).json({ error: "Invalid severity." });
    rule.severity = severity;
  }
  if (description !== undefined) rule.description = String(description).trim();
  if (keywords !== undefined) {
    rule.keywords = Array.isArray(keywords) ? keywords.map((k) => String(k).trim()).filter(Boolean) : [];
  }
  if (enabled !== undefined) rule.enabled = Boolean(enabled);

  save(data);
  res.json({ rule: toSafeRule(rule) });
});

router.delete("/:id", (req, res) => {
  const data = load();
  const rule = data.filterRules.find((r) => r.id === req.params.id && r.userId === req.auth.sub);
  if (!rule) return res.status(404).json({ error: "Rule not found." });
  data.filterRules = data.filterRules.filter((r) => r.id !== rule.id);
  save(data);
  res.json({ ok: true });
});

module.exports = router;
