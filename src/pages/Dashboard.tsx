import { AppLayout } from "@/components/layout/AppLayout";
import {
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  CheckCircle2,
  Link2,
  Filter,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { activityEvents, platforms, totalStats, type ActivityStatus } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

const statusConfig: Record<ActivityStatus, { label: string; icon: React.ElementType; classes: string }> = {
  blocked: { label: "Blocked", icon: ShieldX, classes: "status-blocked border" },
  flagged: { label: "Flagged", icon: AlertTriangle, classes: "status-flagged border" },
  allowed: { label: "Allowed", icon: CheckCircle2, classes: "status-allowed border" },
};

const statCards = [
  {
    title: "Total Filtered",
    value: "1,687",
    change: "+12% today",
    icon: ShieldCheck,
    gradient: "from-primary/10 to-primary/5",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    trend: "up",
  },
  {
    title: "Content Blocked",
    value: "642",
    change: "+8% today",
    icon: ShieldX,
    gradient: "from-danger/10 to-danger/5",
    iconBg: "bg-danger/10",
    iconColor: "text-danger",
    trend: "up",
  },
  {
    title: "Items Flagged",
    value: "318",
    change: "+5% today",
    icon: AlertTriangle,
    gradient: "from-warning/10 to-warning/5",
    iconBg: "bg-warning/10",
    iconColor: "text-warning",
    trend: "up",
  },
  {
    title: "Platforms Active",
    value: String(totalStats.connectedPlatforms),
    change: `of ${platforms.length} connected`,
    icon: Link2,
    gradient: "from-success/10 to-success/5",
    iconBg: "bg-success/10",
    iconColor: "text-success",
    trend: "neutral",
  },
];

export default function Dashboard() {
  const recentEvents = activityEvents.slice(0, 6);
  const connectedPlatforms = platforms.filter((p) => p.status === "connected");

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Real-time content protection overview
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/10 border border-success/20">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-medium text-success">Protection Active</span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <Card key={stat.title} className="border-border shadow-brand-sm overflow-hidden">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{stat.title}</p>
                    <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      {stat.trend === "up" && (
                        <TrendingUp className="w-3 h-3 text-success" />
                      )}
                      {stat.change}
                    </p>
                  </div>
                  <div className={cn("p-2.5 rounded-xl", stat.iconBg)}>
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
                      strokeDasharray={`${2 * Math.PI * 40 * totalStats.protectionScore / 100} ${2 * Math.PI * 40}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-foreground">{totalStats.protectionScore}</span>
                    <span className="text-xs text-muted-foreground">/ 100</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Active Rules</span>
                  <span className="font-semibold text-foreground">{totalStats.activeRules}/7</span>
                </div>
                <Progress value={(totalStats.activeRules / 7) * 100} className="h-1.5" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Platforms Connected</span>
                  <span className="font-semibold text-foreground">{totalStats.connectedPlatforms}/10</span>
                </div>
                <Progress value={(totalStats.connectedPlatforms / 10) * 100} className="h-1.5" />
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
                    className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border"
                  >
                    <div className={cn("w-7 h-7 rounded-md bg-gradient-to-br flex items-center justify-center flex-shrink-0", p.color)}>
                      <Filter className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                      <p className="text-[10px] text-success">{p.filteredToday} filtered</p>
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
            {recentEvents.map((event) => {
              const cfg = statusConfig[event.status];
              return (
                <div
                  key={event.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border hover:bg-muted/50 transition-colors"
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
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{event.timestamp}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
