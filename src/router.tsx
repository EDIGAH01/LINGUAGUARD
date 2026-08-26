import { lazy, Suspense, type ReactNode } from "react";
import { ProtectedRoute } from "./components/ProtectedRoute";

// Route-level code splitting: each page becomes its own chunk, loaded on
// demand, so the initial bundle no longer ships every page (and its heavy
// dependencies — charts, dialogs, icons) up front. Vite/Rolldown emits a
// separate file per lazy import automatically.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Connections = lazy(() => import("./pages/Connections"));
const FilterRules = lazy(() => import("./pages/FilterRules"));
const ActivityLog = lazy(() => import("./pages/ActivityLog"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const Admin = lazy(() => import("./pages/Admin"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const NotFound = lazy(() => import("./pages/NotFound"));

/** Brief fallback shown while a route's chunk is being fetched. */
function PageLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );
}

/** Wraps a lazily-loaded element in a Suspense boundary with the loader. */
const withSuspense = (node: ReactNode) => <Suspense fallback={<PageLoader />}>{node}</Suspense>;

export const routers = [
  {
    path: "/login",
    name: "login",
    element: withSuspense(<Login />),
  },
  {
    path: "/signup",
    name: "signup",
    element: withSuspense(<Signup />),
  },
  /* Legal pages are intentionally PUBLIC — platform reviewers (TikTok, Meta,
     Google) open these signed-out during app review, and wrapping them in
     ProtectedRoute would bounce them to /login and fail the review. */
  {
    path: "/terms",
    name: "terms",
    element: withSuspense(<Terms />),
  },
  {
    path: "/privacy",
    name: "privacy",
    element: withSuspense(<Privacy />),
  },
  {
    path: "/",
    name: "dashboard",
    element: (
      <ProtectedRoute>{withSuspense(<Dashboard />)}</ProtectedRoute>
    ),
  },
  {
    path: "/connections",
    name: "connections",
    element: (
      <ProtectedRoute>{withSuspense(<Connections />)}</ProtectedRoute>
    ),
  },
  {
    path: "/rules",
    name: "rules",
    element: (
      <ProtectedRoute>{withSuspense(<FilterRules />)}</ProtectedRoute>
    ),
  },
  {
    path: "/activity",
    name: "activity",
    element: (
      <ProtectedRoute>{withSuspense(<ActivityLog />)}</ProtectedRoute>
    ),
  },
  {
    path: "/reports",
    name: "reports",
    element: (
      <ProtectedRoute>{withSuspense(<Reports />)}</ProtectedRoute>
    ),
  },
  {
    path: "/settings",
    name: "settings",
    element: (
      <ProtectedRoute>{withSuspense(<Settings />)}</ProtectedRoute>
    ),
  },
  {
    path: "/admin",
    name: "admin",
    element: (
      <ProtectedRoute requireAdmin>{withSuspense(<Admin />)}</ProtectedRoute>
    ),
  },
  /* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */
  {
    path: "*",
    name: "404",
    element: withSuspense(<NotFound />),
  },
];

declare global {
  interface Window {
    __routers__: typeof routers;
  }
}

// Guard against SSR / test environments where window is not defined.
if (typeof window !== "undefined") {
  window.__routers__ = routers;
}
