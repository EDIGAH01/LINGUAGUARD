const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { load, save } = require("./db");

/**
 * Seeds realistic demo data so the app doesn't open on empty pages after a
 * fresh deploy. Unlike the connections seed (which is client-side in
 * src/lib/data.ts), Filter Rules, Activity, the Dashboard stats, Reports and
 * the Admin user list all read *per-user* data from the backend — so they
 * only show something once the store actually contains it.
 *
 * Everything here attaches to the seed admin account and is idempotent per
 * category: if the admin already has rules / events, or there is already more
 * than just the admin in the user table, that part is skipped. That means it
 * populates a brand-new database (e.g. Render's fresh Postgres) exactly once,
 * and never duplicates on subsequent boots or clobbers real data.
 */

const DAY = 24 * 60 * 60 * 1000;

/** The account demo data hangs off: SEED_ADMIN_EMAIL if set, else any admin. */
function pickAdmin(data) {
  const email = (process.env.SEED_ADMIN_EMAIL || "").toLowerCase();
  return (
    (email && data.users.find((u) => u.email.toLowerCase() === email)) ||
    data.users.find((u) => u.role === "admin") ||
    data.users[0] ||
    null
  );
}

function demoRules(userId, now) {
  const mk = (name, category, severity, keywords, description, matchCount, ageDays) => ({
    id: crypto.randomUUID(),
    userId,
    name,
    category,
    severity,
    enabled: true,
    keywords,
    description,
    matchCount,
    createdAt: new Date(now - ageDays * DAY).toISOString(),
  });
  return [
    mk("Hate speech blocklist", "hate_speech", "high",
      ["go back to", "your kind", "subhuman", "vermin", "don't belong here"],
      "Blocks dehumanising language and slurs targeting protected groups.", 128, 40),
    mk("Harassment & bullying", "harassment", "medium",
      ["worthless", "pathetic", "loser", "nobody likes you", "just quit"],
      "Flags targeted insults and personal attacks.", 86, 33),
    mk("Explicit content", "explicit", "high",
      ["nudes", "xxx", "onlyfans", "explicit", "link in bio"],
      "Blocks sexually explicit solicitations and spam.", 42, 28),
    mk("Spam & scams", "spam", "medium",
      ["free gift", "click here", "you won", "double your crypto", "giveaway", "dm me to claim"],
      "Flags scam links, fake giveaways and follower-buying.", 173, 45),
    mk("Misinformation watch", "misinformation", "low",
      ["miracle cure", "hoax", "they don't want you to know", "before they delete"],
      "Flags common health and conspiracy misinformation tropes for review.", 24, 20),
    // One disabled rule so the Filter Rules toggle state has variety.
    { id: crypto.randomUUID(), userId, name: "Custom brand terms", category: "custom",
      severity: "low", enabled: false, keywords: ["leaked", "boycott"],
      description: "Watches for brand-sensitive keywords. Currently paused.",
      matchCount: 9, createdAt: new Date(now - 12 * DAY).toISOString() },
  ];
}

const PLATFORMS = [
  { id: "instagram", name: "Instagram" },
  { id: "twitter", name: "X / Twitter" },
  { id: "tiktok", name: "TikTok" },
  { id: "youtube", name: "YouTube" },
  { id: "facebook", name: "Facebook" },
  { id: "whatsapp", name: "WhatsApp" },
  { id: "telegram", name: "Telegram" },
];

const SENDERS = [
  "@troll_x99", "anon_user_231", "@rage_poster", "spam_bot_42", "@drama_daily",
  "unknown_caller", "@hater_hq", "@random_guest", "mystery_dm", "@edgelord_",
  "@promo_king", "@fake_support", "@bot_army", "@angry_reply",
];

