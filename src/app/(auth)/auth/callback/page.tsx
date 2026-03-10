"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"

import { createClient } from "@/lib/supabase/client"

/**
 * Auth callback — client-side page required because Supabase invite links deliver
 * tokens via URL hash fragments (#access_token=...), which are invisible to server
 * route handlers.
 *
 * - Hash fragment (invites): handled here client-side via setSession()
 * - PKCE code / token_hash (magic links, confirms): forwarded to /auth/confirm
 *   server route, which has cookie access for the PKCE code_verifier
 */

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <Loader2 className="size-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Signing you in...</p>
    </div>
  )
}

function AuthCallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    async function handleCallback() {
      // --- Hash fragment (invite links) ---
      // Supabase inviteUserByEmail() redirects with tokens in the URL hash.
      // Only this flow is handled client-side; all others need server cookie access.
      const hash = window.location.hash
      if (hash) {
        const hashParams = new URLSearchParams(hash.substring(1))
        const accessToken = hashParams.get("access_token")
        const refreshToken = hashParams.get("refresh_token")

        if (accessToken && refreshToken) {
          const supabase = createClient()
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })

          if (!sessionError) {
            window.location.hash = ""
            router.replace("/")
            return
          }

          setError(sessionError.message)
          return
        }
      }

      // --- PKCE code or token_hash flows ---
      // Forward to /auth/confirm server route which has cookie access
      // for the PKCE code_verifier stored during signInWithOtp().
      const code = searchParams.get("code")
      const tokenHash = searchParams.get("token_hash")

      if (code || tokenHash) {
        const params = new URLSearchParams()
        searchParams.forEach((value, key) => params.set(key, value))
        window.location.href = `/auth/confirm?${params.toString()}`
        return
      }

      setError("No authentication parameters found.")
    }

    handleCallback()
  }, [router, searchParams])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">
            Authentication failed
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
        <button
          onClick={() => router.replace("/login")}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Back to sign in
        </button>
      </div>
    )
  }

  return <LoadingSpinner />
}

export default function AuthCallbackPage() {
  return (
    <React.Suspense fallback={<LoadingSpinner />}>
      <AuthCallbackHandler />
    </React.Suspense>
  )
}
