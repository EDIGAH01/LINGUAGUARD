import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Link2,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  Zap,
  Send,
  Bot,
  Plus,
  Trash2,
  KeyRound,
  Smartphone,
  ShieldCheck,
  ExternalLink,
  User,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  InstagramIcon,
  XIcon,
  FacebookIcon,
  TikTokIcon,
  YouTubeIcon,
  WhatsAppIcon,
  TelegramIcon,
  OpenAIIcon,
  ClaudeIcon,
  GeminiIcon,
} from "@/components/icons/social-icons";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  type Platform,
  type ConnectedAccount,
  type ConnectionStatus,
  type PlatformCategory,
  type AuthMethod,
} from "@/lib/data";
import { usePlatforms } from "@/lib/store";
import { usePlan, formatLimit } from "@/lib/plan";
import { authFetch } from "@/lib/auth";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ElementType> = {
  Instagram: InstagramIcon,
  X: XIcon,
  Facebook: FacebookIcon,
  TikTok: TikTokIcon,
  YouTube: YouTubeIcon,
  WhatsApp: WhatsAppIcon,
  Telegram: TelegramIcon,
  OpenAI: OpenAIIcon,
  Claude: ClaudeIcon,
  Gemini: GeminiIcon,
};

const categoryLabel: Record<PlatformCategory, string> = {
  social: "Social Media",
  messaging: "Messaging",
  ai: "AI Agents",
};

const statusConfig: Record<ConnectionStatus, { label: string; icon: React.ElementType; classes: string }> = {
  connected: { label: "Connected", icon: CheckCircle2, classes: "bg-success/10 text-success border-success/20" },
  disconnected: { label: "Disconnected", icon: XCircle, classes: "bg-muted text-muted-foreground border-border" },
  pending: { label: "Pending", icon: Clock, classes: "bg-warning/10 text-warning border-warning/20" },
};

const authMethodIcon: Record<AuthMethod, React.ElementType> = {
  oauth: ExternalLink,
  phone: Smartphone,
  apikey: KeyRound,
  username: User,
};

const authMethodLabel: Record<AuthMethod, string> = {
  oauth: "Connect via OAuth",
  phone: "Verify Phone Number",
  apikey: "Enter API Key",
  username: "Enter Username",
};

// ─── Connect Dialog ────────────────────────────────────────────────────────────

interface ConnectDialogProps {
  platform: Platform | null;
  onClose: () => void;
  onConnect: (platformId: string, account: ConnectedAccount) => void;
}

