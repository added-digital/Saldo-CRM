import type { FortnoxTokenResponse, FortnoxApiError } from "@/types/fortnox"

const FORTNOX_API_BASE = "https://api.fortnox.se"
const FORTNOX_AUTH_BASE = "https://apps.fortnox.se/oauth-v1"

const FORTNOX_SCOPES = [
  "companyinformation",
  "customer",
  "invoice",
  "article",
  "costcenter",
  "bookkeeping",
  "settings",
].join(" ")

export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.FORTNOX_CLIENT_ID!,
    redirect_uri: process.env.FORTNOX_REDIRECT_URI!,
    scope: FORTNOX_SCOPES,
    state,
    response_type: "code",
  })
  return `${FORTNOX_AUTH_BASE}/auth?${params.toString()}`
}

export async function exchangeCodeForTokens(code: string): Promise<FortnoxTokenResponse> {
  const response = await fetch(`${FORTNOX_AUTH_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.FORTNOX_CLIENT_ID}:${process.env.FORTNOX_CLIENT_SECRET}`
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.FORTNOX_REDIRECT_URI!,
    }),
  })

  if (!response.ok) {
    const error = (await response.json()) as FortnoxApiError
    throw new Error(`Fortnox auth error: ${error.ErrorInformation?.Message ?? response.statusText}`)
  }

  return response.json() as Promise<FortnoxTokenResponse>
}

export async function refreshAccessToken(refreshToken: string): Promise<FortnoxTokenResponse> {
  const response = await fetch(`${FORTNOX_AUTH_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.FORTNOX_CLIENT_ID}:${process.env.FORTNOX_CLIENT_SECRET}`
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    const error = (await response.json()) as FortnoxApiError
    throw new Error(`Token refresh error: ${error.ErrorInformation?.Message ?? response.statusText}`)
  }

  return response.json() as Promise<FortnoxTokenResponse>
}

export { FORTNOX_API_BASE }
