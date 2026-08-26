import { useEffect, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  User,
  Bell,
  Shield,
  CreditCard,
  CheckCircle2,
  Mail,
  Smartphone,
  Globe,
  Lock,
  ChevronRight,
  Zap,
  Star,
  Monitor,
  LogOut,
  Plus,
  Trash2,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { enforcePlanLimits } from "@/lib/store";
import { authFetch, useAuth, changePassword } from "@/lib/auth";
import {
  useSessions,
  useApiKeys,
  startTwoFactorSetup,
  confirmTwoFactorSetup,
  disableTwoFactor,
  type TwoFactorSetup,
} from "@/lib/security";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const notificationSettings = [
  { id: "email_blocked", label: "Email on blocked content", description: "Get notified when content is blocked", icon: Mail, enabled: true },
  { id: "email_flagged", label: "Email on flagged content", description: "Receive alerts for flagged items", icon: Mail, enabled: false },
  { id: "sms_critical", label: "SMS for critical violations", description: "Instant SMS for high-severity events", icon: Smartphone, enabled: true },
  { id: "weekly_digest", label: "Weekly digest report", description: "Summary of all filtering activity", icon: Globe, enabled: true },
];

const planFeatures = {
  free: ["3 platforms", "2 filter rules", "7-day activity log", "Basic reports"],
  pro: ["10 platforms", "Unlimited rules", "90-day activity log", "Advanced reports", "AI agents", "API access"],
  enterprise: ["Unlimited platforms", "Custom rules engine", "1-year log retention", "Real-time alerts", "Priority support", "Custom integration"],
};

type SecurityDialogType = "password" | "2fa" | "sessions" | "apikeys" | null;

/**
 * Settings page (route: /settings).
 *
 * The user's account + preferences hub, organised into sections:
 *   • Profile — name / email / phone (PATCH /api/auth/me)
 *   • Notifications — email/SMS/digest toggles stored server-side so the scan
 *     engine honours them; each channel has a "send test" button
 *   • Security — change password, two-factor (TOTP) enrol/disable, and the
 *     list of active sessions (with per-device sign-out)
 *   • API keys — create / copy / revoke keys for programmatic access
 *   • Billing — current plan and upgrade via M-Pesa, which re-applies plan limits
 * Most actions hit the server and update the shared auth user on success.
 */
export default function Settings() {
  const { user, setUser, refreshUser } = useAuth();
  // Server-backed, not localStorage: the scan engine (which sends the real
  // email/SMS alerts, including for Telegram messages that never touch this
  // browser) reads the same stored preferences these toggles write.
  const [notifications, setNotifications] = useState(notificationSettings);
  useEffect(() => {
    authFetch("/api/notifications/prefs").then(async (res) => {
      if (!res.ok) return;
      const { prefs } = (await res.json()) as { prefs: Record<string, boolean> };
      setNotifications((prev) => prev.map((n) => ({ ...n, enabled: prefs[n.id] ?? n.enabled })));
    });
  }, []);
  const [profile, setProfile] = useState({ name: "", email: "", phone: "" });
  const currentPlan = user?.plan ?? "free";
  const [saved, setSaved] = useState(false);
  const [profileChanged, setProfileChanged] = useState(false);
  const [editing, setEditing] = useState(true);

  useEffect(() => {
    if (user) setProfile({ name: user.name, email: user.email, phone: user.phone });
  }, [user]);

  // Security
  const [securityDialog, setSecurityDialog] = useState<SecurityDialogType>(null);
  const twoFAEnabled = user?.twoFactorEnabled ?? false;
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const sessions = useSessions();
  const apiKeys = useApiKeys();
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);

  // 2FA enrollment flow
  const [twoFASetup, setTwoFASetup] = useState<TwoFactorSetup | null>(null);
  const [twoFACode, setTwoFACode] = useState("");
  const [twoFABusy, setTwoFABusy] = useState(false);
  const [twoFAError, setTwoFAError] = useState("");

  useEffect(() => {
    if (securityDialog === "sessions") sessions.refresh();
    if (securityDialog === "apikeys") apiKeys.refresh();
    if (securityDialog !== "2fa") {
      setTwoFASetup(null);
      setTwoFACode("");
      setTwoFAError("");
    }
    if (securityDialog !== "apikeys") {
      setRevealedKey(null);
      setNewKeyLabel("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [securityDialog]);

  const toggleNotification = async (id: string) => {
    const current = notifications.find((n) => n.id === id);
    if (!current) return;
    const nextEnabled = !current.enabled;
    // Optimistic flip, reverted if the server rejects the save.
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, enabled: nextEnabled } : n)));
    const res = await authFetch("/api/notifications/prefs", {
      method: "PATCH",
      body: JSON.stringify({ [id]: nextEnabled }),
    });
    if (!res.ok) {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, enabled: !nextEnabled } : n)));
      toast.error("Failed to save notification preference");
    }
  };

  const handlePasswordSave = async () => {
    if (!pwForm.current) {
      setPwError("Enter your current password.");
      return;
    }
    if (pwForm.next.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    if (pwForm.next !== pwForm.confirm) {
      setPwError("Passwords do not match.");
      return;
    }
    setPwSaving(true);
    try {
      await changePassword(pwForm.current, pwForm.next);
      setSecurityDialog(null);
      setPwForm({ current: "", next: "", confirm: "" });
      setPwError("");
      toast.success("Password updated. Your other signed-in devices have been signed out.");
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setPwSaving(false);
    }
  };

  const beginTwoFactorSetup = async () => {
    setTwoFABusy(true);
    setTwoFAError("");
    try {
      setTwoFASetup(await startTwoFactorSetup());
    } catch (err) {
      setTwoFAError(err instanceof Error ? err.message : "Failed to start setup");
    } finally {
      setTwoFABusy(false);
    }
  };

  const confirmTwoFactor = async () => {
    setTwoFABusy(true);
    setTwoFAError("");
    try {
      await confirmTwoFactorSetup(twoFACode);
      await refreshUser();
      setTwoFASetup(null);
      setTwoFACode("");
      toast.success("Two-factor authentication enabled");
    } catch (err) {
      setTwoFAError(err instanceof Error ? err.message : "Incorrect code");
    } finally {
      setTwoFABusy(false);
    }
  };

  const handleDisableTwoFactor = async () => {
    setTwoFABusy(true);
    setTwoFAError("");
    try {
      await disableTwoFactor(twoFACode);
      await refreshUser();
      setTwoFACode("");
      toast.success("Two-factor authentication disabled");
    } catch (err) {
      setTwoFAError(err instanceof Error ? err.message : "Incorrect code");
    } finally {
      setTwoFABusy(false);
    }
  };

  const signOutSession = (id: string) => {
    sessions.revoke(id).then(
      () => toast.success("Session signed out"),
      (err) => toast.error(err instanceof Error ? err.message : "Failed to sign out session")
    );
  };

  const generateApiKey = async () => {
    setCreatingKey(true);
    try {
      const rawKey = await apiKeys.create(newKeyLabel.trim() || "Untitled key");
      setRevealedKey(rawKey);
      setNewKeyLabel("");
      toast.success("API key created", { description: "Copy it now — it won't be shown in full again." });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setCreatingKey(false);
    }
  };

  const revokeApiKey = (id: string) => {
    apiKeys.revoke(id).then(
      () => toast.success("API key revoked"),
      (err) => toast.error(err instanceof Error ? err.message : "Failed to revoke API key")
    );
  };

  const copyApiKey = (key: string) => {
    navigator.clipboard?.writeText(key).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Could not copy — select and copy manually")
    );
  };

  const handleSave = async () => {
    if (!profileChanged) return;
    try {
      const res = await authFetch("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ name: profile.name, phone: profile.phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save profile");

      setUser(data.user);
      setSaved(true);
      setProfileChanged(false);
      setEditing(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile");
    }
  };

  const changePlan = async (plan: "free" | "pro" | "enterprise") => {
    if (plan === currentPlan) return;

    try {
      const res = await authFetch("/api/auth/me/plan", {
        method: "PATCH",
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to switch plan");
      setUser(data.user);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to switch plan");
      return;
    }

    // Bring connected platforms in line with the new plan's limits
    const removed = enforcePlanLimits(plan);
    const label = plan === "free" ? "Free" : plan === "pro" ? "Pro" : "Enterprise";
    if (removed.length > 0) {
      toast.warning(`Switched to ${label} plan`, {
        description: `Disconnected to fit your plan limits: ${removed.join(", ")}`,
      });
    } else {
      toast.success(`Switched to ${label} plan`);
    }
  };

  const planPriority = (p: "free" | "pro" | "enterprise") => (p === "free" ? 0 : p === "pro" ? 1 : 2);
  const [mpesaOpen, setMpesaOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"free" | "pro" | "enterprise" | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [mpesaMessage, setMpesaMessage] = useState("");
  const [mpesaMessageIsError, setMpesaMessageIsError] = useState(false);
  const pollAbortRef = useRef(false);

  const handleSubscriptionClick = (plan: "free" | "pro" | "enterprise") => {
    if (plan === currentPlan) return;
    // Admins can change their own plan freely — the M-Pesa flow is only for
    // paying customers upgrading themselves, not an access-control gate.
    if (user?.role === "admin") {
      changePlan(plan);
      return;
    }
    // show payment prompt if upgrading
    if (planPriority(plan) > planPriority(currentPlan)) {
      setSelectedPlan(plan);
      setMpesaOpen(true);
      return;
    }
    // downgrades apply immediately
    changePlan(plan);
  };

  const closeMpesaDialog = () => {
    pollAbortRef.current = true;
    setMpesaOpen(false);
    setMpesaPhone("");
    setMpesaMessage("");
    setMpesaMessageIsError(false);
    setProcessingPayment(false);
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const showMpesaInfo = (msg: string) => {
    setMpesaMessage(msg);
    setMpesaMessageIsError(false);
  };

  const showMpesaError = (msg: string) => {
    setMpesaMessage(msg);
    setMpesaMessageIsError(true);
  };

  const confirmMpesaPayment = async () => {
    if (!selectedPlan) return;
    // validate phone
    const valid = /^((\+2547\d{8})|(07\d{8}))$/.test(mpesaPhone);
    if (!valid) {
      showMpesaError("Please enter a valid Kenyan phone number (eg. +2547XXXXXXXX or 07XXXXXXXX)");
      return;
    }

    setProcessingPayment(true);
    showMpesaInfo("Sending M-Pesa prompt...");
    pollAbortRef.current = false;

    try {
      const stkRes = await authFetch("/api/mpesa/stkpush", {
        method: "POST",
        body: JSON.stringify({ phone: mpesaPhone, plan: selectedPlan }),
      });
      const stkData = await stkRes.json();
      if (!stkRes.ok) throw new Error(stkData.error || "Failed to start M-Pesa payment");

      showMpesaInfo(
        stkData.customerMessage || `M-Pesa prompt sent to ${mpesaPhone}. Please confirm on your phone.`
      );

      const checkoutRequestId = stkData.checkoutRequestId;
      const maxAttempts = 20; // ~60s at 3s intervals — matches the STK push's own timeout window
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (pollAbortRef.current) return;
        await sleep(3000);
        if (pollAbortRef.current) return;

        const statusRes = await authFetch(`/api/mpesa/status/${checkoutRequestId}`);
        const statusData = await statusRes.json();

        if (statusData.status === "success") {
          setProcessingPayment(false);
          setMpesaOpen(false);
          await changePlan(selectedPlan);
          setSelectedPlan(null);
          setMpesaPhone("");
          setMpesaMessage("");
          return;
        }
        if (statusData.status === "failed") {
          setProcessingPayment(false);
          showMpesaError(statusData.detail || "Payment was not completed. Please try again.");
          return;
        }
        // status === "pending" — keep polling
      }

      setProcessingPayment(false);
      showMpesaError("Timed out waiting for confirmation. Please try again.");
    } catch (err) {
      setProcessingPayment(false);
      showMpesaError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in-up max-w-3xl">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 -mx-6 -mt-6 px-6 pt-5 pb-4 bg-background/90 backdrop-blur border-b border-border mb-2">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Settings</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Manage your account and preferences</p>
            </div>
            {saved && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/10 border border-success/20 animate-fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                <span className="text-xs font-medium text-success">Saved</span>
              </div>
            )}
          </div>
        </div>

        {/* Profile */}
        <Card className="border-border shadow-brand-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full gradient-brand flex items-center justify-center flex-shrink-0 shadow-brand-md ring-4 ring-primary/10">
                <User className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{profile.name}</p>
                <p className="text-xs text-muted-foreground">{profile.email}</p>
                <Badge className="mt-1 text-[10px] h-4 px-2 bg-primary/10 text-primary border-0 capitalize">
                  {currentPlan} plan
                </Badge>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Full Name</Label>
                <Input
                  value={profile.name}
                  onChange={(e) => {
                    setProfile((p) => ({ ...p, name: e.target.value }));
                    setProfileChanged(true);
                  }}
                  className="h-9 text-sm"
                  disabled={!editing}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Email</Label>
                <Input type="email" value={profile.email} className="h-9 text-sm" disabled title="Email can't be changed here" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Phone</Label>
                <Input
                  value={profile.phone}
                  onChange={(e) => {
                    setProfile((p) => ({ ...p, phone: e.target.value }));
                    setProfileChanged(true);
                  }}
                  className="h-9 text-sm"
                  disabled={!editing}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-9 gap-2"
                onClick={handleSave}
                disabled={!profileChanged}
              >
                {saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
                {saved ? "Saved!" : "Save Changes"}
              </Button>
              {!editing ? (
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setProfileChanged(false); }}>
                  Lock
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        <Dialog open={mpesaOpen} onOpenChange={(open) => { if (!open) closeMpesaDialog(); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pay with M-Pesa</DialogTitle>
              <DialogDescription>
                Confirm payment to upgrade your subscription to{' '}
                {selectedPlan === 'pro' ? 'Pro' : selectedPlan === 'enterprise' ? 'Enterprise' : ''}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Enter the phone number to receive the M-Pesa prompt.</p>
              <div className="flex gap-2">
                <Input
                  value={mpesaPhone}
                  onChange={(e) => { setMpesaPhone(e.target.value); setMpesaMessage(""); setMpesaMessageIsError(false); }}
                  placeholder="+2547XXXXXXXX"
                  disabled={processingPayment}
                />
              </div>
              {mpesaMessage ? (
                <p className={cn("text-sm", mpesaMessageIsError ? "text-danger" : "text-success")}>{mpesaMessage}</p>
              ) : null}
            </div>
            <DialogFooter>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={closeMpesaDialog}>Cancel</Button>
                <Button disabled={processingPayment || !/^((\+2547\d{8})|(07\d{8}))$/.test(mpesaPhone)} onClick={confirmMpesaPayment}>
                  {processingPayment ? 'Processing...' : 'Pay with M-Pesa'}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Security */}
        <Card className="border-border shadow-brand-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" />
              Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {([
              { id: "password" as const, label: "Change Password", desc: "Update your password regularly" },
              {
                id: "2fa" as const,
                label: "Two-Factor Authentication",
                desc: "Protect your account with 2FA",
                badge: twoFAEnabled ? "Enabled" : "Disabled",
                badgeClass: twoFAEnabled
                  ? "bg-success/10 text-success border-success/20"
                  : "bg-muted text-muted-foreground border-border",
              },
              { id: "sessions" as const, label: "Active Sessions", desc: "View and manage logged-in devices" },
              { id: "apikeys" as const, label: "API Keys", desc: "Manage API keys for integrations" },
            ]).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSecurityDialog(item.id)}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-muted/40 transition-colors cursor-pointer group text-left"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <div className="flex items-center gap-2">
                  {item.badge && (
                    <Badge className={cn("text-[10px] h-4 px-2 border", item.badgeClass)}>{item.badge}</Badge>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Security dialogs */}
        <Dialog open={securityDialog !== null} onOpenChange={(open) => { if (!open) { setSecurityDialog(null); setPwError(""); } }}>
          <DialogContent className="max-w-md">
            {securityDialog === "password" && (
              <>
                <DialogHeader>
                  <DialogTitle>Change Password</DialogTitle>
                  <DialogDescription>Choose a strong password of at least 8 characters.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Current Password</Label>
                    <Input
                      type="password"
                      value={pwForm.current}
                      onChange={(e) => { setPwForm((f) => ({ ...f, current: e.target.value })); setPwError(""); }}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">New Password</Label>
                    <Input
                      type="password"
                      value={pwForm.next}
                      onChange={(e) => { setPwForm((f) => ({ ...f, next: e.target.value })); setPwError(""); }}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Confirm New Password</Label>
                    <Input
                      type="password"
                      value={pwForm.confirm}
                      onChange={(e) => { setPwForm((f) => ({ ...f, confirm: e.target.value })); setPwError(""); }}
                      className="h-9 text-sm"
                    />
                  </div>
                  {pwError && <p className="text-xs text-danger">{pwError}</p>}
                </div>
                <DialogFooter>
                  <Button variant="outline" size="sm" onClick={() => setSecurityDialog(null)}>Cancel</Button>
                  <Button size="sm" onClick={handlePasswordSave} disabled={pwSaving}>
                    {pwSaving ? "Updating…" : "Update Password"}
                  </Button>
                </DialogFooter>
              </>
            )}

            {securityDialog === "2fa" && (
              <>
                <DialogHeader>
                  <DialogTitle>Two-Factor Authentication</DialogTitle>
                  <DialogDescription>
                    Require a code from your authenticator app (Google Authenticator, Authy, etc.) when signing in.
                  </DialogDescription>
                </DialogHeader>

                {!twoFAEnabled && !twoFASetup && (
                  <div className="space-y-3 py-2">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-muted">
                          <Shield className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">2FA is disabled</p>
                          <p className="text-xs text-muted-foreground">Enable to protect your account.</p>
                        </div>
                      </div>
                      <Button size="sm" onClick={beginTwoFactorSetup} disabled={twoFABusy}>
                        {twoFABusy ? "Starting…" : "Enable"}
                      </Button>
                    </div>
                    {twoFAError && <p className="text-xs text-danger">{twoFAError}</p>}
                  </div>
                )}

                {!twoFAEnabled && twoFASetup && (
                  <div className="space-y-3 py-2">
                    <p className="text-xs text-muted-foreground">
                      Scan this QR code with your authenticator app, then enter the 6-digit code it shows.
                    </p>
                    <div className="flex justify-center">
                      <img src={twoFASetup.qrDataUrl} alt="2FA QR code" className="w-40 h-40 rounded-lg border border-border" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Can't scan? Enter this key manually</Label>
                      <p className="text-xs font-mono bg-muted/50 rounded px-2 py-1.5 break-all">{twoFASetup.secret}</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">6-digit code</Label>
                      <Input
                        value={twoFACode}
                        onChange={(e) => { setTwoFACode(e.target.value); setTwoFAError(""); }}
                        inputMode="numeric"
                        maxLength={6}
                        className="h-9 text-sm"
                      />
                    </div>
                    {twoFAError && <p className="text-xs text-danger">{twoFAError}</p>}
                  </div>
                )}

                {twoFAEnabled && (
                  <div className="space-y-3 py-2">
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-success/10 border border-success/20">
                      <div className="p-2 rounded-lg bg-success/10">
                        <Shield className="w-4 h-4 text-success" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">2FA is enabled</p>
                        <p className="text-xs text-muted-foreground">Your account has an extra layer of protection.</p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Enter a code to disable 2FA</Label>
                      <Input
                        value={twoFACode}
                        onChange={(e) => { setTwoFACode(e.target.value); setTwoFAError(""); }}
                        inputMode="numeric"
                        maxLength={6}
                        className="h-9 text-sm"
                      />
                    </div>
                    {twoFAError && <p className="text-xs text-danger">{twoFAError}</p>}
                  </div>
                )}

                <DialogFooter>
                  <Button variant="outline" size="sm" onClick={() => setSecurityDialog(null)}>Close</Button>
                  {!twoFAEnabled && twoFASetup && (
                    <Button size="sm" onClick={confirmTwoFactor} disabled={twoFABusy || twoFACode.length !== 6}>
                      {twoFABusy ? "Verifying…" : "Confirm & Enable"}
                    </Button>
                  )}
                  {twoFAEnabled && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleDisableTwoFactor}
                      disabled={twoFABusy || twoFACode.length !== 6}
                    >
                      {twoFABusy ? "Disabling…" : "Disable 2FA"}
                    </Button>
                  )}
                </DialogFooter>
              </>
            )}

            {securityDialog === "sessions" && (
              <>
                <DialogHeader>
                  <DialogTitle>Active Sessions</DialogTitle>
                  <DialogDescription>Devices currently signed in to your account.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-2 max-h-[50vh] overflow-y-auto">
                  {sessions.loading && (
                    <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>
                  )}
                  {!sessions.loading && sessions.sessions.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No active sessions.</p>
                  )}
                  {sessions.sessions.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                      <div className="p-1.5 rounded-md bg-muted">
                        <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{s.device}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.current ? "Active now" : `Last active ${new Date(s.lastSeenAt).toLocaleString()}`}
                        </p>
                      </div>
                      {s.current ? (
                        <Badge className="text-[10px] h-4 px-2 bg-primary/10 text-primary border-0 flex-shrink-0">
                          This device
                        </Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-danger hover:text-danger hover:bg-danger/10 flex-shrink-0"
                          onClick={() => signOutSession(s.id)}
                        >
                          <LogOut className="w-3 h-3" />
                          Sign out
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button size="sm" onClick={() => setSecurityDialog(null)}>Done</Button>
                </DialogFooter>
              </>
            )}

            {securityDialog === "apikeys" && (
              <>
                <DialogHeader>
                  <DialogTitle>API Keys</DialogTitle>
                  <DialogDescription>Keys for integrating LinguaGuard with your own systems.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-2 max-h-[50vh] overflow-y-auto">
                  {revealedKey && (
                    <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 space-y-1.5">
                      <p className="text-xs font-medium text-foreground">Copy this key now — it won't be shown again:</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-mono bg-background/60 rounded px-2 py-1.5 flex-1 truncate">{revealedKey}</p>
                        <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => copyApiKey(revealedKey)} aria-label="Copy API key">
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                  {apiKeys.loading && (
                    <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>
                  )}
                  {!apiKeys.loading && apiKeys.keys.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No API keys yet.</p>
                  )}
                  {apiKeys.keys.map((k) => (
                    <div key={k.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{k.label}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">{k.prefix}••••••••••••</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Created {new Date(k.createdAt).toLocaleDateString()}
                          {k.lastUsedAt ? ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : " · Never used"}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:text-danger hover:bg-danger/10 flex-shrink-0"
                        onClick={() => revokeApiKey(k.id)}
                        aria-label="Revoke API key"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Key label (e.g. Production)"
                    value={newKeyLabel}
                    onChange={(e) => setNewKeyLabel(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={generateApiKey} disabled={creatingKey}>
                    <Plus className="w-3.5 h-3.5" />
                    {creatingKey ? "Generating…" : "Generate New Key"}
                  </Button>
                  <Button size="sm" onClick={() => setSecurityDialog(null)}>Done</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Notifications */}
        <Card className="border-border shadow-brand-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {notifications.map((n) => (
              <div
                key={n.id}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-lg bg-muted">
                    <n.icon className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{n.label}</p>
                    <p className="text-xs text-muted-foreground">{n.description}</p>
                  </div>
                </div>
                <Switch
                  checked={n.enabled}
                  onCheckedChange={() => toggleNotification(n.id)}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Subscription */}
        <Card className="border-border shadow-brand-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              Subscription
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(["free", "pro", "enterprise"] as const).map((plan) => {
                const isCurrent = plan === currentPlan;
                return (
                  <div
                    key={plan}
                    className={cn(
                      "p-4 rounded-xl border-2 transition-all",
                      isCurrent
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        {plan === "pro" && <Zap className="w-3.5 h-3.5 text-primary" />}
                        {plan === "enterprise" && <Star className="w-3.5 h-3.5 text-warning" />}
                        {plan === "free" && <Shield className="w-3.5 h-3.5 text-muted-foreground" />}
                        <span className={cn("text-xs font-bold capitalize", isCurrent ? "text-primary" : "text-foreground")}>
                          {plan}
                        </span>
                      </div>
                      {isCurrent && (
                        <Badge className="text-[10px] h-4 px-1.5 bg-primary text-primary-foreground border-0">Current</Badge>
                      )}
                    </div>
                    <p className="text-lg font-bold text-foreground mb-2">
                      {plan === "free" ? "Ksh 0" : plan === "pro" ? "Ksh 2,999" : "Ksh 9,999"}
                      <span className="text-xs font-normal text-muted-foreground">/mo</span>
                    </p>
                    <ul className="space-y-1">
                      {planFeatures[plan].map((f) => (
                        <li key={f} className="flex items-start gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-success mt-0.5 flex-shrink-0" />
                          <span className="text-[11px] text-muted-foreground">{f}</span>
                        </li>
                      ))}
                    </ul>
                    {!isCurrent && (
                      <>
                        <Button
                          variant={plan === "enterprise" ? "default" : "outline"}
                          size="sm"
                          className="w-full mt-3 h-7 text-xs"
                          onClick={() => handleSubscriptionClick(plan)}
                        >
                          {planPriority(plan) > planPriority(currentPlan) ? "Upgrade" : "Downgrade"}
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
