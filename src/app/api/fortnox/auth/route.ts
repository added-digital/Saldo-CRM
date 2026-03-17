import { NextRequest, NextResponse } from "next/server"
import { exchangeCodeForTokens, extractTenantIdFromJwt } from "@/lib/fortnox/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import type { FortnoxConnection } from "@/types/database"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  if (error) {
    const message = errorDescription ?? error
    console.error("Fortnox OAuth denied:", message)
    return NextResponse.redirect(
      new URL(`/settings/integrations?error=${encodeURIComponent(message)}`, request.url)
    )
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings/integrations?error=missing_code", request.url)
    )
  }

  try {
    const tokens = await exchangeCodeForTokens(code)

    const supabase = createAdminClient()

    const tokenExpiresAt = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString()

    const tenantId = extractTenantIdFromJwt(tokens.access_token)

    const connectionData: Omit<FortnoxConnection, "id" | "connected_at" | "updated_at"> = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: tokenExpiresAt,
      fortnox_tenant_id: tenantId,
      connected_by: null,
      last_sync_at: null,
      sync_status: "idle",
      sync_error: null,
      websocket_offset: null,
    }

    await supabase.from("fortnox_connection").upsert(connectionData as never)

    return NextResponse.redirect(
      new URL("/settings/integrations?success=true", request.url)
    )
  } catch (error) {
    console.error("Fortnox OAuth error:", error)
    return NextResponse.redirect(
      new URL("/settings/integrations?error=auth_failed", request.url)
    )
  }
}
