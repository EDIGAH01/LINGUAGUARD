const nodemailer = require("nodemailer");

let transporterPromise = null;
let usingEthereal = false;

function hasRealSmtpConfig() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Real SMTP if configured; otherwise an auto-provisioned Ethereal test inbox
 * (nodemailer's disposable test account service) so password-reset emails
 * work out of the box in dev without requiring real credentials — same
 * "works now, upgrades when configured" pattern as the M-Pesa/Telegram setup.
 */
async function getTransporter() {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    if (hasRealSmtpConfig()) {
      usingEthereal = false;
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
    }

    usingEthereal = true;
    const testAccount = await nodemailer.createTestAccount();
    console.log("[email] No SMTP_HOST configured — using a disposable Ethereal test inbox.");
    console.log(`[email] Ethereal login (if you want to check it manually): ${testAccount.user} / ${testAccount.pass}`);
    return nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  })();

  return transporterPromise;
}

const TERMII_BASE = "https://v4.api.termii.com";

function termiiEmailConfigured() {
  return Boolean(process.env.TERMII_API_KEY && process.env.TERMII_EMAIL_CONFIG_ID);
}

/**
 * Termii's email product is OTP-delivery only, so it can carry password
 * reset codes but not alerts/digests (those stay on SMTP/Ethereal). Only
 * works once the email configuration is fully set up in the Termii
 * dashboard — until then their API 500s and we fall back to SMTP below.
 */
async function sendResetCodeViaTermii(toEmail, code) {
  const res = await fetch(`${TERMII_BASE}/api/email/otp/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TERMII_API_KEY,
      email_address: toEmail,
      code,
      email_configuration_id: process.env.TERMII_EMAIL_CONFIG_ID,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  console.log(`[email] Reset code sent to ${toEmail} via Termii email-OTP.`);
}

async function sendPasswordResetEmail(toEmail, code) {
  if (termiiEmailConfigured()) {
    try {
      return await sendResetCodeViaTermii(toEmail, code);
    } catch (err) {
      console.warn(`[email] Termii email-OTP failed (${err.message}) — falling back to SMTP.`);
    }
  }

  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || '"LinguaGuard" <no-reply@linguaguard.local>',
    to: toEmail,
    subject: "Your LinguaGuard password reset code",
    text: `Your password reset code is ${code}. It expires in 15 minutes. If you didn't request this, you can ignore this email.`,
    html: `<p>Your password reset code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>It expires in 15 minutes. If you didn't request this, you can ignore this email.</p>`,
  });

  if (usingEthereal) {
    console.log(`[email] Reset email "sent" — preview it here: ${nodemailer.getTestMessageUrl(info)}`);
  }
}

async function sendTestEmail(toEmail, label) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || '"LinguaGuard" <no-reply@linguaguard.local>',
    to: toEmail,
    subject: `LinguaGuard test alert: ${label}`,
    text: `This is a test of your "${label}" notification setting. If you're reading this, email alerts for it are working correctly.`,
    html: `<p>This is a test of your <strong>${label}</strong> notification setting.</p><p>If you're reading this, email alerts for it are working correctly.</p>`,
  });

  if (usingEthereal) {
    console.log(`[email] Test email "sent" — preview it here: ${nodemailer.getTestMessageUrl(info)}`);
  }
}

// The scanned message body, sender, and rule names are user-controlled text
// going into an HTML email — unescaped, a scanned message could smuggle
// markup/links into the alert email itself.
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function sendAlertEmail(toEmail, event) {
  const transporter = await getTransporter();
  const label = event.status === "blocked" ? "blocked" : "flagged";
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || '"LinguaGuard" <no-reply@linguaguard.local>',
    to: toEmail,
    subject: `LinguaGuard ${label} content on ${event.platformName}`,
    text: `LinguaGuard ${label} a message on ${event.platformName}.\n\nRule: ${event.ruleMatched}\nSender: ${event.sender}\nContent: "${event.content}"\n\nSee the full log on your Activity page.`,
    html: `<p>LinguaGuard <strong>${label}</strong> a message on <strong>${escapeHtml(event.platformName)}</strong>.</p>
<p>Rule: <strong>${escapeHtml(event.ruleMatched)}</strong><br>Sender: ${escapeHtml(event.sender)}</p>
<blockquote style="border-left:3px solid #ccc;margin:8px 0;padding:4px 12px;color:#555">${escapeHtml(event.content)}</blockquote>
<p>See the full log on your Activity page.</p>`,
  });

  if (usingEthereal) {
    console.log(`[email] Alert email "sent" — preview it here: ${nodemailer.getTestMessageUrl(info)}`);
  }
}

async function sendWeeklyDigestEmail(toEmail, stats) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || '"LinguaGuard" <no-reply@linguaguard.local>',
    to: toEmail,
    subject: `Your LinguaGuard weekly digest: ${stats.total} messages filtered`,
    text: `Your last 7 days on LinguaGuard:\n\nTotal filtered: ${stats.total}\nBlocked: ${stats.blocked}\nFlagged: ${stats.flagged}\nAllowed: ${stats.allowed}\n\nSee the full breakdown on your Reports page.`,
    html: `<p>Your last 7 days on LinguaGuard:</p>
<table style="border-collapse:collapse">
  <tr><td style="padding:2px 12px 2px 0">Total filtered</td><td><strong>${stats.total}</strong></td></tr>
  <tr><td style="padding:2px 12px 2px 0">Blocked</td><td><strong>${stats.blocked}</strong></td></tr>
  <tr><td style="padding:2px 12px 2px 0">Flagged</td><td><strong>${stats.flagged}</strong></td></tr>
  <tr><td style="padding:2px 12px 2px 0">Allowed</td><td><strong>${stats.allowed}</strong></td></tr>
</table>
<p>See the full breakdown on your Reports page.</p>`,
  });

  if (usingEthereal) {
    console.log(`[email] Weekly digest "sent" — preview it here: ${nodemailer.getTestMessageUrl(info)}`);
  }
}

module.exports = { sendPasswordResetEmail, sendTestEmail, sendAlertEmail, sendWeeklyDigestEmail };
