"use client";

import * as React from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Check, ChevronDown, Filter } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";

import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import type {
  ContractAccrual,
  Customer,
  CustomerWithRelations,
  Profile,
  Team,
} from "@/types/database";
import { EmptyState } from "@/components/app/empty-state";
import { DataTable } from "@/components/app/data-table";
import { KpiCards } from "@/components/app/kpi-cards";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const REPORTS_MANAGER_ALIAS: Record<string, string> = {
  "added@saldoredo.se": "Matias.a@saldoredo.se",
};

const REPORT_MONTH_OPTIONS_COUNT = 36;

const sekFormatter = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});

const hoursFormatter = new Intl.NumberFormat("sv-SE", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

function invoiceTurnoverExVat(input: {
  total_ex_vat: number | null;
  total: number | null;
}): number {
  return Number(input.total_ex_vat ?? input.total ?? 0);
}

function toMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function parseMonthKey(monthKey: string): { year: number; month: number } {
  const [yearPart, monthPart] = monthKey.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }

  return { year, month };
}

function createMonthOptions(count: number): SelectOption[] {
  const monthFormatter = new Intl.DateTimeFormat("sv-SE", {
    month: "long",
    year: "numeric",
  });
  const now = new Date();
  const options: SelectOption[] = [];

  for (let i = 0; i < count; i += 1) {
    const valueDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      id: toMonthKey(valueDate),
      label: monthFormatter.format(valueDate),
    });
  }

  return options;
}

type RollingMonth = {
  key: string;
  label: string;
  year: number;
  month: number;
};

function getRollingMonthRange(selectedMonthKey: string): {
  from: string;
  to: string;
  months: RollingMonth[];
  title: string;
} {
  const { year, month } = parseMonthKey(selectedMonthKey);
  const endDate = new Date(year, month, 0);
  const startDate = new Date(year, month - 12, 1);
  const monthLabelFormatter = new Intl.DateTimeFormat("sv-SE", {
    month: "short",
    year: "numeric",
  });
  const titleFormatter = new Intl.DateTimeFormat("sv-SE", {
    month: "long",
    year: "numeric",
  });
  const months: RollingMonth[] = [];

  for (let i = 0; i < 12; i += 1) {
    const monthDate = new Date(
      startDate.getFullYear(),
      startDate.getMonth() + i,
      1,
    );
    months.push({
      key: toMonthKey(monthDate),
      label: monthLabelFormatter.format(monthDate),
      year: monthDate.getFullYear(),
      month: monthDate.getMonth() + 1,
    });
  }

  return {
    from: toMonthKey(startDate) + "-01",
    to: endDate.toISOString().slice(0, 10),
    months,
    title: titleFormatter.format(new Date(year, month - 1, 1)),
  };
}

function getMonthDateRange(monthKey: string): { from: string; to: string } {
  const { year, month } = parseMonthKey(monthKey);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  return {
    from: toMonthKey(firstDay) + "-01",
    to: lastDay.toISOString().slice(0, 10),
  };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function annualizeContractTotal(
  total: number | null,
  period: string | null,
): number {
  const base = Number(total ?? 0);
  const periodNumber = Number(period ?? "");

  if (periodNumber === 1) return base * 12;
  if (periodNumber === 3) return base * 4;
  return base;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeIdentifier(value: string | null | undefined): string {
  return (value ?? "").trim();
}

type TeamOption = Pick<Team, "id" | "name">;

type ManagerOption = Pick<
  Profile,
  | "id"
  | "full_name"
  | "email"
  | "team_id"
  | "fortnox_cost_center"
  | "fortnox_employee_id"
  | "fortnox_user_id"
  | "fortnox_group_name"
>;

type SelectOption = {
  id: string;
  label: string;
  subLabel?: string;
};

type SearchSelectProps = {
  placeholder: string;
  searchPlaceholder: string;
  options: SelectOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  allLabel?: string;
  allowClear?: boolean;
};

type MonthlyTimeReportingRow = {
  monthKey: string;
  monthLabel: string;
  customerHours: number;
  absenceHours: number;
  internalHours: number;
  totalHours: number;
};

type CustomerTimeReportingRow = {
  contributorKey: string;
  contributorId: string | null;
  contributorName: string;
  groupName: string;
  customerHours: number;
  workloadPercentage: number;
};

type CustomerMonthlyEconomicsRow = {
  monthKey: string;
  monthLabel: string;
  turnover: number;
  hours: number;
  turnoverPerHour: number;
};

type TurnoverMonthRow = {
  monthKey: string;
  monthLabel: string;
  turnover: number;
};

type TimeDetailMetric =
  | "customerHours"
  | "absenceHours"
  | "internalHours"
  | "otherHours"
  | "totalHours";

type TimeDetailRow = {
  id: string;
  reportDate: string | null;
  customerName: string | null;
  employeeName: string | null;
  entryType: string | null;
  projectName: string | null;
  activity: string | null;
  description: string | null;
  hours: number;
};

type InvoiceDetailRow = {
  id: string;
  documentNumber: string;
  invoiceDate: string | null;
  dueDate: string | null;
  turnover: number;
  currencyCode: string;
};

function metricLabel(metric: TimeDetailMetric): string {
  if (metric === "customerHours") return "Customer Hours";
  if (metric === "absenceHours") return "Absence";
  if (metric === "internalHours") return "Internal";
  if (metric === "otherHours") return "Other";
  return "Total Hours";
}

function createEmptyMonthlyTimeReportingRows(
  months: RollingMonth[],
): MonthlyTimeReportingRow[] {
  return months.map((month) => ({
    monthKey: month.key,
    monthLabel: month.label,
    customerHours: 0,
    absenceHours: 0,
    internalHours: 0,
    totalHours: 0,
  }));
}

function createEmptyTurnoverRows(months: RollingMonth[]): TurnoverMonthRow[] {
  return months.map((month) => ({
    monthKey: month.key,
    monthLabel: month.label,
    turnover: 0,
  }));
}

const turnoverChartConfig = {
  turnover: {
    label: "Turnover - ex. VAT",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

function SearchSelect({
  placeholder,
  searchPlaceholder,
  options,
  value,
  onChange,
  disabled = false,
  allLabel = "All",
  allowClear = true,
}: SearchSelectProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((option) => option.id === value) ?? null;

  return (
    <div>
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
        <PopoverContent
          className="w-(--radix-popover-trigger-width) p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              {allowClear ? (
                <CommandItem
                  key="all"
                  value={allLabel}
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-4",
                      value === null ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span>{allLabel}</span>
                </CommandItem>
              ) : null}
              <CommandEmpty>No options found.</CommandEmpty>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`${option.label} ${option.subLabel ?? ""}`}
                  onSelect={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-4",
                      value === option.id ? "opacity-100" : "opacity-0",
                    )}
                  />
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
  );
}

