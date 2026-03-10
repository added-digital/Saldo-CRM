export interface ScopeDefinition {
  key: string
  label: string
  description: string
}

export const scopeDefinitions: ScopeDefinition[] = [
  {
    key: "customers",
    label: "Customer Management",
    description: "View and manage customer records synced from Fortnox",
  },
  {
    key: "teams",
    label: "Team Management",
    description: "View team structure and members",
  },
  {
    key: "reports",
    label: "Reports",
    description: "Access reporting and analytics dashboards",
  },
  {
    key: "integrations",
    label: "Integrations",
    description: "View integration status and sync logs",
  },
] as const

export type ScopeKey = (typeof scopeDefinitions)[number]["key"]
