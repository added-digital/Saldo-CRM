import type { NextRequest } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
// Tracking pixels must never be cached by mail clients or proxies — that
// would suppress repeat opens.
export const dynamic = "force-dynamic"

// Smallest possible transparent 1x1 GIF (43 bytes).
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
)

const NO_CACHE_HEADERS: Record<string, string> = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function pixelResponse(): Response {
  return new Response(TRANSPARENT_GIF, { headers: NO_CACHE_HEADERS })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // Always return the pixel. Never throw, never reveal whether the id was
  // valid — we don't want recipients (or scanners) to enumerate sent emails.
  const { id } = await params
  if (!UUID_REGEX.test(id)) return pixelResponse()

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
        event_type: "open",
        target_url: null,
        user_agent: userAgent,
        ip_address: ipAddress,
        referrer,
      } as never)
    }
  } catch (error) {
    console.error("[open-tracking] failed to log event:", error)
  }

  return pixelResponse()
}
