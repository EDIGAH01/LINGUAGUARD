import { AppLayout } from "@/components/layout/AppLayout";
import {
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  CheckCircle2,
  Link2,
  Filter,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { type ActivityStatus } from "@/lib/data";
import { usePlatforms } from "@/lib/store";
import { useServerRules } from "@/lib/rules";
import { useActivity, useContentStats, formatRelativeTime } from "@/lib/activity";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { useState, useCallback } from "react";

const statusConfig: Record<ActivityStatus, { label: string; icon: React.ElementType; classes: string }> = {
  blocked: { label: "Blocked", icon: ShieldX, classes: "status-blocked border" },
  flagged: { label: "Flagged", icon: AlertTriangle, classes: "status-flagged border" },
  allowed: { label: "Allowed", icon: CheckCircle2, classes: "status-allowed border" },
};

/**
 * Dashboard page (route: /).
 *
 * The landing screen after login — a real-time protection overview. Every
 * number here is live, not mocked:
 *   • stat cards (total filtered / blocked / flagged / platforms active) from
 *     useContentStats → /api/content/stats
 *   • a Protection Score derived from how much of the rule set is enabled and
 *     how many platforms are connected (the same two ratios shown as bars)
 *   • connected-platform tiles showing today's per-platform filter counts
 *   • a Recent Activity feed (useActivity → /api/content/activity)
 * The refresh button re-pulls activity + stats together.
 */
export default function Dashboard() {
  const [platforms] = usePlatforms();
  const { rules } = useServerRules();
  const { events, refresh: refreshActivity } = useActivity();
  const { stats, refresh: refreshStats } = useContentStats();
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshActivity?.(), refreshStats?.()].filter(Boolean));
    setLastRefreshed(new Date());
    setRefreshing(false);
  }, [refreshActivity, refreshStats]);

  const recentEvents = events.slice(0, 6);
  const connectedPlatforms = platforms.filter((p) => p.status === "connected");
  const activeRules = rules.filter((r) => r.enabled).length;
  const totalFiltered = stats?.totalFiltered ?? 0;
  const blocked = stats?.blocked ?? 0;
  const flagged = stats?.flagged ?? 0;

  // Real formula, not a fabricated number: half from how much of your rule
  // set is actually enabled, half from how many of your platforms are
  // connected — the same two ratios shown as progress bars below.
  const ruleRatio = rules.length > 0 ? activeRules / rules.length : 0;
  const platformRatio = platforms.length > 0 ? connectedPlatforms.length / platforms.length : 0;
  const protectionScore = Math.round(((ruleRatio + platformRatio) / 2) * 100);

  const statCards = [
    {
      title: "Total Filtered",
      value: totalFiltered.toLocaleString(),
      change: "All time",
      icon: ShieldCheck,
      gradient: "from-primary/10 to-primary/5",
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      title: "Content Blocked",
      value: blocked.toLocaleString(),
      change: "All time",
      icon: ShieldX,
      gradient: "from-danger/10 to-danger/5",
      iconBg: "bg-danger/10",
      iconColor: "text-danger",
    },
    {
      title: "Items Flagged",
      value: flagged.toLocaleString(),
      change: "All time",
      icon: AlertTriangle,
      gradient: "from-warning/10 to-warning/5",
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
    },
    {
      title: "Platforms Active",
      value: String(connectedPlatforms.length),
      change: `of ${platforms.length} connected`,
      icon: Link2,
      gradient: "from-success/10 to-success/5",
      iconBg: "bg-success/10",
      iconColor: "text-success",
    },
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Real-time content protection overview
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/40 border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              title={`Last updated ${lastRefreshed.toLocaleTimeString()}`}
            >
              <RefreshCw className={cn("w-3 h-3", refreshing && "animate-spin")} />
              <span className="hidden sm:inline">
                {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </button>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/10 border border-success/20">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-medium text-success">Protection Active</span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <Card
              key={stat.title}
              className={cn(
                "border-border shadow-brand-sm overflow-hidden bg-gradient-to-br transition-all duration-200 hover:shadow-brand-md hover:-translate-y-0.5",
                stat.gradient
              )}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{stat.title}</p>
                    <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
                  </div>
                  <div className={cn("p-2.5 rounded-xl ring-4 ring-white/40 dark:ring-white/5", stat.iconBg)}>
                    <stat.icon className={cn("w-5 h-5", stat.iconColor)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Protection Score + Connected Platforms */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Protection Score */}
          <Card className="border-border shadow-brand-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                Protection Score
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-center">
                <div className="relative w-28 h-28">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="40" fill="none"
                      stroke="hsl(var(--primary))" strokeWidth="8"
                      strokeDasharray={`${2 * Math.PI * 40 * protectionScore / 100} ${2 * Math.PI * 40}`}
                      strokeLinecap="round"
                      style={{ filter: "drop-shadow(0 0 6px hsl(var(--primary) / 0.5))" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-foreground">{protectionScore}</span>
                    <span className="text-xs text-muted-foreground">/ 100</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Active Rules</span>
                  <span className="font-semibold text-foreground">{activeRules}/{rules.length}</span>
                </div>
                <Progress value={rules.length > 0 ? (activeRules / rules.length) * 100 : 0} className="h-1.5" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Platforms Connected</span>
                  <span className="font-semibold text-foreground">{connectedPlatforms.length}/{platforms.length}</span>
                </div>
                <Progress value={platforms.length > 0 ? (connectedPlatforms.length / platforms.length) * 100 : 0} className="h-1.5" />
              </div>
            </CardContent>
          </Card>

          {/* Active Platforms */}
          <Card className="border-border shadow-brand-sm lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-primary" />
                  Connected Platforms
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" asChild>
                  <Link to="/connections">
                    Manage <ArrowUpRight className="w-3 h-3 ml-1" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {connectedPlatforms.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/40 border border-border transition-colors hover:bg-muted/70"
                  >
                    <div className={cn("w-7 h-7 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0 shadow-sm", p.color)}>
                      <Filter className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                      <p className="text-[10px] text-success">{stats?.byPlatform[p.id] ?? 0} filtered</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card className="border-border shadow-brand-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-foreground">
                Recent Activity
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" asChild>
                <Link to="/activity">
                  View all <ArrowUpRight className="w-3 h-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentEvents.length === 0 && (
              <div className="py-10 flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-muted-foreground/40" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">No activity yet</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    Try the test scanner on the{" "}
                    <Link to="/rules" className="text-primary hover:underline font-medium">Filter Rules</Link>{" "}
                    page to see events appear here.
                  </p>
                </div>
              </div>
            )}
            {recentEvents.map((event) => {
              const cfg = statusConfig[event.status];
              return (
                <div
                  key={event.id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border hover:bg-muted/50 transition-colors"
                >
                  <Badge
                    className={cn(
                      "flex-shrink-0 text-[10px] h-5 px-2 gap-1 font-semibold",
                      cfg.classes
                    )}
                  >
                    <cfg.icon className="w-2.5 h-2.5" />
                    {cfg.label}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground truncate">{event.content}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">{event.platformName}</span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="text-[10px] text-muted-foreground">{event.ruleMatched}</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatRelativeTime(event.timestamp)}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
