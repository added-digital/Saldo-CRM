"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Link2,
  Link2Off,
  RefreshCw,
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
import { Separator } from "@/components/ui/separator"
import { useUser } from "@/hooks/use-user"
import { formatDateTime } from "@/lib/utils"
import { toast } from "sonner"

export default function IntegrationsPage() {
  const router = useRouter()
  const { isAdmin } = useUser()
  const [connection, setConnection] =
    React.useState<FortnoxConnection | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [syncing, setSyncing] = React.useState(false)
  const [disconnectOpen, setDisconnectOpen] = React.useState(false)
  const [disconnecting, setDisconnecting] = React.useState(false)

  React.useEffect(() => {
    async function fetchConnection() {
      const supabase = createClient()
      const { data } = await supabase
        .from("fortnox_connection")
        .select("*")
        .limit(1)
        .single()

      setConnection(data as unknown as FortnoxConnection | null)
      setLoading(false)
    }

    fetchConnection()
  }, [])

  function handleConnect() {
    const clientId = process.env.NEXT_PUBLIC_FORTNOX_CLIENT_ID
    const redirectUri = encodeURIComponent(
      `${window.location.origin}/api/fortnox/auth`
    )
    const state = crypto.randomUUID()

    sessionStorage.setItem("fortnox_oauth_state", state)

    window.location.href = `https://apps.fortnox.se/oauth-v1/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=customer&state=${state}&response_type=code`
  }

  async function handleSync() {
    setSyncing(true)

    try {
      const response = await fetch("/api/fortnox/sync", { method: "POST" })

      if (!response.ok) {
        throw new Error("Sync failed")
      }

      toast.success("Customer sync started")

      const supabase = createClient()
      const { data } = await supabase
        .from("fortnox_connection")
        .select("*")
        .limit(1)
        .single()
      setConnection(data as unknown as FortnoxConnection | null)
    } catch {
      toast.error("Failed to start sync")
    }

    setSyncing(false)
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

  React.useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace("/")
    }
  }, [loading, isAdmin, router])

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
                  variant="outline"
                  onClick={handleSync}
                  disabled={syncing || connection.sync_status === "syncing"}
                >
                  {syncing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {syncing ? "Syncing..." : "Sync Now"}
                </Button>
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
    </div>
  )
}
