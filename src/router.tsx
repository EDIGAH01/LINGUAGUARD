import Dashboard from "./pages/Dashboard";
import Connections from "./pages/Connections";
import FilterRules from "./pages/FilterRules";
import Activity from "./pages/Activity";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import NotFound from "./pages/NotFound";
import { ProtectedRoute } from "./components/ProtectedRoute";

export const routers = [
  {
    path: "/login",
    name: "login",
    element: <Login />,
  },
  {
    path: "/signup",
    name: "signup",
    element: <Signup />,
  },
  /* Legal pages are intentionally PUBLIC — platform reviewers (TikTok, Meta,
     Google) open these signed-out during app review, and wrapping them in
     ProtectedRoute would bounce them to /login and fail the review. */
  {
    path: "/terms",
    name: "terms",
    element: <Terms />,
  },
  {
    path: "/privacy",
    name: "privacy",
    element: <Privacy />,
  },
  {
    path: "/",
    name: "dashboard",
    element: (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: "/connections",
    name: "connections",
    element: (
      <ProtectedRoute>
        <Connections />
      </ProtectedRoute>
    ),
  },
  {
    path: "/rules",
    name: "rules",
    element: (
      <ProtectedRoute>
        <FilterRules />
      </ProtectedRoute>
    ),
  },
  {
    path: "/activity",
    name: "activity",
    element: (
      <ProtectedRoute>
        <Activity />
      </ProtectedRoute>
    ),
  },
  {
    path: "/reports",
    name: "reports",
    element: (
      <ProtectedRoute>
        <Reports />
      </ProtectedRoute>
    ),
  },
  {
    path: "/settings",
    name: "settings",
    element: (
      <ProtectedRoute>
        <Settings />
      </ProtectedRoute>
    ),
  },
  {
    path: "/admin",
    name: "admin",
    element: (
      <ProtectedRoute requireAdmin>
        <Admin />
      </ProtectedRoute>
    ),
  },
  /* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */
  {
    path: "*",
    name: "404",
    element: <NotFound />,
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
