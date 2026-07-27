import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Users, ShieldCheck, Ban, Trash2, CreditCard, Mail, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { authFetch, useAuth, type AuthUser, type PlanTier, type UserRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface Stats {
  totalUsers: number;
  byPlan: Record<PlanTier, number>;
  byRole: Record<UserRole, number>;
  active: number;
  banned: number;
}

export default function Admin() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AuthUser | null>(null);
  const [testingChannel, setTestingChannel] = useState<"email" | "sms" | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [usersRes, statsRes] = await Promise.all([
        authFetch("/api/admin/users"),
        authFetch("/api/admin/stats"),
      ]);
      if (!usersRes.ok || !statsRes.ok) throw new Error("Failed to load admin data");
      const usersData = await usersRes.json();
      const statsData = await statsRes.json();
      setUsers(usersData.users);
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't load the admin data. Please refresh to try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateUser = async (id: string, patch: Partial<{ role: UserRole; plan: PlanTier; status: "active" | "banned" }>) => {
    setError("");
    const res = await authFetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Update failed");
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === id ? data.user : u)));
  };

  /**
   * Regular users only see their notification toggles — the real send target
   * is always their own signup email / account phone, so there's nothing to
   * demo per-user. This is an admin-only ops check that the email/SMS
   * infrastructure itself is actually delivering, sent to the admin's own account.
   */
  const sendDiagnosticTest = async (channel: "email" | "sms") => {
    setTestingChannel(channel);
    try {
      const res = await authFetch("/api/notifications/test", {
        method: "POST",
        body: JSON.stringify({ channel, label: "Admin diagnostic test" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send test alert");
      toast.success(data.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send test alert");
    } finally {
      setTestingChannel(null);
    }
  };

  const deleteUser = async () => {
    if (!deleteTarget) return;
    const res = await authFetch(`/api/admin/users/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      setDeleteTarget(null);
      load();
    } else {
      const data = await res.json();
      setError(data.error || "Delete failed");
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage users and subscriptions</p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-sm text-danger">{error}</div>
        )}

        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-border shadow-brand-sm transition-all duration-200 hover:shadow-brand-md hover:-translate-y-0.5">
              <CardContent className="p-5 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Users</p>
                  <p className="text-2xl font-bold text-foreground">{stats.totalUsers}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border shadow-brand-sm transition-all duration-200 hover:shadow-brand-md hover:-translate-y-0.5">
              <CardContent className="p-5 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-success/10">
                  <ShieldCheck className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Active</p>
                  <p className="text-2xl font-bold text-foreground">{stats.active}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border shadow-brand-sm transition-all duration-200 hover:shadow-brand-md hover:-translate-y-0.5">
              <CardContent className="p-5 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-danger/10">
                  <Ban className="w-5 h-5 text-danger" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Banned</p>
                  <p className="text-2xl font-bold text-foreground">{stats.banned}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border shadow-brand-sm transition-all duration-200 hover:shadow-brand-md hover:-translate-y-0.5">
              <CardContent className="p-5 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-warning/10">
                  <CreditCard className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pro + Enterprise</p>
                  <p className="text-2xl font-bold text-foreground">
                    {stats.byPlan.pro + stats.byPlan.enterprise}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Card className="border-border shadow-brand-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Notification Delivery Test</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <p className="text-xs text-muted-foreground flex-1">
              Sends a real test alert to your own account email/phone to verify the delivery infrastructure is working.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={testingChannel !== null}
                onClick={() => sendDiagnosticTest("email")}
              >
                <Mail className="w-3.5 h-3.5" />
                {testingChannel === "email" ? "Sending…" : "Test Email"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                disabled={testingChannel !== null || !me?.phone}
                onClick={() => sendDiagnosticTest("sms")}
              >
                <Smartphone className="w-3.5 h-3.5" />
                {testingChannel === "sms" ? "Sending…" : "Test SMS"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-brand-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Users</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="text-sm text-muted-foreground p-6 text-center">Loading…</p>
            ) : (
              <div className="overflow-x-auto">
                <p className="sm:hidden px-3 pt-2 pb-1 text-[11px] text-muted-foreground">
                  ← Swipe to see role, plan, status &amp; actions →
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="p-3 font-medium">Name</th>
                      <th className="p-3 font-medium">Email</th>
                      <th className="p-3 font-medium">Role</th>
                      <th className="p-3 font-medium">Plan</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-border last:border-0">
                        <td className="p-3 font-medium text-foreground">
                          {u.name}
                          {u.id === me?.id && (
                            <Badge className="ml-2 text-[10px] h-4 px-1.5 bg-primary/10 text-primary border-0">You</Badge>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">{u.email}</td>
                        <td className="p-3">
                          {/* Admin is a one-way grant — the server rejects any
                              attempt to revoke it, so the control is locked
                              here rather than letting it fail on submit. */}
                          <Select
                            value={u.role}
                            disabled={u.role === "admin"}
                            onValueChange={(v) => updateUser(u.id, { role: v as UserRole })}
                          >
                            <SelectTrigger
                              className="h-8 w-28 text-xs"
                              title={u.role === "admin" ? "An admin's role is permanent and can't be changed." : undefined}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">User</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3">
                          <Select value={u.plan} onValueChange={(v) => updateUser(u.id, { plan: v as PlanTier })}>
                            <SelectTrigger className="h-8 w-32 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="free">Free</SelectItem>
                              <SelectItem value="pro">Pro</SelectItem>
                              <SelectItem value="enterprise">Enterprise</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3">
                          <Badge
                            className={cn(
                              "text-[10px] h-5 px-2 border",
                              u.status === "banned"
                                ? "bg-danger/10 text-danger border-danger/20"
                                : "bg-success/10 text-success border-success/20"
                            )}
                          >
                            {u.status}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={u.id === me?.id}
                              onClick={() => updateUser(u.id, { status: u.status === "banned" ? "active" : "banned" })}
                            >
                              {u.status === "banned" ? "Unban" : "Ban"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 hover:text-danger hover:bg-danger/10"
                              disabled={u.id === me?.id}
                              onClick={() => setDeleteTarget(u)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes their account and platform connections. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-danger text-danger-foreground hover:bg-danger/90" onClick={deleteUser}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
