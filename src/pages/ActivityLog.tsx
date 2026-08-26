import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  ShieldX,
  AlertTriangle,
  CheckCircle2,
  Search,
  Filter,
  ChevronDown,
  Download,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type ActivityStatus,
  getCategoryLabel,
} from "@/lib/data";
import { useActivity, formatRelativeTime } from "@/lib/activity";
import { usePlan } from "@/lib/plan";
import { cn } from "@/lib/utils";

const statusConfig: Record<ActivityStatus, { label: string; icon: React.ElementType; classes: string; dot: string }> = {
  blocked: {
    label: "Blocked",
    icon: ShieldX,
    classes: "status-blocked border",
    dot: "bg-danger",
  },
  flagged: {
    label: "Flagged",
    icon: AlertTriangle,
    classes: "status-flagged border",
    dot: "bg-warning",
  },
  allowed: {
    label: "Allowed",
    icon: CheckCircle2,
    classes: "status-allowed border",
    dot: "bg-success",
  },
};

const ITEMS_PER_PAGE = 8;

const severityRank = { high: 0, medium: 1, low: 2 } as const;

/**
 * Activity Log page (route: /activity).
 *
 * The full, searchable feed of moderation events (useActivity →
 * /api/content/activity). Read-only — every row is a real recorded scan:
 *   • filter by verdict (all / blocked / flagged / allowed) with live counts
 *   • free-text search across content, platform and matched rule
 *   • sort by newest / oldest / severity, with client-side pagination (8/page)
 *   • expand a row for the full content + metadata
 *   • export the current filtered set to CSV
 * How far back events are kept (retention) is plan-dependent (usePlan).
 */
