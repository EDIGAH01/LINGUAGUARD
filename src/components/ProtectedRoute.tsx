import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Logo3D } from "@/components/Logo3D";

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

/**
 * Client-side gate for UX only (redirects, hides nav). The real enforcement
 * lives server-side in requireAuth/requireAdmin middleware — every admin API
 * route checks the JWT's role itself, so this component alone can't be
 * bypassed to reach admin data even if someone forces the route to render.
 */
export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-5 bg-background animate-fade-in">
        {/* Branded logo mark so the first visible frame matches the product */}
        <Logo3D size={52} />
        {/* Segmented ring spinner using the brand primary color */}
        <div className="relative w-8 h-8">
          <svg
            className="animate-spin w-8 h-8"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
          >
            <circle
              cx="16" cy="16" r="13"
              stroke="hsl(var(--border))"
              strokeWidth="2.5"
            />
            <path
              d="M16 3 A13 13 0 0 1 29 16"
              stroke="hsl(var(--primary))"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p className="text-xs font-medium text-muted-foreground tracking-wide">
          Loading your workspace…
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (requireAdmin && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
