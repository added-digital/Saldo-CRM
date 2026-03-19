import {
  LayoutDashboard,
  Users,
  Shield,
  Settings,
  BarChart3,
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
    ],
  },
  {
    title: "Analytics",
    items: [
      { label: "Reports", href: "/reports", icon: BarChart3, scope: "reports" },
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