export default function ReportsPage() {
  const { user, isAdmin } = useUser();

  const [loading, setLoading] = React.useState(true);
  const [teams, setTeams] = React.useState<TeamOption[]>([]);
  const [managers, setManagers] = React.useState<ManagerOption[]>([]);
  const [customers, setCustomers] = React.useState<CustomerWithRelations[]>([]);

  const [selectedTeamId, setSelectedTeamId] = React.useState<string | null>(
    null,
  );
  const [selectedManagerId, setSelectedManagerId] = React.useState<
    string | null
  >(null);
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<
    string | null
  >(null);
  const [selectedMonth, setSelectedMonth] = React.useState<string>(() =>
    toMonthKey(new Date()),
  );
  const [kpiLoading, setKpiLoading] = React.useState(false);
  const [kpis, setKpis] = React.useState({
    turnover: 0,
    invoices: 0,
    hours: 0,
    contractValue: 0,
  });
  const [accrualsLoading, setAccrualsLoading] = React.useState(false);
  const [customerAccruals, setCustomerAccruals] = React.useState<
    ContractAccrual[]
  >([]);
  const [customerMonthlyEconomicsLoading, setCustomerMonthlyEconomicsLoading] =
    React.useState(false);
  const [customerMonthlyEconomicsRows, setCustomerMonthlyEconomicsRows] =
    React.useState<CustomerMonthlyEconomicsRow[]>([]);
  const [monthlyTimeReportingLoading, setMonthlyTimeReportingLoading] =
    React.useState(false);
  const [monthlyTimeReportingRows, setMonthlyTimeReportingRows] =
    React.useState<MonthlyTimeReportingRow[]>([]);
  const [customerTimeReportingLoading, setCustomerTimeReportingLoading] =
    React.useState(false);
  const [customerTimeReportingRows, setCustomerTimeReportingRows] =
    React.useState<CustomerTimeReportingRow[]>([]);
  const [timeDetailsOpen, setTimeDetailsOpen] = React.useState(false);
  const [timeDetailsLoading, setTimeDetailsLoading] = React.useState(false);
  const [timeDetailsTitle, setTimeDetailsTitle] = React.useState("");
  const [timeDetailsRows, setTimeDetailsRows] = React.useState<TimeDetailRow[]>(
    [],
  );
  const [invoiceDetailsOpen, setInvoiceDetailsOpen] = React.useState(false);
  const [invoiceDetailsLoading, setInvoiceDetailsLoading] =
    React.useState(false);
  const [invoiceDetailsTitle, setInvoiceDetailsTitle] = React.useState("");
  const [invoiceDetailsRows, setInvoiceDetailsRows] = React.useState<
    InvoiceDetailRow[]
  >([]);
  const [turnoverByMonthRows, setTurnoverByMonthRows] = React.useState<
    TurnoverMonthRow[]
  >([]);

  const showTeamFilter = isAdmin || user.role === "team_lead";
  const teamFilterDisabled = user.role === "team_lead" && !isAdmin;
  const filterGridClass = showTeamFilter ? "lg:grid-cols-4" : "lg:grid-cols-3";
  const monthOptions = React.useMemo<SelectOption[]>(
    () => createMonthOptions(REPORT_MONTH_OPTIONS_COUNT),
    [],
  );
  const rollingWindow = React.useMemo(
    () => getRollingMonthRange(selectedMonth),
    [selectedMonth],
  );

  const teamOptions = React.useMemo<SelectOption[]>(
    () => teams.map((team) => ({ id: team.id, label: team.name })),
    [teams],
  );

  const availableManagers = React.useMemo(() => {
    if (!selectedTeamId) return managers;
    return managers.filter((manager) => manager.team_id === selectedTeamId);
  }, [managers, selectedTeamId]);

  const managerOptions = React.useMemo<SelectOption[]>(
    () =>
      availableManagers.map((manager) => ({
        id: manager.id,
        label: manager.full_name ?? manager.email,
        subLabel: manager.email,
      })),
    [availableManagers],
  );

  const teamScopedCustomers = React.useMemo(() => {
    if (!selectedTeamId) return customers;
    const allowedManagerIds = new Set(
      availableManagers.map((manager) => manager.id),
    );
    return customers.filter(
      (customer) =>
        customer.account_manager &&
        allowedManagerIds.has(customer.account_manager.id),
    );
  }, [customers, selectedTeamId, availableManagers]);

  const managerScopedCustomers = React.useMemo(() => {
    if (!selectedManagerId) return teamScopedCustomers;
    return teamScopedCustomers.filter(
      (customer) => customer.account_manager?.id === selectedManagerId,
    );
  }, [teamScopedCustomers, selectedManagerId]);

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
  );

  const filteredCustomers = React.useMemo(() => {
    if (!selectedCustomerId) return managerScopedCustomers;
    return managerScopedCustomers.filter(
      (customer) => customer.id === selectedCustomerId,
    );
  }, [managerScopedCustomers, selectedCustomerId]);

  const selectedCustomer = React.useMemo(
    () => filteredCustomers[0] ?? null,
    [filteredCustomers],
  );

  const teamNameById = React.useMemo(() => {
    return new Map(teams.map((team) => [team.id, team.name]));
  }, [teams]);

  const managerByFortnoxUserId = React.useMemo(() => {
    const map = new Map<string, ManagerOption>();
    for (const manager of managers) {
      const normalized = normalizeIdentifier(manager.fortnox_user_id);
      if (normalized) {
        map.set(normalized, manager);
      }
    }
    return map;
  }, [managers]);

  const managerByFortnoxEmployeeId = React.useMemo(() => {
    const map = new Map<string, ManagerOption>();
    for (const manager of managers) {
      const normalized = normalizeIdentifier(manager.fortnox_employee_id);
      if (normalized) {
        map.set(normalized, manager);
      }
    }
    return map;
  }, [managers]);

  const managerByName = React.useMemo(() => {
    const map = new Map<string, ManagerOption>();
    for (const manager of managers) {
      const keys = [manager.full_name, manager.email];
      for (const key of keys) {
        const normalized = normalizeText(key);
        if (normalized && !map.has(normalized)) {
          map.set(normalized, manager);
        }
      }
    }
    return map;
  }, [managers]);

  function matchesMetric(
    entryType: string | null,
    metric: TimeDetailMetric,
  ): boolean {
    if (metric === "totalHours") return true;

    const normalized = (entryType ?? "").toLowerCase();
    if (metric === "customerHours") return normalized === "time";
    if (metric === "absenceHours") return normalized === "absence";
    if (metric === "internalHours") return normalized === "internal";
    return (
      normalized !== "time" &&
      normalized !== "absence" &&
      normalized !== "internal"
    );
  }

  function formatTimeDetailRows(
    rows: Array<{
      id: string;
      report_date: string | null;
      customer_name: string | null;
      employee_id: string | null;
      employee_name: string | null;
      entry_type: string | null;
      project_name: string | null;
      activity: string | null;
      description: string | null;
      hours: number | null;
    }>,
    metric: TimeDetailMetric,
  ): TimeDetailRow[] {
    return rows
      .filter((row) => matchesMetric(row.entry_type, metric))
      .map((row) => {
        const mappedContributorName = row.employee_id
          ? ((
              managerByFortnoxUserId.get(
                normalizeIdentifier(row.employee_id),
              ) ??
              managerByFortnoxEmployeeId.get(
                normalizeIdentifier(row.employee_id),
              )
            )?.full_name ?? null)
          : null;

        return {
          id: row.id,
          reportDate: row.report_date,
          customerName: row.customer_name,
          employeeName: mappedContributorName ?? row.employee_name,
          entryType: row.entry_type,
          projectName: row.project_name,
          activity: row.activity,
          description: row.description,
          hours: Number(row.hours ?? 0),
        };
      })
      .sort((a, b) => (b.reportDate ?? "").localeCompare(a.reportDate ?? ""));
  }

  function renderHourCell(value: number, onClick?: () => void) {
    if (value === 0 || !onClick) {
      return <span>{hoursFormatter.format(value)}</span>;
    }

    return (
      <button
        type="button"
        onClick={onClick}
        className="font-medium underline underline-offset-2 hover:text-foreground"
      >
        {hoursFormatter.format(value)}
      </button>
    );
  }

  function renderTurnoverCell(value: number, onClick?: () => void) {
    if (value === 0 || !onClick) {
      return <span>{sekFormatter.format(value)}</span>;
    }

    return (
      <button
        type="button"
        onClick={onClick}
        className="font-medium underline underline-offset-2 hover:text-foreground"
      >
        {sekFormatter.format(value)}
      </button>
    );
  }

  async function openCustomerTimeDetails(
    row: CustomerTimeReportingRow,
    metric: TimeDetailMetric,
  ) {
    if (!selectedCustomerId) return;

    setTimeDetailsOpen(true);
    setTimeDetailsLoading(true);
    setTimeDetailsRows([]);
    setTimeDetailsTitle(
      `${selectedCustomer?.name ?? "Selected customer"} · ${row.contributorName} · ${metricLabel(metric)} · ${rollingWindow.title}`,
    );

    let query = createClient()
      .from("time_reports")
      .select(
        "id, report_date, customer_name, employee_id, employee_name, entry_type, project_name, activity, description, hours",
      )
      .gte("report_date", rollingWindow.from)
      .lte("report_date", rollingWindow.to);

    if (selectedCustomer?.fortnox_customer_number) {
      query = query.or(
        `customer_id.eq.${selectedCustomerId},fortnox_customer_number.eq.${selectedCustomer.fortnox_customer_number}`,
      );
    } else {
      query = query.eq("customer_id", selectedCustomerId);
    }

    if (row.contributorId) {
      query = query.eq("employee_id", row.contributorId);
    } else {
      query = query
        .is("employee_id", null)
        .eq("employee_name", row.contributorName);
    }

    const { data, error } = await query;

    if (error) {
      setTimeDetailsRows([]);
      setTimeDetailsLoading(false);
      return;
    }

    const detailRows = formatTimeDetailRows(
      (data ?? []) as Array<{
        id: string;
        report_date: string | null;
        customer_name: string | null;
        employee_id: string | null;
        employee_name: string | null;
        entry_type: string | null;
        project_name: string | null;
        activity: string | null;
        description: string | null;
        hours: number | null;
      }>,
      metric,
    );

    setTimeDetailsRows(detailRows);
    setTimeDetailsLoading(false);
  }

  async function openMonthlyTimeDetails(
    row: MonthlyTimeReportingRow,
    metric: TimeDetailMetric,
  ) {
    if (filteredCustomers.length === 0) return;

    const { from, to } = getMonthDateRange(row.monthKey);
    const customerScope = filteredCustomers.map((customer) => ({
      id: customer.id,
      fortnoxCustomerNumber: customer.fortnox_customer_number,
    }));
    const customerScopeChunks = chunkArray(customerScope, 200);

    setTimeDetailsOpen(true);
    setTimeDetailsLoading(true);
    setTimeDetailsRows([]);
    setTimeDetailsTitle(`${row.monthLabel} · ${metricLabel(metric)}`);

    const supabase = createClient();
    const allRows: Array<{
      id: string;
      report_date: string | null;
      customer_name: string | null;
      employee_id: string | null;
      employee_name: string | null;
      entry_type: string | null;
      project_name: string | null;
      activity: string | null;
      description: string | null;
      hours: number | null;
    }> = [];
    const seenRowIds = new Set<string>();

    function addRows(
      rows: Array<{
        id: string;
        report_date: string | null;
        customer_name: string | null;
        employee_id: string | null;
        employee_name: string | null;
        entry_type: string | null;
        project_name: string | null;
        activity: string | null;
        description: string | null;
        hours: number | null;
      }>,
    ) {
      for (const reportRow of rows) {
        if (seenRowIds.has(reportRow.id)) continue;
        seenRowIds.add(reportRow.id);
        allRows.push(reportRow);
      }
    }

    for (const scopeChunk of customerScopeChunks) {
      const customerIds = scopeChunk.map((customer) => customer.id);
      const customerNumbers = scopeChunk
        .map((customer) => customer.fortnoxCustomerNumber)
        .filter((value): value is string => Boolean(value));

      if (customerIds.length > 0) {
        const { data, error } = await supabase
          .from("time_reports")
          .select(
            "id, report_date, customer_name, employee_id, employee_name, entry_type, project_name, activity, description, hours",
          )
          .in("customer_id", customerIds)
          .gte("report_date", from)
          .lte("report_date", to);

        if (error) {
          setTimeDetailsRows([]);
          setTimeDetailsLoading(false);
          return;
        }

        addRows(
          (data ?? []) as Array<{
            id: string;
            report_date: string | null;
            customer_name: string | null;
            employee_id: string | null;
            employee_name: string | null;
            entry_type: string | null;
            project_name: string | null;
            activity: string | null;
            description: string | null;
            hours: number | null;
          }>,
        );
      }

      if (customerNumbers.length > 0) {
        const { data, error } = await supabase
          .from("time_reports")
          .select(
            "id, report_date, customer_name, employee_id, employee_name, entry_type, project_name, activity, description, hours",
          )
          .in("fortnox_customer_number", customerNumbers)
          .gte("report_date", from)
          .lte("report_date", to);

        if (error) {
          setTimeDetailsRows([]);
          setTimeDetailsLoading(false);
          return;
        }

        addRows(
          (data ?? []) as Array<{
            id: string;
            report_date: string | null;
            customer_name: string | null;
            employee_id: string | null;
            employee_name: string | null;
            entry_type: string | null;
            project_name: string | null;
            activity: string | null;
            description: string | null;
            hours: number | null;
          }>,
        );
      }
    }

    const detailRows = formatTimeDetailRows(allRows, metric);
    setTimeDetailsRows(detailRows);
    setTimeDetailsLoading(false);
  }

  async function openMonthlyInvoiceDetails(row: CustomerMonthlyEconomicsRow) {
    if (!selectedCustomerId) return;

    const { from, to } = getMonthDateRange(row.monthKey);

    setInvoiceDetailsOpen(true);
    setInvoiceDetailsLoading(true);
    setInvoiceDetailsRows([]);
    setInvoiceDetailsTitle(
      `${selectedCustomer?.name ?? "Selected customer"} · ${row.monthLabel} · Turnover - ex. VAT`,
    );

    const supabase = createClient();
    const withCustomerScope = (query: ReturnType<typeof supabase.from>) => {
      let scoped = query.gte("invoice_date", from).lte("invoice_date", to);
      if (selectedCustomer?.fortnox_customer_number) {
        scoped = scoped.or(
          `customer_id.eq.${selectedCustomerId},fortnox_customer_number.eq.${selectedCustomer.fortnox_customer_number}`,
        );
      } else {
        scoped = scoped.eq("customer_id", selectedCustomerId);
      }
      return scoped.order("invoice_date", { ascending: false });
    };

    let dueDateAvailable = true;
    let dueDateRows: Array<{
      id: string;
      document_number: string;
      invoice_date: string | null;
      due_date: string | null;
      total_ex_vat: number | null;
      total: number | null;
      currency_code: string | null;
    }> = [];

    const withDueDate = await withCustomerScope(
      supabase
        .from("invoices")
        .select(
          "id, document_number, invoice_date, due_date, total_ex_vat, total, currency_code",
        ),
    );

    if (withDueDate.error && withDueDate.error.message.includes("due_date")) {
      dueDateAvailable = false;
    } else if (withDueDate.error) {
      setInvoiceDetailsRows([]);
      setInvoiceDetailsLoading(false);
      return;
    } else {
      dueDateRows = (withDueDate.data ?? []) as Array<{
        id: string;
        document_number: string;
        invoice_date: string | null;
        due_date: string | null;
        total_ex_vat: number | null;
        total: number | null;
        currency_code: string | null;
      }>;
    }

    if (!dueDateAvailable) {
      const withoutDueDate = await withCustomerScope(
        supabase
          .from("invoices")
          .select(
            "id, document_number, invoice_date, total_ex_vat, total, currency_code",
          ),
      );

      if (withoutDueDate.error) {
        setInvoiceDetailsRows([]);
        setInvoiceDetailsLoading(false);
        return;
      }

      const rows = (withoutDueDate.data ?? []) as Array<{
        id: string;
        document_number: string;
        invoice_date: string | null;
        total_ex_vat: number | null;
        total: number | null;
        currency_code: string | null;
      }>;

      setInvoiceDetailsRows(
        rows.map((invoice) => ({
          id: invoice.id,
          documentNumber: invoice.document_number,
          invoiceDate: invoice.invoice_date,
          dueDate: null,
          turnover: invoiceTurnoverExVat(invoice),
          currencyCode: invoice.currency_code ?? "SEK",
        })),
      );
      setInvoiceDetailsLoading(false);
      return;
    }

    setInvoiceDetailsRows(
      dueDateRows.map((invoice) => ({
        id: invoice.id,
        documentNumber: invoice.document_number,
        invoiceDate: invoice.invoice_date,
        dueDate: invoice.due_date,
        turnover: invoiceTurnoverExVat(invoice),
        currencyCode: invoice.currency_code ?? "SEK",
      })),
    );
    setInvoiceDetailsLoading(false);
  }

  React.useEffect(() => {
    if (
      selectedManagerId &&
      !availableManagers.some((m) => m.id === selectedManagerId)
    ) {
      setSelectedManagerId(null);
      setSelectedCustomerId(null);
    }
  }, [availableManagers, selectedManagerId]);

  React.useEffect(() => {
    if (
      selectedCustomerId &&
      !managerScopedCustomers.some((c) => c.id === selectedCustomerId)
    ) {
      setSelectedCustomerId(null);
    }
  }, [managerScopedCustomers, selectedCustomerId]);

  const fetchReportData = React.useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const aliasedManagerEmail =
      REPORTS_MANAGER_ALIAS[user.email.toLowerCase()] ?? null;
    let effectiveProfile: Pick<
      Profile,
      | "id"
      | "full_name"
      | "email"
      | "team_id"
      | "fortnox_cost_center"
      | "fortnox_employee_id"
      | "fortnox_user_id"
      | "fortnox_group_name"
    > = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      team_id: user.team_id,
      fortnox_cost_center: user.fortnox_cost_center,
      fortnox_employee_id: user.fortnox_employee_id,
      fortnox_user_id: user.fortnox_user_id,
      fortnox_group_name: user.fortnox_group_name,
    };

    if (aliasedManagerEmail && user.role === "user") {
      const { data: aliasedProfile } = await supabase
        .from("profiles")
        .select(
          "id, full_name, email, team_id, fortnox_cost_center, fortnox_employee_id, fortnox_user_id, fortnox_group_name",
        )
        .ilike("email", aliasedManagerEmail)
        .limit(1)
        .maybeSingle();

      if (aliasedProfile) {
        effectiveProfile = aliasedProfile as Pick<
          Profile,
          | "id"
          | "full_name"
          | "email"
          | "team_id"
          | "fortnox_cost_center"
          | "fortnox_employee_id"
          | "fortnox_user_id"
          | "fortnox_group_name"
        >;
      }
    }

    let scopedTeams: TeamOption[] = [];
    let scopedManagers: ManagerOption[] = [];

    if (isAdmin) {
      const [{ data: teamRows }, { data: profileRows }] = await Promise.all([
        supabase.from("teams").select("id, name"),
        supabase
          .from("profiles")
          .select(
            "id, full_name, email, team_id, fortnox_cost_center, fortnox_employee_id, fortnox_user_id, fortnox_group_name",
          )
          .eq("is_active", true),
      ]);

      const allTeams = (teamRows ?? []) as TeamOption[];
      const allProfiles = (profileRows ?? []) as ManagerOption[];

      scopedTeams = allTeams.map((team) => ({ id: team.id, name: team.name }));
      scopedManagers = allProfiles;
    } else if (user.role === "team_lead") {
      const { data: ledTeamRows } = await supabase
        .from("teams")
        .select("id, name")
        .eq("lead_id", user.id);

      const ledTeams = (ledTeamRows ?? []) as TeamOption[];
      const ledTeamIds = new Set(ledTeams.map((team) => team.id));

      scopedTeams = ledTeams.map((team) => ({ id: team.id, name: team.name }));

      if (ledTeams.length > 0) {
        const { data: teamProfiles } = await supabase
          .from("profiles")
          .select(
            "id, full_name, email, team_id, fortnox_cost_center, fortnox_employee_id, fortnox_user_id, fortnox_group_name",
          )
          .eq("is_active", true)
          .in("team_id", Array.from(ledTeamIds));

        scopedManagers = (teamProfiles ?? []) as ManagerOption[];
      }
    } else {
      scopedManagers = [
        {
          id: effectiveProfile.id,
          full_name: effectiveProfile.full_name,
          email: effectiveProfile.email,
          team_id: effectiveProfile.team_id,
          fortnox_cost_center: effectiveProfile.fortnox_cost_center,
          fortnox_employee_id: effectiveProfile.fortnox_employee_id,
          fortnox_user_id: effectiveProfile.fortnox_user_id,
          fortnox_group_name: effectiveProfile.fortnox_group_name,
        },
      ];
    }

    if (scopedManagers.length === 0) {
      scopedManagers = [
        {
          id: effectiveProfile.id,
          full_name: effectiveProfile.full_name,
          email: effectiveProfile.email,
          team_id: effectiveProfile.team_id,
          fortnox_cost_center: effectiveProfile.fortnox_cost_center,
          fortnox_employee_id: effectiveProfile.fortnox_employee_id,
          fortnox_user_id: effectiveProfile.fortnox_user_id,
          fortnox_group_name: effectiveProfile.fortnox_group_name,
        },
      ];
    }

    const sortedManagers = scopedManagers.sort((a, b) =>
      (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email),
    );

    const managerByCostCenter = new Map<string, ManagerOption>();
    const allowedCostCenters: string[] = [];
    for (const manager of sortedManagers) {
      if (
        manager.fortnox_cost_center &&
        !managerByCostCenter.has(manager.fortnox_cost_center)
      ) {
        managerByCostCenter.set(manager.fortnox_cost_center, manager);
        allowedCostCenters.push(manager.fortnox_cost_center);
      }
    }

    const PAGE_SIZE = 1000;
    let allCustomers: Customer[] = [];
    let from = 0;

    if (!isAdmin && allowedCostCenters.length === 0) {
      allCustomers = [];
    }

    while (isAdmin || allowedCostCenters.length > 0) {
      let query = supabase
        .from("customers")
        .select("*")
        .eq("status", "active")
        .order("name")
        .range(from, from + PAGE_SIZE - 1);

      if (!isAdmin) {
        query = query.in("fortnox_cost_center", allowedCostCenters);
      }

      const { data } = await query;

      const rows = (data ?? []) as Customer[];
      if (rows.length === 0) break;

      allCustomers = allCustomers.concat(rows);
      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    const scopedManagerIds = new Set(
      sortedManagers.map((manager) => manager.id),
    );

    const enrichedCustomers: CustomerWithRelations[] = allCustomers
      .map((customer) => {
        const manager = customer.fortnox_cost_center
          ? (managerByCostCenter.get(customer.fortnox_cost_center) ?? null)
          : null;

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
        };
      })
      .filter(
        (customer) =>
          customer.status === "active" &&
          customer.account_manager &&
          scopedManagerIds.has(customer.account_manager.id),
      );

    setTeams(scopedTeams);
    setManagers(sortedManagers);
    setCustomers(enrichedCustomers);

    if (user.role === "user") {
      setSelectedManagerId(effectiveProfile.id);
      setSelectedTeamId(null);
    } else if (user.role === "team_lead" && scopedTeams.length === 1) {
      setSelectedTeamId(scopedTeams[0].id);
      setSelectedManagerId(null);
    } else {
      setSelectedTeamId(null);
      setSelectedManagerId(null);
    }

    setSelectedCustomerId(null);
    setLoading(false);
  }, [
    isAdmin,
    user.email,
    user.id,
    user.full_name,
    user.team_id,
    user.fortnox_cost_center,
    user.fortnox_employee_id,
    user.fortnox_user_id,
    user.fortnox_group_name,
    user.role,
  ]);

  React.useEffect(() => {
    void fetchReportData();
  }, [fetchReportData]);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchDateScopedKpis() {
      if (filteredCustomers.length === 0) {
        setKpis({ turnover: 0, invoices: 0, hours: 0, contractValue: 0 });
        setTurnoverByMonthRows(createEmptyTurnoverRows(rollingWindow.months));
        setKpiLoading(false);
        return;
      }

      setKpiLoading(true);
      const supabase = createClient();
      const customerIds = filteredCustomers.map((customer) => customer.id);
      const customerIdChunks = chunkArray(customerIds, 200);
      const monthKeys = new Set(rollingWindow.months.map((month) => month.key));
      const monthNumbers = Array.from(
        new Set(rollingWindow.months.map((month) => month.month)),
      );
      const years = Array.from(
        new Set(rollingWindow.months.map((month) => month.year)),
      );

      let turnover = 0;
      let invoiceCount = 0;
      let hours = 0;
      let contractValue = 0;
      const turnoverByMonth = new Map<string, TurnoverMonthRow>();
      for (const row of createEmptyTurnoverRows(rollingWindow.months)) {
        turnoverByMonth.set(row.monthKey, row);
      }

      for (const idChunk of customerIdChunks) {
        if (cancelled) return;

        const { data: kpiRows, error: kpiError } = await supabase
          .from("customer_kpis")
          .select(
            "period_year, period_month, total_turnover, invoice_count, total_hours, contract_value",
          )
          .in("customer_id", idChunk)
          .eq("period_type", "month")
          .in("period_year", years)
          .in("period_month", monthNumbers);

        if (kpiError) {
          throw kpiError;
        }

        const rows = (kpiRows ?? []) as Array<{
          period_year: number;
          period_month: number;
          total_turnover: number | null;
          invoice_count: number | null;
          total_hours: number | null;
          contract_value: number | null;
        }>;

        for (const row of rows) {
          const monthKey = `${row.period_year}-${String(row.period_month).padStart(2, "0")}`;
          if (!monthKeys.has(monthKey)) continue;

          turnover += Number(row.total_turnover ?? 0);
          invoiceCount += Number(row.invoice_count ?? 0);
          hours += Number(row.total_hours ?? 0);
          contractValue += Number(row.contract_value ?? 0);

          const target = turnoverByMonth.get(monthKey);
          if (target) {
            target.turnover += Number(row.total_turnover ?? 0);
          }
        }
      }

      if (cancelled) return;

      setKpis({
        turnover,
        invoices: invoiceCount,
        hours,
        contractValue,
      });
      setTurnoverByMonthRows(
        rollingWindow.months.map(
          (month) =>
            turnoverByMonth.get(month.key) ?? {
              monthKey: month.key,
              monthLabel: month.label,
              turnover: 0,
            },
        ),
      );
      setKpiLoading(false);
    }

    fetchDateScopedKpis().catch(() => {
      if (!cancelled) {
        setKpis({ turnover: 0, invoices: 0, hours: 0, contractValue: 0 });
        setTurnoverByMonthRows(createEmptyTurnoverRows(rollingWindow.months));
        setKpiLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [filteredCustomers, rollingWindow]);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchMonthlyTimeReporting() {
      if (selectedCustomerId || filteredCustomers.length === 0) {
        setMonthlyTimeReportingRows([]);
        setMonthlyTimeReportingLoading(false);
        return;
      }

      setMonthlyTimeReportingLoading(true);
      const supabase = createClient();
      const rowsByMonth = new Map<string, MonthlyTimeReportingRow>();
      for (const row of createEmptyMonthlyTimeReportingRows(
        rollingWindow.months,
      )) {
        rowsByMonth.set(row.monthKey, row);
      }

      const customerIds = filteredCustomers.map((customer) => customer.id);
      const customerIdChunks = chunkArray(customerIds, 200);
      const monthNumbers = Array.from(
        new Set(rollingWindow.months.map((month) => month.month)),
      );
      const years = Array.from(
        new Set(rollingWindow.months.map((month) => month.year)),
      );

      for (const idChunk of customerIdChunks) {
        if (cancelled) return;

        const { data, error } = await supabase
          .from("customer_kpis")
          .select(
            "period_year, period_month, customer_hours, absence_hours, internal_hours",
          )
          .in("customer_id", idChunk)
          .eq("period_type", "month")
          .in("period_year", years)
          .in("period_month", monthNumbers);

        if (error) {
          throw error;
        }

        const rows = (data ?? []) as Array<{
          period_year: number;
          period_month: number;
          customer_hours: number | null;
          absence_hours: number | null;
          internal_hours: number | null;
        }>;

        for (const row of rows) {
          const monthKey = `${row.period_year}-${String(row.period_month).padStart(2, "0")}`;
          const target = rowsByMonth.get(monthKey);
          if (!target) continue;

          const customerHours = Number(row.customer_hours ?? 0);
          const absenceHours = Number(row.absence_hours ?? 0);
          const internalHours = Number(row.internal_hours ?? 0);

          target.customerHours += customerHours;
          target.absenceHours += absenceHours;
          target.internalHours += internalHours;
          target.totalHours += customerHours + absenceHours + internalHours;
        }
      }

      if (cancelled) return;

      const orderedRows = rollingWindow.months.map(
        (month) =>
          rowsByMonth.get(month.key) ?? {
            monthKey: month.key,
            monthLabel: month.label,
            customerHours: 0,
            absenceHours: 0,
            internalHours: 0,
            totalHours: 0,
          },
      );

      setMonthlyTimeReportingRows(orderedRows);
      setMonthlyTimeReportingLoading(false);
    }

    fetchMonthlyTimeReporting().catch(() => {
      if (!cancelled) {
        setMonthlyTimeReportingRows([]);
        setMonthlyTimeReportingLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [filteredCustomers, rollingWindow, selectedCustomerId]);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchCustomerTimeReporting() {
      if (!selectedCustomerId) {
        setCustomerTimeReportingRows([]);
        setCustomerTimeReportingLoading(false);
        return;
      }

      setCustomerTimeReportingLoading(true);
      const supabase = createClient();
      let query = supabase
        .from("time_reports")
        .select("employee_id, employee_name, entry_type, hours")
        .gte("report_date", rollingWindow.from)
        .lte("report_date", rollingWindow.to);

      if (selectedCustomer?.fortnox_customer_number) {
        query = query.or(
          `customer_id.eq.${selectedCustomerId},fortnox_customer_number.eq.${selectedCustomer.fortnox_customer_number}`,
        );
      } else {
        query = query.eq("customer_id", selectedCustomerId);
      }

      const { data, error } = await query;

      if (cancelled) return;

      if (error) {
        setCustomerTimeReportingRows([]);
        setCustomerTimeReportingLoading(false);
        return;
      }

      const rows = (data ?? []) as Array<{
        employee_id: string | null;
        employee_name: string | null;
        entry_type: string | null;
        hours: number | null;
      }>;

      const byContributor = new Map<string, CustomerTimeReportingRow>();

      for (const row of rows) {
        const entryType = normalizeText(row.entry_type);
        if (entryType !== "time") continue;

        const contributorName = row.employee_name?.trim() || "Unknown";
        const sourceEmployeeId = row.employee_id;
        const normalizedEmployeeId = normalizeIdentifier(sourceEmployeeId);
        const byUserId = normalizedEmployeeId
          ? managerByFortnoxUserId.get(normalizedEmployeeId)
          : undefined;
        const byEmployeeId = normalizedEmployeeId
          ? managerByFortnoxEmployeeId.get(normalizedEmployeeId)
          : undefined;
        const byName = managerByName.get(normalizeText(contributorName));
        const managerMatch = byUserId ?? byEmployeeId ?? byName;
        const mappedContributorName = managerMatch?.full_name?.trim() ?? null;
        const displayContributorName = mappedContributorName ?? contributorName;
        const contributorId =
          normalizeIdentifier(managerMatch?.fortnox_user_id) ||
          normalizedEmployeeId ||
          null;
        const key = `${contributorId ?? "none"}:${displayContributorName}`;
        const groupName =
          managerMatch?.fortnox_group_name ??
          (managerMatch?.team_id
            ? (teamNameById.get(managerMatch.team_id) ?? "-")
            : "-");
        const target = byContributor.get(key) ?? {
          contributorKey: key,
          contributorId,
          contributorName: displayContributorName,
          groupName,
          customerHours: 0,
          workloadPercentage: 0,
        };

        target.customerHours += Number(row.hours ?? 0);
        byContributor.set(key, target);
      }

      const totals = Array.from(byContributor.values());
      const totalCustomerHours = totals.reduce(
        (sum, row) => sum + row.customerHours,
        0,
      );

      const finalRows = totals
        .map((row) => ({
          ...row,
          workloadPercentage:
            totalCustomerHours > 0
              ? (row.customerHours / totalCustomerHours) * 100
              : 0,
        }))
        .sort((a, b) => b.customerHours - a.customerHours);

      setCustomerTimeReportingRows(finalRows);
      setCustomerTimeReportingLoading(false);
    }

    fetchCustomerTimeReporting().catch(() => {
      if (!cancelled) {
        setCustomerTimeReportingRows([]);
        setCustomerTimeReportingLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    selectedCustomerId,
    selectedCustomer,
    rollingWindow,
    managerByFortnoxUserId,
    managerByFortnoxEmployeeId,
    managerByName,
    teamNameById,
  ]);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchCustomerAccruals() {
      if (!selectedCustomerId || !selectedCustomer?.fortnox_customer_number) {
        setCustomerAccruals([]);
        setAccrualsLoading(false);
        return;
      }

      setAccrualsLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("contract_accruals")
        .select("*")
        .eq("fortnox_customer_number", selectedCustomer.fortnox_customer_number)
        .order("start_date", { ascending: true });

      if (cancelled) return;

      if (error) {
        setCustomerAccruals([]);
        setAccrualsLoading(false);
        return;
      }

      setCustomerAccruals((data ?? []) as ContractAccrual[]);
      setAccrualsLoading(false);
    }

    fetchCustomerAccruals().catch(() => {
      if (!cancelled) {
        setCustomerAccruals([]);
        setAccrualsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedCustomerId, selectedCustomer?.fortnox_customer_number]);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchCustomerMonthlyEconomics() {
      if (!selectedCustomerId) {
        setCustomerMonthlyEconomicsRows([]);
        setCustomerMonthlyEconomicsLoading(false);
        return;
      }

      setCustomerMonthlyEconomicsLoading(true);
      const supabase = createClient();
      const rowsByMonth = new Map<string, CustomerMonthlyEconomicsRow>();
      for (const month of rollingWindow.months) {
        rowsByMonth.set(month.key, {
          monthKey: month.key,
          monthLabel: month.label,
          turnover: 0,
          hours: 0,
          turnoverPerHour: 0,
        });
      }

      let invoiceQuery = supabase
        .from("invoices")
        .select("invoice_date, total_ex_vat, total")
        .gte("invoice_date", rollingWindow.from)
        .lte("invoice_date", rollingWindow.to);

      if (selectedCustomer?.fortnox_customer_number) {
        invoiceQuery = invoiceQuery.or(
          `customer_id.eq.${selectedCustomerId},fortnox_customer_number.eq.${selectedCustomer.fortnox_customer_number}`,
        );
      } else {
        invoiceQuery = invoiceQuery.eq("customer_id", selectedCustomerId);
      }

      const { data: invoiceRows, error: invoiceError } = await invoiceQuery;
      if (cancelled) return;

      if (invoiceError) {
        setCustomerMonthlyEconomicsRows([]);
        setCustomerMonthlyEconomicsLoading(false);
        return;
      }

      for (const row of (invoiceRows ?? []) as Array<{
        invoice_date: string | null;
        total_ex_vat: number | null;
        total: number | null;
      }>) {
        const monthKey = (row.invoice_date ?? "").slice(0, 7);
        const target = rowsByMonth.get(monthKey);
        if (!target) continue;
        target.turnover += invoiceTurnoverExVat(row);
      }

      let hoursQuery = supabase
        .from("time_reports")
        .select("report_date, hours")
        .eq("entry_type", "time")
        .gte("report_date", rollingWindow.from)
        .lte("report_date", rollingWindow.to);

      if (selectedCustomer?.fortnox_customer_number) {
        hoursQuery = hoursQuery.or(
          `customer_id.eq.${selectedCustomerId},fortnox_customer_number.eq.${selectedCustomer.fortnox_customer_number}`,
        );
      } else {
        hoursQuery = hoursQuery.eq("customer_id", selectedCustomerId);
      }

      const { data: hourRows, error: hourError } = await hoursQuery;
      if (cancelled) return;

      if (hourError) {
        setCustomerMonthlyEconomicsRows([]);
        setCustomerMonthlyEconomicsLoading(false);
        return;
      }

      for (const row of (hourRows ?? []) as Array<{
        report_date: string | null;
        hours: number | null;
      }>) {
        const monthKey = (row.report_date ?? "").slice(0, 7);
        const target = rowsByMonth.get(monthKey);
        if (!target) continue;
        target.hours += Number(row.hours ?? 0);
      }

      const orderedRows = rollingWindow.months.map((month) => {
        const row = rowsByMonth.get(month.key) ?? {
          monthKey: month.key,
          monthLabel: month.label,
          turnover: 0,
          hours: 0,
          turnoverPerHour: 0,
        };

        return {
          ...row,
          turnoverPerHour: row.hours > 0 ? row.turnover / row.hours : 0,
        };
      });

      setCustomerMonthlyEconomicsRows(orderedRows);
      setCustomerMonthlyEconomicsLoading(false);
    }

    fetchCustomerMonthlyEconomics().catch(() => {
      if (!cancelled) {
        setCustomerMonthlyEconomicsRows([]);
        setCustomerMonthlyEconomicsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedCustomerId, selectedCustomer, rollingWindow]);

  const monthlyTimeReportingColumns: ColumnDef<
    MonthlyTimeReportingRow,
    unknown
  >[] = [
    {
      id: "monthLabel",
      accessorKey: "monthLabel",
      header: "Month",
      size: 160,
      enableSorting: false,
    },
    {
      id: "customerHours",
      accessorKey: "customerHours",
      header: "Customer Hours",
      size: 180,
      enableSorting: false,
      cell: ({ row }) =>
        renderHourCell(row.original.customerHours, () =>
          openMonthlyTimeDetails(row.original, "customerHours"),
        ),
    },
  ];

  if (selectedManagerId) {
    monthlyTimeReportingColumns.push(
      {
        id: "absenceHours",
        accessorKey: "absenceHours",
        header: "Absence",
        size: 140,
        enableSorting: false,
        cell: ({ row }) =>
          renderHourCell(row.original.absenceHours, () =>
            openMonthlyTimeDetails(row.original, "absenceHours"),
          ),
      },
      {
        id: "internalHours",
        accessorKey: "internalHours",
        header: "Internal",
        size: 140,
        enableSorting: false,
        cell: ({ row }) =>
          renderHourCell(row.original.internalHours, () =>
            openMonthlyTimeDetails(row.original, "internalHours"),
          ),
      },
      {
        id: "totalHours",
        accessorKey: "totalHours",
        header: "Total",
        size: 140,
        enableSorting: false,
        cell: ({ row }) =>
          renderHourCell(row.original.totalHours, () =>
            openMonthlyTimeDetails(row.original, "totalHours"),
          ),
      },
    );
  }

  const customerTimeReportingColumns: ColumnDef<
    CustomerTimeReportingRow,
    unknown
  >[] = [
    {
      id: "contributorName",
      accessorKey: "contributorName",
      header: "Customer Manager",
      size: 220,
      enableSorting: false,
    },
    {
      id: "groupName",
      accessorKey: "groupName",
      header: "Group",
      size: 180,
      enableSorting: false,
    },
    {
      id: "customerHours",
      accessorKey: "customerHours",
      header: "Customer Hours",
      size: 180,
      enableSorting: false,
      cell: ({ row }) =>
        renderHourCell(row.original.customerHours, () =>
          openCustomerTimeDetails(row.original, "customerHours"),
        ),
    },
    {
      id: "workloadPercentage",
      accessorKey: "workloadPercentage",
      header: "Workload Share",
      size: 160,
      enableSorting: false,
      cell: ({ row }) => `${row.original.workloadPercentage.toFixed(1)}%`,
    },
  ];

  const customerMonthlyEconomicsColumns: ColumnDef<
    CustomerMonthlyEconomicsRow,
    unknown
  >[] = [
    {
      id: "monthLabel",
      accessorKey: "monthLabel",
      header: "Month",
      size: 180,
      enableSorting: false,
    },
    {
      id: "turnover",
      accessorKey: "turnover",
      header: "Turnover - ex. VAT",
      size: 180,
      enableSorting: false,
      cell: ({ row }) =>
        renderTurnoverCell(row.original.turnover, () =>
          openMonthlyInvoiceDetails(row.original),
        ),
    },
    {
      id: "hours",
      accessorKey: "hours",
      header: "Hours",
      size: 140,
      enableSorting: false,
      cell: ({ row }) =>
        renderHourCell(row.original.hours, () =>
          openMonthlyTimeDetails(
            {
              monthKey: row.original.monthKey,
              monthLabel: row.original.monthLabel,
              customerHours: row.original.hours,
              absenceHours: 0,
              internalHours: 0,
              totalHours: row.original.hours,
            },
            "customerHours",
          ),
        ),
    },
    {
      id: "turnoverPerHour",
      accessorKey: "turnoverPerHour",
      header: "Turnover (ex. VAT) / Hours",
      size: 220,
      enableSorting: false,
      cell: ({ row }) =>
        row.original.hours > 0
          ? `${sekFormatter.format(row.original.turnoverPerHour)} / h`
          : "-",
    },
  ];

  const customerAccrualColumns: ColumnDef<ContractAccrual, unknown>[] = [
    {
      id: "contract_number",
      accessorKey: "contract_number",
      header: "Contract",
      size: 140,
      enableSorting: false,
    },
    {
      id: "description",
      accessorKey: "description",
      header: "Description",
      size: 220,
      enableSorting: false,
      cell: ({ row }) => row.original.description ?? "-",
    },
    {
      id: "period",
      accessorKey: "period",
      header: "Period",
      size: 100,
      enableSorting: false,
      cell: ({ row }) => row.original.period ?? "-",
    },
    {
      id: "start_date",
      accessorKey: "start_date",
      header: "Start",
      size: 120,
      enableSorting: false,
      cell: ({ row }) => row.original.start_date ?? "-",
    },
    {
      id: "end_date",
      accessorKey: "end_date",
      header: "End",
      size: 120,
      enableSorting: false,
      cell: ({ row }) => row.original.end_date ?? "-",
    },
    {
      id: "total",
      accessorKey: "total",
      header: "Total",
      size: 140,
      enableSorting: false,
      cell: ({ row }) => sekFormatter.format(Number(row.original.total ?? 0)),
    },
    {
      id: "annualized",
      header: "Annualized",
      size: 160,
      enableSorting: false,
      cell: ({ row }) =>
        sekFormatter.format(
          annualizeContractTotal(row.original.total, row.original.period),
        ),
    },
    {
      id: "is_active",
      accessorKey: "is_active",
      header: "Status",
      size: 120,
      enableSorting: false,
      cell: ({ row }) => (row.original.is_active ? "Active" : "Inactive"),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="w-full max-w-6xl">
        <div className={cn("grid gap-4", filterGridClass)}>
          {showTeamFilter ? (
            <SearchSelect
              placeholder="All teams"
              searchPlaceholder="Search teams..."
              options={teamOptions}
              value={selectedTeamId}
              onChange={(value) => {
                setSelectedTeamId(value);
                setSelectedManagerId(null);
                setSelectedCustomerId(null);
              }}
              disabled={teamFilterDisabled}
              allLabel="All teams"
            />
          ) : null}

          <SearchSelect
            placeholder="All customer managers"
            searchPlaceholder="Search customer managers..."
            options={managerOptions}
            value={selectedManagerId}
            onChange={(value) => {
              setSelectedManagerId(value);
              setSelectedCustomerId(null);
            }}
            disabled={loading || managerOptions.length === 0}
            allLabel="All customer managers"
          />

          <SearchSelect
            placeholder="All customers"
            searchPlaceholder="Search customers..."
            options={customerOptions}
            value={selectedCustomerId}
            onChange={setSelectedCustomerId}
            disabled={loading || customerOptions.length === 0}
            allLabel="All customers"
          />

          <SearchSelect
            placeholder="Select month"
            searchPlaceholder="Search month..."
            options={monthOptions}
            value={selectedMonth}
            onChange={(value) =>
              setSelectedMonth(value ?? toMonthKey(new Date()))
            }
            allowClear={false}
          />
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-muted-foreground">
              Loading report data...
            </p>
          </CardContent>
        </Card>
      ) : filteredCustomers.length === 0 ? (
        <EmptyState
          icon={Filter}
          title="No customers match this filter"
          description="Adjust team, customer manager, or customer selection to view KPIs."
        />
      ) : (
        <div className="space-y-10">
          <p className="text-sm text-muted-foreground">
            Showing KPI totals for {filteredCustomers.length} customer
            {filteredCustomers.length === 1 ? "" : "s"}
          </p>
          <p className="text-xs text-muted-foreground">
            Rolling window ending: {rollingWindow.title}
          </p>
          {kpiLoading ? (
            <Card>
              <CardContent className="py-8">
                <p className="text-sm text-muted-foreground">
                  Calculating KPIs...
                </p>
              </CardContent>
            </Card>
          ) : (
            <KpiCards values={kpis} compact />
          )}

          <section className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-base font-semibold">Turnover per month - ex. VAT</h3>
              <p className="text-sm text-muted-foreground">
                Based on current filters and rolling 12-month window.
              </p>
            </div>
            {kpiLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading turnover chart...
              </p>
            ) : (
              <ChartContainer config={turnoverChartConfig} className="h-[280px]">
                <BarChart
                  accessibilityLayer
                  data={turnoverByMonthRows.map((row) => ({
                    month: row.monthLabel,
                    turnover: row.turnover,
                  }))}
                  margin={{
                    top: 20,
                    bottom: 12,
                  }}
                >
                  <CartesianGrid className="stroke-muted-foreground/20" />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    tickFormatter={(value) => String(value).slice(0, 3)}
                  />
                  <YAxis
                    hide
                    domain={[
                      0,
                      (dataMax: number) => Math.max(1, Math.ceil(dataMax * 1.25)),
                    ]}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel />}
                  />
                  <Bar
                    dataKey="turnover"
                    fill="var(--color-turnover)"
                    barSize={16}
                    radius={0}
                  >
                    <LabelList
                      dataKey="turnover"
                      position="top"
                      offset={10}
                      className="fill-foreground"
                      fontSize={11}
                      formatter={(value) => {
                        const numericValue = Number(value ?? 0);
                        return numericValue === 0
                          ? ""
                          : sekFormatter.format(numericValue);
                      }}
                    />
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </section>

          <section className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-base font-semibold">Time reporting</h3>
              <p className="text-sm text-muted-foreground">
                Rolling 12-month view based on the selected month.
              </p>
            </div>
            {!selectedCustomerId ? (
              <DataTable
                columns={monthlyTimeReportingColumns}
                data={monthlyTimeReportingRows}
                loading={monthlyTimeReportingLoading}
                pageSize={12}
                emptyState={{
                  icon: Filter,
                  title: "No time reporting data",
                  description: "No time reporting data found for this scope.",
                }}
              />
            ) : (
              <DataTable
                columns={customerTimeReportingColumns}
                data={customerTimeReportingRows}
                loading={customerTimeReportingLoading}
                pageSize={12}
                emptyState={{
                  icon: Filter,
                  title: "No customer-hour entries",
                  description:
                    "No customer-hour entries found for this customer in the selected rolling window.",
                }}
              />
            )}
          </section>

          {selectedCustomerId ? (
            <div className="space-y-10">
              <section className="space-y-3">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold">Customer Accruals</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedCustomer?.name ?? "Selected customer"}
                  </p>
                </div>
                <DataTable
                  columns={customerAccrualColumns}
                  data={customerAccruals}
                  loading={accrualsLoading}
                  pageSize={12}
                  emptyState={{
                    icon: Filter,
                    title: "No contract accruals",
                    description:
                      "No contract accruals found for this customer.",
                  }}
                />
              </section>

              <section className="space-y-3">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold">
                    Monthly turnover (ex. VAT) and hours
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedCustomer?.name ?? "Selected customer"} ·{" "}
                    {rollingWindow.title}
                  </p>
                </div>
                {customerMonthlyEconomicsLoading ? (
                  <p className="text-sm text-muted-foreground">
                    Loading monthly economics...
                  </p>
                ) : customerMonthlyEconomicsRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No turnover or hour data found for this customer in the
                    selected range.
                  </p>
                ) : (
                  <DataTable
                    columns={customerMonthlyEconomicsColumns}
                    data={customerMonthlyEconomicsRows}
                    loading={customerMonthlyEconomicsLoading}
                    pageSize={12}
                    emptyState={{
                      icon: Filter,
                      title: "No monthly economics",
                      description:
                        "No turnover or hour data found for this customer in the selected range.",
                    }}
                  />
                )}
              </section>
            </div>
          ) : null}
        </div>
      )}

      <Dialog open={timeDetailsOpen} onOpenChange={setTimeDetailsOpen}>
        <DialogContent className="flex h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] w-[calc(100vw-4rem)] max-w-none flex-col sm:max-w-none">
          <DialogHeader>
            <DialogTitle>{timeDetailsTitle}</DialogTitle>
          </DialogHeader>

          {timeDetailsLoading ? (
            <p className="text-sm text-muted-foreground">Loading rows...</p>
          ) : timeDetailsRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No matching rows found.
            </p>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 font-medium">Customer</th>
                    <th className="px-2 py-2 font-medium">Contributor</th>
                    <th className="px-2 py-2 font-medium">Type</th>
                    <th className="px-2 py-2 font-medium">Hours</th>
                    <th className="px-2 py-2 font-medium">Project</th>
                    <th className="px-2 py-2 font-medium">Activity</th>
                    <th className="px-2 py-2 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {timeDetailsRows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-2 py-2">{row.reportDate ?? "-"}</td>
                      <td className="px-2 py-2">{row.customerName ?? "-"}</td>
                      <td className="px-2 py-2">{row.employeeName ?? "-"}</td>
                      <td className="px-2 py-2">{row.entryType ?? "-"}</td>
                      <td className="px-2 py-2">
                        {hoursFormatter.format(row.hours)}
                      </td>
                      <td className="px-2 py-2">{row.projectName ?? "-"}</td>
                      <td className="px-2 py-2">{row.activity ?? "-"}</td>
                      <td className="px-2 py-2">{row.description ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={invoiceDetailsOpen} onOpenChange={setInvoiceDetailsOpen}>
        <DialogContent className="flex h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] w-[calc(100vw-4rem)] max-w-none flex-col sm:max-w-none">
          <DialogHeader>
            <DialogTitle>{invoiceDetailsTitle}</DialogTitle>
          </DialogHeader>

          {invoiceDetailsLoading ? (
            <p className="text-sm text-muted-foreground">Loading invoices...</p>
          ) : invoiceDetailsRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No matching invoices found for this month.
            </p>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Invoice #</th>
                    <th className="px-2 py-2 font-medium">Date</th>
                    <th className="px-2 py-2 font-medium">Due date</th>
                    <th className="px-2 py-2 font-medium">
                      Turnover - ex. VAT
                    </th>
                    <th className="px-2 py-2 font-medium">Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceDetailsRows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-2 py-2">{row.documentNumber}</td>
                      <td className="px-2 py-2">{row.invoiceDate ?? "-"}</td>
                      <td className="px-2 py-2">{row.dueDate ?? "-"}</td>
                      <td className="px-2 py-2">
                        {sekFormatter.format(row.turnover)}
                      </td>
                      <td className="px-2 py-2">{row.currencyCode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
