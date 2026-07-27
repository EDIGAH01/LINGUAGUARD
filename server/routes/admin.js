const express = require("express");
const { load, save } = require("../db");
const { requireAuth, requireAdmin } = require("../auth");
const { toSafeUser } = require("./auth");

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get("/users", (req, res) => {
  const data = load();
  res.json({ users: data.users.map(toSafeUser) });
});

router.patch("/users/:id", (req, res) => {
  const { role, plan, status, name } = req.body || {};
  const data = load();
  const user = data.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (role !== undefined) {
    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ error: "role must be user or admin" });
    }
    // Admin is a one-way grant: once an account holds it, the role is frozen.
    // Nobody can revoke it — not a different admin, not the account itself.
    // This is deliberately stricter than the old rule (which only stopped an
    // admin demoting *themselves*, leaving admins able to demote each other).
    // Promotion user -> admin is still allowed; only removal is blocked.
    if (user.role === "admin" && role !== "admin") {
      return res.status(403).json({
        error: "An admin's role is permanent and can't be changed once granted.",
      });
    }
    user.role = role;
  }

  if (plan !== undefined) {
    if (!["free", "pro", "enterprise"].includes(plan)) {
      return res.status(400).json({ error: "plan must be free, pro, or enterprise" });
    }
    user.plan = plan;
  }

  if (status !== undefined) {
    if (!["active", "banned"].includes(status)) {
      return res.status(400).json({ error: "status must be active or banned" });
    }
    if (user.id === req.auth.sub && status === "banned") {
      return res.status(400).json({ error: "You can't ban your own account." });
    }
    user.status = status;
  }

  if (typeof name === "string" && name.trim()) user.name = name.trim();

  save(data);
  res.json({ user: toSafeUser(user) });
});

router.delete("/users/:id", (req, res) => {
  if (req.params.id === req.auth.sub) {
    return res.status(400).json({ error: "You can't delete your own account." });
  }

  const data = load();
  const before = data.users.length;
  data.users = data.users.filter((u) => u.id !== req.params.id);
  if (data.users.length === before) return res.status(404).json({ error: "User not found" });

  // Full cascade — anything credential-like especially must go: an API key
  // authenticates by its own hash without re-checking the user record, so a
  // deleted user's key would otherwise keep working forever.
  const gone = (row) => row.userId !== req.params.id;
  data.platformConnections = data.platformConnections.filter(gone);
  data.telegramLinks = data.telegramLinks.filter(gone);
  data.phoneVerifications = data.phoneVerifications.filter(gone);
  data.apiKeys = data.apiKeys.filter(gone);
  data.sessions = data.sessions.filter(gone);
  data.filterRules = data.filterRules.filter(gone);
  data.activityEvents = data.activityEvents.filter(gone);
  save(data);

  res.json({ ok: true });
});

router.get("/stats", (req, res) => {
  const data = load();
  const byPlan = { free: 0, pro: 0, enterprise: 0 };
  const byRole = { user: 0, admin: 0 };
  let banned = 0;

  for (const u of data.users) {
    byPlan[u.plan] = (byPlan[u.plan] || 0) + 1;
    byRole[u.role] = (byRole[u.role] || 0) + 1;
    if (u.status === "banned") banned += 1;
  }

  res.json({
    totalUsers: data.users.length,
    byPlan,
    byRole,
    banned,
    active: data.users.length - banned,
  });
});

module.exports = router;
