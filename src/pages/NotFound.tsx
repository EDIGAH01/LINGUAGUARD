import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Logo3D } from "@/components/Logo3D";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/lib/auth";

/**
 * Not Found page (route: * — the catch-all for unmatched paths).
 *
 * A friendly 404 that echoes the attempted path and offers a way back: "go
 * back", plus Dashboard (when signed in) or Sign in (when not), and quick links
 * to the main pages for authenticated users. Logs the bad path to the console.
 */
const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-6 animate-fade-in">
      {/* Decorative blobs */}
      <div aria-hidden className="pointer-events-none fixed -top-32 -left-32 h-96 w-96 rounded-full bg-primary/8 blur-3xl" />
      <div aria-hidden className="pointer-events-none fixed -bottom-32 -right-32 h-96 w-96 rounded-full bg-accent-foreground/5 blur-3xl" />

      <div className="relative flex flex-col items-center gap-6 text-center max-w-md">
        <Logo3D size={72} showWordmark wordmarkFontSize={28} />

        {/* Big 404 */}
        <div className="space-y-1">
          <p className="text-[96px] font-extrabold leading-none tracking-tighter text-gradient-brand select-none">
            404
          </p>
          <h1 className="text-xl font-semibold text-foreground">Page not found</h1>
          <p className="text-sm text-muted-foreground leading-relaxed mt-2">
            The path{" "}
            <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">
              {location.pathname}
            </code>{" "}
            doesn't exist. It may have been moved, deleted, or you may have typed it incorrectly.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
          <Button
            variant="outline"
            className="w-full sm:w-auto gap-2"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-4 h-4" />
            Go back
          </Button>
          {user ? (
            <Button className="w-full sm:w-auto gap-2" asChild>
              <Link to="/">
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </Link>
            </Button>
          ) : (
            <Button className="w-full sm:w-auto gap-2" asChild>
              <Link to="/login">
                <Home className="w-4 h-4" />
                Sign in
              </Link>
            </Button>
          )}
        </div>

        {/* Quick links */}
        {user && (
          <div className="pt-2 border-t border-border w-full">
            <p className="text-xs text-muted-foreground mb-3">Jump to</p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                { to: "/connections", label: "Connections" },
                { to: "/rules", label: "Filter Rules" },
                { to: "/activity", label: "Activity" },
                { to: "/reports", label: "Reports" },
                { to: "/settings", label: "Settings" },
              ].map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className="text-xs px-3 py-1.5 rounded-full border border-border bg-card hover:bg-muted hover:border-primary/30 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotFound;
