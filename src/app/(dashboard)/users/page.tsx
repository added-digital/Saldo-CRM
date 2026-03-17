"use client";

import * as React from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Shield,
  Plus,
  MoreHorizontal,
  UserCheck,
  UserX,
  RefreshCw,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createClient } from "@/lib/supabase/client";
import type { Profile, Team, Scope } from "@/types/database";
import { inviteUserSchema, type InviteUserInput } from "@/lib/validations/user";
import { PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status-badge";
import { UserAvatar } from "@/components/app/user-avatar";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { FormActions } from "@/components/app/form-actions";
import { useUser } from "@/hooks/use-user";
import { getRoleLabel, formatDate } from "@/lib/utils";
import { toast } from "sonner";

export default function UsersPage() {
  const { isAdmin } = useUser();
  const [users, setUsers] = React.useState<Profile[]>([]);
  const [teams, setTeams] = React.useState<Team[]>([]);
  const [scopes, setScopes] = React.useState<Scope[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [inviteDialogOpen, setInviteDialogOpen] = React.useState(false);
  const [inviting, setInviting] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<Profile | null>(null);
  const [userScopes, setUserScopes] = React.useState<string[]>([]);
  const [deactivateTarget, setDeactivateTarget] =
    React.useState<Profile | null>(null);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);

  const inviteForm = useForm<InviteUserInput>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: { email: "" },
  });

  async function fetchData() {
    const supabase = createClient();

    const [{ data: userRows }, { data: teamRows }, { data: scopeRows }] =
      await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("teams").select("*").order("name"),
        supabase.from("scopes").select("*").order("label"),
      ]);

    setUsers((userRows ?? []) as unknown as Profile[]);
    setTeams((teamRows ?? []) as unknown as Team[]);
    setScopes((scopeRows ?? []) as unknown as Scope[]);
    setLoading(false);
  }

  React.useEffect(() => {
    fetchData();
  }, []);

  async function openUserDetail(user: Profile) {
    setSelectedUser(user);
    const supabase = createClient();
    const { data: scopeRows } = await supabase
      .from("user_scopes")
      .select("scope_id")
      .eq("user_id", user.id);

    setUserScopes(
      (scopeRows ?? []).map((s: { scope_id: string }) => s.scope_id),
    );
  }

  async function handleInvite(values: InviteUserInput) {
    setInviting(true);

    const response = await fetch("/api/users/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: values.email }),
    });

    if (!response.ok) {
      toast.error("Failed to invite user");
    } else {
      toast.success(`Invitation sent to ${values.email}`);
      setInviteDialogOpen(false);
      inviteForm.reset();
    }
    setInviting(false);
  }

  async function handleRoleChange(userId: string, role: string) {
    setActionLoading(true);
    const supabase = createClient();

    const { error } = await supabase
      .from("profiles")
      .update({ role } as never)
      .eq("id", userId);

    if (error) {
      toast.error("Failed to update role");
    } else {
      toast.success("Role updated");
      fetchData();
      if (selectedUser?.id === userId) {
        setSelectedUser((prev) =>
          prev ? { ...prev, role: role as Profile["role"] } : prev,
        );
      }
    }
    setActionLoading(false);
  }

  async function handleTeamChange(userId: string, teamId: string) {
    setActionLoading(true);
    const supabase = createClient();
    const value = teamId === "none" ? null : teamId;

    const { error } = await supabase
      .from("profiles")
      .update({ team_id: value } as never)
      .eq("id", userId);

    if (error) {
      toast.error("Failed to update team");
    } else {
      toast.success("Team updated");
      fetchData();
      if (selectedUser?.id === userId) {
        setSelectedUser((prev) => (prev ? { ...prev, team_id: value } : prev));
      }
    }
    setActionLoading(false);
  }

  async function handleScopeToggle(
    userId: string,
    scopeId: string,
    checked: boolean,
  ) {
    const supabase = createClient();

    if (checked) {
      await supabase
        .from("user_scopes")
        .insert({ user_id: userId, scope_id: scopeId } as never);
      setUserScopes((prev) => [...prev, scopeId]);
    } else {
      await supabase
        .from("user_scopes")
        .delete()
        .eq("user_id", userId)
        .eq("scope_id", scopeId);
      setUserScopes((prev) => prev.filter((s) => s !== scopeId));
    }
  }

  async function handleToggleActive() {
    if (!deactivateTarget) return;
    setActionLoading(true);
    const supabase = createClient();

    const newStatus = !deactivateTarget.is_active;
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: newStatus } as never)
      .eq("id", deactivateTarget.id);

    if (error) {
      toast.error(`Failed to ${newStatus ? "reactivate" : "deactivate"} user`);
    } else {
      toast.success(`User ${newStatus ? "reactivated" : "deactivated"}`);
      setDeactivateTarget(null);
      fetchData();
    }
    setActionLoading(false);
  }

  async function handleSyncEmployees() {
    setSyncing(true)

    try {
      const response = await fetch("/api/fortnox/sync-employees", {
        method: "POST",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message ?? "Sync failed")
      }

      const result = await response.json()
      const { employees, customerLinks } = result

      toast.success(
        `Synced: ${employees.created} created, ${employees.updated} updated, ${employees.skipped} skipped. ${customerLinks.linked} customers linked.`,
      )

      fetchData()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to sync employees",
      )
    }

    setSyncing(false)
  }

  const columns: ColumnDef<Profile, unknown>[] = [
    {
      accessorKey: "full_name",
      header: "Name",
      cell: ({ row }) => {
        const profile = row.original;
        return (
          <div className="flex items-center gap-3">
            <UserAvatar
              name={profile.full_name}
              avatarUrl={profile.avatar_url}
              size="sm"
            />
            <div>
              <p className="text-sm font-medium">{profile.full_name ?? "—"}</p>
              <p className="text-xs text-muted-foreground">{profile.email}</p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => getRoleLabel(row.getValue("role")),
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge
          status={row.getValue("is_active") ? "active" : "archived"}
        />
      ),
    },
    {
      accessorKey: "fortnox_cost_center",
      header: "Cost Center",
      cell: ({ row }) => {
        const cc = row.getValue("fortnox_cost_center") as string | null
        return cc ?? "—"
      },
    },
    {
      accessorKey: "created_at",
      header: "Joined",
      cell: ({ row }) => formatDate(row.getValue("created_at")),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const profile = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openUserDetail(profile)}>
                Manage user
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDeactivateTarget(profile)}>
                {profile.is_active ? (
                  <>
                    <UserX className="size-4" />
                    Deactivate
                  </>
                ) : (
                  <>
                    <UserCheck className="size-4" />
                    Reactivate
                  </>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage user accounts, roles, and permissions"
      >
        <Button variant="outline" onClick={handleSyncEmployees} disabled={syncing}>
          <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync from Fortnox"}
        </Button>
        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              Invite User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite User</DialogTitle>
              <DialogDescription>
                Send an invitation to a new user.
              </DialogDescription>
            </DialogHeader>
            <Form {...inviteForm}>
              <form
                onSubmit={inviteForm.handleSubmit(handleInvite)}
                className="space-y-4"
              >
                <FormField
                  control={inviteForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="user@company.com"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormActions
                  submitLabel="Send Invitation"
                  loading={inviting}
                  onCancel={() => setInviteDialogOpen(false)}
                />
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <DataTable
        columns={columns}
        data={users}
        searchKey="full_name"
        searchPlaceholder="Search users..."
        loading={loading}
        pageSize={10}
        emptyState={{
          icon: Shield,
          title: "No users",
          description: "Invite your first team member to get started.",
        }}
      />

      <Sheet
        open={!!selectedUser}
        onOpenChange={(open) => !open && setSelectedUser(null)}
      >
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedUser?.full_name ?? "User"}</SheetTitle>
            <SheetDescription>{selectedUser?.email}</SheetDescription>
          </SheetHeader>

          {selectedUser && (
            <div className="space-y-6 py-6 px-6">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={selectedUser.role}
                  onValueChange={(v) => handleRoleChange(selectedUser.id, v)}
                  disabled={actionLoading}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="team_lead">Team Lead</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Team</Label>
                <Select
                  value={selectedUser.team_id ?? "none"}
                  onValueChange={(v) => handleTeamChange(selectedUser.id, v)}
                  disabled={actionLoading}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No team</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>Scopes</Label>
                <p className="text-xs text-muted-foreground">
                  Scopes determine which features this user can access.
                  {selectedUser.role === "admin" &&
                    " Admins have all scopes by default."}
                </p>
                {scopes.map((scope) => (
                  <div key={scope.id} className="flex items-start space-x-3">
                    <Checkbox
                      id={`scope-${scope.id}`}
                      checked={
                        selectedUser.role === "admin" ||
                        userScopes.includes(scope.id)
                      }
                      disabled={selectedUser.role === "admin"}
                      onCheckedChange={(checked) =>
                        handleScopeToggle(selectedUser.id, scope.id, !!checked)
                      }
                    />
                    <div className="grid gap-0.5 leading-none">
                      <label
                        htmlFor={`scope-${scope.id}`}
                        className="text-sm font-medium leading-none"
                      >
                        {scope.label}
                      </label>
                      {scope.description && (
                        <p className="text-xs text-muted-foreground">
                          {scope.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Joined</span>
                  <span>{formatDate(selectedUser.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <StatusBadge
                    status={selectedUser.is_active ? "active" : "archived"}
                  />
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
        title={
          deactivateTarget?.is_active ? "Deactivate user" : "Reactivate user"
        }
        description={
          deactivateTarget?.is_active
            ? `Deactivate ${deactivateTarget?.full_name ?? deactivateTarget?.email ?? "this user"}? They will no longer be able to sign in.`
            : `Reactivate ${deactivateTarget?.full_name ?? deactivateTarget?.email ?? "this user"}? They will be able to sign in again.`
        }
        confirmLabel={deactivateTarget?.is_active ? "Deactivate" : "Reactivate"}
        variant={deactivateTarget?.is_active ? "destructive" : "default"}
        onConfirm={handleToggleActive}
        loading={actionLoading}
      />
    </div>
  );
}
