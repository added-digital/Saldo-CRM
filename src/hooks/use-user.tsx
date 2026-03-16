"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { Profile } from "@/types/database"

interface UserContextValue {
  user: Profile
  isAdmin: boolean
  isTeamLead: boolean
  hasMinRole: (minRole: "admin" | "team_lead" | "user") => boolean
}

const UserContext = createContext<UserContextValue | null>(null)

const ROLE_LEVEL: Record<string, number> = {
  user: 1,
  team_lead: 2,
  admin: 3,
}

function UserProvider({
  profile,
  children,
}: {
  profile: Profile
  children: ReactNode
}) {
  const isAdmin = profile.role === "admin"
  const isTeamLead = profile.role === "team_lead" || isAdmin

  function hasMinRole(minRole: "admin" | "team_lead" | "user") {
    return (ROLE_LEVEL[profile.role] ?? 0) >= (ROLE_LEVEL[minRole] ?? 0)
  }

  return (
    <UserContext.Provider
      value={{ user: profile, isAdmin, isTeamLead, hasMinRole }}
    >
      {children}
    </UserContext.Provider>
  )
}

function useUser() {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error("useUser must be used within a UserProvider")
  }
  return context
}

export { UserProvider, useUser }
