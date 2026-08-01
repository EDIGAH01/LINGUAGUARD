const express = require("express");
const { requireAuth } = require("../auth");
const { load, save } = require("../db");
const { scanAndRecord } = require("../contentScanner");
const { dispatchAlerts } = require("../alerts");

const router = express.Router();
router.use(requireAuth);

/**
 * Manual test-scan trigger point. Real incoming Telegram messages (see
 * server/telegram.js) go through the same scanAndRecord function, so this
 * and the Telegram path share one evaluation engine rather than two that
 * could drift apart.
 */
router.post("/scan", async (req, res) => {
  const { platformId, platformName, sender, content } = req.body || {};
  if (!content || typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ error: "content is required." });
  }

  const data = load();
  const { event, matchedRule } = await scanAndRecord(data, { userId: req.auth.sub, platformId, platformName, sender, content });
  save(data);

  const user = data.users.find((u) => u.id === req.auth.sub);
  dispatchAlerts(user, event);

  res.status(201).json({ event, matchedRule });
});

router.get("/activity", (req, res) => {
  const data = load();
  const events = data.activityEvents
    .filter((e) => e.userId === req.auth.sub)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  res.json({ events });
});

router.get("/stats", (req, res) => {
  const data = load();
  const events = data.activityEvents.filter((e) => e.userId === req.auth.sub);

  const blocked = events.filter((e) => e.status === "blocked").length;
  const flagged = events.filter((e) => e.status === "flagged").length;
  const allowed = events.filter((e) => e.status === "allowed").length;

  // Last 7 days, oldest to newest, zero-filled for days with no events.
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) });
  }
  const last7DayKeys = new Set(days.map((d) => d.key));
  const todayKey = days[days.length - 1].key;

  // Reports.tsx shows this under the page's "Last 7 days" badge, so it must
  // stay scoped to the same window instead of accumulating all-time totals.
  const byCategory = {};
  for (const e of events) {
    if (e.status === "allowed") continue;
    if (!last7DayKeys.has(e.timestamp.slice(0, 10))) continue;
    byCategory[e.category] = (byCategory[e.category] || 0) + 1;
  }

  // Reports.tsx/Dashboard.tsx label this "(Today)"/"filtered", so it must be
  // scoped to today rather than all-time.
  const byPlatform = {};
  for (const e of events) {
    if (e.timestamp.slice(0, 10) !== todayKey) continue;
    byPlatform[e.platformId] = (byPlatform[e.platformId] || 0) + 1;
  }
  const dailyStats = days.map(({ key, label }) => {
    const dayEvents = events.filter((e) => e.timestamp.slice(0, 10) === key);
    return {
      date: label,
      blocked: dayEvents.filter((e) => e.status === "blocked").length,
      flagged: dayEvents.filter((e) => e.status === "flagged").length,
      allowed: dayEvents.filter((e) => e.status === "allowed").length,
    };
  });

  res.json({
    totalFiltered: events.length,
    blocked,
    flagged,
    allowed,
    byCategory,
    byPlatform,
    dailyStats,
  });
});

module.exports = router;
