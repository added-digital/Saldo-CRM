import { NextRequest, NextResponse } from "next/server"

import { requestAccessToken } from "@/lib/fortnox/auth"
import { FortnoxClient } from "@/lib/fortnox/client"
import { fetchRegistrationsV2 } from "@/lib/fortnox/time-registrations"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { FortnoxConnection, Profile } from "@/types/database"

async function getFortnoxClient(adminClient: ReturnType<typeof createAdminClient>): Promise<FortnoxClient> {
  const { data } = await adminClient
    .from("fortnox_connection")
    .select("*")
    .limit(1)
    .single()

  if (!data) {
    throw new Error("No Fortnox connection")
  }

  const connection = data as unknown as FortnoxConnection

  if (!connection.fortnox_tenant_id) {
    throw new Error("No TenantId stored. Reconnect Fortnox via Settings -> Integrations.")
  }

  const tokenExpiry = new Date(connection.token_expires_at)
  if (tokenExpiry.getTime() - 5 * 60 * 1000 < Date.now()) {
    const tokens = await requestAccessToken(connection.fortnox_tenant_id)
    const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    await adminClient
      .from("fortnox_connection")
      .update({
        access_token: tokens.access_token,
        token_expires_at: newExpiry,
      } as never)
      .eq("id", connection.id as never)

    return new FortnoxClient(tokens.access_token)
  }

  return new FortnoxClient(connection.access_token)
}

async function authorizeAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>()

  return profile?.role === "admin" ? user : null
}

export async function GET(request: NextRequest) {
  try {
    const user = await authorizeAdmin()
    if (!user) {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 })
    }

    const fromDate = request.nextUrl.searchParams.get("fromDate") ?? "2025-01-01"
    const adminClient = createAdminClient()
    const fortnox = await getFortnoxClient(adminClient)
    const rows = await fetchRegistrationsV2(fortnox, fromDate)

    return NextResponse.json({
      rows,
      fromDate,
      endpoint: "/api/time/registrations-v2",
      total: rows.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
