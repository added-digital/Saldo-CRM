import {
  LayoutDashboard,
  Users,
  UserCog,
  Shield,
  Settings,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  scope?: string
  minRole?: "admin" | "team_lead" | "user"
  badge?: "new" | "beta"
  children?: NavItem[]
}

export interface NavSection {
  title?: string
  items: NavItem[]
}

export const navigation: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
    ],
  },
  {
    title: "Management",
    items: [
      { label: "Customers", href: "/customers", icon: Users, scope: "customers" },
      { label: "Teams", href: "/teams", icon: UserCog, scope: "teams" },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Users", href: "/users", icon: Shield, minRole: "admin" },
      { label: "Settings", href: "/settings", icon: Settings, minRole: "admin" },
    ],
  },
]
