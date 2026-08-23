const express = require("express");
const crypto = require("crypto");
const { load, save } = require("../db");
const { scanAndRecord } = require("../contentScanner");
const { dispatchAlerts } = require("../alerts");

const router = express.Router();

/**
 * WhatsApp Business Cloud API (Meta) inbound-message ingestion.
 *
 * Unlike the OAuth platforms (which we poll), WhatsApp pushes messages to a
 * webhook. Meta first verifies the endpoint with a GET challenge, then POSTs
 * each inbound message. We run every inbound message body through the same
 * scanAndRecord engine as every other channel and fire the owner's alerts.
 *
 * The whole thing is gated on WHATSAPP_VERIFY_TOKEN being set — until the Meta
 * app + phone number are provisioned and that token configured, the endpoint
 * reports "not configured" instead of pretending to work.
 *
 * Attribution (multi-tenant): each inbound message carries the Business
 * phone number that received it (value.metadata.phone_number_id). A user
 * registers their own number id via POST /api/platforms/whatsapp/register,
 * which stores a platformConnection; the webhook routes each message to that
 * number's owner. When no number is registered (single-business deploy), it
 * falls back to WHATSAPP_OWNER_EMAIL, else the first admin.
 */

function isConfigured() {
  return Boolean(process.env.WHATSAPP_VERIFY_TOKEN);
}

function ownerFallback(data) {
  const email = (process.env.WHATSAPP_OWNER_EMAIL || "").toLowerCase();
  return (
    (email && data.users.find((u) => u.email.toLowerCase() === email)) ||
    data.users.find((u) => u.role === "admin") ||
    data.users[0] ||
    null
  );
}

/** Routes an inbound message to the user who registered its Business number. */
function resolveUser(data, phoneNumberId) {
  if (phoneNumberId) {
    const conn = data.platformConnections.find(
      (c) => c.provider === "whatsapp" && c.externalId === String(phoneNumberId)
    );
    if (conn) {
      const owner = data.users.find((u) => u.id === conn.userId);
      if (owner) return owner;
    }
  }
  return ownerFallback(data);
}

/**
 * Optional HMAC-SHA256 signature check (Meta signs the raw body with the app
 * secret as X-Hub-Signature-256). Enforced only when WHATSAPP_APP_SECRET is
 * set AND the raw body was captured (see express.json verify hook in index.js).
 */
function signatureValid(req) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // not configured to verify — accept
  const header = req.get("x-hub-signature-256") || "";
  if (!req.rawBody) return true; // raw body unavailable — can't verify, don't hard-fail
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Verification handshake: Meta calls this once when you register the webhook.
router.get("/webhook", (req, res) => {
  if (!isConfigured()) return res.status(501).send("WhatsApp not configured");
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(String(challenge));
  }
  return res.sendStatus(403);
});

// Inbound messages.
router.post("/webhook", async (req, res) => {
  // Always 200 quickly — Meta retries (and eventually disables) a webhook that
  // errors or is slow, so acknowledge first and never surface internals.
  res.sendStatus(200);

  if (!isConfigured() || !signatureValid(req)) return;

  try {
    const data = load();

    let changed = false;
    for (const entry of req.body?.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        // The Business number that received these messages decides whose rules
        // they're scanned against.
        const owner = resolveUser(data, value.metadata?.phone_number_id);
        if (!owner) continue;
        const contacts = value.contacts || [];
        for (const msg of value.messages || []) {
          // Only text messages carry moderatable content.
          const text = msg.text?.body;
          if (!text || !text.trim()) continue;
          const contact = contacts.find((c) => c.wa_id === msg.from);
          const sender = contact?.profile?.name ? `${contact.profile.name} (${msg.from})` : msg.from || "WhatsApp user";

          const { event } = await scanAndRecord(data, {
            userId: owner.id,
            platformId: "whatsapp",
            platformName: "WhatsApp",
            sender,
            content: text,
          });
          changed = true;
          dispatchAlerts(owner, event);
        }
      }
    }
    if (changed) save(data);
  } catch (err) {
    console.error("[whatsapp] webhook processing error:", err.message);
  }
});

module.exports = router;
