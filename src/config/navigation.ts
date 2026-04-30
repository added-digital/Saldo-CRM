import {
  House,
  Users,
  UserRound,
  Mail,
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
      { label: "Home", href: "/", icon: House },
    ],
  },
  {
    title: "Management",
    items: [
      { label: "Customers", href: "/customers", icon: Users, scope: "customers" },
      { label: "Contacts", href: "/contacts", icon: UserRound, scope: "customers" },
      { label: "Mail", href: "/mail", icon: Mail, scope: "customers" },
    ],
  },
  {
    title: "Analytics",
    items: [
      { label: "Reports", href: "/reports", icon: BarChart3, minRole: "user" },
      { label: "Reports v2", href: "/reports-v2", icon: BarChart3, minRole: "user" },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Settings", href: "/settings", icon: Settings, minRole: "user" },
    ],
  },
]
