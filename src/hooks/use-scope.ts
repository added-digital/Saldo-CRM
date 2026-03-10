"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useUser } from "./use-user"

export function useScope(scopeKey: string): boolean {
  const { user, loading: userLoading } = useUser()
  const [hasScope, setHasScope] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (userLoading) return

    if (!user) {
      setHasScope(false)
      setLoading(false)
      return
    }

    if (user.role === "admin") {
      setHasScope(true)
      setLoading(false)
      return
    }

    const supabase = createClient()

    async function checkScope() {
      const { count } = await supabase
        .from("user_scopes")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)

      setHasScope((count ?? 0) > 0)
      setLoading(false)
    }

    checkScope()
  }, [user, userLoading, scopeKey])

  if (loading || userLoading) return false
  return hasScope
}

export function useUserScopes(): { scopes: string[]; loading: boolean } {
  const { user, loading: userLoading } = useUser()
  const [scopes, setScopes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (userLoading) return

    if (!user) {
      setScopes([])
      setLoading(false)
      return
    }

    if (user.role === "admin") {
      setScopes(["customers", "teams", "reports", "integrations"])
      setLoading(false)
      return
    }

    const supabase = createClient()

    async function fetchScopes() {
      const { data: userScopeRows } = await supabase
        .from("user_scopes")
        .select("scope_id")
        .eq("user_id", user!.id)

      if (!userScopeRows?.length) {
        setScopes([])
        setLoading(false)
        return
      }

      const scopeIds = userScopeRows.map((us: { scope_id: string }) => us.scope_id)
      const { data: scopeRows } = await supabase
        .from("scopes")
        .select("key")
        .in("id", scopeIds)

      setScopes(scopeRows?.map((s: { key: string }) => s.key) ?? [])
      setLoading(false)
    }

    fetchScopes()
  }, [user, userLoading])

  return { scopes, loading }
}
