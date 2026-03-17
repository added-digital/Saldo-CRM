"use client"

import * as React from "react"
import {
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Play,
  Users,
  Building2,
  FileText,
  Clock,
  FileSignature,
  Square,
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import type { SyncJob } from "@/types/database"
import { useSync, SYNC_STEPS, STEP_LABELS, type SyncStep } from "@/hooks/use-sync"
import { useUser } from "@/hooks/use-user"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDateTime } from "@/lib/utils"

const STEP_ICONS: Record<SyncStep, React.ElementType> = {
  customers: Building2,
  employees: Users,
  invoices: FileText,
  "time-reports": Clock,
  contracts: FileSignature,
}

const STEP_DESCRIPTIONS: Record<SyncStep, string> = {
  customers: "Sync customer data, cost centers, and link account managers",
  employees: "Sync employees, create user accounts, and link cost centers",
  invoices: "Sync invoices and compute turnover KPIs per customer",
  "time-reports": "Sync attendance transactions and compute reported hours",
  contracts: "Sync contracts and compute contract value per customer",
}

export default function SyncPage() {
  const { isAdmin } = useUser()
  const { syncing, progress, startSync, stopSync } = useSync()
  const [recentJobs, setRecentJobs] = React.useState<SyncJob[]>([])
  const [loadingJobs, setLoadingJobs] = React.useState(true)

  const fetchRecentJobs = React.useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("sync_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10)

    setRecentJobs((data ?? []) as unknown as SyncJob[])
    setLoadingJobs(false)
  }, [])

  React.useEffect(() => {
    fetchRecentJobs()
  }, [fetchRecentJobs])

  React.useEffect(() => {
    if (!syncing && !loadingJobs) {
      fetchRecentJobs()
    }
  }, [syncing, loadingJobs, fetchRecentJobs])

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div className="h-48 animate-pulse rounded-lg border bg-muted" />
      </div>
    )
  }

  const overallProgress = progress
    ? Math.round((progress.synced / progress.total) * 100)
    : 0

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Fortnox Sync</CardTitle>
              <CardDescription>
                Run individual sync steps or sync everything at once
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {syncing && (
                <Button variant="outline" onClick={stopSync}>
                  <Square className="size-4" />
                  Stop
                </Button>
              )}
              <Button onClick={() => startSync()} disabled={syncing}>
                {syncing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                {syncing ? "Syncing..." : "Sync All"}
              </Button>
            </div>
          </div>
        </CardHeader>
        {syncing && progress && (
          <CardContent className="pt-0">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{progress.step}</span>
                <span className="font-medium">
                  {progress.synced}/{progress.total} steps
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SYNC_STEPS.map((step) => {
          const Icon = STEP_ICONS[step]
          const isCurrentStep = syncing && progress?.step.includes(STEP_LABELS[step])

          return (
            <Card key={step}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="size-4 text-muted-foreground" />
                    {STEP_LABELS[step]}
                  </CardTitle>
                  {isCurrentStep && (
                    <Badge variant="secondary" className="font-normal">
                      <Loader2 className="mr-1 size-3 animate-spin" />
                      Running
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {STEP_DESCRIPTIONS[step]}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={syncing}
                  onClick={() => startSync([step])}
                >
                  <Play className="size-3" />
                  Run
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Sync Jobs</CardTitle>
          <CardDescription>
            History of the last 10 sync operations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingJobs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : recentJobs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No sync jobs have been run yet
            </p>
          ) : (
            <div className="space-y-2">
              {recentJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-3">
                    <SyncStatusIcon status={job.status} />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">
                        {job.current_step ?? "Sync"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(job.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {job.total_items > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {job.processed_items}/{job.total_items} items
                      </span>
                    )}
                    <SyncStatusBadge status={job.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function SyncStatusIcon({ status }: { status: SyncJob["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="size-4 text-green-600" />
    case "failed":
      return <XCircle className="size-4 text-destructive" />
    case "processing":
      return <Loader2 className="size-4 animate-spin text-primary" />
    default:
      return <RefreshCw className="size-4 text-muted-foreground" />
  }
}

function SyncStatusBadge({ status }: { status: SyncJob["status"] }) {
  switch (status) {
    case "completed":
      return <Badge variant="outline" className="font-normal text-green-600">Completed</Badge>
    case "failed":
      return <Badge variant="destructive" className="font-normal">Failed</Badge>
    case "processing":
      return <Badge variant="secondary" className="font-normal">Processing</Badge>
    default:
      return <Badge variant="outline" className="font-normal">Pending</Badge>
  }
}