// Content templates — mild, clearly-demo examples of each category a moderation
// tool would catch. status/category/severity mirror what the real scanner
// (server/contentScanner.js) would assign.
const TEMPLATES = [
  { status: "blocked", category: "hate_speech", severity: "high",
    content: "People like you don't belong here, go back to where you came from.",
    rule: "Hate speech blocklist" },
  { status: "flagged", category: "harassment", severity: "medium",
    content: "You're absolutely worthless and everyone can see it.",
    rule: "Harassment & bullying" },
  { status: "blocked", category: "explicit", severity: "high",
    content: "Check my profile for nudes — link in bio 🔞",
    rule: "Explicit content" },
  { status: "flagged", category: "spam", severity: "medium",
    content: "🎉 You won a $1000 gift card! Click here to claim now.",
    rule: "Spam & scams" },
  { status: "flagged", category: "misinformation", severity: "low",
    content: "This miracle cure the doctors don't want you to know about!",
    rule: "Misinformation watch" },
  { status: "flagged", category: "harassment", severity: "medium",
    content: "Nobody likes you, just quit already.",
    rule: "Harassment & bullying" },
  { status: "flagged", category: "spam", severity: "medium",
    content: "DM me to double your crypto in 24 hours 🚀",
    rule: "Spam & scams" },
  { status: "blocked", category: "hate_speech", severity: "high",
    content: "Your kind is ruining this platform.",
    rule: "Hate speech blocklist" },
  { status: "flagged", category: "harassment", severity: "medium",
    content: "You are a pathetic excuse for a creator.",
    rule: "AI moderation (gemini): harassment" },
  { status: "blocked", category: "explicit", severity: "high",
    content: "Selling explicit content, onlyfans in bio.",
    rule: "Explicit content" },
  { status: "flagged", category: "spam", severity: "medium",
    content: "Free giveaway! Follow and DM 'PRIZE' to enter.",
    rule: "Spam & scams" },
  { status: "flagged", category: "misinformation", severity: "low",
    content: "Vaccines are a hoax — share before they delete this.",
    rule: "Misinformation watch" },
  { status: "allowed", category: "custom", severity: "low",
    content: "Love this content, keep it up! 🙌", rule: "—" },
  { status: "allowed", category: "custom", severity: "low",
    content: "Great video, super helpful — thanks for sharing.", rule: "—" },
  { status: "allowed", category: "custom", severity: "low",
    content: "Congrats on the launch 🎉 well deserved.", rule: "—" },
];

function demoEvents(userId, now) {
  // Events per day, going from 6 days ago up to today (more recent = busier),
  // so Reports' 7-day chart and the "today" tallies all have shape.
  const perDay = [5, 7, 6, 9, 6, 8, 11];
  const events = [];
  let i = 0;
  for (let d = 6; d >= 0; d--) {
    const count = perDay[6 - d];
    for (let j = 0; j < count; j++) {
      const tpl = TEMPLATES[i % TEMPLATES.length];
      const platform = PLATFORMS[(i + d) % PLATFORMS.length];
      const sender = SENDERS[i % SENDERS.length];
      // Spread events through business hours of each day rather than clumping.
      const ms = now - d * DAY - Math.round(((j + 1) / (count + 1)) * 11 * 60 * 60 * 1000);
      events.push({
        id: crypto.randomUUID(),
        userId,
        platformId: platform.id,
        platformName: platform.name,
        status: tpl.status,
        content: tpl.content,
        ruleMatched: tpl.rule,
        category: tpl.category,
        severity: tpl.severity,
        sender,
        timestamp: new Date(ms).toISOString(),
      });
      i++;
    }
  }
  return events;
}

function demoUsers(now) {
  const mk = (name, email, role, plan, status, ageDays) => ({
    id: crypto.randomUUID(),
    name,
    email,
    phone: "",
    // A random, unknown password — these accounts exist to populate the Admin
    // table, not to be logged into.
    passwordHash: bcrypt.hashSync(crypto.randomBytes(12).toString("base64url"), 10),
    role,
    plan,
    status,
    createdAt: new Date(now - ageDays * DAY).toISOString(),
    tokenVersion: 0,
    twoFactorEnabled: false,
  });
  return [
    mk("Maria Santos", "maria.santos@example.com", "user", "pro", "active", 52),
    mk("James Okoro", "james.okoro@example.com", "user", "free", "active", 41),
    mk("Wei Chen", "wei.chen@example.com", "user", "enterprise", "active", 38),
    mk("Priya Nair", "priya.nair@example.com", "user", "pro", "active", 25),
    mk("Tom Baker", "tom.baker@example.com", "user", "free", "banned", 19),
    mk("Sofia Rossi", "sofia.rossi@example.com", "admin", "enterprise", "active", 60),
    mk("David Kim", "david.kim@example.com", "user", "free", "active", 8),
  ];
}

function ensureDemoData() {
  const data = load();
  const admin = pickAdmin(data);
  if (!admin) return; // nothing to attach to yet

  const now = Date.now();
  let changed = false;
  const seeded = [];

  if (!data.filterRules.some((r) => r.userId === admin.id)) {
    data.filterRules.push(...demoRules(admin.id, now));
    seeded.push("filter rules");
    changed = true;
  }

  if (!data.activityEvents.some((e) => e.userId === admin.id)) {
    data.activityEvents.push(...demoEvents(admin.id, now));
    seeded.push("activity events");
    changed = true;
  }

  if (data.users.length <= 1) {
    data.users.push(...demoUsers(now));
    seeded.push("demo users");
    changed = true;
  }

  if (changed) {
    save(data);
    console.log(`[demo] Seeded ${seeded.join(", ")} for admin ${admin.email}.`);
  }
}

module.exports = { ensureDemoData };
