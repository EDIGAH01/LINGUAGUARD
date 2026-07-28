const crypto = require("crypto");
const { load, save, getKv, setKv } = require("./db");
const { scanAndRecord } = require("./contentScanner");
const { dispatchAlerts } = require("./alerts");

const POLL_OFFSET_KEY = "telegram_poll_offset";

const API = (method) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

function isConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME);
}

function newCode(data, userId) {
  data.telegramLinks = data.telegramLinks.filter((l) => l.userId !== userId || l.verified);
  const code = crypto.randomInt(100000, 999999).toString();
  data.telegramLinks.push({ userId, code, verified: false, createdAt: Date.now() });
  return code;
}

/** Creates a one-time code + deep link for the user to open in Telegram and hit "Start" (personal DM). */
async function startVerification(userId) {
  const data = load();
  const code = newCode(data, userId);
  await save(data);
  return { code, deepLink: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${code}` };
}

/**
 * `?startgroup=` is Telegram's dedicated deep-link format for "let the user
 * pick a group to add this bot to" — once added, Telegram sends the same
 * `/start <code>` message, just with the group as the chat instead of a
 * private one. Reuses the same code/verification path as the personal flow;
 * pollOnce below tells the two apart via msg.chat.type.
 */
async function startGroupVerification(userId) {
  const data = load();
  const code = newCode(data, userId);
  await save(data);
  return { code, deepLink: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?startgroup=${code}` };
}

function getStatus(userId) {
  const data = load();
  // Links verified before this feature existed have no chatType at all —
  // they're all personal DMs (the only kind that used to exist), so missing
  // is treated the same as "private".
  const link = data.telegramLinks.find(
    (l) => l.userId === userId && l.verified && (!l.chatType || l.chatType === "private")
  );
  return link
    ? { connected: true, chatId: link.chatId, telegramUsername: link.telegramUsername }
    : { connected: false };
}

function getGroupLinks(userId) {
  const data = load();
  // chatType only exists on links verified after group support shipped —
  // missing chatType means an old personal-DM link, not a group, so it must
  // be excluded explicitly rather than just checking "not private".
  return data.telegramLinks
    .filter((l) => l.userId === userId && l.verified && l.chatType && l.chatType !== "private")
    .map((l) => ({ chatId: l.chatId, groupTitle: l.groupTitle || "Telegram group", connectedAt: l.createdAt }));
}

async function sendMessage(chatId, text) {
  await fetch(API("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

// Persisted, not just an in-memory counter — otherwise every server restart
// would re-fetch (and re-scan) messages Telegram already delivered, since
// Telegram only stops re-sending an update once a *later* offset has been
// acknowledged in a getUpdates call.
let pollOffset = Number(getKv(POLL_OFFSET_KEY) || 0);
let polling = false;

/**
 * Long-polls Telegram for incoming messages. Two things happen here:
 *  1. "/start <code>" completes a pending verification (personal or group —
 *     same code namespace, told apart by msg.chat.type).
 *  2. Any other message in an already-verified chat is real content: it gets
 *     scanned against that chat's owner's filter rules, the same engine the
 *     manual test-scanner uses, and the bot replies with the verdict.
 *
 * Note for groups specifically: Telegram bots only receive every message in
 * a group if the bot's privacy mode is disabled (@BotFather → /setprivacy →
 * Disable) or the bot is a group admin — otherwise it only sees commands and
 * messages that mention it, by Telegram's own design, not a bug here.
 */
async function pollOnce() {
  if (!isConfigured() || polling) return;
  polling = true;

  try {
    const res = await fetch(`${API("getUpdates")}?timeout=0&offset=${pollOffset}`);
    if (!res.ok) return;
    const { result: updates } = await res.json();
    if (!updates?.length) return;

    const data = load();
    let changed = false;

    for (const update of updates) {
      pollOffset = update.update_id + 1;
      const msg = update.message;
      if (!msg) continue;
      const text = msg.text || "";

      // In group chats Telegram clients append the bot's username to
      // commands ("/start@BotName 123456"), so the optional @suffix is
      // load-bearing — without it, group verification silently never matches.
      const match = text.match(/^\/start(?:@\w+)?\s+(\d{6})$/);
      if (match) {
        const code = match[1];
        const link = data.telegramLinks.find((l) => l.code === code && !l.verified);
        if (!link) {
          await sendMessage(msg.chat.id, "That verification code isn't valid or has already been used.");
          continue;
        }

        link.verified = true;
        link.chatId = msg.chat.id;
        link.chatType = msg.chat.type;
        link.telegramUsername = msg.chat.username || msg.from?.first_name || "Telegram user";
        if (msg.chat.type !== "private") link.groupTitle = msg.chat.title || "Telegram group";
        changed = true;

        const confirmation = msg.chat.type === "private"
          ? `You're verified! LinguaGuard is now connected to this Telegram account (@${link.telegramUsername}).`
          : `This group ("${link.groupTitle}") is now connected to LinguaGuard. Messages here will be scanned against your filter rules.`;
        await sendMessage(msg.chat.id, confirmation);
        continue;
      }

      // Not a verification command — if this chat is already verified and
      // connected, it's real incoming content: scan it against that chat's
      // owner's filter rules and reply with the verdict. Unverified chats
      // are ignored — there's no user/rule set to scan them against.
      if (!text.trim()) continue;
      const verifiedLink = data.telegramLinks.find((l) => l.verified && l.chatId === msg.chat.id);
      if (!verifiedLink) continue;

      const senderName = msg.from?.username || msg.from?.first_name || verifiedLink.telegramUsername || "Telegram user";
      const { event } = scanAndRecord(data, {
        userId: verifiedLink.userId,
        platformId: "telegram",
        platformName: verifiedLink.chatType === "private" ? "Telegram" : `Telegram · ${verifiedLink.groupTitle}`,
        sender: senderName,
        content: text,
      });
      changed = true;

      // Real notification trigger: email/SMS the chat's owner per their
      // Settings preferences when something is blocked or flagged.
      dispatchAlerts(data.users.find((u) => u.id === verifiedLink.userId), event);

      // DMs act as an interactive tester, so every verdict (including
      // "allowed") is echoed back. In groups, replying to every innocent
      // message would drown the chat — only violations get announced there.
      const isGroup = verifiedLink.chatType && verifiedLink.chatType !== "private";
      if (!isGroup || event.status !== "allowed") {
        const verdictEmoji = { blocked: "🚫", flagged: "⚠️", allowed: "✅" }[event.status];
        const verdictText = event.ruleMatched !== "—"
          ? `${verdictEmoji} ${event.status} — matched rule: ${event.ruleMatched}`
          : `${verdictEmoji} ${event.status}`;
        await sendMessage(msg.chat.id, verdictText);
      }
    }

    if (changed) await save(data);
    setKv(POLL_OFFSET_KEY, String(pollOffset));
  } catch (err) {
    console.error("[telegram] poll error:", err.message);
  } finally {
    polling = false;
  }
}

function startPolling() {
  if (!isConfigured()) {
    console.log("[telegram] TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME not set — Telegram connect disabled.");
    return;
  }
  console.log("[telegram] polling for verification messages…");
  setInterval(pollOnce, 3000);
}

module.exports = { isConfigured, startVerification, startGroupVerification, getStatus, getGroupLinks, startPolling };
