import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { Logo3D } from "@/components/Logo3D";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { useAuth } from "@/lib/auth";
import { User, Mail, Lock } from "lucide-react";

/**
 * Sign Up page (route: /signup — public).
 *
 * New-account registration (useAuth().signup) with name / email / password.
 * New users start on the Free plan. On success they're logged straight in and
 * sent into the app; an already-authenticated user is redirected away.
 */
export default function Signup() {
  const { signup, user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  if (user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await signup(name, email, password);
      // navigation happens via the effect above once `user` updates
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel — mirrors Login exactly */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden border-r border-sidebar-border bg-sidebar-background p-12">
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
            Start moderating in minutes, not weeks.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-sidebar-foreground/70">
            Create a workspace, connect your first platform, and write the rules
            that decide what gets through.
          </p>
          <ul className="mt-8 space-y-3">
            {[
              "Free to start — no card required",
              "Connect Telegram, X, TikTok and more",
              "Upgrade only when you outgrow the limits",
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
            <Link to="/terms" className="transition-colors hover:text-sidebar-foreground/70">Terms of Service</Link>
            <span className="mx-2">·</span>
            <Link to="/privacy" className="transition-colors hover:text-sidebar-foreground/70">Privacy Policy</Link>
          </p>
        </div>
      </aside>

      <main className="flex min-h-screen flex-col items-center justify-center overflow-y-auto bg-background px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center lg:hidden">
            <Logo3D size={64} showWordmark wordmarkFontSize={30} />
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Create your account</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Set up your LinguaGuard workspace. It takes about a minute.
            </p>
          </div>

          <form className="space-y-3" onSubmit={handleSubmit}>
            <FloatingLabelInput
              id="name"
              label="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              icon={User}
              required
            />
            <FloatingLabelInput
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              icon={Mail}
              required
            />
            <FloatingLabelInput
              id="password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              revealable
              icon={Lock}
              required
            />
            <FloatingLabelInput
              id="confirm"
              label="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              revealable
              icon={Lock}
              required
            />

            {error && (
              <p role="alert" className="text-xs rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2.5 text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 mt-5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
            By creating an account you agree to our{" "}
            <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>{" "}
            and{" "}
            <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
          </p>
          <p className="text-sm text-muted-foreground text-center mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-primary font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
