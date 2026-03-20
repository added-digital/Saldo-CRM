"use client"

import * as React from "react"
import { Check, ChevronDown, Filter } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/use-user"
import type { Customer, CustomerWithRelations, Profile, Team } from "@/types/database"
import { CustomerKpiCards } from "@/components/app/customer-kpi-view"
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
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const REPORTS_MIN_DATE = "2025-01-01"

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function clampDate(value: string, min: string, max: string): string {
  if (!value) return min
  if (value < min) return min
  if (value > max) return max
  return value
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
  const [fromDate, setFromDate] = React.useState<string>(REPORTS_MIN_DATE)
  const [toDate, setToDate] = React.useState<string>(todayIsoDate())

  const maxDate = React.useMemo(() => todayIsoDate(), [])

  const showTeamFilter = isAdmin || user.role === "team_lead"

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
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          team_id: user.team_id,
          fortnox_cost_center: user.fortnox_cost_center,
        },
      ]
    }

    if (scopedManagers.length === 0) {
      scopedManagers = [
        {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          team_id: user.team_id,
          fortnox_cost_center: user.fortnox_cost_center,
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
      setSelectedManagerId(user.id)
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
          <div className="grid gap-4 lg:grid-cols-5">
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
                allLabel="All teams"
              />
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium">Team</p>
                <Button variant="outline" className="w-full justify-start" disabled>
                  Team filtering is not available for your role
                </Button>
              </div>
            )}

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

            <div className="space-y-2">
              <p className="text-sm font-medium">From</p>
              <Input
                type="date"
                min={REPORTS_MIN_DATE}
                max={toDate}
                value={fromDate}
                onChange={(event) => {
                  const next = clampDate(event.target.value, REPORTS_MIN_DATE, toDate)
                  setFromDate(next)
                }}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">To</p>
              <Input
                type="date"
                min={fromDate}
                max={maxDate}
                value={toDate}
                onChange={(event) => {
                  const next = clampDate(event.target.value, fromDate, maxDate)
                  setToDate(next)
                }}
              />
            </div>
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
          <p className="text-xs text-muted-foreground">
            Date range: {fromDate} to {toDate}
          </p>
          <CustomerKpiCards customers={filteredCustomers} />
        </div>
      )}
    </div>
  )
}
