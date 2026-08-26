// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type PlatformCategory = "social" | "messaging" | "ai";
export type ConnectionStatus = "connected" | "disconnected" | "pending";
export type FilterSeverity = "low" | "medium" | "high";
export type FilterCategory =
  | "hate_speech"
  | "harassment"
  | "explicit"
  | "spam"
  | "misinformation"
  | "custom";
export type ActivityStatus = "blocked" | "flagged" | "allowed";
export type AuthMethod = "oauth" | "phone" | "apikey" | "username";

export interface ConnectedAccount {
  id: string;
  handle: string;       // @username, phone, or API key label
  displayName: string;
  avatar?: string;      // initials fallback
  connectedAt: string;
  filteredToday: number;
  active: boolean;
}

export interface Platform {
  id: string;
  name: string;
  category: PlatformCategory;
  icon: string; // lucide icon name
  status: ConnectionStatus;
  color: string; // tailwind gradient class
  description: string;
  filteredToday: number;
  authMethod: AuthMethod;
  authHint: string;     // placeholder / helper text for connect dialog
  accounts: ConnectedAccount[];
}

// â”€â”€â”€ Mock Data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Platform identity/connection status below is still a client-side demo (real
// OAuth needs a developer app registered with each platform) â€” but filter
// rules, activity events, and aggregate stats are real now; see
// src/lib/rules.ts and src/lib/activity.ts, backed by server/routes/rules.js
// and server/routes/content.js.

