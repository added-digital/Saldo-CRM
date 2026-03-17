"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { type ColumnDef } from "@tanstack/react-table"
import { Users, Tags } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import type { CustomerWithRelations, Profile, Segment } from "@/types/database"
import { PageHeader } from "@/components/app/page-header"
import { DataTable } from "@/components/app/data-table"
import { ActionBar } from "@/components/app/action-bar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"

const columns: ColumnDef<CustomerWithRelations, unknown>[] = [
  {
    accessorKey: "name",
    size: 250,
    minSize: 120,
    header: "Name",
  },
  {
    accessorKey: "fortnox_customer_number",
    size: 150,
    minSize: 100,
    header: "Customer No.",
    cell: ({ row }) => row.getValue("fortnox_customer_number") || "—",
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
    id: "account_manager",
    size: 180,
    minSize: 100,
    header: "Customer Manager",
    cell: ({ row }) => {
      const manager = row.original.account_manager
      if (!manager) return <span className="text-muted-foreground">—</span>
      return manager.full_name ?? manager.email
    },
  },
  {
    id: "segments",
    size: 200,
    minSize: 100,
    header: "Segments",
    cell: ({ row }) => {
      const segments = row.original.segments
      if (!segments || segments.length === 0) {
        return <span className="text-muted-foreground">—</span>
      }
      return (
        <div className="flex flex-wrap gap-1">
          {segments.map((segment: Segment) => (
            <Badge
              key={segment.id}
              variant="outline"
              className="text-xs font-normal"
              style={{
                borderColor: segment.color,
                color: segment.color,
              }}
            >
              {segment.name}
            </Badge>
          ))}
        </div>
      )
    },
  },
]

export default function CustomersPage() {
  const router = useRouter()
  const [customers, setCustomers] = React.useState<CustomerWithRelations[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedCustomers, setSelectedCustomers] = React.useState<CustomerWithRelations[]>([])
  const [segmentsDialogOpen, setSegmentsDialogOpen] = React.useState(false)
  const [allSegments, setAllSegments] = React.useState<Segment[]>([])
  const [checkedSegmentIds, setCheckedSegmentIds] = React.useState<Set<string>>(new Set())
  const [assigning, setAssigning] = React.useState(false)
  const clearSelectionRef = React.useRef<(() => void) | null>(null)

  async function fetchCustomers() {
    const supabase = createClient()

    const PAGE_SIZE = 1000
    let allRows: CustomerWithRelations[] = []
    let from = 0
    let hasMore = true

    while (hasMore) {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .eq("status", "active")
        .order("name")
        .range(from, from + PAGE_SIZE - 1)

      const rows = (data ?? []) as unknown as CustomerWithRelations[]
      allRows = allRows.concat(rows)
      hasMore = rows.length === PAGE_SIZE
      from += PAGE_SIZE
    }

    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, full_name, email, fortnox_cost_center")
      .eq("is_active", true)
      .not("fortnox_cost_center", "is", null)

    const profileByCostCenter = new Map<string, Pick<Profile, "id" | "full_name" | "email">>()
    for (const p of (profileRows ?? []) as unknown as { id: string; full_name: string | null; email: string; fortnox_cost_center: string }[]) {
      profileByCostCenter.set(p.fortnox_cost_center, { id: p.id, full_name: p.full_name, email: p.email })
    }

    const customerIds = allRows.map((c) => c.id)

    let segmentMap: Record<string, Segment[]> = {}

    if (customerIds.length > 0) {
      const { data: csRows } = await supabase
        .from("customer_segments")
        .select("customer_id, segment:segments(*)")
        .in("customer_id", customerIds)
        .range(0, 9999)

      const rawCs = (csRows ?? []) as unknown as {
        customer_id: string
        segment: Segment
      }[]

      segmentMap = rawCs.reduce<Record<string, Segment[]>>((acc, row) => {
        if (!acc[row.customer_id]) acc[row.customer_id] = []
        acc[row.customer_id].push(row.segment)
        return acc
      }, {})
    }

    const enriched: CustomerWithRelations[] = allRows.map((c) => ({
      ...c,
      account_manager: c.fortnox_cost_center ? profileByCostCenter.get(c.fortnox_cost_center) ?? null : null,
      segments: segmentMap[c.id] ?? [],
    }))

    setCustomers(enriched)
    setLoading(false)
  }

  React.useEffect(() => {
    fetchCustomers()
  }, [])

  function handleOpenSegmentsDialog() {
    const supabase = createClient()
    supabase
      .from("segments")
      .select("*")
      .order("name")
      .then(({ data }) => {
        setAllSegments((data ?? []) as unknown as Segment[])
        setCheckedSegmentIds(new Set())
        setSegmentsDialogOpen(true)
      })
  }

  function toggleSegment(segmentId: string) {
    setCheckedSegmentIds((prev) => {
      const next = new Set(prev)
      if (next.has(segmentId)) {
        next.delete(segmentId)
      } else {
        next.add(segmentId)
      }
      return next
    })
  }

  async function handleAssignSegments() {
    if (checkedSegmentIds.size === 0) return
    setAssigning(true)

    const supabase = createClient()
    const rows = selectedCustomers.flatMap((customer) =>
      Array.from(checkedSegmentIds).map((segmentId) => ({
        customer_id: customer.id,
        segment_id: segmentId,
      }))
    )

    const { error } = await supabase
      .from("customer_segments")
      .upsert(rows as never[], { onConflict: "customer_id,segment_id" })

    if (error) {
      toast.error("Failed to assign segments")
    } else {
      toast.success(
        `Segments assigned to ${selectedCustomers.length} customer${selectedCustomers.length !== 1 ? "s" : ""}`
      )
      setSegmentsDialogOpen(false)
      clearSelectionRef.current?.()
      fetchCustomers()
    }

    setAssigning(false)
  }

  function handleClearSelection() {
    clearSelectionRef.current?.()
  }

  return (
    <div className="space-y-6 pb-16">
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
        selectable
        onSelectionChange={setSelectedCustomers}
        clearSelectionRef={clearSelectionRef}
        onRowNavigate={(customer) => router.push(`/customers/${customer.id}`)}
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

      <ActionBar
        selectedCount={selectedCustomers.length}
        onClear={handleClearSelection}
        actions={[
          {
            label: "Add Segments",
            icon: Tags,
            onClick: handleOpenSegmentsDialog,
          },
        ]}
      />

      <Dialog open={segmentsDialogOpen} onOpenChange={setSegmentsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Segments</DialogTitle>
            <DialogDescription>
              Select segments to assign to {selectedCustomers.length} customer
              {selectedCustomers.length !== 1 ? "s" : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {allSegments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No segments available. Create segments in Settings → Segments.
              </p>
            ) : (
              <div className="space-y-2">
                {allSegments.map((segment) => (
                  <label
                    key={segment.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={checkedSegmentIds.has(segment.id)}
                      onCheckedChange={() => toggleSegment(segment.id)}
                    />
                    <Badge
                      variant="outline"
                      className="text-xs font-normal"
                      style={{
                        borderColor: segment.color,
                        color: segment.color,
                      }}
                    >
                      {segment.name}
                    </Badge>
                    {segment.description && (
                      <span className="text-sm text-muted-foreground">
                        {segment.description}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setSegmentsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAssignSegments}
                disabled={checkedSegmentIds.size === 0 || assigning}
              >
                {assigning ? "Assigning..." : "Assign Segments"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
