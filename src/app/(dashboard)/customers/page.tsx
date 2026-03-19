"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { type ColumnDef } from "@tanstack/react-table"
import { Users, Tags, LayoutGrid } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import type { CustomerWithRelations, Profile, Segment } from "@/types/database"
import { PageHeader } from "@/components/app/page-header"
import { DataTable } from "@/components/app/data-table"
import { CustomerKpiCards } from "@/components/app/customer-kpi-view"
import { ActionBar } from "@/components/app/action-bar"
import {
  CustomerFilters,
  applyFilters,
  EMPTY_FILTERS,
  type CustomerFilterState,
  type CustomerListColumnOption,
} from "@/components/app/customer-filters"
import { SearchInput } from "@/components/app/search-input"
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
    id: "name",
    accessorKey: "name",
    size: 250,
    minSize: 120,
    header: "Name",
  },
  {
    id: "fortnox_customer_number",
    accessorKey: "fortnox_customer_number",
    size: 150,
    minSize: 100,
    header: "Customer No.",
    cell: ({ row }) => row.getValue("fortnox_customer_number") || "—",
  },
  {
    id: "org_number",
    accessorKey: "org_number",
    size: 140,
    minSize: 100,
    header: "Org Number",
    cell: ({ row }) => row.getValue("org_number") || "—",
  },
  {
    id: "contact_name",
    accessorKey: "contact_name",
    size: 180,
    minSize: 100,
    header: "Primary Contact",
    cell: ({ row }) => row.getValue("contact_name") || "—",
  },
  {
    id: "email",
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
    id: "total_turnover",
    accessorKey: "total_turnover",
    size: 160,
    minSize: 120,
    header: "Turnover",
    cell: ({ row }) => formatSek(row.getValue("total_turnover") as number | null),
  },
  {
    id: "invoice_count",
    accessorKey: "invoice_count",
    size: 120,
    minSize: 100,
    header: "Invoices",
    cell: ({ row }) => formatNumber(row.getValue("invoice_count") as number | null),
  },
  {
    id: "total_hours",
    accessorKey: "total_hours",
    size: 120,
    minSize: 100,
    header: "Hours",
    cell: ({ row }) => formatHours(row.getValue("total_hours") as number | null),
  },
  {
    id: "contract_value",
    accessorKey: "contract_value",
    size: 170,
    minSize: 120,
    header: "Contract Value",
    cell: ({ row }) => formatSek(row.getValue("contract_value") as number | null),
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

const sekFormatter = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat("sv-SE")

const hoursFormatter = new Intl.NumberFormat("sv-SE", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
})

function formatSek(value: number | null): string {
  if (value == null) return "—"
  return sekFormatter.format(value)
}

function formatNumber(value: number | null): string {
  if (value == null) return "—"
  return numberFormatter.format(value)
}

function formatHours(value: number | null): string {
  if (value == null) return "—"
  return hoursFormatter.format(value)
}

const customerListColumnDefinitions: Omit<CustomerListColumnOption, "visible">[] = [
  { id: "name", label: "Customer Name", alwaysVisible: true },
  { id: "fortnox_customer_number", label: "Customer No." },
  { id: "org_number", label: "Org Number" },
  { id: "contact_name", label: "Primary Contact" },
  { id: "email", label: "Email" },
  { id: "account_manager", label: "Customer Manager" },
  { id: "total_turnover", label: "Turnover" },
  { id: "invoice_count", label: "Invoices" },
  { id: "total_hours", label: "Hours" },
  { id: "contract_value", label: "Contract Value" },
  { id: "segments", label: "Segments" },
]

const CUSTOMER_FILTERS_STORAGE_KEY = "saldo-crm:customers:filters"