export const platforms: Platform[] = [
  {
    id: "instagram",
    name: "Instagram",
    category: "social",
    icon: "Instagram",
    status: "connected",
    color: "from-pink-500 to-purple-600",
    description: "Monitor posts, comments & DMs",
    filteredToday: 43,
    authMethod: "oauth",
    authHint: "Sign in with your Instagram account via OAuth",
    accounts: [
      {
        id: "ig-1",
        handle: "@edigah_clifford",
        displayName: "Edigah Clifford",
        avatar: "EC",
        connectedAt: "Jul 28, 2026",
        filteredToday: 27,
        active: true,
      },
      {
        id: "ig-2",
        handle: "@brand.official",
        displayName: "Brand Official",
        avatar: "BO",
        connectedAt: "Aug 4, 2026",
        filteredToday: 16,
        active: true,
      },
    ],
  },
  {
    id: "twitter",
    name: "X / Twitter",
    category: "social",
    icon: "X",
    status: "connected",
    color: "from-sky-400 to-blue-600",
    description: "Filter tweets, replies & mentions",
    filteredToday: 127,
    authMethod: "oauth",
    authHint: "Sign in with your X account via OAuth",
    accounts: [
      {
        id: "tw-1",
        handle: "@edigahclifford_x",
        displayName: "Edigah Clifford",
        avatar: "EC",
        connectedAt: "Jul 22, 2026",
        filteredToday: 84,
        active: true,
      },
      {
        id: "tw-2",
        handle: "@brand_hq",
        displayName: "Brand HQ",
        avatar: "BH",
        connectedAt: "Aug 1, 2026",
        filteredToday: 43,
        active: true,
      },
    ],
  },
  {
    id: "tiktok",
    name: "TikTok",
    category: "social",
    icon: "TikTok",
    status: "connected",
    color: "from-slate-800 to-slate-900",
    description: "Filter video comments & captions",
    filteredToday: 89,
    authMethod: "oauth",
    authHint: "Sign in with your TikTok account via OAuth",
    accounts: [
      {
        id: "tt-1",
        handle: "@edigahclifford.tt",
        displayName: "Edigah Clifford",
        avatar: "EC",
        connectedAt: "Jul 30, 2026",
        filteredToday: 89,
        active: true,
      },
    ],
  },
  {
    id: "youtube",
    name: "YouTube",
    category: "social",
    icon: "YouTube",
    status: "connected",
    color: "from-red-500 to-red-700",
    description: "Moderate comments & live chat",
    filteredToday: 56,
    authMethod: "oauth",
    authHint: "Sign in with your Google account to connect YouTube",
    accounts: [
      {
        id: "yt-1",
        handle: "@EdigahClifford",
        displayName: "Edigah Clifford",
        avatar: "EC",
        connectedAt: "Aug 3, 2026",
        filteredToday: 41,
        active: true,
      },
      {
        id: "yt-2",
        handle: "@BrandStudio",
        displayName: "Brand Studio",
        avatar: "BS",
        connectedAt: "Aug 8, 2026",
        filteredToday: 15,
        active: true,
      },
    ],
  },
  {
    id: "facebook",
    name: "Facebook",
    category: "social",
    icon: "Facebook",
    status: "connected",
    color: "from-blue-500 to-blue-700",
    description: "Screen posts, comments & groups",
    filteredToday: 34,
    authMethod: "oauth",
    authHint: "Sign in with your Facebook account via OAuth",
    accounts: [
      {
        id: "fb-1",
        handle: "Edigah Clifford",
        displayName: "Edigah Clifford",
        avatar: "EC",
        connectedAt: "Aug 2, 2026",
        filteredToday: 19,
        active: true,
      },
      {
        id: "fb-2",
        handle: "Brand Official · Page",
        displayName: "Brand Official",
        avatar: "BO",
        connectedAt: "Aug 6, 2026",
        filteredToday: 15,
        active: true,
      },
    ],
  },
  {
    id: "telegram",
    name: "Telegram",
    category: "messaging",
    icon: "Telegram",
    status: "connected",
    color: "from-sky-400 to-cyan-500",
    description: "Filter channels, groups & bots",
    filteredToday: 22,
    authMethod: "phone",
    authHint: "Enter your Telegram phone number",
    accounts: [
      {
        id: "tg-1",
        handle: "@edigah_clifford",
        displayName: "Edigah Clifford",
        avatar: "EC",
        connectedAt: "Aug 7, 2026",
        filteredToday: 14,
        active: true,
      },
      {
        id: "tg-2",
        handle: "Group · Community Chat",
        displayName: "Community Chat",
        avatar: "CC",
        connectedAt: "Aug 9, 2026",
        filteredToday: 8,
        active: true,
      },
    ],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    category: "messaging",
    icon: "WhatsApp",
    status: "connected",
    color: "from-green-500 to-emerald-600",
    description: "Screen messages & group chats",
    filteredToday: 17,
    authMethod: "phone",
    authHint: "Enter your WhatsApp phone number",
    accounts: [
      {
        id: "wa-1",
        handle: "+1 (555) 019-2000",
        displayName: "Personal",
        avatar: "P",
        connectedAt: "Jul 25, 2026",
        filteredToday: 11,
        active: true,
      },
      {
        id: "wa-2",
        handle: "+1 (555) 040-1188",
        displayName: "Business",
        avatar: "B",
        connectedAt: "Aug 5, 2026",
        filteredToday: 6,
        active: true,
      },
    ],
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    category: "ai",
    icon: "OpenAI",
    status: "connected",
    color: "from-emerald-500 to-teal-600",
    description: "Guard inputs & outputs from GPT",
    filteredToday: 12,
    authMethod: "apikey",
    authHint: "Paste your OpenAI API key (sk-...)",
    accounts: [
      {
        id: "gpt-1",
        handle: "sk-••••••••••••••••vJ4K",
        displayName: "Production Key",
        avatar: "PK",
        connectedAt: "Jul 20, 2026",
        filteredToday: 12,
        active: true,
      },
    ],
  },
  {
    id: "claude",
    name: "Claude",
    category: "ai",
    icon: "Claude",
    status: "pending",
    color: "from-orange-400 to-amber-500",
    description: "Filter Anthropic Claude sessions",
    filteredToday: 0,
    authMethod: "apikey",
    authHint: "Paste your Anthropic API key (sk-ant-...)",
    accounts: [],
  },
  {
    id: "gemini",
    name: "Gemini",
    category: "ai",
    icon: "Gemini",
    status: "connected",
    color: "from-blue-500 to-indigo-600",
    description: "Monitor Google Gemini interactions",
    filteredToday: 7,
    authMethod: "apikey",
    authHint: "Paste your Google AI API key",
    accounts: [
      {
        id: "gm-1",
        handle: "AIza••••••••••••••••Kd7",
        displayName: "Google AI Key",
        avatar: "GK",
        connectedAt: "Aug 6, 2026",
        filteredToday: 7,
        active: true,
      },
    ],
  },
];

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const getCategoryLabel = (cat: FilterCategory): string => ({
  hate_speech: "Hate Speech",
  harassment: "Harassment",
  explicit: "Explicit Content",
  spam: "Spam & Scam",
  misinformation: "Misinformation",
  custom: "Custom",
}[cat]);

export const getSeverityLabel = (s: FilterSeverity): string =>
  ({ low: "Low", medium: "Medium", high: "High" }[s]);
