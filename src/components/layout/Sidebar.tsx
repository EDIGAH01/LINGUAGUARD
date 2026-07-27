import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Link2,
  Filter,
  Activity,
  BarChart3,
  Settings,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Bell,
  User,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlan } from "@/lib/plan";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Logo3D } from "@/components/Logo3D";

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
  const navigate = useNavigate();
  const { limits } = usePlan();
  const { user, logout } = useAuth();

  const items = user?.role === "admin"
    ? [...navItems, { to: "/admin", icon: ShieldAlert, label: "Admin" }]
    : navItems;

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

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
        <div className="flex-shrink-0">
          <Logo3D size={collapsed ? 34 : 46} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-base font-bold tracking-wide truncate">
              <span style={{ color: "#00A8CC" }}>Lingua</span>
              <span style={{ color: "#FF5A3C" }}>Guard</span>
            </p>
            <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.7)" }}>
              Language, Protected
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-4 space-y-1 overflow-y-auto">
        {items.map(({ to, icon: Icon, label }) => {
          const isActive =
            to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                "relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group",
                collapsed && "justify-center px-0 py-3",
                isActive
                  ? "bg-sidebar-primary/15 text-sidebar-primary shadow-brand-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground"
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full bg-sidebar-primary" />
              )}
              <Icon
                className={cn(
                  "w-4 h-4 flex-shrink-0 transition-colors",
                  isActive ? "text-sidebar-primary" : "group-hover:text-sidebar-accent-foreground"
                )}
              />
              {!collapsed && (
                <span className={cn("text-sm truncate", isActive ? "font-semibold" : "font-medium")}>{label}</span>
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
      <div className="p-2.5 border-t border-sidebar-border space-y-1">
        {/* User */}
        <div
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-xl bg-sidebar-accent/40",
            collapsed && "justify-center px-0 bg-transparent"
          )}
        >
          <div className="w-8 h-8 rounded-full gradient-brand flex items-center justify-center flex-shrink-0 shadow-brand-sm">
            <User className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-sidebar-foreground truncate">{user?.name}</p>
              <p className="text-[10px] text-sidebar-primary/80">{limits.label}</p>
            </div>
          )}
          {!collapsed && (
            <NavLink to="/activity" aria-label="View activity log">
              <Bell className="w-3.5 h-3.5 text-sidebar-foreground/50 flex-shrink-0 cursor-pointer hover:text-sidebar-primary transition-colors" />
            </NavLink>
          )}
        </div>

        {!collapsed && (
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-sidebar-accent/90">
            <span className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/80">Theme</span>
            <ThemeToggle className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground" />
          </div>
        )}

        <button
          onClick={handleLogout}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sidebar-foreground/50",
            "hover:bg-danger/10 hover:text-danger transition-all duration-200",
            collapsed && "justify-center px-0"
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span className="text-xs font-medium">Log out</span>}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sidebar-foreground/50",
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
