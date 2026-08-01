/**
 * Seed script — populates the LinguaGuard database with realistic dummy data
 * so every page of the UI has something meaningful to display.
 *
 * Safe to run against an existing DB: it preserves the seeded admin account
 * and any real data already there. Dummy users are identified by their
 * @dummy.linguaguard email domain so they can be removed cleanly later.
 *
 * Usage:  node server/scripts/seed-dummy-data.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const crypto  = require("crypto");
const bcrypt  = require("bcryptjs");
const path    = require("path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = path.join(__dirname, "..", "database.db");
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// ─── helpers ────────────────────────────────────────────────────────────────

const uuid  = () => crypto.randomUUID();
const now   = () => new Date().toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
const hash  = (pw) => bcrypt.hashSync(pw, 10);

// ─── look up the seeded admin so we can attach some data to them too ────────

const adminRow = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
if (!adminRow) {
  console.error("No admin account found. Run the server once first so it seeds the admin, then re-run this script.");
  process.exit(1);
}
const ADMIN_ID = adminRow.id;
console.log(`Admin ID: ${ADMIN_ID}`);

// ─── dummy users ────────────────────────────────────────────────────────────

const DUMMY_USERS = [
  { id: uuid(), name: "Amara Osei",       email: "amara@dummy.linguaguard",   phone: "254712345678", plan: "pro",        role: "user" },
  { id: uuid(), name: "David Kimani",     email: "david@dummy.linguaguard",   phone: "254723456789", plan: "free",       role: "user" },
  { id: uuid(), name: "Sofia Nakamura",   email: "sofia@dummy.linguaguard",   phone: "254734567890", plan: "enterprise", role: "user" },
  { id: uuid(), name: "Carlos Mendes",    email: "carlos@dummy.linguaguard",  phone: "254745678901", plan: "free",       role: "user" },
  { id: uuid(), name: "Priya Sharma",     email: "priya@dummy.linguaguard",   phone: "254756789012", plan: "pro",        role: "user" },
];

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users
    (id, name, email, phone, passwordHash, role, plan, status, createdAt, tokenVersion,
     twoFactorEnabled, notificationPrefs)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, 0, 0, ?)
`);

const defaultPrefs = JSON.stringify({
  email_blocked: true,
  email_flagged: false,
  sms_critical: true,
  weekly_digest: true,
});

for (const u of DUMMY_USERS) {
  insertUser.run(u.id, u.name, u.email, u.phone, hash("Password123!"), u.role, u.plan, daysAgo(Math.floor(Math.random() * 60 + 5)), defaultPrefs);
  console.log(`  User: ${u.name} (${u.plan})`);
}

// All user IDs we'll attach data to
const ALL_USER_IDS = [ADMIN_ID, ...DUMMY_USERS.map(u => u.id)];
const PRO_USER_IDS  = [ADMIN_ID, DUMMY_USERS[0].id, DUMMY_USERS[2].id, DUMMY_USERS[4].id];

// ─── filter rules ────────────────────────────────────────────────────────────

const RULES_TEMPLATE = [
  {
    name: "Block Hate Speech",
    category: "hate_speech",
    severity: "high",
    enabled: 1,
    keywords: ["slur", "racist", "bigot", "supremacist", "dehumanize"],
    description: "Blocks content containing hate speech targeting individuals or groups.",
    matchCount: 47,
  },
  {
    name: "Flag Harassment",
    category: "harassment",
    severity: "medium",
    enabled: 1,
    keywords: ["harass", "threaten", "stalk", "doxx", "bully", "intimidate"],
    description: "Flags messages that constitute harassment or personal threats.",
    matchCount: 23,
  },
  {
    name: "Block Explicit Content",
    category: "explicit",
    severity: "high",
    enabled: 1,
    keywords: ["nsfw", "explicit", "adult content", "nude", "porn"],
    description: "Blocks sexually explicit or adult-only material.",
    matchCount: 15,
  },
  {
    name: "Spam & Scam Filter",
    category: "spam",
    severity: "medium",
    enabled: 1,
    keywords: ["click here", "buy now", "limited offer", "winner", "prize", "crypto", "investment", "double your money"],
    description: "Catches common spam patterns and financial scam messages.",
    matchCount: 112,
  },
  {
    name: "Misinformation Guard",
    category: "misinformation",
    severity: "medium",
    enabled: 1,
    keywords: ["fake news", "hoax", "conspiracy", "deep state", "plandemic", "5g causes"],
    description: "Flags known misinformation phrases and conspiracy narratives.",
    matchCount: 8,
  },
  {
    name: "Custom Brand Safety",
    category: "custom",
    severity: "low",
    enabled: 1,
    keywords: ["competitor", "rival brand", "switch to", "better than us"],
    description: "Custom rule to protect brand reputation in monitored channels.",
    matchCount: 5,
  },
  {
    name: "Phishing Links",
    category: "spam",
    severity: "high",
    enabled: 1,
    keywords: ["verify your account", "confirm your password", "login link", "unusual activity", "suspended account"],
    description: "Detects phishing attempts targeting account credentials.",
    matchCount: 31,
  },
  {
    name: "Violence & Threats",
    category: "harassment",
    severity: "high",
    enabled: 0,
    keywords: ["kill", "attack", "bomb", "shoot", "hurt you", "i will find you"],
    description: "High-severity rule for direct violent threats. Disabled pending policy review.",
    matchCount: 3,
  },
];

const insertRule = db.prepare(`
  INSERT OR IGNORE INTO filter_rules
    (id, userId, name, category, severity, enabled, keywords, description, matchCount, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Each pro/enterprise user gets all rules; free users get 2 (plan limit)
for (const userId of ALL_USER_IDS) {
  const isPro = PRO_USER_IDS.includes(userId);
  const rulesToAdd = isPro ? RULES_TEMPLATE : RULES_TEMPLATE.slice(0, 2);
  for (const r of rulesToAdd) {
    const ruleId = uuid();
    insertRule.run(
      ruleId, userId, r.name, r.category, r.severity, r.enabled,
      JSON.stringify(r.keywords), r.description, r.matchCount,
      daysAgo(Math.floor(Math.random() * 30 + 1))
    );
  }
}
console.log(`  Filter rules seeded for ${ALL_USER_IDS.length} users`);

// ─── platform connections ────────────────────────────────────────────────────

const PLATFORM_CONFIGS = [
  { id: "telegram",  name: "Telegram",  color: "from-blue-500 to-blue-600",    icon: "Send",         category: "messaging", authMethod: "telegram" },
  { id: "whatsapp",  name: "WhatsApp",  color: "from-green-500 to-green-600",  icon: "WhatsApp",     category: "messaging", authMethod: "phone" },
  { id: "twitter",   name: "X (Twitter)", color: "from-gray-700 to-gray-900", icon: "Twitter",      category: "social",    authMethod: "oauth" },
  { id: "instagram", name: "Instagram", color: "from-pink-500 to-purple-600",  icon: "Instagram",    category: "social",    authMethod: "oauth" },
  { id: "facebook",  name: "Facebook",  color: "from-blue-600 to-blue-800",    icon: "Facebook",     category: "social",    authMethod: "oauth" },
  { id: "youtube",   name: "YouTube",   color: "from-red-500 to-red-700",      icon: "Youtube",      category: "social",    authMethod: "oauth" },
  { id: "tiktok",    name: "TikTok",    color: "from-gray-800 to-black",       icon: "Music",        category: "social",    authMethod: "oauth" },
  { id: "openai",    name: "OpenAI Agent", color: "from-teal-500 to-emerald-600", icon: "Bot",       category: "ai",        authMethod: "apikey" },
];

const insertConn = db.prepare(`
  INSERT OR IGNORE INTO platform_connections (id, userId, data) VALUES (?, ?, ?)
`);

// Assign platforms to users realistically based on plan
const userPlatformMap = {
  [ADMIN_ID]:            ["telegram", "twitter", "instagram", "openai"],
  [DUMMY_USERS[0].id]:   ["telegram", "whatsapp", "instagram", "twitter"],  // pro
  [DUMMY_USERS[1].id]:   ["telegram", "facebook"],                           // free (2 max)
  [DUMMY_USERS[2].id]:   ["telegram", "whatsapp", "youtube", "tiktok", "openai", "facebook"], // enterprise
  [DUMMY_USERS[3].id]:   ["whatsapp"],                                       // free (1 connected)
  [DUMMY_USERS[4].id]:   ["twitter", "instagram", "telegram"],               // pro
};

for (const [userId, platforms] of Object.entries(userPlatformMap)) {
  for (const platformId of platforms) {
    const cfg = PLATFORM_CONFIGS.find(p => p.id === platformId);
    if (!cfg) continue;
    const connId = `${platformId}-${userId.slice(0, 8)}`;
    const account = {
      id: `${platformId}-acct-${userId.slice(0, 6)}`,
      handle: `@user_${userId.slice(0, 6)}`,
      displayName: `${DUMMY_USERS.find(u => u.id === userId)?.name || "Admin"}'s ${cfg.name}`,
      avatar: cfg.name.slice(0, 2).toUpperCase(),
      connectedAt: daysAgo(Math.floor(Math.random() * 20 + 1)).slice(0, 10),
      filteredToday: Math.floor(Math.random() * 40),
      active: true,
    };
    const data = {
      id: connId,
      userId,
      ...cfg,
      status: "connected",
      accounts: [account],
    };
    insertConn.run(connId, userId, JSON.stringify(data));
  }
}
console.log(`  Platform connections seeded`);

// ─── activity events ─────────────────────────────────────────────────────────

const CONTENT_SAMPLES = {
  blocked: [
    { content: "You racist piece of trash, get out of our community!", rule: "Block Hate Speech", category: "hate_speech", severity: "high" },
    { content: "Click here NOW to claim your $5,000 prize! Limited time offer!", rule: "Spam & Scam Filter", category: "spam", severity: "medium" },
    { content: "I will find where you live and make you pay for this.", rule: "Flag Harassment", category: "harassment", severity: "medium" },
    { content: "Verify your account immediately or it will be suspended: http://phish-link.tk/login", rule: "Phishing Links", category: "spam", severity: "high" },
    { content: "NSFW content shared in this group violating community guidelines.", rule: "Block Explicit Content", category: "explicit", severity: "high" },
    { content: "You bigot supremacist, people like you deserve to be silenced forever.", rule: "Block Hate Speech", category: "hate_speech", severity: "high" },
    { content: "Double your money in 24 hours with our guaranteed crypto investment!", rule: "Spam & Scam Filter", category: "spam", severity: "medium" },
    { content: "Confirm your password here to restore access: http://secure-verify.ru", rule: "Phishing Links", category: "spam", severity: "high" },
  ],
  flagged: [
    { content: "The 5G towers are definitely causing the recent health issues, look it up.", rule: "Misinformation Guard", category: "misinformation", severity: "medium" },
    { content: "This is totally a hoax, the government is hiding the real numbers.", rule: "Misinformation Guard", category: "misinformation", severity: "medium" },
    { content: "Our competitor's product is way better than ours, switching now.", rule: "Custom Brand Safety", category: "custom", severity: "low" },
    { content: "You should check out their rival brand, much cheaper and better quality.", rule: "Custom Brand Safety", category: "custom", severity: "low" },
    { content: "Fake news! The deep state is controlling all the media outlets.", rule: "Misinformation Guard", category: "misinformation", severity: "medium" },
    { content: "Buy now before prices go up! This deal expires in 10 minutes only.", rule: "Spam & Scam Filter", category: "spam", severity: "medium" },
    { content: "Unusual activity detected on your account, login link sent below.", rule: "Phishing Links", category: "spam", severity: "high" },
  ],
  allowed: [
    { content: "Great work on the product launch everyone, really proud of the team!", rule: "—", category: "custom", severity: "low" },
    { content: "Can someone share the meeting notes from yesterday's session?", rule: "—", category: "custom", severity: "low" },
    { content: "The new feature update looks really clean, nice work developers.", rule: "—", category: "custom", severity: "low" },
    { content: "Happy Friday team! Don't forget standup at 9am tomorrow.", rule: "—", category: "custom", severity: "low" },
    { content: "Has anyone tested the new API integration with the mobile app?", rule: "—", category: "custom", severity: "low" },
    { content: "Customer feedback is overwhelmingly positive this quarter, great job!", rule: "—", category: "custom", severity: "low" },
    { content: "Please review the PR I opened, need two approvals before merging.", rule: "—", category: "custom", severity: "low" },
    { content: "Sales report attached — we hit 142% of target for October!", rule: "—", category: "custom", severity: "low" },
    { content: "Team lunch is at noon, booking for 8 people at the usual place.", rule: "—", category: "custom", severity: "low" },
  ],
};

const SENDERS = [
  "john_doe", "mary_wanjiku", "techguy99", "marketing_bot", "sarah.k",
  "anonymous_user", "channel_admin", "user_2847", "promo_account", "real_human_42",
  "group_member", "subscriber_01", "moderator_test", "new_user_2024", "verified_acc",
];

const insertEvent = db.prepare(`
  INSERT OR IGNORE INTO activity_events
    (id, userId, platformId, platformName, status, content, ruleMatched, category, severity, sender, timestamp)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Generate ~90 events spread across the last 14 days for each main user
for (const userId of [ADMIN_ID, DUMMY_USERS[0].id, DUMMY_USERS[2].id]) {
  const platforms = userPlatformMap[userId] || ["telegram"];

  for (let i = 0; i < 90; i++) {
    // Realistic distribution: 30% blocked, 20% flagged, 50% allowed
    const roll = Math.random();
    const status = roll < 0.30 ? "blocked" : roll < 0.50 ? "flagged" : "allowed";
    const samples = CONTENT_SAMPLES[status];
    const sample = samples[Math.floor(Math.random() * samples.length)];
    const platformId = platforms[Math.floor(Math.random() * platforms.length)];
    const cfg = PLATFORM_CONFIGS.find(p => p.id === platformId);
    const daysBack = Math.random() * 14;
    const timestamp = new Date(Date.now() - daysBack * 86_400_000).toISOString();

    insertEvent.run(
      uuid(), userId, platformId, cfg?.name ?? platformId,
      status, sample.content, sample.rule,
      sample.category, sample.severity,
      SENDERS[Math.floor(Math.random() * SENDERS.length)],
      timestamp
    );
  }
}

// Lighter set for free-plan users (less retention shown anyway)
for (const userId of [DUMMY_USERS[1].id, DUMMY_USERS[3].id, DUMMY_USERS[4].id]) {
  const platforms = userPlatformMap[userId] || ["telegram"];

  for (let i = 0; i < 20; i++) {
    const roll = Math.random();
    const status = roll < 0.30 ? "blocked" : roll < 0.50 ? "flagged" : "allowed";
    const samples = CONTENT_SAMPLES[status];
    const sample = samples[Math.floor(Math.random() * samples.length)];
    const platformId = platforms[Math.floor(Math.random() * platforms.length)];
    const cfg = PLATFORM_CONFIGS.find(p => p.id === platformId);
    const timestamp = new Date(Date.now() - Math.random() * 7 * 86_400_000).toISOString();

    insertEvent.run(
      uuid(), userId, platformId, cfg?.name ?? platformId,
      status, sample.content, sample.rule,
      sample.category, sample.severity,
      SENDERS[Math.floor(Math.random() * SENDERS.length)],
      timestamp
    );
  }
}
console.log(`  Activity events seeded`);

// ─── API keys ────────────────────────────────────────────────────────────────

const insertApiKey = db.prepare(`
  INSERT OR IGNORE INTO api_keys
    (id, userId, label, prefix, keyHash, createdAt, lastUsedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const API_KEY_CONFIGS = [
  { label: "Production",   lastUsed: daysAgo(1) },
  { label: "Staging",      lastUsed: daysAgo(5) },
  { label: "CI/CD Pipeline", lastUsed: daysAgo(0) },
];

// Give API keys to pro/enterprise users
for (const userId of PRO_USER_IDS) {
  for (const kc of API_KEY_CONFIGS.slice(0, userId === ADMIN_ID ? 3 : 1)) {
    const rawKey = `lg_${crypto.randomBytes(24).toString("hex")}`;
    const prefix = rawKey.slice(0, 10);
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    insertApiKey.run(uuid(), userId, kc.label, prefix, keyHash, daysAgo(Math.floor(Math.random() * 30 + 2)), kc.lastUsed);
  }
}
console.log(`  API keys seeded`);

// ─── sessions ────────────────────────────────────────────────────────────────

const insertSession = db.prepare(`
  INSERT OR IGNORE INTO sessions
    (id, userId, device, ip, createdAt, lastSeenAt, revoked)
  VALUES (?, ?, ?, ?, ?, ?, 0)
`);

const DEVICES = [
  "Chrome 124 on Windows 11",
  "Safari 17 on macOS Sonoma",
  "Firefox 125 on Ubuntu 22.04",
  "Chrome 124 on Android 14",
  "Safari 17 on iPhone iOS 17",
  "Edge 124 on Windows 10",
];

const IPS = [
  "41.89.12.45", "105.163.4.78", "196.216.2.100",
  "154.123.45.67", "41.212.33.90", "102.89.56.12",
];

for (const userId of ALL_USER_IDS) {
  // 1–2 active sessions per user
  const count = userId === ADMIN_ID ? 2 : 1;
  for (let i = 0; i < count; i++) {
    insertSession.run(
      uuid(), userId,
      DEVICES[Math.floor(Math.random() * DEVICES.length)],
      IPS[Math.floor(Math.random() * IPS.length)],
      daysAgo(Math.floor(Math.random() * 10 + 1)),
      new Date(Date.now() - Math.random() * 3_600_000).toISOString()
    );
  }
}
console.log(`  Sessions seeded`);

// ─── summary ────────────────────────────────────────────────────────────────

console.log("\n✓ Dummy data seeded successfully!\n");
console.log("Users created (password for all: Password123!):");
for (const u of DUMMY_USERS) {
  console.log(`  ${u.name.padEnd(20)} ${u.email.padEnd(35)} plan: ${u.plan}`);
}
console.log("\nThe admin account is unchanged. Log in at http://localhost:5173");

db.close();
