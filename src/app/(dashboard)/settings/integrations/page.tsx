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
import { Separator } from "@/components/ui/separator"
import { useUser } from "@/hooks/use-user"
import { useTranslation } from "@/hooks/use-translation"
import { formatDateTime } from "@/lib/utils"
import { toast } from "sonner"

export default function IntegrationsPage() {
  const { isAdmin } = useUser()
  const { t } = useTranslation()
  const [connection, setConnection] =
    React.useState<FortnoxConnection | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [disconnectOpen, setDisconnectOpen] = React.useState(false)
  const [disconnecting, setDisconnecting] = React.useState(false)

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
      toast.error(t("settings.integrations.toast.disconnectFailed", "Failed to disconnect"))
    } else {
      toast.success(t("settings.integrations.toast.disconnected", "Fortnox disconnected"))
      setConnection(null)
      setDisconnectOpen(false)
    }
    setDisconnecting(false)
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
                    {t("settings.integrations.connected", "Connected")}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="font-normal">
                    {t("settings.integrations.notConnected", "Not connected")}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {t(
                  "settings.integrations.description",
                  "Sync customer data from your Fortnox account"
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isConnected ? (
            <>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("settings.integrations.connectedAt", "Connected")}
                  </span>
                  <span>{formatDateTime(connection.connected_at)}</span>
                </div>
                {connection.last_sync_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("settings.integrations.lastSync", "Last Sync")}
                    </span>
                    <span>{formatDateTime(connection.last_sync_at)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("settings.integrations.syncStatus", "Sync Status")}
                  </span>
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
                  <span className="text-muted-foreground">
                    {t("settings.integrations.tokenStatus", "Token Status")}
                  </span>
                  <span>
                    {isTokenValid ? (
                      <Badge variant="outline" className="font-normal">
                        {t("settings.integrations.tokenValid", "Valid")}
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="font-normal">
                        {t("settings.integrations.tokenExpired", "Expired")}
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
                  {t("settings.integrations.disconnect", "Disconnect")}
                </Button>
              </div>
            </>
          ) : (
            <Button onClick={handleConnect}>
              <Link2 className="size-4" />
              {t("settings.integrations.connectFortnox", "Connect Fortnox")}
            </Button>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title={t("settings.integrations.disconnectTitle", "Disconnect Fortnox")}
        description={t(
          "settings.integrations.disconnectDescription",
          "This will remove the Fortnox connection. Customer data will remain but will no longer sync. You can reconnect at any time."
        )}
        confirmLabel={t("settings.integrations.disconnect", "Disconnect")}
        variant="destructive"
        onConfirm={handleDisconnect}
        loading={disconnecting}
      />
    </div>
  )
}