function ConnectDialog({ platform, onClose, onConnect }: ConnectDialogProps) {
  const [step, setStep] = useState<"form" | "verifying" | "success">("form");
  const [fieldValue, setFieldValue] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [smsStatus, setSmsStatus] = useState("");

  // Telegram is wired to a real backend (a real bot, real verification
  // message) instead of the simulated flow the other platforms use.
  const [telegramLink, setTelegramLink] = useState<string | null>(null);
  const [telegramError, setTelegramError] = useState("");
  const [telegramGroups, setTelegramGroups] = useState<{ chatId: number; groupTitle: string; connectedAt: number }[]>([]);
  const [groupLink, setGroupLink] = useState<string | null>(null);
  const [groupError, setGroupError] = useState("");

  useEffect(() => {
    if (!platform) {
      setStep("form");
      setFieldValue("");
      setDisplayName("");
      setVerifyCode("");
      setShowSecret(false);
      setVerificationSent(false);
      setSmsStatus("");
      setTelegramLink(null);
      setTelegramError("");
      setTelegramGroups([]);
      setGroupLink(null);
      setGroupError("");
      setOauthUrl(null);
      setOauthError("");
    }
  }, [platform]);

  const isTelegram = platform?.id === "telegram";

  // Real OAuth 2.0 + PKCE for the platforms that have it wired server-side —
  // everything else still uses the simulated flow below until a developer
  // app is registered for it.
  const oauthProvider =
    platform?.id === "twitter" ? "x"
    : platform?.id === "tiktok" ? "tiktok"
    : platform?.id === "instagram" ? "instagram"
    : platform?.id === "youtube" ? "youtube"
    : platform?.id === "facebook" ? "facebook"
    : null;
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState("");

  useEffect(() => {
    if (!oauthProvider || !oauthUrl) return;
    const interval = setInterval(async () => {
      const res = await authFetch(`/api/oauth/${oauthProvider}/status`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.connected) {
        clearInterval(interval);
        setOauthUrl(null);
        setDisplayName(data.displayName || data.username || `${platform?.name} account`);
        setFieldValue(data.username ? `@${data.username}` : data.displayName || "");
        setStep("success");
      }
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oauthProvider, oauthUrl]);

  const startRealOAuth = async () => {
    if (!oauthProvider) return;
    setOauthError("");
    setStep("verifying");
    try {
      const res = await authFetch(`/api/oauth/${oauthProvider}/start`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start authorization");
      setOauthUrl(data.authUrl);
      window.open(data.authUrl, "_blank", "noopener,noreferrer");
      setStep("form");
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : "We couldn't reach that service. Please try again.");
      setStep("form");
    }
  };

  useEffect(() => {
    if (!isTelegram) return;
    authFetch("/api/platforms/telegram/groups").then(async (res) => {
      if (res.ok) setTelegramGroups((await res.json()).groups);
    });
  }, [isTelegram]);

  useEffect(() => {
    if (!isTelegram || !platform || !telegramLink) return;
    const interval = setInterval(async () => {
      const res = await authFetch("/api/platforms/telegram/status");
      if (!res.ok) return;
      const data = await res.json();
      if (data.connected) {
        clearInterval(interval);
        setDisplayName(data.telegramUsername || "Telegram user");
        setFieldValue(`@${data.telegramUsername || "telegram_user"}`);
        setStep("success");
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [isTelegram, platform, telegramLink]);

  // Polls until a NEW group shows up (by count growing) rather than a fixed
  // "connected" flag — Telegram's ?startgroup= flow doesn't tell the client
  // which group was picked, only that the bot's /start arrived somewhere.
  useEffect(() => {
    if (!isTelegram || !groupLink) return;
    const startCount = telegramGroups.length;
    const interval = setInterval(async () => {
      const res = await authFetch("/api/platforms/telegram/groups");
      if (!res.ok) return;
      const data = await res.json();
      if (data.groups.length > startCount) {
        clearInterval(interval);
        const newGroup = data.groups[data.groups.length - 1];
        setTelegramGroups(data.groups);
        setGroupLink(null);
        onConnect("telegram", {
          id: `telegram-group-${newGroup.chatId}`,
          handle: `Group: ${newGroup.groupTitle}`,
          displayName: newGroup.groupTitle,
          avatar: newGroup.groupTitle.slice(0, 2).toUpperCase(),
          connectedAt: new Date(newGroup.connectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          filteredToday: 0,
          active: true,
        });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 2000);
    return () => clearInterval(interval);
  }, [isTelegram, groupLink]);

  const startTelegramVerification = async () => {
    setTelegramError("");
    setStep("verifying");
    try {
      const res = await authFetch("/api/platforms/telegram/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start Telegram verification");
      setTelegramLink(data.deepLink);
      window.open(data.deepLink, "_blank", "noopener,noreferrer");
      setStep("form");
    } catch (err) {
      setTelegramError(err instanceof Error ? err.message : "We couldn't reach that service. Please try again.");
      setStep("form");
    }
  };

  const startTelegramGroupVerification = async () => {
    setGroupError("");
    try {
      const res = await authFetch("/api/platforms/telegram/group/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start group connection");
      setGroupLink(data.deepLink);
      window.open(data.deepLink, "_blank", "noopener,noreferrer");
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : "We couldn't reach that service. Please try again.");
    }
  };

  if (!platform) return null;

  const AuthIcon = authMethodIcon[platform.authMethod];

  const handleSubmit = async () => {
    if (!fieldValue) return;

    if (platform.authMethod === "phone" && !verificationSent) {
      setStep("verifying");
      try {
        const res = await authFetch("/api/platforms/phone/start", {
          method: "POST",
          body: JSON.stringify({ platformId: platform.id, phone: fieldValue, platformName: platform.name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to send verification code");
        setVerificationSent(true);
        setSmsStatus(data.message || `A verification code was sent to ${fieldValue}.`);
      } catch (err) {
        setSmsStatus(err instanceof Error ? err.message : "Failed to send verification code");
      }
      setStep("form");
      return;
    }

    if (platform.authMethod === "phone" && verificationSent) {
      if (verifyCode.length < 6) {
        setSmsStatus("Enter the full 6-digit code.");
        return;
      }

      setStep("verifying");
      try {
        const res = await authFetch("/api/platforms/phone/verify", {
          method: "POST",
          body: JSON.stringify({ platformId: platform.id, phone: fieldValue, code: verifyCode }),
        });
        const data = await res.json();
        if (!res.ok) {
          setStep("form");
          setSmsStatus(data.error || "Incorrect code.");
          return;
        }
      } catch {
        setStep("form");
        setSmsStatus("Something went wrong. Please try again.");
        return;
      }
    }

    setStep("verifying");
    await new Promise((r) => setTimeout(r, 800));
    setStep("success");
  };

  const handleOAuth = async () => {
    setStep("verifying");
    await new Promise((r) => setTimeout(r, 2000));
    setStep("success");
  };

  const handleConfirm = () => {
    const now = new Date();
    const label = displayName || fieldValue || "My Account";
    const handle =
      platform.authMethod === "oauth"
        // Real OAuth (X, TikTok) already put the provider's real @handle in
        // fieldValue — only fall back to deriving a slug from the display
        // name for the simulated flow, which never sets fieldValue at all.
        ? fieldValue.startsWith("@")
          ? fieldValue
          : `@${label.toLowerCase().replace(/\s+/g, "_")}`
        : platform.authMethod === "apikey"
        ? `${fieldValue.slice(0, 8)}••••••••••••`
        : fieldValue;

    onConnect(platform.id, {
      id: `${platform.id}-${Date.now()}`,
      handle,
      displayName: label,
      avatar: label
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2),
      connectedAt: now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      filteredToday: 0,
      active: true,
    });
    onClose();
  };

  return (
    <Dialog open={!!platform} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className={cn("w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center flex-shrink-0", platform.color)}>
              {(() => { const Icon = iconMap[platform.icon] ?? Link2; return <Icon className="w-4 h-4 text-white" />; })()}
            </div>
            <div>
              <DialogTitle className="text-base">Connect {platform.name}</DialogTitle>
              <DialogDescription className="text-xs">{platform.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {step === "success" ? (
          <div className="py-6 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center">
              <ShieldCheck className="w-7 h-7 text-success" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Account Connected!</p>
              <p className="text-xs text-muted-foreground mt-1">
                LinguaGuard is now monitoring {platform.name}
              </p>
            </div>
            <Button size="sm" className="mt-2 w-full" onClick={handleConfirm}>
              Done
            </Button>
          </div>
        ) : step === "verifying" ? (
          <div className="py-8 flex flex-col items-center gap-3 text-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">
              {platform.authMethod === "oauth" ? "Opening authorization page..." : "Verifying credentials..."}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              {/* Auth method badge */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border">
                <AuthIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-xs text-muted-foreground">
                  {isTelegram ? "Connect via Telegram bot" : authMethodLabel[platform.authMethod]}
                </span>
              </div>

              {/* Real OAuth 2.0 + PKCE (X, TikTok) — an actual redirect to the
                  provider's real login/consent page, not a simulated delay. */}
              {oauthProvider && (
                <>
                  {oauthUrl ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-muted-foreground">
                        Waiting for you to finish signing in with {platform.name}… this updates automatically.
                      </p>
                      <div className="flex items-center gap-2 text-xs text-primary">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Listening for authorization
                      </div>
                      <Button variant="outline" size="sm" className="w-full h-8 text-xs" asChild>
                        <a href={oauthUrl} target="_blank" rel="noopener noreferrer">
                          Reopen {platform.name} login
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <Button className="w-full h-9 gap-2 text-sm" onClick={startRealOAuth}>
                      <ExternalLink className="w-3.5 h-3.5" />
                      Authorize with {platform.name}
                    </Button>
                  )}
                  <p className="text-[11px] text-center text-muted-foreground">
                    You'll be redirected to {platform.name} to grant access. LinguaGuard only reads content — it never posts on your behalf.
                  </p>
                  {oauthError && <p className="text-[11px] text-danger text-center">{oauthError}</p>}
                </>
              )}

              {/* Simulated OAuth flow — for platforms without a registered developer app yet. */}
              {platform.authMethod === "oauth" && !oauthProvider && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Display Name (optional)</Label>
                    <Input
                      placeholder="e.g. My Personal Account"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <Button className="w-full h-9 gap-2 text-sm" onClick={handleOAuth}>
                    <ExternalLink className="w-3.5 h-3.5" />
                    Authorize with {platform.name}
                  </Button>
                  <p className="text-[11px] text-center text-muted-foreground">
                    You'll be redirected to {platform.name} to grant access. LinguaGuard only reads content — it never posts on your behalf.
                  </p>
                </>
              )}

              {/* Telegram: real bot-backed verification, not simulated */}
              {isTelegram && (
                <>
                  {telegramLink ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-muted-foreground">
                        Waiting for you to tap <strong>Start</strong> in Telegram… this updates automatically.
                      </p>
                      <div className="flex items-center gap-2 text-xs text-primary">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Listening for verification
                      </div>
                      <Button variant="outline" size="sm" className="w-full h-8 text-xs" asChild>
                        <a href={telegramLink} target="_blank" rel="noopener noreferrer">
                          Reopen Telegram link
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Tap the button below to open Telegram and message our bot. Once you hit "Start" there, this
                      connects automatically — no code to copy.
                    </p>
                  )}
                  {telegramError && <p className="text-[11px] text-danger">{telegramError}</p>}

                  <div className="pt-1 border-t border-border space-y-2">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide pt-2">
                      Moderate a group instead
                    </p>
                    {telegramGroups.length > 0 && (
                      <div className="space-y-1">
                        {telegramGroups.map((g) => (
                          <div key={g.chatId} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/40 text-[11px] text-foreground">
                            <ShieldCheck className="w-3 h-3 text-success flex-shrink-0" />
                            {g.groupTitle}
                          </div>
                        ))}
                      </div>
                    )}
                    {groupLink ? (
                      <div className="flex items-center gap-2 text-xs text-primary">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Waiting for a group to be picked…
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5" onClick={startTelegramGroupVerification}>
                        <Plus className="w-3.5 h-3.5" />
                        Connect a Telegram Group
                      </Button>
                    )}
                    {groupError && <p className="text-[11px] text-danger">{groupError}</p>}
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      After adding the bot, it only sees every message if its privacy mode is disabled
                      (message <span className="font-mono">@BotFather</span> → <span className="font-mono">/setprivacy</span> → Disable)
                      or it's made a group admin — otherwise Telegram only forwards it commands, by Telegram's own design.
                    </p>
                  </div>
                </>
              )}

              {/* Phone flow (non-Telegram) */}
              {platform.authMethod === "phone" && !isTelegram && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Phone Number</Label>
                    <Input
                      type="tel"
                      placeholder="+1 (555) 000-0000"
                      value={fieldValue}
                      onChange={(e) => setFieldValue(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  {verificationSent && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Verification Code</Label>
                      <Input
                        placeholder="6-digit code sent via SMS"
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value)}
                        maxLength={6}
                        className="h-9 text-sm tracking-widest"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Enter the code sent to your phone number.
                      </p>
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {verificationSent
                      ? smsStatus || "A code was sent. Enter it above to verify."
                      : "Enter your phone number then tap \"Send Code\"."}
                  </p>
                </>
              )}

              {/* API Key flow */}
              {platform.authMethod === "apikey" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">API Key</Label>
                    <div className="relative">
                      <Input
                        type={showSecret ? "text" : "password"}
                        placeholder={platform.authHint}
                        value={fieldValue}
                        onChange={(e) => setFieldValue(e.target.value)}
                        className="h-9 text-sm pr-9 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Label (optional)</Label>
                    <Input
                      placeholder="e.g. Production Key"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Your API key is encrypted and stored securely. It is only used to access your AI agent's API and is never shared.
                    </p>
                  </div>
                </>
              )}
            </div>

            {isTelegram ? (
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                <Button size="sm" onClick={startTelegramVerification} disabled={!!telegramLink}>
                  {telegramLink ? "Waiting…" : "Open Telegram"}
                </Button>
              </DialogFooter>
            ) : platform.authMethod !== "oauth" ? (
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={
                    !fieldValue ||
                    (platform.authMethod === "phone" && verificationSent && verifyCode.length < 6)
                  }
                >
                  {platform.authMethod === "phone"
                    ? verificationSent
                      ? "Verify Code"
                      : "Send Code"
                    : "Connect"}
                </Button>
              </DialogFooter>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

/**
 * Connections page (route: /connections).
 *
 * Where the user links the accounts LinguaGuard should monitor, grouped by
 * category (Social Media, Messaging, AI Agents). Each tile shows connection
 * status and its linked accounts, and opens the ConnectDialog above to add one.
 *
 * Connection method varies by platform and is reflected in ConnectDialog:
 *   • real OAuth 2.0 + PKCE for the wired providers (X, Instagram, Facebook,
 *     YouTube, TikTok) via /api/oauth/*
 *   • a real bot-backed flow for Telegram
 *   • SMS-code verification for phone platforms (e.g. WhatsApp)
 *   • an API-key form for AI agents
 * Platform tiles/accounts here are the client-side demo store (usePlatforms);
 * the OAuth/Telegram flows overlay real connections on top. Plan-gated: the
 * number of connected platforms is capped (usePlan → maxPlatforms), and AI
 * agents require a plan with aiAgents enabled.
 */
export default function Connections() {
  const [platforms, updatePlatforms] = usePlatforms();
  const [connectingPlatform, setConnectingPlatform] = useState<Platform | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<{ platformId: string; accountId: string } | null>(null);
  const { limits } = usePlan();

  const connectedCount = platforms.filter((p) => p.status === "connected").length;
  const atPlatformLimit = connectedCount >= limits.maxPlatforms;

  const handleConnect = (platformId: string, account: ConnectedAccount) => {
    updatePlatforms((prev) => {
      const target = prev.find((p) => p.id === platformId);
      // Guard: connecting a NEW platform must respect the plan limit
      const connectedNow = prev.filter((p) => p.status === "connected").length;
      if (
        target &&
        target.status !== "connected" &&
        connectedNow >= limits.maxPlatforms
      ) {
        return prev;
      }
      return prev.map((p) =>
        p.id === platformId
          ? {
              ...p,
              status: "connected" as ConnectionStatus,
              accounts: [...p.accounts, account],
            }
          : p
      );
    });
  };

  const handleDisconnectAccount = (platformId: string, accountId: string) => {
    updatePlatforms((prev) =>
      prev.map((p) => {
        if (p.id !== platformId) return p;
        const updatedAccounts = p.accounts.filter((a) => a.id !== accountId);
        return {
          ...p,
          accounts: updatedAccounts,
          status: updatedAccounts.length === 0 ? ("disconnected" as ConnectionStatus) : p.status,
        };
      })
    );
    setDisconnectTarget(null);
  };

  const categories: PlatformCategory[] = ["social", "messaging", "ai"];

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Connections</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Connect your accounts to enable content filtering
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full border",
                atPlatformLimit
                  ? "bg-warning/10 border-warning/20"
                  : "bg-muted/40 border-border"
              )}
            >
              <span
                className={cn(
                  "text-xs font-medium",
                  atPlatformLimit ? "text-warning" : "text-muted-foreground"
                )}
              >
                {connectedCount}/{formatLimit(limits.maxPlatforms)} platforms · {limits.label}
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
              <Link2 className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium text-primary">
                {platforms.reduce((acc, p) => acc + p.accounts.length, 0)} accounts linked
              </span>
            </div>
          </div>
        </div>

        {/* Plan limit notice */}
        {atPlatformLimit && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-warning/10 border border-warning/20">
            <p className="text-xs text-foreground">
              You've reached the {formatLimit(limits.maxPlatforms)}-platform limit of your {limits.label}.
              Upgrade to connect more platforms.
            </p>
            <Button size="sm" className="h-7 text-xs flex-shrink-0" asChild>
              <Link to="/settings">Upgrade Plan</Link>
            </Button>
          </div>
        )}

        {/* Platform Categories */}
        {categories.map((category) => {
          const categoryPlatforms = platforms.filter((p) => p.category === category);
          return (
            <div key={category} className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">{categoryLabel[category]}</h2>
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">
                  {categoryPlatforms.filter((p) => p.status === "connected").length}/
                  {categoryPlatforms.length} connected
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {categoryPlatforms.map((platform) => {
                  const Icon = iconMap[platform.icon] ?? Link2;
                  const status = statusConfig[platform.status];
                  const isConnected = platform.status === "connected";
                  const AuthIcon = authMethodIcon[platform.authMethod];

                  return (
                    <Card
                      key={platform.id}
                      className={cn(
                        "border-border shadow-brand-sm transition-all duration-200 hover:shadow-brand-md overflow-hidden",
                        isConnected && "border-primary/20"
                      )}
                    >
                      <CardContent className="p-4 space-y-3">
                        {/* Platform Header */}
                        <div className="flex items-center gap-3">
                          <div className={cn("w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center flex-shrink-0", platform.color)}>
                            <Icon className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">{platform.name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{platform.description}</p>
                          </div>
                          <Badge className={cn("text-[10px] h-5 px-2 gap-1 border font-medium flex-shrink-0", status.classes)}>
                            <status.icon className="w-2.5 h-2.5" />
                            {status.label}
                          </Badge>
                        </div>

                        {/* Auth method indicator */}
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <AuthIcon className="w-3 h-3" />
                          <span>{authMethodLabel[platform.authMethod]}</span>
                        </div>

                        {/* Connected Accounts */}
                        {platform.accounts.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                              Linked Accounts
                            </p>
                            {platform.accounts.map((account) => (
                              <div
                                key={account.id}
                                className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border border-border group transition-colors hover:bg-muted/60"
                              >
                                {/* Avatar */}
                                <div className={cn("w-6 h-6 rounded-full bg-gradient-to-br flex items-center justify-center flex-shrink-0 text-white text-[9px] font-bold", platform.color)}>
                                  {account.avatar}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-medium text-foreground truncate">{account.displayName}</p>
                                  <p className="text-[10px] text-muted-foreground truncate font-mono">{account.handle}</p>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {account.filteredToday > 0 && (
                                    <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                      <Zap className="w-2.5 h-2.5 text-warning" />
                                      <span>{account.filteredToday}</span>
                                    </div>
                                  )}
                                  <button
                                    onClick={() => setDisconnectTarget({ platformId: platform.id, accountId: account.id })}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-danger/10 hover:text-danger text-muted-foreground"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Action Button */}
                        {platform.category === "ai" && !limits.aiAgents ? (
                          <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5" asChild>
                            <Link to="/settings">
                              <Lock className="w-3 h-3" />
                              Upgrade to Pro for AI Agents
                            </Link>
                          </Button>
                        ) : platform.status === "pending" ? (
                          <Button variant="outline" size="sm" className="w-full h-8 text-xs" disabled>
                            <Clock className="w-3 h-3 mr-1.5" />
                            Approval Pending
                          </Button>
                        ) : !isConnected && atPlatformLimit ? (
                          <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5" disabled>
                            <Lock className="w-3 h-3" />
                            Platform Limit Reached
                          </Button>
                        ) : (
                          <Button
                            variant={isConnected ? "outline" : "default"}
                            size="sm"
                            className="w-full h-8 text-xs font-medium gap-1.5"
                            onClick={() => setConnectingPlatform(platform)}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            {isConnected ? "Add Another Account" : "Connect Account"}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Connect Dialog */}
      <ConnectDialog
        platform={connectingPlatform}
        onClose={() => setConnectingPlatform(null)}
        onConnect={handleConnect}
      />

      {/* Disconnect Confirmation */}
      <AlertDialog open={!!disconnectTarget} onOpenChange={() => setDisconnectTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the account from LinguaGuard. Content filtering for this account will stop immediately. You can reconnect at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-danger-foreground hover:bg-danger/90"
              onClick={() =>
                disconnectTarget &&
                handleDisconnectAccount(disconnectTarget.platformId, disconnectTarget.accountId)
              }
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
