import { NextResponse, type NextRequest } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { isSafeRedirectUrl } from "@/lib/email/tracking"
import { system } from "@/config/system"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Safe fallback when the click is bogus — bad UUID, missing/invalid url
 * param, or a target URL that fails our scheme allowlist. We refuse to
 * redirect to user-supplied URLs that aren't HTTPS or mailto:, so the
 * fallback is the app's own homepage. This is the open-redirect guard.
 */
function safeFallbackUrl(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (env) return env.endsWith("/") ? env.slice(0, -1) : env
  return system.url
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  const target = request.nextUrl.searchParams.get("url")

  // Refuse anything that doesn't pass both checks. We don't want to leak
  // whether the tracking id was valid, so the response is the same in
  // either failure mode: a redirect to our own app.
  if (!UUID_REGEX.test(id) || !isSafeRedirectUrl(target)) {
    return NextResponse.redirect(safeFallbackUrl(), 302)
  }

  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("sent_emails")
      .select("id")
      .eq("tracking_id", id)
      .maybeSingle()

    const sentEmailId = (data as { id: string } | null)?.id ?? null
    if (sentEmailId) {
      const ipAddress =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
      const userAgent = request.headers.get("user-agent") ?? null
      const referrer = request.headers.get("referer") ?? null
      await admin.from("email_events").insert({
        sent_email_id: sentEmailId,
        event_type: "click",
        target_url: target,
        user_agent: userAgent,
        ip_address: ipAddress,
        referrer,
      } as never)
    }
  } catch (error) {
    // Logging is best-effort. Never block the redirect on a write failure.
    console.error("[click-tracking] failed to log event:", error)
  }

  // `target` has been validated above. The 302 is safe.
  return NextResponse.redirect(target as string, 302)
}
