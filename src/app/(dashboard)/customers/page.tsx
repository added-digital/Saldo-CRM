"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { type ColumnDef } from "@tanstack/react-table"
import { Users, Tags, ChevronLeft, ChevronRight, Mail, BarChart3 } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import type { CustomerWithRelations, Profile, Segment } from "@/types/database"
import { DataTable } from "@/components/app/data-table"
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
    id: "invoice_count",
    accessorKey: "invoice_count",
    size: 120,
    minSize: 100,
    header: "Invoices",
    cell: ({ row }) => formatNumber(row.getValue("invoice_count") as number | null),
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

function formatSek(value: number | null): string {
  if (value == null) return "—"
  return sekFormatter.format(value)
}

function formatNumber(value: number | null): string {
  if (value == null) return "—"
  return numberFormatter.format(value)
}

const customerListColumnDefinitions: Omit<CustomerListColumnOption, "visible">[] = [
  { id: "name", label: "Customer Name", alwaysVisible: true },
  { id: "fortnox_customer_number", label: "Customer No." },
  { id: "org_number", label: "Org Number" },
  { id: "contact_name", label: "Primary Contact" },
  { id: "email", label: "Email" },
  { id: "account_manager", label: "Customer Manager" },
  { id: "invoice_count", label: "Invoices" },
  { id: "contract_value", label: "Contract Value" },
  { id: "segments", label: "Segments" },
]

const CUSTOMER_FILTERS_STORAGE_KEY = "saldo-crm:customers:filters"
const CUSTOMER_LIST_COLUMNS_STORAGE_KEY = "saldo-crm:customers:list-columns"
const CUSTOMER_TABLE_PAGE_SIZE = 15
const DEFAULT_VISIBLE_LIST_COLUMN_IDS = new Set<string>([
  "name",
  "fortnox_customer_number",
  "account_manager",
  "segments",
])

function getDefaultVisibleListColumns(): Record<string, boolean> {
  return Object.fromEntries(
    customerListColumnDefinitions.map((column) => [
      column.id,
      column.alwaysVisible || DEFAULT_VISIBLE_LIST_COLUMN_IDS.has(column.id),
    ])
  )
}

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
  const [searchQuery, setSearchQuery] = React.useState("")
  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(CUSTOMER_TABLE_PAGE_SIZE)
  const [filters, setFilters] = React.useState<CustomerFilterState>(EMPTY_FILTERS)
  const [visibleListColumns, setVisibleListColumns] = React.useState<Record<string, boolean>>(() => getDefaultVisibleListColumns())

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

  const pageCount = React.useMemo(
    () => Math.max(1, Math.ceil(filteredCustomers.length / pageSize)),
    [filteredCustomers.length, pageSize]
  )

  React.useEffect(() => {
    setPageIndex((current) => {
      if (current < 0) return 0
      if (current >= pageCount) return pageCount - 1
      return current
    })
  }, [pageCount])

  const paginatedCustomers = React.useMemo(() => {
    const from = pageIndex * pageSize
    const to = from + pageSize
    return filteredCustomers.slice(from, to)
  }, [filteredCustomers, pageIndex, pageSize])

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
      const storedColumns = window.localStorage.getItem(CUSTOMER_LIST_COLUMNS_STORAGE_KEY)
      if (!storedColumns) return

      const parsedColumns = JSON.parse(storedColumns) as unknown
      if (!parsedColumns || typeof parsedColumns !== "object") return

      const candidate = parsedColumns as Record<string, unknown>
      const next = getDefaultVisibleListColumns()
      for (const column of customerListColumnDefinitions) {
        if (typeof candidate[column.id] === "boolean") {
          next[column.id] = column.alwaysVisible ? true : candidate[column.id] as boolean
        }
      }
      setVisibleListColumns(next)
    } catch {
      window.localStorage.removeItem(CUSTOMER_LIST_COLUMNS_STORAGE_KEY)
    }
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

  function handleSendMail() {
    const recipients = Array.from(
      new Set(
        selectedCustomers
          .map((customer) => customer.email?.trim())
          .filter((email): email is string => Boolean(email))
      )
    )

    if (recipients.length === 0) {
      toast.error("No primary contact emails found for selected customers")
      return
    }

    router.push(`/settings/mail?to=${encodeURIComponent(recipients.join("\n"))}`)
  }

  function handleOpenInReports() {
    const selectedCustomer = selectedCustomers[0]
    if (!selectedCustomer) return
    router.push(`/reports?customerId=${encodeURIComponent(selectedCustomer.id)}`)
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
    setVisibleListColumns(getDefaultVisibleListColumns())
  }

  function handleSaveFilter() {
    window.localStorage.setItem(CUSTOMER_FILTERS_STORAGE_KEY, JSON.stringify(filters))
    window.localStorage.setItem(CUSTOMER_LIST_COLUMNS_STORAGE_KEY, JSON.stringify(visibleListColumns))
    toast.success("Filters and list fields saved")
  }

  const paginationControl = (
    <div className="flex items-center gap-2">
      <select
        value={pageSize}
        onChange={(event) => {
          setPageSize(Number(event.target.value))
          setPageIndex(0)
        }}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        aria-label="Rows per page"
      >
        <option value={15}>15 / page</option>
        <option value={30}>30 / page</option>
        <option value={50}>50 / page</option>
      </select>
      <span className="text-sm text-muted-foreground">
        {pageIndex + 1} of {pageCount}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        onClick={() => setPageIndex((current) => Math.max(current - 1, 0))}
        disabled={pageIndex === 0}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        onClick={() => setPageIndex((current) => Math.min(current + 1, pageCount - 1))}
        disabled={pageIndex >= pageCount - 1}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
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
        {paginationControl}
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
      {toolbar}

      <DataTable
        columns={visibleColumns}
        data={paginatedCustomers}
        loading={loading}
        pageSize={pageSize}
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
          ...(selectedCustomers.length === 1
            ? [
                {
                  label: "Open in Reports",
                  icon: BarChart3,
                  onClick: handleOpenInReports,
                  variant: "outline" as const,
                },
              ]
            : []),
          {
            label: "Send Mail",
            icon: Mail,
            onClick: handleSendMail,
          },
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
