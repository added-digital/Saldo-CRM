"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { type ColumnDef } from "@tanstack/react-table"
import { Users, ArrowUpDown } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import type { Customer } from "@/types/database"
import { PageHeader } from "@/components/app/page-header"
import { DataTable } from "@/components/app/data-table"
import { StatusBadge } from "@/components/app/status-badge"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/utils"

const columns: ColumnDef<Customer, unknown>[] = [
  {
    accessorKey: "name",
    size: 250,
    minSize: 120,
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Name
        <ArrowUpDown className="ml-2 size-4" />
      </Button>
    ),
  },
  {
    accessorKey: "org_number",
    size: 140,
    minSize: 100,
    header: "Org Number",
    cell: ({ row }) => row.getValue("org_number") || "—",
  },
  {
    accessorKey: "email",
    size: 220,
    minSize: 100,
    header: "Email",
    cell: ({ row }) => row.getValue("email") || "—",
  },
  {
    accessorKey: "city",
    size: 140,
    minSize: 80,
    header: "City",
    cell: ({ row }) => row.getValue("city") || "—",
  },
  {
    accessorKey: "status",
    size: 110,
    minSize: 80,
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
  },
  {
    accessorKey: "created_at",
    size: 130,
    minSize: 90,
    header: "Created",
    cell: ({ row }) => formatDate(row.getValue("created_at")),
  },
]

export default function CustomersPage() {
  const router = useRouter()
  const [customers, setCustomers] = React.useState<Customer[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    async function fetchCustomers() {
      const supabase = createClient()
      const { data } = await supabase
        .from("customers")
        .select("*")
        .neq("status", "removed")
        .order("name")

      setCustomers((data ?? []) as unknown as Customer[])
      setLoading(false)
    }

    fetchCustomers()
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Manage customer records synced from Fortnox"
      />

      <DataTable
        columns={columns}
        data={customers}
        searchKey="name"
        searchPlaceholder="Search customers..."
        loading={loading}
        onRowClick={(customer) => router.push(`/customers/${customer.id}`)}
        emptyState={{
          icon: Users,
          title: "No customers",
          description:
            "Connect Fortnox in Settings → Integrations to sync your customer database.",
          action: {
            label: "Go to Integrations",
            onClick: () => router.push("/settings/integrations"),
          },
        }}
      />
    </div>
  )
}