export default function Activity() {
  const { limits } = usePlan();
  const { events: allEvents } = useActivity();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "severity">("newest");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Status filter + free-text search, then sort — all client-side over the
  // already-loaded events (the list is small enough not to need server paging).
  const filtered = allEvents
    .filter((e) => {
      const matchStatus = statusFilter === "all" || e.status === statusFilter;
      const matchSearch =
        !search ||
        e.content.toLowerCase().includes(search.toLowerCase()) ||
        e.platformName.toLowerCase().includes(search.toLowerCase()) ||
        e.ruleMatched.toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    })
    .sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      if (sortBy === "oldest") return aTime - bTime;
      if (sortBy === "severity") {
        const diff = severityRank[a.severity] - severityRank[b.severity];
        return diff !== 0 ? diff : bTime - aTime;
      }
      return bTime - aTime;
    });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const counts = {
    all: allEvents.length,
    blocked: allEvents.filter((e) => e.status === "blocked").length,
    flagged: allEvents.filter((e) => e.status === "flagged").length,
    allowed: allEvents.filter((e) => e.status === "allowed").length,
  };

  // Build a CSV from the current filtered rows and trigger a client-side
  // download (no server round-trip); double-quotes in content are escaped.
  const exportCsv = () => {
    const rows = [
      ["Timestamp", "Status", "Platform", "Sender", "Rule Matched", "Category", "Severity", "Content"],
      ...filtered.map((e) => [
        e.timestamp,
        e.status,
        e.platformName,
        e.sender,
        e.ruleMatched,
        e.category,
        e.severity,
        `"${e.content.replace(/"/g, '""')}"`,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `linguaguard-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Activity Log</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Real-time content filtering events across all platforms
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {filtered.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs hidden sm:flex"
                onClick={exportCsv}
                title="Download filtered results as CSV"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </Button>
            )}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/40 border border-border">
              <span className="text-xs font-medium text-muted-foreground">
                {limits.retentionDays >= 365 ? "1-year" : `${limits.retentionDays}-day`} retention · {limits.label}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-danger/10 border border-danger/20">
              <span className="w-2 h-2 rounded-full bg-danger animate-pulse" />
              <span className="text-xs font-medium text-danger">Live</span>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          {(["all", "blocked", "flagged", "allowed"] as const).map((s) => {
            const isActive = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary shadow-brand-sm"
                    : "bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
                )}
              >
                {s !== "all" && (
                  <span className={cn("w-1.5 h-1.5 rounded-full", statusConfig[s as ActivityStatus].dot)} />
                )}
                <span className="capitalize">{s}</span>
                <span className={cn(
                  "text-[10px] px-1 py-0 rounded",
                  isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {counts[s]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search + Filter Row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search content, platform, rule..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select value={sortBy} onValueChange={(v) => { setSortBy(v as typeof sortBy); setPage(1); }}>
            <SelectTrigger className="h-9 w-full sm:w-36 text-xs">
              <Filter className="w-3 h-3 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="severity">By Severity</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Events List */}
        <div className="space-y-2">
          {paginated.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-center text-muted-foreground">
              <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center">
                <Filter className="w-6 h-6 opacity-30" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">No events match your filters</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {allEvents.length === 0
                    ? "Run the test scanner on the Filter Rules page to generate your first events."
                    : "Try clearing the search or changing the status filter."}
                </p>
              </div>
            </div>
          ) : (
            paginated.map((event) => {
              const cfg = statusConfig[event.status];
              const isExpanded = expanded === event.id;

              return (
                <div
                  key={event.id}
                  className="rounded-xl border border-border bg-card shadow-brand-sm overflow-hidden transition-all duration-200 hover:shadow-brand-md"
                >
                  <button
                    className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
                    onClick={() => setExpanded(isExpanded ? null : event.id)}
                  >
                    {/* Status */}
                    <Badge
                      className={cn(
                        "flex-shrink-0 text-[10px] h-5 px-2 gap-1 font-semibold mt-0.5",
                        cfg.classes
                      )}
                    >
                      <cfg.icon className="w-2.5 h-2.5" />
                      {cfg.label}
                    </Badge>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground line-clamp-1">{event.content}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[11px] font-medium text-primary">{event.platformName}</span>
                        <span className="text-[11px] text-muted-foreground">·</span>
                        <span className="text-[11px] text-muted-foreground">{event.sender}</span>
                        {event.ruleMatched !== "—" && (
                          <>
                            <span className="text-[11px] text-muted-foreground">·</span>
                            <span className="text-[11px] text-muted-foreground">{event.ruleMatched}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[11px] text-muted-foreground">{formatRelativeTime(event.timestamp)}</span>
                      <ChevronDown
                        className={cn(
                          "w-3.5 h-3.5 text-muted-foreground transition-transform",
                          isExpanded && "rotate-180"
                        )}
                      />
                    </div>
                  </button>

                  {/* Expanded */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-0 border-t border-border bg-muted/20">
                      <div className="pt-3 space-y-3">
                        <div>
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Full Content</p>
                          <p className="text-sm text-foreground leading-relaxed">{event.content}</p>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div>
                            <p className="text-[11px] text-muted-foreground mb-0.5">Platform</p>
                            <p className="text-xs font-semibold text-foreground">{event.platformName}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-muted-foreground mb-0.5">Category</p>
                            <p className="text-xs font-semibold text-foreground">{getCategoryLabel(event.category)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-muted-foreground mb-0.5">Severity</p>
                            <p className="text-xs font-semibold text-foreground capitalize">{event.severity}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-muted-foreground mb-0.5">Time</p>
                            <p className="text-xs font-semibold text-foreground">{new Date(event.timestamp).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} events
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-3 text-xs"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Prev
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce<(number | "…")[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <span key={`ellipsis-${i}`} className="text-xs text-muted-foreground px-1">…</span>
                  ) : (
                    <Button
                      key={p}
                      variant={p === page ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-7 p-0 text-xs"
                      onClick={() => setPage(p as number)}
                    >
                      {p}
                    </Button>
                  )
                )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-3 text-xs"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