function isCustomerFilterState(value: unknown): value is CustomerFilterState {
  if (!value || typeof value !== "object") return false

  const candidate = value as Record<string, unknown>

  return (
    Array.isArray(candidate.statuses) &&
    Array.isArray(candidate.segmentIds) &&
    Array.isArray(candidate.managerIds) &&
    typeof candidate.missingPrimaryContact === "boolean" &&
    typeof candidate.missingEmail === "boolean" &&
    typeof candidate.missingCustomerManager === "boolean"
  )
}

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
  const [showKpiCards, setShowKpiCards] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [filters, setFilters] = React.useState<CustomerFilterState>(EMPTY_FILTERS)
  const [visibleListColumns, setVisibleListColumns] = React.useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        customerListColumnDefinitions.map((column) => [column.id, true])
      )
  )

  const listColumns = React.useMemo<CustomerListColumnOption[]>(
    () =>
      customerListColumnDefinitions.map((column) => ({
        ...column,
        visible: visibleListColumns[column.id] ?? true,
      })),
    [visibleListColumns]
  )

  const visibleColumns = React.useMemo(
    () => columns.filter((column) => visibleListColumns[column.id ?? ""] ?? true),
    [visibleListColumns]
  )

  const filteredCustomers = React.useMemo(() => {
    let result = customers

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.fortnox_customer_number?.toLowerCase().includes(q) ||
          c.org_number?.toLowerCase().includes(q) ||
          c.contact_name?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q)
      )
    }

    return applyFilters(result, filters)
  }, [customers, searchQuery, filters])

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

    const segmentMap: Record<string, Segment[]> = {}

    const BATCH = 200
    for (let i = 0; i < customerIds.length; i += BATCH) {
      const batch = customerIds.slice(i, i + BATCH)

      const { data: csRows } = await supabase
        .from("customer_segments")
        .select("customer_id, segment:segments(*)")
        .in("customer_id", batch)

      const rawCs = (csRows ?? []) as unknown as {
        customer_id: string
        segment: Segment
      }[]

      for (const row of rawCs) {
        if (!segmentMap[row.customer_id]) segmentMap[row.customer_id] = []
        segmentMap[row.customer_id].push(row.segment)
      }
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

  React.useEffect(() => {
    try {
      const storedFilters = window.localStorage.getItem(CUSTOMER_FILTERS_STORAGE_KEY)
      if (!storedFilters) return

      const parsedFilters = JSON.parse(storedFilters) as unknown
      if (isCustomerFilterState(parsedFilters)) {
        setFilters(parsedFilters)
      }
    } catch {
      window.localStorage.removeItem(CUSTOMER_FILTERS_STORAGE_KEY)
    }
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

  function toggleListColumn(columnId: string) {
    const column = customerListColumnDefinitions.find((item) => item.id === columnId)
    if (column?.alwaysVisible) return

    setVisibleListColumns((prev) => ({
      ...prev,
      [columnId]: !(prev[columnId] ?? true),
    }))
  }

  function resetListColumns() {
    setVisibleListColumns(
      Object.fromEntries(
        customerListColumnDefinitions.map((column) => [column.id, true])
      )
    )
  }

  function handleSaveFilter() {
    window.localStorage.setItem(CUSTOMER_FILTERS_STORAGE_KEY, JSON.stringify(filters))
    toast.success("Filter saved")
  }

  const kpiToggle = (
    <Button
      variant={showKpiCards ? "default" : "outline"}
      size="sm"
      className="h-8"
      onClick={() => setShowKpiCards((current) => !current)}
      aria-pressed={showKpiCards}
    >
      <LayoutGrid className="size-3.5" />
      KPI cards
    </Button>
  )

  const toolbar = (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <SearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search customers..."
        className="w-full lg:max-w-sm"
      />
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {kpiToggle}
        <CustomerFilters
          customers={customers}
          filters={filters}
          onFiltersChange={setFilters}
          onSaveFilter={handleSaveFilter}
          listColumns={listColumns}
          onToggleListColumn={toggleListColumn}
          onResetListColumns={resetListColumns}
        />
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Manage customer records synced from Fortnox"
      />

      {toolbar}

      {showKpiCards ? <CustomerKpiCards customers={filteredCustomers} /> : null}

      <DataTable
        columns={visibleColumns}
        data={filteredCustomers}
        loading={loading}
        pageSize={15}
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
