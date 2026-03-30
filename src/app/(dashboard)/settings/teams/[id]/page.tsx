"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { use } from "react"
import { ArrowLeft, UserPlus, X } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import type { Team, Profile } from "@/types/database"
import { UserAvatar } from "@/components/app/user-avatar"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { EmptyState } from "@/components/app/empty-state"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useUser } from "@/hooks/use-user"
import { useTranslation } from "@/hooks/use-translation"
import { getRoleLabel, formatDate } from "@/lib/utils"
import { toast } from "sonner"

export default function SettingsTeamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { user: currentUser, isAdmin, isTeamLead } = useUser()
  const { t } = useTranslation()

  const [team, setTeam] = React.useState<Team | null>(null)
  const [members, setMembers] = React.useState<Profile[]>([])
  const [lead, setLead] = React.useState<Profile | null>(null)
  const [availableUsers, setAvailableUsers] = React.useState<Profile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [addDialogOpen, setAddDialogOpen] = React.useState(false)
  const [selectedUserId, setSelectedUserId] = React.useState("")
  const [removeTarget, setRemoveTarget] = React.useState<Profile | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false)
  const [actionLoading, setActionLoading] = React.useState(false)
  const [teamNameDraft, setTeamNameDraft] = React.useState("")

  const isTeamOwner =
    isAdmin || (isTeamLead && team?.lead_id === currentUser?.id)

  async function fetchTeam() {
    const supabase = createClient()

    const { data: teamData } = await supabase
      .from("teams")
      .select("*")
      .eq("id", id)
      .single()

    if (!teamData) {
      setTeam(null)
      setLoading(false)
      return
    }

    const t = teamData as unknown as Team
    setTeam(t)

    const { data: memberRows } = await supabase
      .from("profiles")
      .select("*")
      .eq("team_id", id)
      .order("full_name")

    setMembers((memberRows ?? []) as unknown as Profile[])

    if (t.lead_id) {
      const { data: leadData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", t.lead_id)
        .single()
      setLead(leadData as unknown as Profile | null)
    }

    const { data: unassignedUsers } = await supabase
      .from("profiles")
      .select("*")
      .is("team_id", null)
      .eq("is_active", true)
      .order("full_name")

    setAvailableUsers((unassignedUsers ?? []) as unknown as Profile[])
    setLoading(false)
  }

  React.useEffect(() => {
    fetchTeam()
  }, [id])

  async function handleAddMember() {
    if (!selectedUserId) return
    setActionLoading(true)
    const supabase = createClient()

    const { error } = await supabase
      .from("profiles")
      .update({ team_id: id } as never)
      .eq("id", selectedUserId)

    if (error) {
      toast.error(t("settings.teamDetail.toast.addMemberFailed", "Failed to add member"))
    } else {
      toast.success(t("settings.teamDetail.toast.memberAdded", "Member added"))
      setAddDialogOpen(false)
      setSelectedUserId("")
      fetchTeam()
    }
    setActionLoading(false)
  }

  async function handleRemoveMember() {
    if (!removeTarget) return
    setActionLoading(true)
    const supabase = createClient()

    const { error } = await supabase
      .from("profiles")
      .update({ team_id: null } as never)
      .eq("id", removeTarget.id)

    if (error) {
      toast.error(t("settings.teamDetail.toast.removeMemberFailed", "Failed to remove member"))
    } else {
      toast.success(t("settings.teamDetail.toast.memberRemoved", "Member removed"))
      setRemoveTarget(null)
      fetchTeam()
    }
    setActionLoading(false)
  }

  async function handleLeadChange(userId: string) {
    setActionLoading(true)
    const supabase = createClient()
    const value = userId === "none" ? null : userId

    const { error } = await supabase
      .from("teams")
      .update({ lead_id: value } as never)
      .eq("id", id)

    if (error) {
      toast.error(t("settings.teamDetail.toast.updateLeadFailed", "Failed to update team lead"))
    } else {
      toast.success(t("settings.teamDetail.toast.leadUpdated", "Team lead updated"))
      fetchTeam()
    }
    setActionLoading(false)
  }

  async function handleDeleteTeam() {
    setActionLoading(true)
    const supabase = createClient()

    const { error } = await supabase.from("teams").delete().eq("id", id)

    if (error) {
      toast.error(
        t(
          "settings.teamDetail.toast.deleteFailed",
          "Failed to delete team. Ensure all members are removed first."
        )
      )
    } else {
      toast.success(t("settings.teamDetail.toast.teamDeleted", "Team deleted"))
      router.push("/settings/teams")
    }
    setActionLoading(false)
  }

  async function handleTeamNameSave() {
    const trimmedName = teamNameDraft.trim()
    if (!team || !trimmedName || trimmedName === team.name) return

    setActionLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from("teams")
      .update({ name: trimmedName } as never)
      .eq("id", id)

    if (error) {
      toast.error(t("settings.teamDetail.toast.updateNameFailed", "Failed to update team name"))
    } else {
      toast.success(t("settings.teamDetail.toast.nameUpdated", "Team name updated"))
      setTeam((current) => (current ? { ...current, name: trimmedName } : current))
    }
    setActionLoading(false)
  }

  React.useEffect(() => {
    setTeamNameDraft(team?.name ?? "")
  }, [team?.name])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-lg border bg-muted" />
      </div>
    )
  }

  if (!team) {
    return (
      <div className="space-y-6">
        <p className="text-lg font-semibold">
          {t("settings.teamDetail.notFound", "Team not found")}
        </p>
        <Button variant="outline" onClick={() => router.push("/settings/teams")}>
          <ArrowLeft className="size-4" />
          {t("settings.teamDetail.backToTeams", "Back to teams")}
        </Button>
      </div>
    )
  }

  const eligibleLeads = members.filter(
    (m) => m.role === "admin" || m.role === "team_lead"
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/settings/teams")}
        >
          <ArrowLeft className="size-4" />
          <span className="sr-only">{t("common.back", "Back")}</span>
        </Button>
        <div className="flex flex-1 items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{team.name}</h2>
            {team.description && (
              <p className="text-sm text-muted-foreground">{team.description}</p>
            )}
          </div>
          {isAdmin && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={members.length > 0}
            >
              {t("settings.teamDetail.deleteTeam", "Delete Team")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                {t("settings.teamDetail.members", "Members")} ({members.length})
              </CardTitle>
              {isTeamOwner && (
                <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <UserPlus className="size-4" />
                      {t("settings.teamDetail.addMember", "Add Member")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        {t("settings.teamDetail.addTeamMember", "Add Team Member")}
                      </DialogTitle>
                      <DialogDescription>
                        {t(
                          "settings.teamDetail.selectUserDescription",
                          "Select a user to add to"
                        )} {team.name}.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Select
                        value={selectedUserId}
                        onValueChange={setSelectedUserId}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t("settings.teamDetail.selectUser", "Select a user")}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {availableUsers.length === 0 ? (
                            <SelectItem value="none" disabled>
                              {t("settings.teamDetail.noAvailableUsers", "No available users")}
                            </SelectItem>
                          ) : (
                            availableUsers.map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.full_name ?? u.email}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setAddDialogOpen(false)}
                        >
                          {t("common.cancel", "Cancel")}
                        </Button>
                        <Button
                          onClick={handleAddMember}
                          disabled={!selectedUserId || actionLoading}
                        >
                          {t("common.add", "Add")}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <EmptyState
                  icon={UserPlus}
                  title={t("settings.teamDetail.empty.title", "No members")}
                  description={t(
                    "settings.teamDetail.empty.description",
                    "Add members to this team to get started."
                  )}
                />
              ) : (
                <div className="space-y-2">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-md border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          name={member.full_name}
                          avatarUrl={member.avatar_url}
                          size="sm"
                        />
                        <div>
                          <p className="text-sm font-medium">
                            {member.full_name ?? member.email}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {getRoleLabel(member.role)}
                            {member.id === team.lead_id
                              ? ` · ${t("settings.teamDetail.teamLead", "Team Lead")}`
                              : ""}
                          </p>
                        </div>
                      </div>
                      {isTeamOwner && member.id !== currentUser?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRemoveTarget(member)}
                        >
                          <X className="size-4" />
                          <span className="sr-only">{t("common.remove", "Remove")}</span>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("settings.teamDetail.details", "Team Details")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isTeamOwner && (
                <div className="space-y-2">
                  <Label>{t("settings.teamDetail.teamName", "Team Name")}</Label>
                  <div className="flex gap-2">
                    <Input
                      value={teamNameDraft}
                      onChange={(event) => setTeamNameDraft(event.target.value)}
                      placeholder={t("settings.teamDetail.teamNamePlaceholder", "Team Name")}
                      disabled={actionLoading}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTeamNameSave}
                      disabled={
                        actionLoading ||
                        teamNameDraft.trim().length === 0 ||
                        teamNameDraft.trim() === (team.name ?? "")
                      }
                    >
                      {t("common.save", "Save")}
                    </Button>
                  </div>
                </div>
              )}

              {isAdmin && (
                <div className="space-y-2">
                  <Label>{t("settings.teamDetail.teamLead", "Team Lead")}</Label>
                  <Select
                    value={team.lead_id ?? "none"}
                    onValueChange={handleLeadChange}
                    disabled={actionLoading}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={t("settings.teamDetail.selectLead", "Select lead")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        {t("settings.teamDetail.noLead", "No lead")}
                      </SelectItem>
                      {eligibleLeads.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name ?? u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("settings.teamDetail.created", "Created")}
                  </span>
                  <span>{formatDate(team.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("settings.teamDetail.members", "Members")}
                  </span>
                  <span>{members.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title={t("settings.teamDetail.removeMember", "Remove member")}
        description={`${t("settings.teamDetail.removePromptPrefix", "Remove")} ${removeTarget?.full_name ?? removeTarget?.email ?? t("settings.teamDetail.thisUser", "this user")} ${t("settings.teamDetail.removePromptFrom", "from")} ${team.name}? ${t("settings.teamDetail.removePromptSuffix", "They will be unassigned from the team.")}`}
        confirmLabel={t("common.remove", "Remove")}
        variant="destructive"
        onConfirm={handleRemoveMember}
        loading={actionLoading}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t("settings.teamDetail.deleteTeamTitle", "Delete team")}
        description={`${t("settings.teamDetail.deletePromptPrefix", "Permanently delete")} "${team.name}"? ${t("settings.teamDetail.deletePromptSuffix", "This action cannot be undone. All members must be removed first.")}`}
        confirmLabel={t("common.delete", "Delete")}
        variant="destructive"
        onConfirm={handleDeleteTeam}
        loading={actionLoading}
      />
    </div>
  )
}
