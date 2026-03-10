"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Profile } from "@/types/database"

export function useUser() {
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    async function getUser() {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        setUser(null)
        setLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single()

      setUser(profile)
      setLoading(false)
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          setUser(null)
          return
        }
        getUser()
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const isAdmin = user?.role === "admin"
  const isTeamLead = user?.role === "team_lead" || isAdmin
  const hasMinRole = (minRole: "admin" | "team_lead" | "user") => {
    if (!user) return false
    const roleLevel: Record<string, number> = { user: 1, team_lead: 2, admin: 3 }
    return (roleLevel[user.role] ?? 0) >= (roleLevel[minRole] ?? 0)
  }

  return { user, loading, isAdmin, isTeamLead, hasMinRole }
}
