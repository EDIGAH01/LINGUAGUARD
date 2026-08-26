import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2, Mail, Lock, MessageSquare, Smartphone, KeyRound, ShieldCheck } from "lucide-react";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { Logo3D } from "@/components/Logo3D";
import { useAuth, requestPasswordReset, confirmPasswordReset } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Step = "login" | "twofa" | "forgot" | "reset";

/**
 * Login page (route: /login — public).
 *
 * Email + password sign-in (useAuth().login). If the account has two-factor
 * enabled, the server replies asking for a TOTP code and a second step is shown
 * (confirmLoginTwoFactor). On success the user is sent into the app; an
 * already-authenticated user is redirected away from here.
 */
export default function Login() {
  const { login, confirmLoginTwoFactor, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingToken, setPendingToken] = useState("");
  const [twoFACode, setTwoFACode] = useState("");
  const [resetMethod, setResetMethod] = useState<"email" | "sms">("email");
  const [resetPhone, setResetPhone] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string })?.from || "/";

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, from, navigate]);

  if (user) return null;

  const resetMessages = () => {
    setError("");
    setInfo("");
  };

  const goToStep = (next: Step) => {
    resetMessages();
    setStep(next);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (result && result.requires2FA) {
        setPendingToken(result.pendingToken);
        setStep("twofa");
        return;
      }
      // navigation happens via the effect above once `user` updates
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTwoFASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);
    try {
      await confirmLoginTwoFactor(pendingToken, twoFACode);
      // navigation happens via the effect above once `user` updates
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect code");
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);
    try {
      const message = await requestPasswordReset(email, resetMethod, resetPhone);
      setStep("reset");
      setInfo(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't complete that request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(email, code, newPassword);
      setPassword("");
      setCode("");
      setNewPassword("");
      setConfirmPassword("");
      setStep("login");
      setInfo("Password updated — sign in with your new password.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't complete that request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const heading = {
    login: { title: "Sign in", sub: "Welcome back. Sign in to your workspace." },
    twofa: { title: "Two-factor verification", sub: "Enter the 6-digit code from your authenticator app." },
    forgot: { title: "Reset your password", sub: "We'll send a verification code to your account." },
    reset: { title: "Enter your code", sub: "Check your inbox for the 6-digit code, then choose a new password." },
  }[step];

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel — the product's identity and value, on the real brand
          palette rather than the off-brand purple this page used to use.
          Hidden below lg: on a phone it would push the form off-screen, which
          is the actual job of this page. */}
      {/* border-r matters in dark mode, where the panel and the form surface
          are close enough in value that the split would otherwise vanish. */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden border-r border-sidebar-border bg-sidebar-background p-12">
        {/* Depth without stock imagery: two soft brand-coloured washes. */}
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-accent-foreground/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <Logo3D size={48} />
          <div>
            <p className="text-lg font-bold leading-tight">
              <span style={{ color: "#00A8CC" }}>Lingua</span>
              <span style={{ color: "#FF5A3C" }}>Guard</span>
            </p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/60 leading-tight">
              Language, Protected
            </p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-sidebar-foreground">
            Protect every conversation, everywhere it happens.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-sidebar-foreground/70">
            Real-time content moderation across your social, messaging, and AI
            platforms — with a complete audit trail of every decision.
          </p>
          <ul className="mt-8 space-y-3">
            {[
              "Real-time filtering with custom rule sets",
              "Ten platforms, one moderation policy",
              "Full audit log with per-event severity",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <span className="text-sm text-sidebar-foreground/80">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative space-y-2">
          <p className="text-[11px] text-sidebar-foreground/50">
            Encrypted in transit · Two-factor ready · Session-level access control
          </p>
          <p className="text-[11px] text-sidebar-foreground/40">
            <Link to="/terms" className="transition-colors hover:text-sidebar-foreground/70">
              Terms of Service
            </Link>
            <span className="mx-2">·</span>
            <Link to="/privacy" className="transition-colors hover:text-sidebar-foreground/70">
              Privacy Policy
            </Link>
          </p>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex min-h-screen flex-col items-center justify-center overflow-y-auto bg-background px-6 py-10">
        <div className="w-full max-w-sm">
          {/* Compact brand lockup for small screens, where the panel is hidden. */}
          <div className="mb-8 flex flex-col items-center lg:hidden">
            <Logo3D size={64} showWordmark wordmarkFontSize={30} />
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{heading.title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{heading.sub}</p>
          </div>

        {step === "login" && (
          <form className="space-y-3" onSubmit={handleLogin}>
            <FloatingLabelInput
              id="email"
              name="email"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              enableAutofill
              icon={Mail}
              required
            />
            <FloatingLabelInput
              id="password"
              name="lg-login-secret"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              revealable
              icon={Lock}
              required
            />

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => goToStep("forgot")}
                className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                Forgot password?
              </button>
            </div>

            <Message error={error} info={info} />

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 mt-5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}

        {step === "twofa" && (
          <form className="space-y-3" onSubmit={handleTwoFASubmit}>
            <FloatingLabelInput
              id="twofa-code"
              label="6-digit code"
              value={twoFACode}
              onChange={(e) => setTwoFACode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              icon={KeyRound}
              required
            />

            <Message error={error} info={info} />

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 mt-5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("login"); setTwoFACode(""); setPendingToken(""); }}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors pt-4"
            >
              Back to sign in
            </button>
          </form>
        )}

        {step === "forgot" && (
          <form className="space-y-3" onSubmit={handleForgotSubmit}>
            <FloatingLabelInput
              id="forgot-email"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              icon={Mail}
              required
            />

            <div className="flex items-center gap-2 pt-4">
              <button
                type="button"
                onClick={() => setResetMethod("email")}
                className={cn(
                  "flex-1 h-9 rounded-full border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors",
                  resetMethod === "email"
                    ? "bg-primary/10 text-primary border-primary"
                    : "bg-transparent text-muted-foreground border-input hover:border-primary/40 hover:text-foreground"
                )}
              >
                <Mail className="w-3.5 h-3.5" />
                Email
              </button>
              <button
                type="button"
                onClick={() => setResetMethod("sms")}
                className={cn(
                  "flex-1 h-9 rounded-full border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors",
                  resetMethod === "sms"
                    ? "bg-primary/10 text-primary border-primary"
                    : "bg-transparent text-muted-foreground border-input hover:border-primary/40 hover:text-foreground"
                )}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                SMS
              </button>
            </div>

            {resetMethod === "sms" && (
              <FloatingLabelInput
                id="reset-phone"
                label="Phone number"
                type="tel"
                value={resetPhone}
                onChange={(e) => setResetPhone(e.target.value)}
                autoComplete="off"
                icon={Smartphone}
                required
              />
            )}

            <Message error={error} info={info} />

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 mt-5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? "Sending…" : resetMethod === "sms" ? "Send code via SMS" : "Send reset code"}
            </button>
            <button
              type="button"
              onClick={() => goToStep("login")}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors pt-4"
            >
              Back to sign in
            </button>
          </form>
        )}

        {step === "reset" && (
          <form className="space-y-3" onSubmit={handleResetSubmit}>
            <FloatingLabelInput
              id="code"
              label="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              required
            />
            <FloatingLabelInput
              id="new-password"
              label="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              revealable
              icon={Lock}
              required
            />
            <FloatingLabelInput
              id="confirm-password"
              label="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              revealable
              icon={Lock}
              required
            />

            <Message error={error} info={info} />

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 mt-5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? "Updating…" : "Update password"}
            </button>
            <button
              type="button"
              onClick={() => goToStep("forgot")}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors pt-4"
            >
              Didn't get a code? Try again
            </button>
          </form>
        )}

          {step === "login" && (
            <p className="text-sm text-muted-foreground text-center mt-6">
              Don't have an account?{" "}
              <Link to="/signup" className="font-medium text-primary hover:underline">
                Create one
              </Link>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function Message({ error, info }: { error: string; info: string }) {
  if (!error && !info) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "text-xs rounded-lg px-3 py-2.5 mt-4 border",
        error
          ? "bg-danger-subtle border-danger/25 text-danger"
          : "bg-info-subtle border-info/25 text-info"
      )}
    >
      {error || info}
    </p>
  );
}
