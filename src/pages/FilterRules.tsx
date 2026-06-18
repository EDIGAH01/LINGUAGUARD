import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Filter,
  Plus,
  AlertTriangle,
  ShieldX,
  MessageSquare,
  Repeat2,
  Info,
  Wrench,
  ChevronRight,
  Pencil,
  Trash2,
  Hash,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  filterRules as initialRules,
  type FilterRule,
  type FilterCategory,
  type FilterSeverity,
  getCategoryLabel,
  getSeverityLabel,
} from "@/lib/data";
import { cn } from "@/lib/utils";

const categoryIcons: Record<FilterCategory, React.ElementType> = {
  hate_speech: AlertTriangle,
  harassment: MessageSquare,
  explicit: ShieldX,
  spam: Repeat2,
  misinformation: Info,
  custom: Wrench,
};

const categoryColors: Record<FilterCategory, string> = {
  hate_speech: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  harassment: "bg-danger/10 text-danger border-danger/20",
  explicit: "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-950 dark:text-pink-300 dark:border-pink-800",
  spam: "bg-warning/10 text-warning border-warning/20",
  misinformation: "bg-info/10 text-info border-info/20",
  custom: "bg-accent text-accent-foreground border-primary/20",
};

const severityColors: Record<FilterSeverity, string> = {
  low: "bg-success/10 text-success border-success/20",
  medium: "bg-warning/10 text-warning border-warning/20",
  high: "bg-danger/10 text-danger border-danger/20",
};

export default function FilterRules() {
  const [rules, setRules] = useState<FilterRule[]>(initialRules);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<FilterRule | null>(null);
  const [form, setForm] = useState({ name: "", category: "custom" as FilterCategory, severity: "medium" as FilterSeverity, description: "", keywords: "" });

  const handleToggle = (id: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const handleEdit = (rule: FilterRule) => {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      category: rule.category,
      severity: rule.severity,
      description: rule.description,
      keywords: rule.keywords.join(", "),
    });
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingRule(null);
    setForm({ name: "", category: "custom", severity: "medium", description: "", keywords: "" });
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSave = () => {
    if (!form.name) return;
    if (editingRule) {
      setRules((prev) =>
        prev.map((r) =>
          r.id === editingRule.id
            ? { ...r, ...form, keywords: form.keywords.split(",").map((k) => k.trim()).filter(Boolean) }
            : r
        )
      );
    } else {
      const newRule: FilterRule = {
        id: `r${Date.now()}`,
        ...form,
        enabled: true,
        keywords: form.keywords.split(",").map((k) => k.trim()).filter(Boolean),
        matchCount: 0,
        platforms: [],
        createdAt: new Date().toISOString().split("T")[0],
      };
      setRules((prev) => [...prev, newRule]);
    }
    setDialogOpen(false);
  };

  const enabledRules = rules.filter((r) => r.enabled);
  const disabledRules = rules.filter((r) => !r.enabled);

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Filter Rules</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configure what content gets blocked or flagged
            </p>
          </div>
          <Button size="sm" className="h-9 gap-2" onClick={handleNew}>
            <Plus className="w-4 h-4" />
            Add Rule
          </Button>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success" />
            <span className="text-sm font-semibold text-foreground">{enabledRules.length} Active</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-muted-foreground" />
            <span className="text-sm text-muted-foreground">{disabledRules.length} Disabled</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm text-muted-foreground">
              {rules.reduce((acc, r) => acc + r.matchCount, 0).toLocaleString()} total matches
            </span>
          </div>
        </div>

        {/* Rules List */}
        <div className="space-y-3">
          {rules.map((rule) => {
            const Icon = categoryIcons[rule.category];
            return (
              <Card
                key={rule.id}
                className={cn(
                  "border-border shadow-brand-sm transition-all duration-200 hover:shadow-brand-md",
                  !rule.enabled && "opacity-60"
                )}
              >
                <CardHeader className="pb-0 pt-4 px-4">
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={cn("p-2 rounded-lg border mt-0.5 flex-shrink-0", categoryColors[rule.category])}>
                      <Icon className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-foreground">{rule.name}</h3>
                        <Badge className={cn("text-[10px] h-4 px-1.5 border font-medium", categoryColors[rule.category])}>
                          {getCategoryLabel(rule.category)}
                        </Badge>
                        <Badge className={cn("text-[10px] h-4 px-1.5 border font-medium", severityColors[rule.severity])}>
                          {getSeverityLabel(rule.severity)} Risk
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
                    </div>

                    {/* Toggle */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={() => handleToggle(rule.id)}
                      />
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="px-4 pb-4 pt-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* Keywords preview */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {rule.keywords.slice(0, 3).map((kw) => (
                          <div key={kw} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 border border-border">
                            <Hash className="w-2.5 h-2.5 text-muted-foreground" />
                            <span className="text-[11px] text-muted-foreground">{kw}</span>
                          </div>
                        ))}
                        {rule.keywords.length > 3 && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                            <ChevronRight className="w-3 h-3" />
                            {rule.keywords.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-muted-foreground mr-2">
                        {rule.matchCount.toLocaleString()} matches
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:text-primary hover:bg-primary/10"
                        onClick={() => handleEdit(rule)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:text-danger hover:bg-danger/10"
                        onClick={() => handleDelete(rule.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Rule" : "New Filter Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Rule Name</Label>
              <Input
                placeholder="e.g. Block offensive language"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as FilterCategory }))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hate_speech">Hate Speech</SelectItem>
                    <SelectItem value="harassment">Harassment</SelectItem>
                    <SelectItem value="explicit">Explicit Content</SelectItem>
                    <SelectItem value="spam">Spam & Scam</SelectItem>
                    <SelectItem value="misinformation">Misinformation</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm((f) => ({ ...f, severity: v as FilterSeverity }))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Description</Label>
              <Textarea
                placeholder="Describe what this rule does..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="text-sm min-h-[60px] resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Keywords / Triggers</Label>
              <Textarea
                placeholder="Comma-separated keywords, e.g. spam, phishing, click here"
                value={form.keywords}
                onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
                className="text-sm min-h-[60px] resize-none"
              />
              <p className="text-[11px] text-muted-foreground">Separate multiple keywords with commas</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!form.name}>
              {editingRule ? "Save Changes" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
