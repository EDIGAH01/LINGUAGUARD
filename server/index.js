require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { initiateStkPush, queryStkStatus } = require("./mpesa");
const db = require("./db");
const { load, save, ensureSeedAdmin } = db;
const { requireAuth } = require("./auth");
const telegram = require("./telegram");
const { startDigestScheduler } = require("./digest");
const { router: authRoutes } = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const platformRoutes = require("./routes/platforms");
const notificationRoutes = require("./routes/notifications");
const rulesRoutes = require("./routes/rules");
const contentRoutes = require("./routes/content");
const apiKeyRoutes = require("./routes/apikeys");
const twoFactorRoutes = require("./routes/twofactor");
const oauthRoutes = require("./routes/oauth");

// Deferred to the async startup below — the Postgres backend must finish
// hydrating (initDb) before anything reads the store via ensureSeedAdmin or a
// request handler. SQLite makes initDb a no-op, so this ordering is harmless
// there and required here.

const app = express();

// Behind a TLS-terminating tunnel/proxy (ngrok today, a real load balancer
// later) the hop to this server is plain HTTP, so req.protocol reports "http"
// unless the proxy is trusted — which silently produced
// "http://<host>/api/oauth/<provider>/callback" as the OAuth redirect_uri.
// Both X and TikTok require HTTPS and an exact match against the registered
// URI, so every real OAuth connect failed on that mismatch. Trust exactly one
// hop: enough to read X-Forwarded-Proto, while still taking the client IP from
// the proxy's own appended entry so the rate limiters can't be spoofed by a
// caller sending their own X-Forwarded-For.
app.set("trust proxy", 1);

app.use(helmet());

// In dev the Vite proxy makes requests same-origin, so CORS doesn't matter.
// Set ALLOWED_ORIGIN in .env to the real frontend URL once this is deployed
// somewhere the browser talks to this server cross-origin directly.
const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(cors(allowedOrigin ? { origin: allowedOrigin } : {}));

app.use(express.json());

