import { LayoutDashboard, Users, UserCog, Activity } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/app/page-header"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { Profile, Customer, Team } from "@/types/database"

interface StatCardProps {
  title: string
  value: string | number
  description: string
  icon: React.ReactNode
}

function StatCard({ title, value, description, icon }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const [
    { count: totalCustomers },
    { count: activeCustomers },
    { count: totalUsers },
    { count: totalTeams },
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("teams")
      .select("*", { count: "exact", head: true }),
  ])

  const { data: recentCustomerRows } = await supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5)

  const recentCustomers = (recentCustomerRows ?? []) as unknown as Customer[]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Overview of your operations"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Customers"
          value={totalCustomers ?? 0}
          description="All time"
          icon={<Users className="size-4 text-muted-foreground" />}
        />
        <StatCard
          title="Active Customers"
          value={activeCustomers ?? 0}
          description="Currently active"
          icon={<Activity className="size-4 text-muted-foreground" />}
        />
        <StatCard
          title="Team Members"
          value={totalUsers ?? 0}
          description="Active users"
          icon={<UserCog className="size-4 text-muted-foreground" />}
        />
        <StatCard
          title="Teams"
          value={totalTeams ?? 0}
          description="Organized groups"
          icon={<LayoutDashboard className="size-4 text-muted-foreground" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Customers</CardTitle>
        </CardHeader>
        <CardContent>
          {recentCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No customers yet. Connect Fortnox to sync your customer database.
            </p>
          ) : (
            <div className="space-y-3">
              {recentCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{customer.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {customer.email ?? customer.org_number ?? "No contact info"}
                    </p>
                  </div>
                  <span className="text-xs capitalize text-muted-foreground">
                    {customer.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
