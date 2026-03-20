"use client"

import * as React from "react"
import { Check, ChevronDown, Filter } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import type { ContractAccrual, Customer, CustomerWithRelations, Invoice, Profile, Team } from "@/types/database"
import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const REPORT_YEARS = ["2025", "2026"] as const
const REPORT_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const
const REPORTS_MANAGER_ALIAS: Record<string, string> = {
  "added@saldoredo.se": "Matias.a@saldoredo.se",
}

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

function getYearDateRange(year: string): { from: string; to: string } {
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function annualizeContractTotal(total: number | null, period: string | null): number {
  const base = Number(total ?? 0)
  const periodNumber = Number(period ?? "")

  if (periodNumber === 1) return base * 12
  if (periodNumber === 3) return base * 4
  return base
}

type TeamOption = Pick<Team, "id" | "name">

type ManagerOption = Pick<
  Profile,
  "id" | "full_name" | "email" | "team_id" | "fortnox_cost_center"
>

type SelectOption = {
  id: string
  label: string
  subLabel?: string
}

type SearchSelectProps = {
  title: string
  placeholder: string
  searchPlaceholder: string
  options: SelectOption[]
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
  allLabel?: string
  allowClear?: boolean
}

type MonthlyTimeReportingRow = {
  month: number
  label: string
  customerHours: number
  absenceHours: number
  internalHours: number
  otherHours: number
  totalHours: number
}

function createEmptyMonthlyTimeReportingRows(): MonthlyTimeReportingRow[] {
  return REPORT_MONTHS.map((label, index) => ({
    month: index + 1,
    label,
    customerHours: 0,
    absenceHours: 0,
    internalHours: 0,
    otherHours: 0,
    totalHours: 0,
  }))
}

function SearchSelect({
  title,
  placeholder,
  searchPlaceholder,
  options,
  value,
  onChange,
  disabled = false,
  allLabel = "All",
  allowClear = true,
}: SearchSelectProps) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find((option) => option.id === value) ?? null

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between"
            disabled={disabled}
          >
            <span className="truncate text-left">
              {selected?.label ?? placeholder}
            </span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              {allowClear ? (
                <CommandItem
                  key="all"
                  value={allLabel}
                  onSelect={() => {
                    onChange(null)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("size-4", value === null ? "opacity-100" : "opacity-0")} />
                  <span>{allLabel}</span>
                </CommandItem>
              ) : null}
              <CommandEmpty>No options found.</CommandEmpty>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`${option.label} ${option.subLabel ?? ""}`}
                  onSelect={() => {
                    onChange(option.id)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("size-4", value === option.id ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <p className="truncate">{option.label}</p>
                    {option.subLabel ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {option.subLabel}
                      </p>
                    ) : null}
                  </div>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export default function ReportsPage() {
  const { user, isAdmin } = useUser()

  const [loading, setLoading] = React.useState(true)
  const [teams, setTeams] = React.useState<TeamOption[]>([])
  const [managers, setManagers] = React.useState<ManagerOption[]>([])
  const [customers, setCustomers] = React.useState<CustomerWithRelations[]>([])

  const [selectedTeamId, setSelectedTeamId] = React.useState<string | null>(null)
  const [selectedManagerId, setSelectedManagerId] = React.useState<string | null>(null)
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<string | null>(null)
  const [selectedYear, setSelectedYear] = React.useState<string>(REPORT_YEARS[0])
  const [kpiLoading, setKpiLoading] = React.useState(false)
  const [kpis, setKpis] = React.useState({
    turnover: 0,
    invoices: 0,
    hours: 0,
    contractValue: 0,
  })
  const [accrualsLoading, setAccrualsLoading] = React.useState(false)
  const [customerAccruals, setCustomerAccruals] = React.useState<ContractAccrual[]>([])
  const [invoicesLoading, setInvoicesLoading] = React.useState(false)
  const [customerInvoices, setCustomerInvoices] = React.useState<Invoice[]>([])
  const [timeReportingLoading, setTimeReportingLoading] = React.useState(false)
  const [monthlyTimeReporting, setMonthlyTimeReporting] = React.useState<MonthlyTimeReportingRow[]>(
    () => createEmptyMonthlyTimeReportingRows(),
  )

  const showTeamFilter = isAdmin || user.role === "team_lead"
  const teamFilterDisabled = user.role === "team_lead" && !isAdmin
  const filterGridClass = showTeamFilter ? "lg:grid-cols-4" : "lg:grid-cols-3"
  const selectedYearRange = React.useMemo(() => getYearDateRange(selectedYear), [selectedYear])
  const yearOptions = React.useMemo<SelectOption[]>(
    () => REPORT_YEARS.map((year) => ({ id: year, label: year })),
    [],
  )

  const teamOptions = React.useMemo<SelectOption[]>(
    () => teams.map((team) => ({ id: team.id, label: team.name })),
    [teams],
  )

  const availableManagers = React.useMemo(() => {
    if (!selectedTeamId) return managers
    return managers.filter((manager) => manager.team_id === selectedTeamId)
  }, [managers, selectedTeamId])

  const managerOptions = React.useMemo<SelectOption[]>(
    () =>
      availableManagers.map((manager) => ({
        id: manager.id,
        label: manager.full_name ?? manager.email,
        subLabel: manager.email,
      })),
    [availableManagers],
  )

  const teamScopedCustomers = React.useMemo(() => {
    if (!selectedTeamId) return customers
    const allowedManagerIds = new Set(availableManagers.map((manager) => manager.id))
    return customers.filter(
      (customer) =>
        customer.account_manager && allowedManagerIds.has(customer.account_manager.id),
    )
  }, [customers, selectedTeamId, availableManagers])

  const managerScopedCustomers = React.useMemo(() => {
    if (!selectedManagerId) return teamScopedCustomers
    return teamScopedCustomers.filter(
      (customer) => customer.account_manager?.id === selectedManagerId,
    )
  }, [teamScopedCustomers, selectedManagerId])

  const customerOptions = React.useMemo<SelectOption[]>(
    () =>
      managerScopedCustomers.map((customer) => ({
        id: customer.id,
        label: customer.name,
        subLabel: customer.fortnox_customer_number
          ? `#${customer.fortnox_customer_number}`
          : "No customer number",
      })),
    [managerScopedCustomers],
  )

  const filteredCustomers = React.useMemo(() => {
    if (!selectedCustomerId) return managerScopedCustomers
    return managerScopedCustomers.filter(
      (customer) => customer.id === selectedCustomerId,
    )
  }, [managerScopedCustomers, selectedCustomerId])

  const selectedCustomer = React.useMemo(
    () => filteredCustomers[0] ?? null,
    [filteredCustomers],
  )

  React.useEffect(() => {
    if (selectedManagerId && !availableManagers.some((m) => m.id === selectedManagerId)) {
      setSelectedManagerId(null)
      setSelectedCustomerId(null)
    }
  }, [availableManagers, selectedManagerId])

  React.useEffect(() => {
    if (selectedCustomerId && !managerScopedCustomers.some((c) => c.id === selectedCustomerId)) {
      setSelectedCustomerId(null)
    }
  }, [managerScopedCustomers, selectedCustomerId])

  async function fetchReportData() {
    setLoading(true)
    const supabase = createClient()

    const aliasedManagerEmail = REPORTS_MANAGER_ALIAS[user.email.toLowerCase()] ?? null
    let effectiveProfile: Pick<
      Profile,
      "id" | "full_name" | "email" | "team_id" | "fortnox_cost_center"
    > = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      team_id: user.team_id,
      fortnox_cost_center: user.fortnox_cost_center,
    }

    if (aliasedManagerEmail && user.role === "user") {
      const { data: aliasedProfile } = await supabase
        .from("profiles")
        .select("id, full_name, email, team_id, fortnox_cost_center")
        .ilike("email", aliasedManagerEmail)
        .limit(1)
        .maybeSingle()

      if (aliasedProfile) {
        effectiveProfile = aliasedProfile as Pick<
          Profile,
          "id" | "full_name" | "email" | "team_id" | "fortnox_cost_center"
        >
      }
    }

    let scopedTeams: TeamOption[] = []
    let scopedManagers: ManagerOption[] = []

    if (isAdmin) {
      const [{ data: teamRows }, { data: profileRows }] = await Promise.all([
        supabase.from("teams").select("id, name"),
        supabase
          .from("profiles")
          .select("id, full_name, email, team_id, fortnox_cost_center")
          .eq("is_active", true),
      ])

      const allTeams = (teamRows ?? []) as TeamOption[]
      const allProfiles = (profileRows ?? []) as ManagerOption[]

      scopedTeams = allTeams.map((team) => ({ id: team.id, name: team.name }))
      scopedManagers = allProfiles
    } else if (user.role === "team_lead") {
      const { data: ledTeamRows } = await supabase
        .from("teams")
        .select("id, name")
        .eq("lead_id", user.id)

      const ledTeams = (ledTeamRows ?? []) as TeamOption[]
      const ledTeamIds = new Set(ledTeams.map((team) => team.id))

      scopedTeams = ledTeams.map((team) => ({ id: team.id, name: team.name }))

      if (ledTeams.length > 0) {
        const { data: teamProfiles } = await supabase
          .from("profiles")
          .select("id, full_name, email, team_id, fortnox_cost_center")
          .eq("is_active", true)
          .in("team_id", Array.from(ledTeamIds))

        scopedManagers = (teamProfiles ?? []) as ManagerOption[]
      }
    } else {
      scopedManagers = [
        {
          id: effectiveProfile.id,
          full_name: effectiveProfile.full_name,
          email: effectiveProfile.email,
          team_id: effectiveProfile.team_id,
          fortnox_cost_center: effectiveProfile.fortnox_cost_center,
        },
      ]
    }

    if (scopedManagers.length === 0) {
      scopedManagers = [
        {
          id: effectiveProfile.id,
          full_name: effectiveProfile.full_name,
          email: effectiveProfile.email,
          team_id: effectiveProfile.team_id,
          fortnox_cost_center: effectiveProfile.fortnox_cost_center,
        },
      ]
    }

    const sortedManagers = scopedManagers.sort((a, b) =>
      (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email),
    )

    const managerByCostCenter = new Map<string, ManagerOption>()
    const allowedCostCenters: string[] = []
    for (const manager of sortedManagers) {
      if (manager.fortnox_cost_center && !managerByCostCenter.has(manager.fortnox_cost_center)) {
        managerByCostCenter.set(manager.fortnox_cost_center, manager)
        allowedCostCenters.push(manager.fortnox_cost_center)
      }
    }

    const PAGE_SIZE = 1000
    let allCustomers: Customer[] = []
    let from = 0

    if (!isAdmin && allowedCostCenters.length === 0) {
      allCustomers = []
    }

    while (isAdmin || allowedCostCenters.length > 0) {
      let query = supabase
        .from("customers")
        .select("*")
        .order("name")
        .range(from, from + PAGE_SIZE - 1)

      if (!isAdmin) {
        query = query.in("fortnox_cost_center", allowedCostCenters)
      }

      const { data } = await query

      const rows = (data ?? []) as Customer[]
      if (rows.length === 0) break

      allCustomers = allCustomers.concat(rows)
      if (rows.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    const scopedManagerIds = new Set(sortedManagers.map((manager) => manager.id))

    const enrichedCustomers: CustomerWithRelations[] = allCustomers
      .map((customer) => {
        const manager = customer.fortnox_cost_center
          ? managerByCostCenter.get(customer.fortnox_cost_center) ?? null
          : null

        return {
          ...customer,
          account_manager: manager
            ? {
                id: manager.id,
                full_name: manager.full_name,
                email: manager.email,
              }
            : null,
          segments: [],
        }
      })
      .filter(
        (customer) =>
          customer.account_manager &&
          scopedManagerIds.has(customer.account_manager.id),
      )

    setTeams(scopedTeams)
    setManagers(sortedManagers)
    setCustomers(enrichedCustomers)

    if (user.role === "user") {
      setSelectedManagerId(effectiveProfile.id)
      setSelectedTeamId(null)
    } else if (user.role === "team_lead" && scopedTeams.length === 1) {
      setSelectedTeamId(scopedTeams[0].id)
      setSelectedManagerId(null)
    } else {
      setSelectedTeamId(null)
      setSelectedManagerId(null)
    }

    setSelectedCustomerId(null)
    setLoading(false)
  }

  React.useEffect(() => {
    fetchReportData()
  }, [user.id, user.role, user.team_id, user.fortnox_cost_center, isAdmin])

  React.useEffect(() => {
    let cancelled = false

    async function fetchDateScopedKpis() {
      if (filteredCustomers.length === 0) {
        setKpis({ turnover: 0, invoices: 0, hours: 0, contractValue: 0 })
        setKpiLoading(false)
        return
      }

      setKpiLoading(true)
      const supabase = createClient()

      const customerIds = filteredCustomers.map((customer) => customer.id)
      const customerIdChunks = chunkArray(customerIds, 200)
      const selectedYearNumber = Number(selectedYear)

      let turnover = 0
      let invoiceCount = 0
      let hours = 0
      let contractValue = 0

      for (const idChunk of customerIdChunks) {
        if (cancelled) return

        const { data: kpiRows, error: kpiError } = await supabase
          .from("customer_kpis")
          .select("total_turnover, invoice_count, total_hours, contract_value")
          .in("customer_id", idChunk)
          .eq("period_type", "year")
          .eq("period_year", selectedYearNumber)

        if (kpiError) {
          throw kpiError
        }

        const rows = (kpiRows ?? []) as Array<{
          total_turnover: number | null
          invoice_count: number | null
          total_hours: number | null
          contract_value: number | null
        }>

        for (const row of rows) {
          turnover += Number(row.total_turnover ?? 0)
          invoiceCount += Number(row.invoice_count ?? 0)
          hours += Number(row.total_hours ?? 0)
          contractValue += Number(row.contract_value ?? 0)
        }
      }

      if (cancelled) return

      setKpis({
        turnover,
        invoices: invoiceCount,
        hours,
        contractValue,
      })
      setKpiLoading(false)
    }

    fetchDateScopedKpis().catch(() => {
      if (!cancelled) {
        setKpis({ turnover: 0, invoices: 0, hours: 0, contractValue: 0 })
        setKpiLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [filteredCustomers, selectedYear])

  React.useEffect(() => {
    let cancelled = false

    async function fetchMonthlyTimeReporting() {
      if (filteredCustomers.length === 0) {
        setMonthlyTimeReporting(createEmptyMonthlyTimeReportingRows())
        setTimeReportingLoading(false)
        return
      }

      setTimeReportingLoading(true)
      const supabase = createClient()
      const monthlyRows = createEmptyMonthlyTimeReportingRows()
      const customerIds = filteredCustomers.map((customer) => customer.id)
      const customerIdChunks = chunkArray(customerIds, 200)
      const selectedYearNumber = Number(selectedYear)

      for (const idChunk of customerIdChunks) {
        if (cancelled) return

        const { data, error } = await supabase
          .from("customer_kpis")
          .select("period_month, customer_hours, absence_hours, internal_hours, other_hours, total_hours")
          .in("customer_id", idChunk)
          .eq("period_type", "month")
          .eq("period_year", selectedYearNumber)

        if (error) {
          throw error
        }

        const rows = (data ?? []) as Array<{
          period_month: number | null
          customer_hours: number | null
          absence_hours: number | null
          internal_hours: number | null
          other_hours: number | null
          total_hours: number | null
        }>

        for (const row of rows) {
          const month = Number(row.period_month ?? 0)
          if (!Number.isInteger(month) || month < 1 || month > 12) continue

          const target = monthlyRows[month - 1]
          target.customerHours += Number(row.customer_hours ?? 0)
          target.absenceHours += Number(row.absence_hours ?? 0)
          target.internalHours += Number(row.internal_hours ?? 0)
          target.otherHours += Number(row.other_hours ?? 0)
          target.totalHours += Number(row.total_hours ?? 0)
        }
      }

      if (cancelled) return

      setMonthlyTimeReporting(monthlyRows)
      setTimeReportingLoading(false)
    }

    fetchMonthlyTimeReporting().catch(() => {
      if (!cancelled) {
        setMonthlyTimeReporting(createEmptyMonthlyTimeReportingRows())
        setTimeReportingLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [filteredCustomers, selectedYear])

  React.useEffect(() => {
    let cancelled = false

    async function fetchCustomerAccruals() {
      if (!selectedCustomerId || !selectedCustomer?.fortnox_customer_number) {
        setCustomerAccruals([])
        setAccrualsLoading(false)
        return
      }

      setAccrualsLoading(true)
      const supabase = createClient()
      const { data, error } = await supabase
        .from("contract_accruals")
        .select("*")
        .eq("fortnox_customer_number", selectedCustomer.fortnox_customer_number)
        .order("start_date", { ascending: true })

      if (cancelled) return

      if (error) {
        setCustomerAccruals([])
        setAccrualsLoading(false)
        return
      }

      setCustomerAccruals((data ?? []) as ContractAccrual[])
      setAccrualsLoading(false)
    }

    fetchCustomerAccruals().catch(() => {
      if (!cancelled) {
        setCustomerAccruals([])
        setAccrualsLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [selectedCustomerId, selectedCustomer?.fortnox_customer_number])

  React.useEffect(() => {
    let cancelled = false

    async function fetchCustomerInvoices() {
      if (!selectedCustomerId) {
        setCustomerInvoices([])
        setInvoicesLoading(false)
        return
      }

      setInvoicesLoading(true)
      const supabase = createClient()
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("customer_id", selectedCustomerId)
        .gte("invoice_date", selectedYearRange.from)
        .lte("invoice_date", selectedYearRange.to)
        .order("invoice_date", { ascending: false })

      if (cancelled) return

      if (error) {
        setCustomerInvoices([])
        setInvoicesLoading(false)
        return
      }

      setCustomerInvoices((data ?? []) as Invoice[])
      setInvoicesLoading(false)
    }

    fetchCustomerInvoices().catch(() => {
      if (!cancelled) {
        setCustomerInvoices([])
        setInvoicesLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [selectedCustomerId, selectedYearRange])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Filter by team, customer manager, and customer"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="size-4 text-muted-foreground" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={cn("grid gap-4", filterGridClass)}>
            {showTeamFilter ? (
              <SearchSelect
                title="Team"
                placeholder="All teams"
                searchPlaceholder="Search teams..."
                options={teamOptions}
                value={selectedTeamId}
                onChange={(value) => {
                  setSelectedTeamId(value)
                  setSelectedManagerId(null)
                  setSelectedCustomerId(null)
                }}
                disabled={teamFilterDisabled}
                allLabel="All teams"
              />
            ) : null}

            <SearchSelect
              title="Customer Manager"
              placeholder="All customer managers"
              searchPlaceholder="Search customer managers..."
              options={managerOptions}
              value={selectedManagerId}
              onChange={(value) => {
                setSelectedManagerId(value)
                setSelectedCustomerId(null)
              }}
              disabled={loading || managerOptions.length === 0}
              allLabel="All customer managers"
            />

            <SearchSelect
              title="Customer"
              placeholder="All customers"
              searchPlaceholder="Search customers..."
              options={customerOptions}
              value={selectedCustomerId}
              onChange={setSelectedCustomerId}
              disabled={loading || customerOptions.length === 0}
              allLabel="All customers"
            />

            <SearchSelect
              title="Year"
              placeholder="Select year"
              searchPlaceholder="Search year..."
              options={yearOptions}
              value={selectedYear}
              onChange={(value) => setSelectedYear(value ?? REPORT_YEARS[0])}
              allowClear={false}
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-muted-foreground">Loading report data...</p>
          </CardContent>
        </Card>
      ) : filteredCustomers.length === 0 ? (
        <EmptyState
          icon={Filter}
          title="No customers match this filter"
          description="Adjust team, customer manager, or customer selection to view KPIs."
        />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Showing KPI totals for {filteredCustomers.length} customer{filteredCustomers.length === 1 ? "" : "s"}
          </p>
            <p className="text-xs text-muted-foreground">Year: {selectedYear}</p>
          {kpiLoading ? (
            <Card>
              <CardContent className="py-8">
                <p className="text-sm text-muted-foreground">Calculating KPIs...</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Turnover
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{sekFormatter.format(kpis.turnover)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Invoices
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{numberFormatter.format(kpis.invoices)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Hours
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{hoursFormatter.format(kpis.hours)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Contract Value
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{sekFormatter.format(kpis.contractValue)}</p>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Time reporting</CardTitle>
              <p className="text-sm text-muted-foreground">
                Monthly breakdown for {selectedYear} based on the current role and filter scope.
              </p>
            </CardHeader>
            <CardContent>
              {timeReportingLoading ? (
                <p className="text-sm text-muted-foreground">Loading time reporting...</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-2 py-2 font-medium">Month</th>
                        <th className="px-2 py-2 font-medium">Customer Hours</th>
                        <th className="px-2 py-2 font-medium">Absence</th>
                        <th className="px-2 py-2 font-medium">Internal</th>
                        <th className="px-2 py-2 font-medium">Other</th>
                        <th className="px-2 py-2 font-medium">Total Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyTimeReporting.map((row) => (
                        <tr key={row.month} className="border-b last:border-0">
                          <td className="px-2 py-2">{row.label}</td>
                          <td className="px-2 py-2">{hoursFormatter.format(row.customerHours)}</td>
                          <td className="px-2 py-2">{hoursFormatter.format(row.absenceHours)}</td>
                          <td className="px-2 py-2">{hoursFormatter.format(row.internalHours)}</td>
                          <td className="px-2 py-2">{hoursFormatter.format(row.otherHours)}</td>
                          <td className="px-2 py-2">{hoursFormatter.format(row.totalHours)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {selectedCustomerId ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Customer Accruals</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {selectedCustomer?.name ?? "Selected customer"}
                  </p>
                </CardHeader>
                <CardContent>
                  {accrualsLoading ? (
                    <p className="text-sm text-muted-foreground">Loading accruals...</p>
                  ) : customerAccruals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No contract accruals found for this customer.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="px-2 py-2 font-medium">Contract</th>
                            <th className="px-2 py-2 font-medium">Description</th>
                            <th className="px-2 py-2 font-medium">Period</th>
                            <th className="px-2 py-2 font-medium">Start</th>
                            <th className="px-2 py-2 font-medium">End</th>
                            <th className="px-2 py-2 font-medium">Total</th>
                            <th className="px-2 py-2 font-medium">Annualized</th>
                            <th className="px-2 py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customerAccruals.map((accrual) => (
                            <tr key={accrual.id} className="border-b last:border-0">
                              <td className="px-2 py-2">{accrual.contract_number}</td>
                              <td className="px-2 py-2">{accrual.description ?? "-"}</td>
                              <td className="px-2 py-2">{accrual.period ?? "-"}</td>
                              <td className="px-2 py-2">{accrual.start_date ?? "-"}</td>
                              <td className="px-2 py-2">{accrual.end_date ?? "-"}</td>
                              <td className="px-2 py-2">{sekFormatter.format(Number(accrual.total ?? 0))}</td>
                              <td className="px-2 py-2">
                                {sekFormatter.format(annualizeContractTotal(accrual.total, accrual.period))}
                              </td>
                              <td className="px-2 py-2">{accrual.is_active ? "Active" : "Inactive"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Invoices</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {selectedCustomer?.name ?? "Selected customer"} · {selectedYear}
                  </p>
                </CardHeader>
                <CardContent>
                  {invoicesLoading ? (
                    <p className="text-sm text-muted-foreground">Loading invoices...</p>
                  ) : customerInvoices.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No invoices found for this customer in the selected range.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-sm">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="px-2 py-2 font-medium">Invoice #</th>
                            <th className="px-2 py-2 font-medium">Date</th>
                            <th className="px-2 py-2 font-medium">Customer</th>
                            <th className="px-2 py-2 font-medium">Total</th>
                            <th className="px-2 py-2 font-medium">Balance</th>
                            <th className="px-2 py-2 font-medium">Currency</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customerInvoices.map((invoice) => (
                            <tr key={invoice.id} className="border-b last:border-0">
                              <td className="px-2 py-2">{invoice.document_number}</td>
                              <td className="px-2 py-2">{invoice.invoice_date ?? "-"}</td>
                              <td className="px-2 py-2">{invoice.customer_name ?? selectedCustomer?.name ?? "-"}</td>
                              <td className="px-2 py-2">{sekFormatter.format(Number(invoice.total ?? 0))}</td>
                              <td className="px-2 py-2">{sekFormatter.format(Number(invoice.balance ?? 0))}</td>
                              <td className="px-2 py-2">{invoice.currency_code}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
