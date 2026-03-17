"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { User, Users, UserCog, Link2, Tags, RefreshCw } from "lucide-react"
import { type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/app/page-header"
import { useUser } from "@/hooks/use-user"

interface SettingsTab {
  label: string
  href: string
  icon: LucideIcon
}

const settingsTabs: SettingsTab[] = [
  { label: "Profile", href: "/settings/profile", icon: User },
  { label: "Contacts", href: "/settings/contacts", icon: Users },
  { label: "Teams", href: "/settings/teams", icon: UserCog },
  { label: "Segments", href: "/settings/segments", icon: Tags },
  { label: "Integrations", href: "/settings/integrations", icon: Link2 },
  { label: "Sync", href: "/settings/sync", icon: RefreshCw },
]

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { isAdmin } = useUser()

  const visibleTabs = isAdmin
    ? settingsTabs
    : settingsTabs.filter((tab) => tab.href === "/settings/profile")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your account and system configuration"
      />

      <div className="border-b">
        <nav className="-mb-px flex gap-4" aria-label="Settings navigation">
          {visibleTabs.map((tab) => {
            const isActive =
              pathname === tab.href || pathname.startsWith(tab.href + "/")

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-1 pb-3 pt-2 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                <tab.icon className="size-4" />
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {children}
    </div>
  )
}
