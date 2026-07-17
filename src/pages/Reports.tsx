import { AppLayout } from "@/components/layout/AppLayout";
import { BarChart3, TrendingUp, ShieldX, AlertTriangle, Activity, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { dailyStats, categoryBreakdown } from "@/lib/data";
import { usePlatforms } from "@/lib/store";
import { usePlan } from "@/lib/plan";
import { cn } from "@/lib/utils";

const weeklyTotals = dailyStats.reduce(
  (acc, d) => ({
    blocked: acc.blocked + d.blocked,
    flagged: acc.flagged + d.flagged,
    allowed: acc.allowed + d.allowed,
  }),
  { blocked: 0, flagged: 0, allowed: 0 }
);

export default function Reports() {
  const { limits } = usePlan();
  const [platforms] = usePlatforms();

  const platformStats = platforms
    .filter((p) => p.status === "connected" && p.filteredToday > 0)
    .sort((a, b) => b.filteredToday - a.filteredToday);
  const totalToday = platformStats.reduce((acc, p) => acc + p.filteredToday, 0);

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Reports</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Analytics and insights on your content filtering
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium text-primary">Last 7 days</span>
          </div>
        </div>

        {/* Weekly Summary Cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Blocked", value: weeklyTotals.blocked, icon: ShieldX, color: "text-danger", bg: "bg-danger/10" },
            { label: "Total Flagged", value: weeklyTotals.flagged, icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10" },
            { label: "Total Allowed", value: weeklyTotals.allowed, icon: Activity, color: "text-success", bg: "bg-success/10" },
          ].map((item) => (
            <Card key={item.label} className="border-border shadow-brand-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-lg", item.bg)}>
                    <item.icon className={cn("w-4 h-4", item.color)} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-xl font-bold text-foreground">{item.value.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Daily Activity Chart */}
        <Card className="border-border shadow-brand-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Daily Filtering Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyStats} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barSize={18} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "hsl(var(--foreground))",
                  }}
                  cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                />
                <Bar dataKey="blocked" name="Blocked" fill="hsl(var(--danger))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="flagged" name="Flagged" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="allowed" name="Allowed" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-4 mt-2">
              {[
                { label: "Blocked", color: "bg-danger" },
                { label: "Flagged", color: "bg-warning" },
                { label: "Allowed", color: "bg-success" },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <span className={cn("w-2.5 h-2.5 rounded-sm", l.color)} />
                  <span className="text-xs text-muted-foreground">{l.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Advanced analytics — Pro & Enterprise only */}
        {!limits.advancedReports ? (
        <Card className="border-border border-dashed shadow-brand-sm">
          <CardContent className="p-8 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Advanced Reports</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                Category breakdowns, per-platform analytics, and weekly insights are available on
                Pro and Enterprise plans. Your {limits.label} includes basic reports only.
              </p>
            </div>
            <Button size="sm" className="mt-1" asChild>
              <Link to="/settings">Upgrade Plan</Link>
            </Button>
          </CardContent>
        </Card>
        ) : (
        <>
        {/* Category Breakdown + Platform Table */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Pie Chart */}
          <Card className="border-border shadow-brand-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-foreground">
                Violations by Category
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={categoryBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {categoryBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "hsl(var(--foreground))",
                    }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: "11px", color: "hsl(var(--muted-foreground))" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Platform Breakdown */}
          <Card className="border-border shadow-brand-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-foreground">
                Filtering by Platform (Today)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {platformStats.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No filtering activity yet — connect platforms to see per-platform stats.
                </p>
              )}
              {platformStats.map((p) => {
                const pct = Math.round((p.filteredToday / totalToday) * 100);
                return (
                  <div key={p.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">{p.name}</span>
                      <span className="text-muted-foreground">{p.filteredToday} ({pct}%)</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", p.color)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Trend Insight */}
        <Card className="border-border shadow-brand-sm bg-gradient-to-r from-primary/5 to-accent">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Weekly Insight</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Spam & Scam content (412 matches) is your most frequent filter trigger this week.
                  Harassment violations increased 18% compared to last week — consider reviewing your
                  Cyberbullying rule thresholds.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        </>
        )}
      </div>
    </AppLayout>
  );
}
