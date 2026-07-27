const TOPMESSAGE_ENDPOINT = "https://api.topmessage.com/v1/messages";
const TERMII_BASE = "https://v4.api.termii.com";

function termiiConfigured() {
  return Boolean(process.env.TERMII_API_KEY);
}

function topMessageConfigured() {
  return Boolean(process.env.TOPMESSAGE_API_KEY);
}

function isConfigured() {
  return termiiConfigured() || topMessageConfigured();
}

/**
 * Whether outbound SMS is currently usable. Starts optimistic and flips on the
 * outcome of real sends.
 *
 * This exists so a caller can report "SMS is down" *without* it becoming an
 * account-enumeration oracle. The provider-account failures we actually hit —
 * unapproved sender ID, zero balance — fail identically for every recipient,
 * so this flag is a property of our own infrastructure, never of whether a
 * given account or phone number exists. That's what makes it safe to surface
 * before any user lookup.
 */
let lastSendFailed = false;

function isChannelHealthy() {
  return isConfigured() && !lastSendFailed;
}

/**
 * Boot-time health probe. Without this the flag above starts optimistic, so
 * the first reset request after every restart still attempts a real send —
 * and because a send is only attempted once the caller's phone already
 * matched, the resulting flip to "unhealthy" would itself leak whether they
 * guessed the number right. Establishing health up-front, from provider state
 * alone, removes that correlation entirely.
 *
 * Checks the sender ID specifically because that's the actual blocker Termii
 * reports (SENDER_ID_NOT_APPROVED) — a non-zero balance alone doesn't mean a
 * send will succeed. Read-only endpoints; costs no credits.
 */
async function probeChannelHealth() {
  if (!isConfigured()) return;
  if (!termiiConfigured()) return; // only TopMessage configured — nothing cheap to probe

  try {
    const res = await fetch(`${TERMII_BASE}/api/sender-id?api_key=${process.env.TERMII_API_KEY}`);
    const data = await res.json().catch(() => ({}));
    const wanted = process.env.TERMII_SENDER_ID;
    const approved = (data.data || []).some((s) => s.sender_id === wanted && s.status === "approved");

    if (!approved) {
      lastSendFailed = true;
      console.warn(
        `[sms] Sender ID "${wanted}" is not approved on Termii — outbound SMS is disabled ` +
          `until it is. Register it at https://accounts.termii.com/ (Sender IDs).`
      );
    }
  } catch (err) {
    // A probe that can't complete says nothing about the provider, so leave
    // the flag alone rather than disabling SMS over a transient network blip.
    console.warn("[sms] channel health probe failed (leaving SMS enabled):", err.message);
  }
}

/**
 * channel "generic" = SMS, "whatsapp" = WhatsApp message — same Termii
 * endpoint either way. Requires a sender ID approved for the destination
 * country in the Termii dashboard; until then Termii answers
 * SENDER_ID_NOT_APPROVED and this throws with that exact reason.
 */
async function sendViaTermii(phone, message, channel = "generic") {
  const res = await fetch(`${TERMII_BASE}/api/sms/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: phone,
      from: process.env.TERMII_SENDER_ID || "Termii",
      sms: message,
      type: "plain",
      channel,
      api_key: process.env.TERMII_API_KEY,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Termii ${channel} send failed (${data.message || data.error || `HTTP ${res.status}`})`);
  }
  console.log(`[sms] Sent to ${phone} via Termii/${channel} (id: ${data.message_id || "?"})`);
}

async function sendViaTopMessage(phone, message) {
  const res = await fetch(TOPMESSAGE_ENDPOINT, {
    method: "POST",
    headers: {
      "X-TopMessage-Key": process.env.TOPMESSAGE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        from: process.env.TOPMESSAGE_SENDER_ID || "LinguaGuard",
        to: [phone],
        text: message,
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  const result = data?.data?.[0];
  if (!res.ok || result?.status === "FAILED") {
    const detail = result?.status || data?.message || data?.error || `HTTP ${res.status}`;
    throw new Error(`TopMessage send failed (${detail})`);
  }
  console.log(`[sms] Sent to ${phone} via TopMessage (status: ${result?.status ?? "unknown"})`);
}

/**
 * Single choke point for every outbound SMS (password reset, platform
 * verification, alerts). Termii is tried first when configured, TopMessage
 * second — a provider being down/out of credit shouldn't kill delivery when
 * the other could have carried it. Callers never get message content back in
 * an HTTP response; only this module (and the server console) sees it.
 */
async function sendSms(phone, message) {
  if (!isConfigured()) {
    console.log(`[sms] No SMS provider configured — would have sent to ${phone}: "${message}"`);
    console.log("[sms] Set TERMII_API_KEY (termii.com) or TOPMESSAGE_API_KEY (topmessage.com) to enable real delivery.");
    return;
  }

  const errors = [];
  if (termiiConfigured()) {
    try {
      const r = await sendViaTermii(phone, message, "generic");
      lastSendFailed = false;
      return r;
    } catch (err) {
      errors.push(err.message);
    }
  }
  if (topMessageConfigured()) {
    try {
      const r = await sendViaTopMessage(phone, message);
      lastSendFailed = false;
      return r;
    } catch (err) {
      errors.push(err.message);
    }
  }
  // Every configured provider refused — treat the channel as down until a
  // later send succeeds and clears this.
  lastSendFailed = true;
  throw new Error(errors.join("; "));
}

/**
 * WhatsApp delivery via Termii's whatsapp channel, falling back to plain SMS
 * if that fails or Termii isn't configured — the code still has to reach the
 * user even when the WhatsApp route can't.
 */
async function sendWhatsApp(phone, message) {
  if (termiiConfigured()) {
    try {
      return await sendViaTermii(phone, message, "whatsapp");
    } catch (err) {
      console.warn(`[sms] WhatsApp channel failed (${err.message}) — falling back to SMS.`);
    }
  }
  return sendSms(phone, message);
}

function sendPasswordResetSms(phone, code) {
  return sendSms(phone, `Your LinguaGuard password reset code is ${code}. It expires in 15 minutes.`);
}

function sendPlatformVerificationSms(phone, code, platformName, { viaWhatsApp = false } = {}) {
  const message = `Your LinguaGuard verification code for ${platformName} is ${code}. It expires in 10 minutes.`;
  return viaWhatsApp ? sendWhatsApp(phone, message) : sendSms(phone, message);
}

function sendTestSms(phone, label) {
  return sendSms(phone, `This is a test of your "${label}" LinguaGuard notification setting. If you received this, SMS alerts for it are working.`);
}

function sendAlertSms(phone, event) {
  const label = event.status === "blocked" ? "BLOCKED" : "FLAGGED";
  // SMS is billed per segment (~160 chars) — keep it to the essentials and a
  // short content preview; the Activity page has the full message.
  const preview = event.content.length > 60 ? `${event.content.slice(0, 57)}...` : event.content;
  return sendSms(phone, `LinguaGuard ${label} on ${event.platformName} (rule: ${event.ruleMatched}): "${preview}"`);
}

module.exports = {
  isConfigured,
  isChannelHealthy,
  probeChannelHealth,
  sendSms,
  sendWhatsApp,
  sendPasswordResetSms,
  sendPlatformVerificationSms,
  sendTestSms,
  sendAlertSms,
};
