import { useEffect, useState } from "react";
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

const initialSessions = [
  { id: "s1", device: "Chrome · Windows 11", location: "Nairobi, KE", lastActive: "Active now", current: true },
  { id: "s2", device: "Safari · iPhone 15", location: "Nairobi, KE", lastActive: "2 hr ago", current: false },
  { id: "s3", device: "Edge · MacBook Pro", location: "Mombasa, KE", lastActive: "Jun 12, 2026", current: false },
];

const initialApiKeys = [
  { id: "k1", label: "Production", key: "lg_live_••••••••••••4f2a", created: "Jun 8, 2026" },
];

export default function Settings() {
  const [notifications, setNotifications] = useState(() => {
    try {
      const stored = window.localStorage.getItem("linguaguard-notifications");
      if (stored) {
        const enabledMap = JSON.parse(stored) as Record<string, boolean>;
        return notificationSettings.map((n) => ({ ...n, enabled: enabledMap[n.id] ?? n.enabled }));
      }
    } catch {
      // corrupt storage — use defaults
    }
    return notificationSettings;
  });
  const [profile, setProfile] = useState({ name: "Alex Morgan", email: "alex@company.com", phone: "+1 (555) 0192" });
    const [currentPlan, setCurrentPlan] = useState<"free" | "pro" | "enterprise">("pro");
  const [saved, setSaved] = useState(false);
  const [profileChanged, setProfileChanged] = useState(false);
  const [editing, setEditing] = useState(true);

  // Security
  const [securityDialog, setSecurityDialog] = useState<SecurityDialogType>(null);
  const [twoFAEnabled, setTwoFAEnabled] = useState<boolean>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("linguaguard-security") || "{}").twoFA ?? true;
    } catch {
      return true;
    }
  });
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [sessions, setSessions] = useState(initialSessions);
  const [apiKeys, setApiKeys] = useState(initialApiKeys);

  const toggleNotification = (id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, enabled: !n.enabled } : n));
      window.localStorage.setItem(
        "linguaguard-notifications",
        JSON.stringify(Object.fromEntries(next.map((n) => [n.id, n.enabled])))
      );
      return next;
    });
  };

  const handlePasswordSave = () => {
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
    setSecurityDialog(null);
    setPwForm({ current: "", next: "", confirm: "" });
    setPwError("");
    toast.success("Password updated");
  };

  const handleToggle2FA = (enabled: boolean) => {
    setTwoFAEnabled(enabled);
    window.localStorage.setItem("linguaguard-security", JSON.stringify({ twoFA: enabled }));
    toast.success(enabled ? "Two-factor authentication enabled" : "Two-factor authentication disabled");
  };

  const signOutSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    toast.success("Session signed out");
  };

  const generateApiKey = () => {
    const key = `lg_live_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
    setApiKeys((prev) => [
      ...prev,
      {
        id: `k${Date.now()}`,
        label: `Key ${prev.length + 1}`,
        key,
        created: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      },
    ]);
    toast.success("API key created", { description: "Copy it now — it won't be shown in full again." });
  };

  const revokeApiKey = (id: string) => {
    setApiKeys((prev) => prev.filter((k) => k.id !== id));
    toast.success("API key revoked");
  };

  const copyApiKey = (key: string) => {
    navigator.clipboard?.writeText(key).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Could not copy — select and copy manually")
    );
  };

  const handleSave = () => {
    if (!profileChanged) return;
    window.localStorage.setItem(
      "linguaguard-profile",
      JSON.stringify({ profile, currentPlan }),
    );
    setSaved(true);
    setProfileChanged(false);
    // keep inputs editable after saving
    setEditing(true);
    // notify other components (e.g. Sidebar) about profile change
    try {
      window.dispatchEvent(new CustomEvent("linguaguard-profile-changed", { detail: { profile, currentPlan } }));
    } catch (e) {
      // ignore if CustomEvent isn't available
    }
    setTimeout(() => setSaved(false), 2000);
  };

  useEffect(() => {
    const storedProfile = window.localStorage.getItem("linguaguard-profile");
    if (storedProfile) {
      const parsed = JSON.parse(storedProfile);
      if (parsed.profile) {
        setProfile(parsed.profile);
      } else {
        setProfile(parsed);
      }
      if (parsed.currentPlan) {
        setCurrentPlan(parsed.currentPlan);
      }
    }
  }, []);

  const changePlan = (plan: "free" | "pro" | "enterprise") => {
    if (plan === currentPlan) return;
    setCurrentPlan(plan);
    window.localStorage.setItem(
      "linguaguard-profile",
      JSON.stringify({ profile, currentPlan: plan }),
    );
    try {
      window.dispatchEvent(new CustomEvent("linguaguard-profile-changed", { detail: { profile, currentPlan: plan } }));
    } catch (e) {}

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

  const handleSubscriptionClick = (plan: "free" | "pro" | "enterprise") => {
    if (plan === currentPlan) return;
    // show payment prompt if upgrading
    if (planPriority(plan) > planPriority(currentPlan)) {
      setSelectedPlan(plan);
      setMpesaOpen(true);
      return;
    }
    // downgrades apply immediately
    changePlan(plan);
  };

  const confirmMpesaPayment = async () => {
    if (!selectedPlan) return;
    // validate phone
    const valid = /^((\+2547\d{8})|(07\d{8}))$/.test(mpesaPhone);
    if (!valid) {
      setMpesaMessage("Please enter a valid Kenyan phone number (eg. +2547XXXXXXXX or 07XXXXXXXX)");
      return;
    }
    setProcessingPayment(true);
    setMpesaMessage("Sending M-Pesa prompt...");
    // simulate sending M-Pesa STK push (replace with real integration)
    setTimeout(() => {
      setMpesaMessage(`M-Pesa prompt sent to ${mpesaPhone}. Please confirm on your phone.`);
      // simulate user completing payment and service confirming
      setTimeout(() => {
        setProcessingPayment(false);
        setMpesaOpen(false);
        changePlan(selectedPlan);
        setSelectedPlan(null);
        setMpesaPhone("");
        setMpesaMessage("");
      }, 2000);
    }, 1200);
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in-up max-w-2xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your account and preferences
          </p>
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
              <div className="w-14 h-14 rounded-full gradient-brand flex items-center justify-center flex-shrink-0 shadow-brand-md">
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
                <Input
                  type="email"
                  value={profile.email}
                  onChange={(e) => {
                    setProfile((p) => ({ ...p, email: e.target.value }));
                    setProfileChanged(true);
                  }}
                  className="h-9 text-sm"
                  disabled={!editing}
                />
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
        <Dialog open={mpesaOpen} onOpenChange={setMpesaOpen}>
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
                <Input value={mpesaPhone} onChange={(e) => { setMpesaPhone(e.target.value); setMpesaMessage(""); }} placeholder="+2547XXXXXXXX" />
              </div>
              {mpesaMessage ? <p className="text-sm text-success">{mpesaMessage}</p> : null}
            </div>
            <DialogFooter>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => { setMpesaOpen(false); setMpesaPhone(""); setMpesaMessage(""); }}>Cancel</Button>
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
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer group text-left"
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
                  <Button size="sm" onClick={handlePasswordSave}>Update Password</Button>
                </DialogFooter>
              </>
            )}

            {securityDialog === "2fa" && (
              <>
                <DialogHeader>
                  <DialogTitle>Two-Factor Authentication</DialogTitle>
                  <DialogDescription>
                    Require a verification code from your authenticator app when signing in.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border my-2">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg", twoFAEnabled ? "bg-success/10" : "bg-muted")}>
                      <Shield className={cn("w-4 h-4", twoFAEnabled ? "text-success" : "text-muted-foreground")} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        2FA is {twoFAEnabled ? "enabled" : "disabled"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {twoFAEnabled ? "Your account has an extra layer of protection." : "Enable to protect your account."}
                      </p>
                    </div>
                  </div>
                  <Switch checked={twoFAEnabled} onCheckedChange={handleToggle2FA} />
                </div>
                <DialogFooter>
                  <Button size="sm" onClick={() => setSecurityDialog(null)}>Done</Button>
                </DialogFooter>
              </>
            )}

            {securityDialog === "sessions" && (
              <>
                <DialogHeader>
                  <DialogTitle>Active Sessions</DialogTitle>
                  <DialogDescription>Devices currently signed in to your account.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-2">
                  {sessions.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                      <div className="p-1.5 rounded-md bg-muted">
                        <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{s.device}</p>
                        <p className="text-xs text-muted-foreground">{s.location} · {s.lastActive}</p>
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
                <div className="space-y-2 py-2">
                  {apiKeys.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No API keys yet.</p>
                  )}
                  {apiKeys.map((k) => (
                    <div key={k.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{k.label}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">{k.key}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Created {k.created}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:text-primary hover:bg-primary/10"
                          onClick={() => copyApiKey(k.key)}
                          aria-label="Copy API key"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:text-danger hover:bg-danger/10"
                          onClick={() => revokeApiKey(k.id)}
                          aria-label="Revoke API key"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={generateApiKey}>
                    <Plus className="w-3.5 h-3.5" />
                    Generate New Key
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
                className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-md bg-muted">
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
                          {plan === "free" ? "Downgrade" : "Upgrade"}
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
