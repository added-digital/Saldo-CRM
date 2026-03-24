"use client"

import * as React from "react"
import {
  Link2,
  Link2Off,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import type { FortnoxConnection } from "@/types/database"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { useUser } from "@/hooks/use-user"
import { formatDateTime } from "@/lib/utils"
import { toast } from "sonner"

type DebugTimeReportRow = {
  id: string
  report_date: string | null
  employee_id: string | null
  employee_name: string | null
  customer_name: string | null
  entry_type: string | null
  hours: number | null
  project_name: string | null
}

type DebugEmployeeRow = {
  employee_id: string | null
  email: string | null
  full_name: string | null
  first_name: string | null
  last_name: string | null
  inactive: boolean
}

type DebugDumpResponse = {
  debug: "fortnoxdump"
  fromDate: string
  limits: {
    time_reports: number
    employees: number
  }
  time_reports: DebugTimeReportRow[]
  employees: DebugEmployeeRow[]
}

type FortnoxUserDumpResponse = {
  debug: "fortnoxuserdump"
  lookup_id: string
  likely_user_id: string | null
  endpoint: string | null
  raw: {
    user: Record<string, unknown> | null
    employee: Record<string, unknown> | null
  }
  users_match_count: number
  users_matches: Array<Record<string, unknown>>
  attempts: Array<{
    endpoint: string
    ok: boolean
    error?: string
  }>
}

export default function IntegrationsPage() {
  const { isAdmin } = useUser()
  const [connection, setConnection] =
    React.useState<FortnoxConnection | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [disconnectOpen, setDisconnectOpen] = React.useState(false)
  const [disconnecting, setDisconnecting] = React.useState(false)
  const [debugDumpLoading, setDebugDumpLoading] = React.useState(false)
  const [debugDump, setDebugDump] = React.useState<DebugDumpResponse | null>(null)
  const [fortnoxUserId, setFortnoxUserId] = React.useState("")
  const [fortnoxUserDumpLoading, setFortnoxUserDumpLoading] = React.useState(false)
  const [fortnoxUserDump, setFortnoxUserDump] = React.useState<FortnoxUserDumpResponse | null>(null)
  const [fortnoxUserDumpError, setFortnoxUserDumpError] = React.useState<string | null>(null)

  const fetchConnection = React.useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("fortnox_connection")
      .select("*")
      .limit(1)
      .single()

    setConnection(data as unknown as FortnoxConnection | null)
    setLoading(false)
  }, [])

  React.useEffect(() => {
    fetchConnection()
  }, [fetchConnection])

  function handleConnect() {
    const clientId = process.env.NEXT_PUBLIC_FORTNOX_CLIENT_ID
    const redirectUri = encodeURIComponent(
      `${window.location.origin}/api/fortnox/auth`
    )
    const state = crypto.randomUUID()

    sessionStorage.setItem("fortnox_oauth_state", state)

    const scope = encodeURIComponent(
      "companyinformation customer invoice article costcenter bookkeeping settings salary"
    )

    window.location.href = `https://apps.fortnox.se/oauth-v1/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}&response_type=code&account_type=service`
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    const supabase = createClient()

    const { error } = await supabase
      .from("fortnox_connection")
      .delete()
      .not("id", "is", null)

    if (error) {
      toast.error("Failed to disconnect")
    } else {
      toast.success("Fortnox disconnected")
      setConnection(null)
      setDisconnectOpen(false)
    }
    setDisconnecting(false)
  }

  async function loadDebugDump() {
    setDebugDumpLoading(true)

    try {
      const response = await fetch("/api/fortnox/debug?fortnoxdump=1")
      if (!response.ok) {
        throw new Error(`Debug request failed (${response.status})`)
      }

      const data = (await response.json()) as DebugDumpResponse
      setDebugDump(data)
    } catch {
      toast.error("Failed to load debug dump")
    } finally {
      setDebugDumpLoading(false)
    }
  }

  async function loadFortnoxUserDump() {
    const trimmedUserId = fortnoxUserId.trim()
    if (!trimmedUserId) {
      setFortnoxUserDumpError("User ID is required")
      setFortnoxUserDump(null)
      return
    }

    setFortnoxUserDumpLoading(true)
    setFortnoxUserDumpError(null)
    setFortnoxUserDump(null)

    try {
      const params = new URLSearchParams({
        fortnoxuserdump: "1",
        userId: trimmedUserId,
      })

      const response = await fetch(`/api/fortnox/debug?${params.toString()}`)
      const payload = await response.json()

      if (!response.ok) {
        setFortnoxUserDumpError(payload?.error ?? `Debug request failed (${response.status})`)
        return
      }

      setFortnoxUserDump(payload as FortnoxUserDumpResponse)
    } catch {
      setFortnoxUserDumpError("Failed to load Fortnox user dump")
    } finally {
      setFortnoxUserDumpLoading(false)
    }
  }

  if (loading || !isAdmin) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded-lg border bg-muted" />
      </div>
    )
  }

  const isConnected = !!connection
  const isTokenValid =
    connection &&
    new Date(connection.token_expires_at) > new Date()

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                Fortnox
                {isConnected ? (
                  <Badge variant="default" className="font-normal">
                    <CheckCircle2 className="mr-1 size-3" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="font-normal">
                    Not connected
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Sync customer data from your Fortnox account
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isConnected ? (
            <>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Connected</span>
                  <span>{formatDateTime(connection.connected_at)}</span>
                </div>
                {connection.last_sync_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Sync</span>
                    <span>{formatDateTime(connection.last_sync_at)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sync Status</span>
                  <span className="flex items-center gap-1 capitalize">
                    {connection.sync_status === "error" && (
                      <AlertCircle className="size-3 text-destructive" />
                    )}
                    {connection.sync_status === "syncing" && (
                      <Loader2 className="size-3 animate-spin" />
                    )}
                    {connection.sync_status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Token Status</span>
                  <span>
                    {isTokenValid ? (
                      <Badge variant="outline" className="font-normal">
                        Valid
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="font-normal">
                        Expired
                      </Badge>
                    )}
                  </span>
                </div>
                {connection.sync_error && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3">
                    <p className="text-xs text-destructive">
                      {connection.sync_error}
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={() => setDisconnectOpen(true)}
                >
                  <Link2Off className="size-4" />
                  Disconnect
                </Button>
              </div>
            </>
          ) : (
            <Button onClick={handleConnect}>
              <Link2 className="size-4" />
              Connect Fortnox
            </Button>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title="Disconnect Fortnox"
        description="This will remove the Fortnox connection. Customer data will remain but will no longer sync. You can reconnect at any time."
        confirmLabel="Disconnect"
        variant="destructive"
        onConfirm={handleDisconnect}
        loading={disconnecting}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Debug</CardTitle>
          <CardDescription>
            Live Fortnox sample for validating employee ID mapping.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={loadDebugDump} disabled={debugDumpLoading} variant="outline">
            {debugDumpLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Loading Fortnox dump...
              </>
            ) : (
              <>Load Fortnox dump (10 time rows + 10 employees)</>
            )}
          </Button>

          {debugDump ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-sm font-medium">Time reports ({debugDump.time_reports.length})</p>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-2 py-2 font-medium">Date</th>
                        <th className="px-2 py-2 font-medium">Employee ID</th>
                        <th className="px-2 py-2 font-medium">Employee Name</th>
                        <th className="px-2 py-2 font-medium">Customer</th>
                        <th className="px-2 py-2 font-medium">Type</th>
                        <th className="px-2 py-2 font-medium">Hours</th>
                        <th className="px-2 py-2 font-medium">Project</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debugDump.time_reports.map((row) => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="px-2 py-2">{row.report_date ?? "-"}</td>
                          <td className="px-2 py-2">{row.employee_id ?? "-"}</td>
                          <td className="px-2 py-2">{row.employee_name ?? "-"}</td>
                          <td className="px-2 py-2">{row.customer_name ?? "-"}</td>
                          <td className="px-2 py-2">{row.entry_type ?? "-"}</td>
                          <td className="px-2 py-2">{row.hours ?? 0}</td>
                          <td className="px-2 py-2">{row.project_name ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Employees ({debugDump.employees.length})</p>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-2 py-2 font-medium">Employee ID</th>
                        <th className="px-2 py-2 font-medium">Name</th>
                        <th className="px-2 py-2 font-medium">Email</th>
                        <th className="px-2 py-2 font-medium">First Name</th>
                        <th className="px-2 py-2 font-medium">Last Name</th>
                        <th className="px-2 py-2 font-medium">Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debugDump.employees.map((row, index) => (
                        <tr key={`${row.employee_id ?? "unknown"}-${index}`} className="border-b last:border-0">
                          <td className="px-2 py-2">{row.employee_id ?? "-"}</td>
                          <td className="px-2 py-2">{row.full_name ?? "-"}</td>
                          <td className="px-2 py-2">{row.email ?? "-"}</td>
                          <td className="px-2 py-2">{row.first_name ?? "-"}</td>
                          <td className="px-2 py-2">{row.last_name ?? "-"}</td>
                          <td className="px-2 py-2">{row.inactive ? "No" : "Yes"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-medium">Fortnox user dump</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={fortnoxUserId}
                onChange={(event) => setFortnoxUserId(event.target.value)}
                placeholder="Fortnox user/employee id"
                className="sm:max-w-xs"
              />
              <Button onClick={loadFortnoxUserDump} disabled={fortnoxUserDumpLoading} variant="outline">
                {fortnoxUserDumpLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Loading user dump...
                  </>
                ) : (
                  <>Load user dump</>
                )}
              </Button>
            </div>

            {fortnoxUserDumpError ? (
              <p className="text-sm text-destructive">{fortnoxUserDumpError}</p>
            ) : null}

            {fortnoxUserDump ? (
              <div className="space-y-2 rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Lookup id: {fortnoxUserDump.lookup_id}</p>
                <p className="text-xs text-muted-foreground">Likely användar-ID: {fortnoxUserDump.likely_user_id ?? "Not resolved"}</p>
                <p className="text-xs text-muted-foreground">Resolved endpoint: {fortnoxUserDump.endpoint ?? "None"}</p>

                <p className="text-xs font-medium">Raw user</p>
                <pre className="max-h-[320px] overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(fortnoxUserDump.raw.user, null, 2)}
                </pre>

                <p className="text-xs font-medium">Raw employee</p>
                <pre className="max-h-[320px] overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(fortnoxUserDump.raw.employee, null, 2)}
                </pre>

                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    Users matches ({fortnoxUserDump.users_match_count})
                  </summary>
                  <pre className="mt-2 max-h-52 overflow-auto rounded-md bg-muted p-3 text-xs">
                    {JSON.stringify(fortnoxUserDump.users_matches, null, 2)}
                  </pre>
                </details>

                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">Attempt log</summary>
                  <pre className="mt-2 max-h-52 overflow-auto rounded-md bg-muted p-3 text-xs">
                    {JSON.stringify(fortnoxUserDump.attempts, null, 2)}
                  </pre>
                </details>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