app.use("/api/auth/2fa", twoFactorRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/platforms", platformRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/rules", rulesRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/apikeys", apiKeyRoutes);
app.use("/api/oauth", oauthRoutes);

const { PLAN_PRICES } = require("./plans");

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/mpesa/stkpush", requireAuth, async (req, res) => {
  const { phone, plan } = req.body || {};
  const amount = PLAN_PRICES[plan];

  if (!phone || !amount) {
    return res.status(400).json({ error: "phone and a valid plan (pro|enterprise) are required" });
  }

  try {
    const result = await initiateStkPush({
      phone,
      amount,
      accountReference: `LG-${plan}`,
      transactionDesc: "Plan upgrade",
    });

    // Recorded so /api/mpesa/status can verify — before this payment existed,
    // *any* authenticated user could grant themselves any plan by calling
    // PATCH /api/auth/me/plan directly, with no real payment behind it at all.
    try {
      const data = load();
      data.pendingPayments.push({
        checkoutRequestId: result.CheckoutRequestID,
        userId: req.auth.sub,
        plan,
        status: "pending",
        createdAt: Date.now(),
      });
      save(data);
    } catch (dbErr) {
      // The STK push already left Safaricom's servers — we can't un-ring that
      // bell. Log the failure so it can be reconciled manually; the callback
      // path won't be able to grant the plan either (no pending record), so
      // the user will need to contact support if they actually paid.
      console.error("[mpesa] failed to record pending payment after STK push:", dbErr.message);
      return res.status(500).json({ error: "Payment initiated but could not be recorded. Please contact support with your CheckoutRequestID: " + result.CheckoutRequestID });
    }

    res.json({
      checkoutRequestId: result.CheckoutRequestID,
      merchantRequestId: result.MerchantRequestID,
      customerMessage: result.CustomerMessage,
    });
  } catch (err) {
    console.error("[mpesa] stkpush error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/mpesa/status/:checkoutRequestId", requireAuth, async (req, res) => {
  try {
    const data = await queryStkStatus(req.params.checkoutRequestId);

    if (data.errorCode) {
      // Transaction is still awaiting the user's PIN entry on their phone.
      return res.json({ status: "pending", detail: data.errorMessage });
    }

    if (String(data.ResultCode) === "0") {
      grantPendingPlan(req.params.checkoutRequestId, req.auth.sub);
      return res.json({ status: "success", detail: data.ResultDesc });
    }

    return res.json({ status: "failed", detail: data.ResultDesc });
  } catch (err) {
    console.error("[mpesa] status query error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

/**
 * Grants the plan recorded against a checkoutRequestId — but only once.
 * checkoutRequestId is unique per STK push (Safaricom generates it), so
 * looking it up alone is safe: the matched record already carries the
 * correct userId, there's no way to grant the wrong account by omitting a
 * userId filter here. The polling path passes the caller's own userId too,
 * as a defense-in-depth check that a user can't grant a plan against a
 * checkoutRequestId that isn't theirs.
 */
function grantPendingPlan(checkoutRequestId, userId) {
  const data = load();
  const payment = data.pendingPayments.find(
    (p) =>
      p.checkoutRequestId === checkoutRequestId &&
      p.status === "pending" &&
      (userId === undefined || p.userId === userId)
  );
  if (!payment) return;

  const user = data.users.find((u) => u.id === payment.userId);
  if (user) user.plan = payment.plan;
  payment.status = "consumed";
  save(data);
}

function markPendingPaymentFailed(checkoutRequestId) {
  const data = load();
  const payment = data.pendingPayments.find(
    (p) => p.checkoutRequestId === checkoutRequestId && p.status === "pending"
  );
  if (!payment) return;
  payment.status = "failed";
  save(data);
}

/**
 * Safaricom's async result callback — reachable only if MPESA_CALLBACK_URL
 * points at a real public URL (e.g. an ngrok tunnel to this server). This
 * isn't authenticated as one of our users (Safaricom calls it directly), so
 * it can only ever consume a specific already-recorded pendingPayments entry
 * by its unique checkoutRequestId — it can't be used to grant an arbitrary
 * plan the way a spoofed call to /api/auth/me/plan could.
 *
 * The /api/mpesa/status polling endpoint reaches the same outcome without
 * this ever firing, so this is a redundant, faster confirmation path, not
 * the only way payments get granted.
 */
app.post("/api/mpesa/callback", (req, res) => {
  const stkCallback = req.body?.Body?.stkCallback;
  if (!stkCallback || !stkCallback.CheckoutRequestID) {
    console.warn("[mpesa] callback received with unexpected shape:", JSON.stringify(req.body));
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const { CheckoutRequestID, ResultCode, ResultDesc } = stkCallback;

  if (Number(ResultCode) === 0) {
    grantPendingPlan(CheckoutRequestID);
    console.log(`[mpesa] callback confirmed payment for ${CheckoutRequestID} — plan granted.`);
  } else {
    // ResultCode !== 0 covers the user cancelling, entering the wrong PIN,
    // insufficient funds, or timing out — all "did not pay", not an error.
    markPendingPaymentFailed(CheckoutRequestID);
    console.log(`[mpesa] callback reported failure for ${CheckoutRequestID}: ${ResultDesc}`);
  }

  // Safaricom expects this exact acknowledgment shape regardless of outcome —
  // it's confirming receipt of the callback, not our decision from it.
  res.json({ ResultCode: 0, ResultDesc: "Confirmation Received Successfully" });
});

// Single-process deployment: if a production build exists (npm run build),
// serve it from this same server — one process, one port, no Vite needed.
// In dev this is simply skipped (dist/ may be stale or absent) and the Vite
// dev server on :5173 proxies /api here as before.
const DIST_DIR = path.join(__dirname, "..", "dist");
const DIST_INDEX = path.join(DIST_DIR, "index.html");
if (fs.existsSync(DIST_INDEX)) {
  app.use(express.static(DIST_DIR));
  // SPA fallback: any non-API GET that didn't match a real file gets
  // index.html so client-side routes (/settings, /rules, …) deep-link.
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    res.sendFile(DIST_INDEX);
  });
}

// PORT is what every managed host (Render, Railway, Fly, Heroku) injects, and
// binding anything else makes the platform's health check fail even though the
// app started fine. MPESA_SERVER_PORT stays as the local override.
const PORT = process.env.PORT || process.env.MPESA_SERVER_PORT || 4000;

/**
 * Async startup: the Postgres backend has to finish hydrating before we seed
 * the admin, start the pollers, or accept a single request — otherwise the
 * first read would hit an empty in-memory store. SQLite's initDb is a no-op,
 * so the same ordering works for local dev unchanged.
 */
async function start() {
  await db.initDb();

  ensureSeedAdmin();
  require("./demoData").ensureDemoData();
  telegram.startPolling();
  startDigestScheduler();
  // Fire-and-forget: a slow SMS provider must not delay startup.
  require("./sms").probeChannelHealth();

  app.listen(PORT, () => {
    console.log(`LinguaGuard backend listening on http://localhost:${PORT}`);
    if (fs.existsSync(DIST_INDEX)) {
      console.log(`[web] Serving the built frontend too — the full app is at http://localhost:${PORT}`);
    }
  });
}

// Persist any queued write before the process exits. Render sends SIGTERM
// ahead of a deploy, so this is the graceful window that closes the
// write-through durability gap for the Postgres backend.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received — flushing pending writes…`);
  try {
    await db.flush();
  } catch (err) {
    console.error("[server] flush on shutdown failed:", err.message);
  }
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

start().catch((err) => {
  console.error("[server] failed to start:", err);
  process.exit(1);
});
