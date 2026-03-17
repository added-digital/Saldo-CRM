import { type AdminClient } from "./supabase.ts"
import { FortnoxClient, requestAccessToken } from "./fortnox-client.ts"

export interface SyncJobUpdate {
  status?: string
  progress?: number
  current_step?: string
  total_items?: number
  processed_items?: number
  error_message?: string | null
  payload?: Record<string, unknown>
  batch_phase?: string | null
  batch_offset?: number
  dispatch_lock?: boolean
}

export async function updateSyncJob(
  supabase: AdminClient,
  jobId: string,
  update: SyncJobUpdate
) {
  const { error } = await supabase
    .from("sync_jobs")
    .update({ ...update, updated_at: new Date().toISOString() } as never)
    .eq("id", jobId as never)

  if (error) {
    console.error("Failed to update sync job:", error)
  }
}

export async function getFortnoxClient(
  supabase: AdminClient
): Promise<FortnoxClient> {
  const { data, error } = await supabase
    .from("fortnox_connection")
    .select("*")
    .limit(1)
    .single()

  if (error || !data) {
    throw new Error("No Fortnox connection found")
  }

  const connection = data as Record<string, unknown>
  const tenantId = connection.fortnox_tenant_id as string

  if (!tenantId) {
    throw new Error("No TenantId stored. Reconnect Fortnox.")
  }

  const tokenExpiry = new Date(connection.token_expires_at as string)
  const bufferMs = 5 * 60 * 1000
  const isExpired = tokenExpiry.getTime() - bufferMs < Date.now()

  if (isExpired) {
    const tokens = await requestAccessToken(tenantId)
    const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    await supabase
      .from("fortnox_connection")
      .update({
        access_token: tokens.access_token,
        token_expires_at: newExpiry,
      } as never)
      .eq("id", connection.id as never)

    return new FortnoxClient(tokens.access_token)
  }

  return new FortnoxClient(connection.access_token as string)
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  }
}
