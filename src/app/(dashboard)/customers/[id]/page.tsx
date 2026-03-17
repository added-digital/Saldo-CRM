"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { use } from "react"
import { ArrowLeft, Building2, Mail, Phone, MapPin, ChevronDown } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import type { Customer, Profile } from "@/types/database"
import { PageHeader } from "@/components/app/page-header"
import { StatusBadge } from "@/components/app/status-badge"
import { UserAvatar } from "@/components/app/user-avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import { formatDate } from "@/lib/utils"

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [customer, setCustomer] = React.useState<Customer | null>(null)
  const [accountManager, setAccountManager] = React.useState<Profile | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function fetchData() {
      const supabase = createClient()

      const { data: customerData } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id)
        .single()

      const c = customerData as unknown as Customer | null
      setCustomer(c)

      if (c?.fortnox_cost_center) {
        const { data: managerData } = await supabase
          .from("profiles")
          .select("*")
          .eq("fortnox_cost_center", c.fortnox_cost_center)
          .eq("is_active", true)
          .single()

        setAccountManager(managerData as unknown as Profile | null)
      }

      setLoading(false)
    }

    fetchData()
  }, [id])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-lg border bg-muted" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="space-y-6">
        <PageHeader title="Customer not found" />
        <Button variant="outline" onClick={() => router.push("/customers")}>
          <ArrowLeft className="size-4" />
          Back to customers
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/customers")}
        >
          <ArrowLeft className="size-4" />
          <span className="sr-only">Back</span>
        </Button>
        <PageHeader title={customer.name}>
          <StatusBadge status={customer.status} />
        </PageHeader>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {customer.org_number && (
              <div className="flex items-center gap-3">
                <Building2 className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Org Number</p>
                  <p className="text-sm">{customer.org_number}</p>
                </div>
              </div>
            )}
            {customer.email && (
              <div className="flex items-center gap-3">
                <Mail className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm">{customer.email}</p>
                </div>
              </div>
            )}
            {customer.phone && (
              <div className="flex items-center gap-3">
                <Phone className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="text-sm">{customer.phone}</p>
                </div>
              </div>
            )}
            {(customer.address_line1 || customer.city) && (
              <div className="flex items-center gap-3">
                <MapPin className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Address</p>
                  <p className="text-sm">
                    {[
                      customer.address_line1,
                      customer.address_line2,
                      [customer.zip_code, customer.city]
                        .filter(Boolean)
                        .join(" "),
                      customer.country !== "SE" ? customer.country : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {accountManager ? (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Account Manager</p>
                <div className="flex items-center gap-3 rounded-md border p-3">
                  <UserAvatar
                    name={accountManager.full_name}
                    avatarUrl={accountManager.avatar_url}
                    size="sm"
                  />
                  <div>
                    <p className="text-sm font-medium">
                      {accountManager.full_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {accountManager.email}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Account Manager</p>
                <p className="text-sm text-muted-foreground">Unassigned</p>
              </div>
            )}

            <Separator />

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fortnox #</span>
                <span>{customer.fortnox_customer_number ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Synced</span>
                <span>
                  {customer.last_synced_at
                    ? formatDate(customer.last_synced_at)
                    : "Never"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(customer.created_at)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {customer.fortnox_raw && (
        <Collapsible>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer">
                <CardTitle className="flex items-center justify-between text-base">
                  Fortnox Raw Data
                  <ChevronDown className="size-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">
                  {JSON.stringify(customer.fortnox_raw, null, 2)}
                </pre>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  )
}
