import Dashboard from "./pages/Dashboard";
import Connections from "./pages/Connections";
import FilterRules from "./pages/FilterRules";
import Activity from "./pages/Activity";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

export const routers = [
  {
    path: "/",
    name: "dashboard",
    element: <Dashboard />,
  },
  {
    path: "/connections",
    name: "connections",
    element: <Connections />,
  },
  {
    path: "/rules",
    name: "rules",
    element: <FilterRules />,
  },
  {
    path: "/activity",
    name: "activity",
    element: <Activity />,
  },
  {
    path: "/reports",
    name: "reports",
    element: <Reports />,
  },
  {
    path: "/settings",
    name: "settings",
    element: <Settings />,
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

window.__routers__ = routers;
