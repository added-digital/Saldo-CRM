/**
 * Email open/click tracking helpers.
 *
 * Strategy
 * --------
 *  - Each `sent_emails` row carries a `tracking_id` (UUID) generated when the
 *    row is created.
 *  - Right before the rendered HTML is handed to Microsoft Graph, the HTML is
 *    rewritten:
 *      • every `<a href="https://...">` is replaced with a click-tracking
 *        URL that points at our app: /api/track/click/{trackingId}?url=...
 *      • a 1x1 invisible pixel `<img>` pointing at /api/track/open/{trackingId}
 *        is appended just before `</body>` (or the end of the document).
 *  - The tracking routes log the event to `email_events` and either return a
 *    transparent GIF (open) or 302-redirect to the validated URL (click).
 *
 * Open redirect protection lives in `isSafeRedirectUrl` and is shared with
 * the click route. We allow only `https:` and `mailto:` schemes — everything
 * else (javascript:, data:, file:, http:, etc.) is rejected. URLs longer
 * than 2048 chars are also rejected.
 */

import { randomUUID } from "node:crypto"

export type TrackingContext = {
  trackingId: string
  appUrl: string
}

const MAX_REDIRECT_URL_LENGTH = 2048
const ALLOWED_REDIRECT_PROTOCOLS = new Set(["https:", "mailto:"])

export function generateTrackingId(): string {
  return randomUUID()
}

/**
 * True iff `raw` is safe to use as the target of a 302 redirect from our
 * click-tracking route. Anything that returns false should be treated as
 * an open-redirect attempt and refused.
 */
export function isSafeRedirectUrl(raw: string | null | undefined): boolean {
  if (!raw) return false
  if (raw.length > MAX_REDIRECT_URL_LENGTH) return false
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return false
  }
  if (!ALLOWED_REDIRECT_PROTOCOLS.has(parsed.protocol)) return false
  // Belt-and-braces against URL-parser quirks: reject suspicious raw prefixes.
  const lower = raw.trim().toLowerCase()
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("file:") ||
    lower.startsWith("vbscript:")
  ) {
    return false
  }
  return true
}

/**
 * Wrap one URL with our click-tracking redirect. Falls back to the original
 * URL if the input isn't safe to track (so non-HTTPS/non-mailto links
 * still work but go direct without telemetry).
 */
export function buildClickTrackingUrl(
  originalUrl: string,
  context: TrackingContext,
): string {
  if (!isSafeRedirectUrl(originalUrl)) return originalUrl
  const encoded = encodeURIComponent(originalUrl)
  return `${context.appUrl}/api/track/click/${context.trackingId}?url=${encoded}`
}

/**
 * Rewrite every <a href="..."> in the rendered HTML to point at our click
 * tracker. Only matches absolute https URLs and explicit mailto: links;
 * relative URLs and any links that already point at our /api/track/ prefix
 * are left untouched (so we don't double-wrap or break in-product links).
 */
export function wrapHrefsForTracking(
  html: string,
  context: TrackingContext,
): string {
  const trackingPrefix = `${context.appUrl}/api/track/`
  return html.replace(
    /<a([^>]*?)href="([^"]+)"([^>]*)>/gi,
    (match, before: string, href: string, after: string) => {
      const trimmed = href.trim()
      if (trimmed.startsWith(trackingPrefix)) return match
      if (!isSafeRedirectUrl(trimmed)) return match
      const wrapped = buildClickTrackingUrl(trimmed, context)
      return `<a${before}href="${wrapped}"${after}>`
    },
  )
}

/** Append a 1x1 invisible pixel just before </body> (or at the end if absent). */
export function appendOpenPixel(
  html: string,
  context: TrackingContext,
): string {
  const pixelUrl = `${context.appUrl}/api/track/open/${context.trackingId}`
  const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${pixel}</body>`)
  }
  return `${html}${pixel}`
}

/** Apply both wrappings in one call. */
export function injectTracking(
  html: string,
  context: TrackingContext,
): string {
  return appendOpenPixel(wrapHrefsForTracking(html, context), context)
}
