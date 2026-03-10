"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { UserCog, Plus } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { createClient } from "@/lib/supabase/client"
import type { Team, Profile } from "@/types/database"
import { createTeamSchema, type CreateTeamInput } from "@/lib/validations/team"
import { PageHeader } from "@/components/app/page-header"
import { EmptyState } from "@/components/app/empty-state"
import { UserAvatar } from "@/components/app/user-avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FormActions } from "@/components/app/form-actions"
import { useUser } from "@/hooks/use-user"
import { toast } from "sonner"

interface TeamWithLead extends Team {
  lead?: Profile | null
  memberCount: number
}

export default function TeamsPage() {
  const router = useRouter()
  const { isAdmin } = useUser()
  const [teams, setTeams] = React.useState<TeamWithLead[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)

  const form = useForm<CreateTeamInput>({
    resolver: zodResolver(createTeamSchema),
    defaultValues: { name: "", description: "" },
  })

  async function fetchTeams() {
    const supabase = createClient()

    const { data: teamRows } = await supabase
      .from("teams")
      .select("*")
      .order("name")

    const rawTeams = (teamRows ?? []) as unknown as Team[]

    const teamsWithLeads: TeamWithLead[] = await Promise.all(
      rawTeams.map(async (team) => {
        let lead: Profile | null = null
        if (team.lead_id) {
          const { data } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", team.lead_id)
            .single()
          lead = data as unknown as Profile | null
        }

        const { count } = await supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("team_id", team.id)

        return { ...team, lead, memberCount: count ?? 0 }
      })
    )

    setTeams(teamsWithLeads)
    setLoading(false)
  }

  React.useEffect(() => {
    fetchTeams()
  }, [])

  async function onSubmit(values: CreateTeamInput) {
    const supabase = createClient()
    const { error } = await supabase
      .from("teams")
      .insert(values as never)

    if (error) {
      toast.error("Failed to create team")
      return
    }

    toast.success("Team created")
    setDialogOpen(false)
    form.reset()
    fetchTeams()
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg border bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teams"
        description="Manage your organization's teams"
      >
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                New Team
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Team</DialogTitle>
                <DialogDescription>
                  Add a new team to your organization.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Team Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Sales Team" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="What does this team do?"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormActions
                    submitLabel="Create Team"
                    loading={form.formState.isSubmitting}
                    onCancel={() => setDialogOpen(false)}
                  />
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>

      {teams.length === 0 ? (
        <EmptyState
          icon={UserCog}
          title="No teams"
          description="Create your first team to organize your users."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Card
              key={team.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => router.push(`/teams/${team.id}`)}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{team.name}</CardTitle>
                {team.description && (
                  <CardDescription className="line-clamp-2">
                    {team.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {team.lead ? (
                      <>
                        <UserAvatar
                          name={team.lead.full_name}
                          avatarUrl={team.lead.avatar_url}
                          size="sm"
                        />
                        <div>
                          <p className="text-xs text-muted-foreground">Lead</p>
                          <p className="text-sm font-medium">
                            {team.lead.full_name ?? team.lead.email}
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">No lead assigned</p>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {team.memberCount} member{team.memberCount !== 1 ? "s" : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
