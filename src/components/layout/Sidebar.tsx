import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Link2,
  Filter,
  Activity,
  BarChart3,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
  Bell,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlan } from "@/lib/plan";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/connections", icon: Link2, label: "Connections" },
  { to: "/rules", icon: Filter, label: "Filter Rules" },
  { to: "/activity", icon: Activity, label: "Activity Log" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const [userName, setUserName] = useState("Alex Morgan");
  const { limits } = usePlan();

  useEffect(() => {
    const applyStored = () => {
      const stored = window.localStorage.getItem("linguaguard-profile");
      if (!stored) return;
      try {
        const parsed = JSON.parse(stored);
        const p = parsed.profile || parsed;
        if (p && p.name) setUserName(p.name);
      } catch (e) {
        // ignore parse errors
      }
    };

    applyStored();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "linguaguard-profile") applyStored();
    };

    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.profile && detail.profile.name) {
        setUserName(detail.profile.name);
      } else {
        applyStored();
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("linguaguard-profile-changed", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("linguaguard-profile-changed", onCustom as EventListener);
    };
  }, []);

  return (
    <aside
      className={cn(
        "flex flex-col h-full transition-all duration-300 ease-in-out",
        "bg-sidebar border-r border-sidebar-border",
        collapsed ? "w-16" : "w-60"
      )}
      style={{ backgroundColor: "hsl(var(--sidebar-background))" }}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-5 border-b border-sidebar-border",
          collapsed && "justify-center px-0"
        )}
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-lg gradient-brand flex items-center justify-center shadow-brand-md animate-pulse-ring">
          <Shield className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <div>
            <p className="text-sm font-bold text-sidebar-primary-foreground tracking-wide">
              LinguaGuard
            </p>
            <p className="text-[10px] text-sidebar-foreground/60">Content Protection</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive =
            to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group",
                collapsed && "justify-center px-0 py-3",
                isActive
                  ? "bg-sidebar-primary/20 text-sidebar-primary shadow-brand-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/90 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon
                className={cn(
                  "w-4 h-4 flex-shrink-0 transition-colors",
                  isActive ? "text-sidebar-primary" : "group-hover:text-sidebar-accent-foreground"
                )}
              />
              {!collapsed && (
                <span className="text-sm font-medium truncate">{label}</span>
              )}
              {!collapsed && label === "Activity Log" && (
                <Badge className="ml-auto text-[10px] h-4 px-1.5 bg-danger/20 text-danger border-0">
                  Live
                </Badge>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* User + Collapse */}
      <div className="p-2 border-t border-sidebar-border space-y-1">
        {/* User */}
        <div
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg",
            collapsed && "justify-center px-0"
          )}
        >
          <div className="w-7 h-7 rounded-full gradient-brand flex items-center justify-center flex-shrink-0">
            <User className="w-3.5 h-3.5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-sidebar-foreground truncate">{userName}</p>
              <p className="text-[10px] text-sidebar-foreground/50">{limits.label}</p>
            </div>
          )}
          {!collapsed && (
            <NavLink to="/activity" aria-label="View activity log">
              <Bell className="w-3.5 h-3.5 text-sidebar-foreground/50 flex-shrink-0 cursor-pointer hover:text-sidebar-primary transition-colors" />
            </NavLink>
          )}
        </div>

        {!collapsed && (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-sidebar-accent/90">
            <span className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/80">Theme</span>
            <ThemeToggle />
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground/50",
            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span className="text-xs font-medium">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
