"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { Check, ChevronDown, ChevronRight, Filter } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/use-translation";

const REPORTS_MANAGER_ALIAS: Record<string, string> = {
  "added@saldoredo.se": "Matias.a@saldoredo.se",
};

const REPORT_MONTH_OPTIONS_COUNT = 36;
const TIME_REPORTS_PAGE_SIZE = 1000;

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
}): { amount: number | null; fromTotal: boolean } {
  if (input.total_ex_vat != null) {
    return { amount: Number(input.total_ex_vat), fromTotal: false };
  }

  if (input.total != null) {
    return { amount: Number(input.total), fromTotal: true };
  }

  return { amount: null, fromTotal: false };
}

function toMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

const SWEDISH_MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Maj",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dec",
] as const;

function formatSwedishMonthShort(date: Date): string {
  return SWEDISH_MONTH_SHORT[date.getMonth()] ?? "";
}

function formatSwedishMonthYear(date: Date): string {
  return `${formatSwedishMonthShort(date)} ${date.getFullYear()}`;
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
  const now = new Date();
  const minSelectableMonth = "2025-01";
  const options: SelectOption[] = [];

  for (let i = 0; i < count; i += 1) {
    const valueDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      id: toMonthKey(valueDate),
      label: formatSwedishMonthYear(valueDate),
    });
  }

  return options.filter((option) => option.id >= minSelectableMonth);
}

type RollingMonth = {
  key: string;
  label: string;
  year: number;
  month: number;
};

type ReportingWindowMode =
  | "current-month"
  | "rolling-12-months"
  | "rolling-year";

function getReportingWindowRange(
  selectedMonthKey: string,
  mode: ReportingWindowMode,
): {
  from: string;
  to: string;
  months: RollingMonth[];
  title: string;
} {
  const { year, month } = parseMonthKey(selectedMonthKey);
  const monthDate = new Date(year, month - 1, 1);
  const endDate =
    mode === "rolling-year" ? new Date(year, month, 0) : new Date(year, month, 0);
  const startDate =
    mode === "current-month"
      ? new Date(year, month - 1, 1)
      : mode === "rolling-year"
        ? new Date(year, 0, 1)
        : new Date(year, month - 12, 1);
  const months: RollingMonth[] = [];

  if (mode === "current-month") {
    months.push({
      key: toMonthKey(monthDate),
      label: formatSwedishMonthShort(monthDate),
      year: monthDate.getFullYear(),
      month: monthDate.getMonth() + 1,
    });

    return {
      from: toMonthKey(startDate) + "-01",
      to: endDate.toISOString().slice(0, 10),
      months,
      title: formatSwedishMonthYear(monthDate),
    };
  }

  const monthCount = mode === "rolling-year" ? month : 12;

  for (let i = 0; i < monthCount; i += 1) {
    const monthDate = new Date(
      startDate.getFullYear(),
      startDate.getMonth() + i,
      1,
    );
    months.push({
      key: toMonthKey(monthDate),
      label: formatSwedishMonthShort(monthDate),
      year: monthDate.getFullYear(),
      month: monthDate.getMonth() + 1,
    });
  }

  return {
    from: toMonthKey(startDate) + "-01",
    to: endDate.toISOString().slice(0, 10),
    months,
    title:
      mode === "rolling-year"
        ? String(year)
        : formatSwedishMonthYear(new Date(year, month - 1, 1)),
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

function getNiceStep(roughStep: number): number {
  if (!Number.isFinite(roughStep) || roughStep <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const residual = roughStep / magnitude;

  if (residual <= 1) return magnitude;
  if (residual <= 2) return 2 * magnitude;
  if (residual <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function getRoundedChartMax(dataMax: number): number {
  if (!Number.isFinite(dataMax) || dataMax <= 0) {
    return 1;
  }

  const targetSegments = 5;
  const step = getNiceStep(dataMax / targetSegments);
  const highestCoveredLine = Math.ceil(dataMax / step);
  return Math.max(step * 2, (highestCoveredLine + 1) * step);
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
  showAvatar?: boolean;
  avatarFallback?: string;
};

function getInitials(value: string | null | undefined): string {
  const normalized = (value ?? "").trim();
  if (!normalized) return "--";

  const parts = normalized.split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) return "--";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function toPossessive(name: string): string {
  const normalized = name.trim();
  if (!normalized) return "";
  const suffix = normalized.endsWith("s") ? "'" : "'s";
  return `${normalized}${suffix}`;
}

function toPossessiveLabel(name: string): string {
  const possessive = toPossessive(name);
  if (!possessive) return "All customers";
  return `${possessive} customers`;
}

type SearchSelectProps = {
  placeholder: string;
  searchPlaceholder: string;
  options: SelectOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  allLabel?: string;
  allowClear?: boolean;
  noOptionsLabel?: string;
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
  managerProfileId: string | null;
  contributorId: string | null;
  contributorName: string;
  groupName: string;
  customerHours: number;
  workloadPercentage: number;
};

type HelpedCustomerManagerRow = {
  managerProfileId: string;
  managerName: string;
  groupName: string;
  customerHours: number;
  workloadPercentage: number;
};

type CustomerMonthlyEconomicsRow = {
  monthKey: string;
  monthLabel: string;
  turnover: number | null;
  turnoverFromTotal: boolean;
  hours: number;
  turnoverPerHour: number | null;
};

type ManagerCustomerSummaryRow = {
  customerId: string;
  customerName: string;
  turnover: number;
  invoiceCount: number;
  contractValue: number;
  workloadPercentage: number;
  customerHours: number;
};

type ArticleGroupItemRow = {
  articleNumber: string | null;
  articleName: string;
  turnoverExVat: number;
  rowCount: number;
  quantity: number;
  shareOfGroup: number;
};

type ArticleGroupSummaryRow = {
  groupName: string;
  turnoverExVat: number;
  articleCount: number;
  rowCount: number;
  quantity: number;
  shareOfTotal: number;
  articles: ArticleGroupItemRow[];
};

type TurnoverMonthRow = {
  monthKey: string;
  monthLabel: string;
  turnover: number;
  invoiceCount: number;
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
  turnover: number | null;
  turnoverFromTotal: boolean;
  currencyCode: string;
};

function prefixFilterScore(value: string, search: string): number {
  const normalizedValue = value.trim().toLowerCase();
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return 1;
  return normalizedValue.startsWith(normalizedSearch) ? 1 : 0;
}

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
    monthLabel: `${month.label} ${String(month.year).slice(-2)}`,
    customerHours: 0,
    absenceHours: 0,
    internalHours: 0,
    totalHours: 0,
  }));
}

function createEmptyTurnoverRows(months: RollingMonth[]): TurnoverMonthRow[] {
  return months.map((month) => ({
    monthKey: month.key,
    monthLabel: `${month.label} ${String(month.year).slice(-2)}`,
    turnover: 0,
    invoiceCount: 0,
  }));
}

function compareMonthKeys(a: string, b: string): number {
  if (a === "average" && b === "average") return 0;
  if (a === "average") return 1;
  if (b === "average") return -1;
  return a.localeCompare(b);
}

function compareMonthKeysWithAverageFixed(
  a: CustomerMonthlyEconomicsRow,
  b: CustomerMonthlyEconomicsRow,
): number {
  if (a.monthKey === "average" || b.monthKey === "average") {
    return 0;
  }

  return a.monthKey.localeCompare(b.monthKey);
}

const turnoverChartConfig = {
  turnover: {
    label: "Turnover",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

type TurnoverTooltipPayloadItem = {
  value?: number | string | null;
  payload?: {
    invoiceCount?: number;
  };
};

function TurnoverTooltipContent({
  active,
  payload,
  label,
  turnoverLabel = "Turnover",
  invoicesLabel = "Invoices",
}: {
  active?: boolean;
  payload?: TurnoverTooltipPayloadItem[];
  label?: string | number;
  turnoverLabel?: string;
  invoicesLabel?: string;
}) {
  if (!active || !Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const first = payload[0];
  const turnover = Number(first.value ?? 0);
  const invoiceCount = Number(first.payload?.invoiceCount ?? 0);

  return (
    <div className="grid min-w-[10rem] gap-1.5 rounded-md border bg-background px-3 py-2 text-xs shadow-xl">
      {label != null ? (
        <div className="font-medium">{String(label)}</div>
      ) : null}
      <div className="grid gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">{turnoverLabel}</span>
          <span className="font-medium tabular-nums">
            {turnover.toLocaleString("sv-SE")}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">{invoicesLabel}</span>
          <span className="font-medium tabular-nums">
            {invoiceCount.toLocaleString("sv-SE")}
          </span>
        </div>
      </div>
    </div>
  );
}

function SearchSelect({
  placeholder,
  searchPlaceholder,
  options,
  value,
  onChange,
  disabled = false,
  allLabel = "All",
  allowClear = true,
  noOptionsLabel = "No options found.",
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
          <Command
            filter={(commandValue, search) =>
              prefixFilterScore(commandValue, search)
            }
          >
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
              <CommandEmpty>{noOptionsLabel}</CommandEmpty>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                    value={option.label}
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
                  {option.showAvatar ? (
                    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                      {option.avatarFallback ?? "--"}
                    </span>
                  ) : null}
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
  const { t } = useTranslation();
  const searchParams = useSearchParams();

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
  const [selectedWindowMode, setSelectedWindowMode] =
    React.useState<ReportingWindowMode>("rolling-12-months");
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
  const [
    otherManagersTimeReportingLoading,
    setOtherManagersTimeReportingLoading,
  ] = React.useState(false);
  const [otherManagersTimeReportingRows, setOtherManagersTimeReportingRows] =
    React.useState<CustomerTimeReportingRow[]>([]);
  const [helpedCustomerManagersLoading, setHelpedCustomerManagersLoading] =
    React.useState(false);
  const [helpedCustomerManagersRows, setHelpedCustomerManagersRows] =
    React.useState<HelpedCustomerManagerRow[]>([]);
  const [managerCustomerSummaryLoading, setManagerCustomerSummaryLoading] =
    React.useState(false);
  const [managerCustomerSummaryRows, setManagerCustomerSummaryRows] =
    React.useState<ManagerCustomerSummaryRow[]>([]);
  const [articleGroupsLoading, setArticleGroupsLoading] = React.useState(false);
  const [articleGroupRows, setArticleGroupRows] = React.useState<
    ArticleGroupSummaryRow[]
  >([]);
  const [openArticleGroups, setOpenArticleGroups] = React.useState<
    Record<string, boolean>
  >({});
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
  const [contractDetailsOpen, setContractDetailsOpen] = React.useState(false);
  const [contractDetailsLoading, setContractDetailsLoading] =
    React.useState(false);
  const [contractDetailsTitle, setContractDetailsTitle] = React.useState("");
  const [contractDetailsRows, setContractDetailsRows] = React.useState<
    ContractAccrual[]
  >([]);
  const [turnoverByMonthRows, setTurnoverByMonthRows] = React.useState<
    TurnoverMonthRow[]
  >([]);

  const customerIdFromQuery = searchParams.get("customerId");

  const showTeamFilter = isAdmin || user.role === "team_lead";
  const teamFilterDisabled = user.role === "team_lead" && !isAdmin;
  const filterGridClass = showTeamFilter
    ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)_minmax(0,2.5fr)_minmax(0,1fr)_minmax(0,1.25fr)]"
    : "lg:grid-cols-[minmax(0,1.9fr)_minmax(0,2.5fr)_minmax(0,1fr)_minmax(0,1.25fr)]";
  const monthOptions = React.useMemo<SelectOption[]>(
    () => createMonthOptions(REPORT_MONTH_OPTIONS_COUNT),
    [],
  );
  const rollingWindow = React.useMemo(
    () => getReportingWindowRange(selectedMonth, selectedWindowMode),
    [selectedMonth, selectedWindowMode],
  );
  const reportingWindowOptions = React.useMemo<SelectOption[]>(
    () => [
      {
        id: "current-month",
        label: t("reports.filters.window.currentMonth", "Current month"),
      },
      {
        id: "rolling-12-months",
        label: t("reports.filters.window.rolling12Months", "Rollback 12 months"),
      },
      {
        id: "rolling-year",
        label: t("reports.filters.window.rollingYear", "Rollback year"),
      },
    ],
    [t],
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
        label: manager.full_name ?? t("reports.unknownManager", "Unknown manager"),
      })),
    [availableManagers, t],
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

  const customerOptions = React.useMemo<SelectOption[]>(() => {
    const selectedManagerProfile =
      managers.find((manager) => manager.id === selectedManagerId) ?? null;
    const teamManagerIds = new Set(availableManagers.map((manager) => manager.id));
    const selectedManagerInitials = getInitials(
      selectedManagerProfile?.full_name ?? selectedManagerProfile?.email,
    );

    const rows = customers.map((customer) => {
      const belongsToSelectedManager =
        Boolean(selectedManagerId) &&
        customer.account_manager?.id === selectedManagerId;
      const belongsToSelectedTeam = Boolean(
        selectedTeamId &&
          customer.account_manager?.id &&
          teamManagerIds.has(customer.account_manager.id),
      );
      const showOwnerAvatarInTeamScope =
        Boolean(selectedTeamId) &&
        !selectedManagerId &&
        belongsToSelectedTeam;
      const ownerAvatarFallback = getInitials(
        customer.account_manager?.full_name ?? customer.account_manager?.email,
      );

      return {
        id: customer.id,
        label: customer.name,
        showAvatar: belongsToSelectedManager || showOwnerAvatarInTeamScope,
        avatarFallback: belongsToSelectedManager
          ? selectedManagerInitials
          : showOwnerAvatarInTeamScope
            ? ownerAvatarFallback
            : undefined,
        priority: belongsToSelectedManager ? 0 : 1,
      };
    });

    rows.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.label.localeCompare(b.label);
    });

    return rows.map(({ priority: _priority, ...option }) => option);
  }, [availableManagers, customers, managers, selectedManagerId, selectedTeamId]);

  const filteredCustomers = React.useMemo(() => {
    if (!selectedCustomerId) return managerScopedCustomers;
    return customers.filter(
      (customer) => customer.id === selectedCustomerId,
    );
  }, [customers, managerScopedCustomers, selectedCustomerId]);

  const selectedCustomer = React.useMemo(
    () => filteredCustomers[0] ?? null,
    [filteredCustomers],
  );

  const selectedManager = React.useMemo(
    () => managers.find((manager) => manager.id === selectedManagerId) ?? null,
    [managers, selectedManagerId],
  );

  const selectedTeam = React.useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [teams, selectedTeamId],
  );

  const customerAllLabel = React.useMemo(() => {
    if (selectedManagerId === user.id) {
      return t("reports.filters.myCustomers", "My customers");
    }

    if (selectedManager) {
      const possessive = toPossessive(
        selectedManager.full_name?.trim() || selectedManager.email,
      );
      if (!possessive) {
        return t("reports.filters.allCustomers", "All customers");
      }
      return `${possessive} ${t("reports.filters.customers", "customers")}`;
    }

    if (selectedTeam) {
      const possessive = toPossessive(selectedTeam.name);
      if (!possessive) {
        return t("reports.filters.allCustomers", "All customers");
      }
      return `${possessive} ${t("reports.filters.customers", "customers")}`;
    }

    return t("reports.filters.allCustomers", "All customers");
  }, [selectedManager, selectedManagerId, selectedTeam, t, user.id]);

  const managerAllLabel = React.useMemo(() => {
    if (!selectedTeam) {
      return t("reports.filters.allCustomerManagers", "All customer managers");
    }

    const possessiveTeam = toPossessive(selectedTeam.name);
    if (!possessiveTeam) {
      return t("reports.filters.allCustomerManagers", "All customer managers");
    }

    return `${t("reports.filters.all", "All")} ${possessiveTeam} ${t("reports.filters.customerManagers", "customer managers")}`;
  }, [selectedTeam, t]);

  const teamNameById = React.useMemo(() => {
    return new Map(teams.map((team) => [team.id, team.name]));
  }, [teams]);

  const managerById = React.useMemo(() => {
    return new Map(managers.map((manager) => [manager.id, manager]));
  }, [managers]);

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

  const resolveReporterManagerId = React.useCallback(
    (row: { employee_id: string | null; employee_name: string | null }) => {
      const normalizedEmployeeId = normalizeIdentifier(row.employee_id);
      const byUserId = normalizedEmployeeId
        ? managerByFortnoxUserId.get(normalizedEmployeeId)
        : undefined;
      const byEmployeeId = normalizedEmployeeId
        ? managerByFortnoxEmployeeId.get(normalizedEmployeeId)
        : undefined;
      const contributorName = row.employee_name?.trim() ?? "";
      const byName = managerByName.get(normalizeText(contributorName));
      const managerMatch = byUserId ?? byEmployeeId ?? byName;

      return managerMatch?.id ?? null;
    },
    [managerByFortnoxEmployeeId, managerByFortnoxUserId, managerByName],
  );

  const isSelectedManagerReporter = React.useCallback(
    (row: { employee_id: string | null; employee_name: string | null }) => {
      if (!selectedManager) return false;

      const resolvedManagerId = resolveReporterManagerId(row);
      if (resolvedManagerId === selectedManager.id) {
        return true;
      }

      const normalizedEmployeeId = normalizeIdentifier(row.employee_id);

      const selectedUserId = normalizeIdentifier(
        selectedManager.fortnox_user_id,
      );
      const selectedEmployeeId = normalizeIdentifier(
        selectedManager.fortnox_employee_id,
      );
      if (
        normalizedEmployeeId &&
        (normalizedEmployeeId === selectedUserId ||
          normalizedEmployeeId === selectedEmployeeId)
      ) {
        return true;
      }

      const normalizedEmployeeName = normalizeText(row.employee_name);
      return (
        normalizedEmployeeName.length > 0 &&
        (normalizedEmployeeName === normalizeText(selectedManager.full_name) ||
          normalizedEmployeeName === normalizeText(selectedManager.email))
      );
    },
    [resolveReporterManagerId, selectedManager],
  );

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
        const normalizedEmployeeId = normalizeIdentifier(row.employee_id);
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
        const baseContributorName = row.employee_name ?? t("reports.unknown", "Unknown");
        const displayContributorName = mappedContributorName
          ? mappedContributorName
          : normalizedEmployeeId
            ? `${baseContributorName} (ID: ${normalizedEmployeeId})`
            : baseContributorName;

        return {
          id: row.id,
          reportDate: row.report_date,
          customerName: row.customer_name,
          employeeName: displayContributorName,
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

function renderTurnoverCell(
  value: number | null,
  onClick?: () => void,
  showNotExVatLabel = false,
) {
  if (value == null) {
    return <span className="text-muted-foreground">{t("reports.missing", "missing")}</span>;
  }

  const valueText = `${sekFormatter.format(value)}${showNotExVatLabel ? ` ${t("reports.notExVat", "(NOT ex VAT)")}` : ""}`;

  if (value === 0 || !onClick) {
    return <span>{valueText}</span>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="font-medium underline underline-offset-2 hover:text-foreground"
    >
      {valueText}
    </button>
  );
}

function renderWorkloadShareCell(percentage: number) {
  const clamped = Math.min(Math.max(percentage, 0), 100);
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-[oklch(0.62_0.15_252)]"
          style={{ width: `${clamped}%` }}
        />
      </span>
      <span className="w-10 text-right text-muted-foreground">
        {Math.round(clamped)}%
      </span>
    </div>
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
    const { from, to } = getMonthDateRange(row.monthKey);

    if (selectedManagerId && !selectedCustomerId) {
      setTimeDetailsOpen(true);
      setTimeDetailsLoading(true);
      setTimeDetailsRows([]);
      setTimeDetailsTitle(`${row.monthLabel} · ${metricLabel(metric)}`);

      const supabase = createClient();
      const allRows: Array<{
        id: string;
        report_date: string | null;
        customer_name: string | null;
        fortnox_customer_number: string | null;
        employee_id: string | null;
        employee_name: string | null;
        entry_type: string | null;
        project_name: string | null;
        activity: string | null;
        description: string | null;
        hours: number | null;
      }> = [];
      let pageFrom = 0;

      while (true) {
        const { data, error } = await supabase
          .from("time_reports")
          .select(
            "id, report_date, customer_name, fortnox_customer_number, employee_id, employee_name, entry_type, project_name, activity, description, hours",
          )
          .gte("report_date", from)
          .lte("report_date", to)
          .range(pageFrom, pageFrom + TIME_REPORTS_PAGE_SIZE - 1);

        if (error) {
          setTimeDetailsRows([]);
          setTimeDetailsLoading(false);
          return;
        }

        const pageRows = (data ?? []) as Array<{
          id: string;
          report_date: string | null;
          customer_name: string | null;
          fortnox_customer_number: string | null;
          employee_id: string | null;
          employee_name: string | null;
          entry_type: string | null;
          project_name: string | null;
          activity: string | null;
          description: string | null;
          hours: number | null;
        }>;

        allRows.push(...pageRows);

        if (pageRows.length < TIME_REPORTS_PAGE_SIZE) {
          break;
        }

        pageFrom += TIME_REPORTS_PAGE_SIZE;
      }

      const scopedRows = allRows.filter((timeRow) =>
        isSelectedManagerReporter(timeRow),
      );

      if (metric === "internalHours") {
        const internalScopeRows = scopedRows.filter(
          (timeRow) =>
            normalizeIdentifier(timeRow.fortnox_customer_number) === "1",
        );
        setTimeDetailsRows(
          formatTimeDetailRows(internalScopeRows, "totalHours"),
        );
      } else {
        setTimeDetailsRows(formatTimeDetailRows(scopedRows, metric));
      }
      setTimeDetailsLoading(false);
      return;
    }

    if (filteredCustomers.length === 0) return;

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

  async function openOtherManagersTimeDetails(
    row: CustomerTimeReportingRow,
    metric: TimeDetailMetric,
  ) {
    if (
      !selectedManagerId ||
      selectedCustomerId ||
      filteredCustomers.length === 0
    ) {
      return;
    }

    setTimeDetailsOpen(true);
    setTimeDetailsLoading(true);
    setTimeDetailsRows([]);
    setTimeDetailsTitle(
      `${row.contributorName} · ${metricLabel(metric)} · ${rollingWindow.title}`,
    );

    const customerScope = filteredCustomers.map((customer) => ({
      id: customer.id,
      fortnoxCustomerNumber: customer.fortnox_customer_number,
    }));
    const customerScopeChunks = chunkArray(customerScope, 200);

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
          .gte("report_date", rollingWindow.from)
          .lte("report_date", rollingWindow.to);

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
          .gte("report_date", rollingWindow.from)
          .lte("report_date", rollingWindow.to);

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

    const matchingRows = allRows.filter((reportRow) => {
      if (row.managerProfileId) {
        return resolveReporterManagerId(reportRow) === row.managerProfileId;
      }

      return isSelectedManagerReporter(reportRow);
    });

    setTimeDetailsRows(formatTimeDetailRows(matchingRows, metric));
    setTimeDetailsLoading(false);
  }

  async function openHelpedCustomerManagersDetails(
    row: HelpedCustomerManagerRow,
    metric: TimeDetailMetric,
  ) {
    if (!selectedManagerId || selectedCustomerId || !row.managerProfileId) {
      return;
    }

    const managerCustomers = customers.filter(
      (customer) => customer.account_manager?.id === row.managerProfileId,
    );

    if (managerCustomers.length === 0) {
      setTimeDetailsOpen(true);
      setTimeDetailsLoading(false);
      setTimeDetailsRows([]);
      setTimeDetailsTitle(
        `${row.managerName} · ${metricLabel(metric)} · ${rollingWindow.title}`,
      );
      return;
    }

    setTimeDetailsOpen(true);
    setTimeDetailsLoading(true);
    setTimeDetailsRows([]);
    setTimeDetailsTitle(
      `${row.managerName} · ${metricLabel(metric)} · ${rollingWindow.title}`,
    );

    const customerScope = managerCustomers.map((customer) => ({
      id: customer.id,
      fortnoxCustomerNumber: customer.fortnox_customer_number,
    }));
    const customerScopeChunks = chunkArray(customerScope, 200);

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
          .gte("report_date", rollingWindow.from)
          .lte("report_date", rollingWindow.to);

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
          .gte("report_date", rollingWindow.from)
          .lte("report_date", rollingWindow.to);

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

    const matchingRows = allRows.filter((reportRow) =>
      isSelectedManagerReporter(reportRow),
    );

    setTimeDetailsRows(formatTimeDetailRows(matchingRows, metric));
    setTimeDetailsLoading(false);
  }

  async function openMonthlyInvoiceDetails(row: CustomerMonthlyEconomicsRow) {
    if (!selectedCustomerId) return;

    const { from, to } = getMonthDateRange(row.monthKey);

    setInvoiceDetailsOpen(true);
    setInvoiceDetailsLoading(true);
    setInvoiceDetailsRows([]);
    setInvoiceDetailsTitle(
      `${selectedCustomer?.name ?? t("reports.selectedCustomer", "Selected customer")} · ${row.monthLabel} · ${t("reports.columns.turnover", "Turnover")}`,
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
        rows.map((invoice) => {
          const turnover = invoiceTurnoverExVat(invoice);
          return {
            id: invoice.id,
            documentNumber: invoice.document_number,
            invoiceDate: invoice.invoice_date,
            dueDate: null,
            turnover: turnover.amount,
            turnoverFromTotal: turnover.fromTotal,
            currencyCode: invoice.currency_code ?? "SEK",
          };
        }),
      );
      setInvoiceDetailsLoading(false);
      return;
    }

    setInvoiceDetailsRows(
      dueDateRows.map((invoice) => {
        const turnover = invoiceTurnoverExVat(invoice);
        return {
          id: invoice.id,
          documentNumber: invoice.document_number,
          invoiceDate: invoice.invoice_date,
          dueDate: invoice.due_date,
          turnover: turnover.amount,
          turnoverFromTotal: turnover.fromTotal,
          currencyCode: invoice.currency_code ?? "SEK",
        };
      }),
    );
    setInvoiceDetailsLoading(false);
  }

  async function openManagerCustomerContractDetails(
    row: ManagerCustomerSummaryRow,
  ) {
    setContractDetailsOpen(true);
    setContractDetailsLoading(true);
    setContractDetailsRows([]);
    setContractDetailsTitle(`${row.customerName} · Contract Accruals`);

    const customer = customers.find((item) => item.id === row.customerId) ?? null;
    if (!customer?.fortnox_customer_number) {
      setContractDetailsRows([]);
      setContractDetailsLoading(false);
      return;
    }

    const { data, error } = await createClient()
      .from("contract_accruals")
      .select(
        "id, contract_number, description, period, start_date, end_date, total_ex_vat, total, is_active",
      )
      .eq("fortnox_customer_number", customer.fortnox_customer_number)
      .order("start_date", { ascending: false });

    if (error) {
      setContractDetailsRows([]);
      setContractDetailsLoading(false);
      return;
    }

    setContractDetailsRows((data ?? []) as ContractAccrual[]);
    setContractDetailsLoading(false);
  }

  async function openManagerCustomerInvoiceDetails(
    row: ManagerCustomerSummaryRow,
  ) {
    setInvoiceDetailsOpen(true);
    setInvoiceDetailsLoading(true);
    setInvoiceDetailsRows([]);
    setInvoiceDetailsTitle(
      `${row.customerName} · ${rollingWindow.title} · ${t("reports.columns.turnover", "Turnover")}`,
    );

    const customer = customers.find((item) => item.id === row.customerId) ?? null;
    const supabase = createClient();

    const withCustomerScope = (query: ReturnType<typeof supabase.from>) => {
      let scoped = query
        .gte("invoice_date", rollingWindow.from)
        .lte("invoice_date", rollingWindow.to);
      if (customer?.fortnox_customer_number) {
        scoped = scoped.or(
          `customer_id.eq.${row.customerId},fortnox_customer_number.eq.${customer.fortnox_customer_number}`,
        );
      } else {
        scoped = scoped.eq("customer_id", row.customerId);
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
        rows.map((invoice) => {
          const turnover = invoiceTurnoverExVat(invoice);
          return {
            id: invoice.id,
            documentNumber: invoice.document_number,
            invoiceDate: invoice.invoice_date,
            dueDate: null,
            turnover: turnover.amount,
            turnoverFromTotal: turnover.fromTotal,
            currencyCode: invoice.currency_code ?? "SEK",
          };
        }),
      );
      setInvoiceDetailsLoading(false);
      return;
    }

    setInvoiceDetailsRows(
      dueDateRows.map((invoice) => {
        const turnover = invoiceTurnoverExVat(invoice);
        return {
          id: invoice.id,
          documentNumber: invoice.document_number,
          invoiceDate: invoice.invoice_date,
          dueDate: invoice.due_date,
          turnover: turnover.amount,
          turnoverFromTotal: turnover.fromTotal,
          currencyCode: invoice.currency_code ?? "SEK",
        };
      }),
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
      !teamScopedCustomers.some((c) => c.id === selectedCustomerId)
    ) {
      setSelectedCustomerId(null);
    }
  }, [selectedCustomerId, teamScopedCustomers]);

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
      const { data: profileRows } = await supabase
        .from("profiles")
        .select(
          "id, full_name, email, team_id, fortnox_cost_center, fortnox_employee_id, fortnox_user_id, fortnox_group_name",
        )
        .eq("is_active", true);

      scopedManagers = (profileRows ?? []) as ManagerOption[];
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
    for (const manager of sortedManagers) {
      if (
        manager.fortnox_cost_center &&
        !managerByCostCenter.has(manager.fortnox_cost_center)
      ) {
        managerByCostCenter.set(manager.fortnox_cost_center, manager);
      }
    }

    const PAGE_SIZE = 1000;
    let allCustomers: Customer[] = [];
    let from = 0;

    while (true) {
      const query = supabase
        .from("customers")
        .select("*")
        .eq("status", "active")
        .order("name")
        .range(from, from + PAGE_SIZE - 1);

      const { data } = await query;

      const rows = (data ?? []) as Customer[];
      if (rows.length === 0) break;

      allCustomers = allCustomers.concat(rows);
      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

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
      .filter((customer) => customer.status === "active");

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
    if (!customerIdFromQuery) return;
    if (!customers.some((customer) => customer.id === customerIdFromQuery)) {
      return;
    }
    setSelectedCustomerId(customerIdFromQuery);
  }, [customerIdFromQuery, customers]);

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
            "period_year, period_month, total_turnover, invoice_count, total_hours",
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
        }>;

        for (const row of rows) {
          const monthKey = `${row.period_year}-${String(row.period_month).padStart(2, "0")}`;
          if (!monthKeys.has(monthKey)) continue;

          turnover += Number(row.total_turnover ?? 0);
          invoiceCount += Number(row.invoice_count ?? 0);
          hours += Number(row.total_hours ?? 0);

          const target = turnoverByMonth.get(monthKey);
          if (target) {
            target.turnover += Number(row.total_turnover ?? 0);
            target.invoiceCount += Number(row.invoice_count ?? 0);
          }
        }
      }

      const contractCustomerNumbers = Array.from(
        new Set(
          filteredCustomers
            .map((customer) => customer.fortnox_customer_number)
            .filter((value): value is string => Boolean(value)),
        ),
      );

      const contractCustomerNumberChunks = chunkArray(
        contractCustomerNumbers,
        200,
      );

      for (const numberChunk of contractCustomerNumberChunks) {
        if (cancelled) return;

        const { data: contractRows, error: contractError } = await supabase
          .from("contract_accruals")
          .select("total_ex_vat, total, period")
          .in("fortnox_customer_number", numberChunk)
          .eq("is_active", true);

        if (contractError) {
          throw contractError;
        }

        const rows = (contractRows ?? []) as Array<{
          total_ex_vat: number | null;
          total: number | null;
          period: string | null;
        }>;

        for (const row of rows) {
          contractValue += annualizeContractTotal(
            row.total_ex_vat ?? row.total,
            row.period,
          );
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
              invoiceCount: 0,
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
      if (selectedCustomerId) {
        setMonthlyTimeReportingRows([]);
        setMonthlyTimeReportingLoading(false);
        return;
      }

      if (!selectedManagerId && filteredCustomers.length === 0) {
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

      const monthNumbers = Array.from(
        new Set(rollingWindow.months.map((month) => month.month)),
      );
      const years = Array.from(
        new Set(rollingWindow.months.map((month) => month.year)),
      );

      if (selectedManagerId) {
        const { data, error } = await supabase
          .from("manager_time_kpis")
          .select(
            "period_year, period_month, customer_hours, absence_hours, internal_hours, other_hours, total_hours",
          )
          .eq("manager_profile_id", selectedManagerId)
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
          other_hours: number | null;
          total_hours: number | null;
        }>;

        for (const row of rows) {
          const monthKey = `${row.period_year}-${String(row.period_month).padStart(2, "0")}`;
          const target = rowsByMonth.get(monthKey);
          if (!target) continue;

          const customerHours = Number(row.customer_hours ?? 0);
          const absenceHours = Number(row.absence_hours ?? 0);
          const internalHours = Number(row.internal_hours ?? 0);
          const totalHours = Number(
            row.total_hours ??
              customerHours +
                absenceHours +
                internalHours +
                Number(row.other_hours ?? 0),
          );

          target.customerHours += customerHours;
          target.absenceHours += absenceHours;
          target.internalHours += internalHours;
          target.totalHours += totalHours;
        }
      } else {
        const customerIds = filteredCustomers.map((customer) => customer.id);
        const customerIdChunks = chunkArray(customerIds, 200);

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
      }

      if (cancelled) return;

      const orderedRows = [...rollingWindow.months].reverse().map(
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
  }, [filteredCustomers, rollingWindow, selectedCustomerId, selectedManagerId]);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchOtherManagersOnSelectedCustomers() {
      if (
        !selectedManagerId ||
        selectedCustomerId ||
        filteredCustomers.length === 0
      ) {
        setOtherManagersTimeReportingRows([]);
        setOtherManagersTimeReportingLoading(false);
        return;
      }

      setOtherManagersTimeReportingLoading(true);
      const supabase = createClient();
      const monthNumbers = Array.from(
        new Set(rollingWindow.months.map((month) => month.month)),
      );
      const years = Array.from(
        new Set(rollingWindow.months.map((month) => month.year)),
      );

      const { data, error } = await supabase
        .from("manager_time_kpis")
        .select("manager_profile_id, customer_hours, period_year, period_month")
        .eq("customer_manager_profile_id", selectedManagerId)
        .neq("manager_profile_id", selectedManagerId)
        .in("period_year", years)
        .in("period_month", monthNumbers);

      if (error) {
        setOtherManagersTimeReportingRows([]);
        setOtherManagersTimeReportingLoading(false);
        return;
      }

      const rows = (data ?? []) as Array<{
        manager_profile_id: string;
        customer_hours: number | null;
        period_year: number;
        period_month: number;
      }>;

      const byContributor = new Map<string, CustomerTimeReportingRow>();

      for (const row of rows) {
        const manager = managerById.get(row.manager_profile_id);
        const displayContributorName =
          manager?.full_name?.trim() || manager?.email || t("reports.unknown", "Unknown");
        const contributorId =
          normalizeIdentifier(manager?.fortnox_user_id) ||
          normalizeIdentifier(manager?.fortnox_employee_id) ||
          null;
        const key = `${row.manager_profile_id}:${displayContributorName}`;
        const groupName =
          manager?.fortnox_group_name ??
          (manager?.team_id ? (teamNameById.get(manager.team_id) ?? "-") : "-");
        const target = byContributor.get(key) ?? {
          contributorKey: key,
          managerProfileId: row.manager_profile_id,
          contributorId,
          contributorName: displayContributorName,
          groupName,
          customerHours: 0,
          workloadPercentage: 0,
        };

        target.customerHours += Number(row.customer_hours ?? 0);
        byContributor.set(key, target);
      }

      const totals = Array.from(byContributor.values());
      const totalCustomerHours = totals.reduce(
        (sum, reportRow) => sum + reportRow.customerHours,
        0,
      );

      const finalRows = totals
        .map((reportRow) => ({
          ...reportRow,
          workloadPercentage:
            totalCustomerHours > 0
              ? (reportRow.customerHours / totalCustomerHours) * 100
              : 0,
        }))
        .sort((a, b) => b.customerHours - a.customerHours);

      if (cancelled) return;

      setOtherManagersTimeReportingRows(finalRows);
      setOtherManagersTimeReportingLoading(false);
    }

    fetchOtherManagersOnSelectedCustomers().catch(() => {
      if (!cancelled) {
        setOtherManagersTimeReportingRows([]);
        setOtherManagersTimeReportingLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    filteredCustomers,
    managerById,
    rollingWindow,
    selectedCustomerId,
    selectedManagerId,
    t,
    teamNameById,
  ]);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchHelpedCustomerManagers() {
      if (!selectedManagerId || selectedCustomerId) {
        setHelpedCustomerManagersRows([]);
        setHelpedCustomerManagersLoading(false);
        return;
      }

      setHelpedCustomerManagersLoading(true);

      const monthNumbers = Array.from(
        new Set(rollingWindow.months.map((month) => month.month)),
      );
      const years = Array.from(
        new Set(rollingWindow.months.map((month) => month.year)),
      );

      const { data, error } = await createClient()
        .from("manager_time_kpis")
        .select(
          "customer_manager_profile_id, customer_hours, period_year, period_month",
        )
        .eq("manager_profile_id", selectedManagerId)
        .neq("customer_manager_profile_id", selectedManagerId)
        .not("customer_manager_profile_id", "is", null)
        .in("period_year", years)
        .in("period_month", monthNumbers);

      if (error) {
        setHelpedCustomerManagersRows([]);
        setHelpedCustomerManagersLoading(false);
        return;
      }

      const rows = (data ?? []) as Array<{
        customer_manager_profile_id: string;
        customer_hours: number | null;
        period_year: number;
        period_month: number;
      }>;

      const monthKeys = new Set(rollingWindow.months.map((month) => month.key));
      const totalsByManager = new Map<string, HelpedCustomerManagerRow>();

      for (const row of rows) {
        const monthKey = `${row.period_year}-${String(row.period_month).padStart(2, "0")}`;
        if (!monthKeys.has(monthKey)) continue;

        const manager = managerById.get(row.customer_manager_profile_id);
        const managerName =
          manager?.full_name?.trim() || manager?.email || t("reports.unknown", "Unknown");
        const groupName =
          manager?.fortnox_group_name ??
          (manager?.team_id ? (teamNameById.get(manager.team_id) ?? "-") : "-");
        const current = totalsByManager.get(
          row.customer_manager_profile_id,
        ) ?? {
          managerProfileId: row.customer_manager_profile_id,
          managerName,
          groupName,
          customerHours: 0,
          workloadPercentage: 0,
        };

        current.customerHours += Number(row.customer_hours ?? 0);
        totalsByManager.set(row.customer_manager_profile_id, current);
      }

      const totalHours = Array.from(totalsByManager.values()).reduce(
        (sum, row) => sum + row.customerHours,
        0,
      );

      const finalRows = Array.from(totalsByManager.values())
        .filter((row) => row.customerHours > 0)
        .map((row) => ({
          ...row,
          workloadPercentage:
            totalHours > 0 ? (row.customerHours / totalHours) * 100 : 0,
        }))
        .sort((a, b) => b.customerHours - a.customerHours);

      if (cancelled) return;

      setHelpedCustomerManagersRows(finalRows);
      setHelpedCustomerManagersLoading(false);
    }

    fetchHelpedCustomerManagers().catch(() => {
      if (!cancelled) {
        setHelpedCustomerManagersRows([]);
        setHelpedCustomerManagersLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    managerById,
    rollingWindow,
    selectedCustomerId,
    selectedManagerId,
    t,
    teamNameById,
  ]);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchManagerCustomerSummary() {
      if (
        !selectedManagerId ||
        selectedCustomerId ||
        filteredCustomers.length === 0
      ) {
        setManagerCustomerSummaryRows([]);
        setManagerCustomerSummaryLoading(false);
        return;
      }

      setManagerCustomerSummaryLoading(true);

      const supabase = createClient();
      const customerIds = filteredCustomers.map((customer) => customer.id);
      const customerIdChunks = chunkArray(customerIds, 200);
      const monthNumbers = Array.from(
        new Set(rollingWindow.months.map((month) => month.month)),
      );
      const years = Array.from(
        new Set(rollingWindow.months.map((month) => month.year)),
      );
      const monthKeys = new Set(rollingWindow.months.map((month) => month.key));

      const customerNameById = new Map(
        filteredCustomers.map((customer) => [customer.id, customer.name]),
      );
      const totalsByCustomer = new Map<string, ManagerCustomerSummaryRow>();
      const createEmptySummaryRow = (customerId: string): ManagerCustomerSummaryRow => ({
        customerId,
        customerName: customerNameById.get(customerId) ?? customerId,
        turnover: 0,
        invoiceCount: 0,
        contractValue: 0,
        workloadPercentage: 0,
        customerHours: 0,
      });

      for (const idChunk of customerIdChunks) {
        if (cancelled) return;

        const { data, error } = await supabase
          .from("customer_kpis")
          .select(
            "customer_id, period_year, period_month, invoice_count, customer_hours",
          )
          .in("customer_id", idChunk)
          .eq("period_type", "month")
          .in("period_year", years)
          .in("period_month", monthNumbers);

        if (error) {
          setManagerCustomerSummaryRows([]);
          setManagerCustomerSummaryLoading(false);
          return;
        }

        const rows = (data ?? []) as Array<{
          customer_id: string;
          period_year: number;
          period_month: number;
          invoice_count: number | null;
          customer_hours: number | null;
        }>;

        for (const row of rows) {
          const monthKey = `${row.period_year}-${String(row.period_month).padStart(2, "0")}`;
          if (!monthKeys.has(monthKey)) continue;

          const current =
            totalsByCustomer.get(row.customer_id) ??
            createEmptySummaryRow(row.customer_id);

          current.invoiceCount += Number(row.invoice_count ?? 0);
          current.customerHours += Number(row.customer_hours ?? 0);

          totalsByCustomer.set(row.customer_id, current);
        }
      }

      const invoicesSeen = new Set<string>();
      const customerNumberById = new Map(
        filteredCustomers
          .filter((customer) => Boolean(customer.fortnox_customer_number))
          .map((customer) => [customer.id, customer.fortnox_customer_number as string]),
      );
      const customerIdsByNumber = new Map<string, string[]>();
      for (const [customerId, customerNumber] of customerNumberById.entries()) {
        const existing = customerIdsByNumber.get(customerNumber) ?? [];
        existing.push(customerId);
        customerIdsByNumber.set(customerNumber, existing);
      }

      for (const idChunk of customerIdChunks) {
        if (cancelled) return;

        const { data, error } = await supabase
          .from("invoices")
          .select("id, customer_id, total_ex_vat")
          .in("customer_id", idChunk)
          .gte("invoice_date", rollingWindow.from)
          .lte("invoice_date", rollingWindow.to);

        if (error) {
          setManagerCustomerSummaryRows([]);
          setManagerCustomerSummaryLoading(false);
          return;
        }

        const rows = (data ?? []) as Array<{
          id: string;
          customer_id: string | null;
          total_ex_vat: number | null;
        }>;

        for (const row of rows) {
          if (!row.customer_id) continue;
          invoicesSeen.add(row.id);

          const current =
            totalsByCustomer.get(row.customer_id) ??
            createEmptySummaryRow(row.customer_id);
          current.turnover += Number(row.total_ex_vat ?? 0);
          totalsByCustomer.set(row.customer_id, current);
        }
      }

      const customerNumberChunks = chunkArray(
        Array.from(customerIdsByNumber.keys()),
        200,
      );

      for (const numberChunk of customerNumberChunks) {
        if (cancelled) return;

        const { data, error } = await supabase
          .from("invoices")
          .select("id, customer_id, fortnox_customer_number, total_ex_vat")
          .in("fortnox_customer_number", numberChunk)
          .gte("invoice_date", rollingWindow.from)
          .lte("invoice_date", rollingWindow.to);

        if (error) {
          setManagerCustomerSummaryRows([]);
          setManagerCustomerSummaryLoading(false);
          return;
        }

        const rows = (data ?? []) as Array<{
          id: string;
          customer_id: string | null;
          fortnox_customer_number: string | null;
          total_ex_vat: number | null;
        }>;

        for (const row of rows) {
          if (invoicesSeen.has(row.id)) continue;
          invoicesSeen.add(row.id);

          const customerNumber = row.fortnox_customer_number;
          if (!customerNumber) continue;

          const targetCustomerIds = customerIdsByNumber.get(customerNumber);
          if (!targetCustomerIds || targetCustomerIds.length === 0) continue;

          const amount = Number(row.total_ex_vat ?? 0);

          for (const customerId of targetCustomerIds) {
            const current =
              totalsByCustomer.get(customerId) ??
              createEmptySummaryRow(customerId);
            current.turnover += amount;
            totalsByCustomer.set(customerId, current);
          }
        }
      }

      const contractCustomerNumberById = new Map(
        filteredCustomers
          .filter((customer) => Boolean(customer.fortnox_customer_number))
          .map((customer) => [customer.id, customer.fortnox_customer_number as string]),
      );
      const customerIdsByContractNumber = new Map<string, string[]>();
      for (const [customerId, contractNumber] of contractCustomerNumberById.entries()) {
        const existing = customerIdsByContractNumber.get(contractNumber) ?? [];
        existing.push(customerId);
        customerIdsByContractNumber.set(contractNumber, existing);
      }

      const contractCustomerNumberChunks = chunkArray(
        Array.from(customerIdsByContractNumber.keys()),
        200,
      );

      for (const numberChunk of contractCustomerNumberChunks) {
        if (cancelled) return;

        const { data, error } = await supabase
          .from("contract_accruals")
          .select("fortnox_customer_number, total_ex_vat, total, period")
          .in("fortnox_customer_number", numberChunk)
          .eq("is_active", true);

        if (error) {
          setManagerCustomerSummaryRows([]);
          setManagerCustomerSummaryLoading(false);
          return;
        }

        const rows = (data ?? []) as Array<{
          fortnox_customer_number: string | null;
          total_ex_vat: number | null;
          total: number | null;
          period: string | null;
        }>;

        for (const row of rows) {
          const contractNumber = row.fortnox_customer_number;
          if (!contractNumber) continue;

          const targetCustomerIds = customerIdsByContractNumber.get(contractNumber);
          if (!targetCustomerIds || targetCustomerIds.length === 0) continue;

          const annualized = annualizeContractTotal(
            row.total_ex_vat ?? row.total,
            row.period,
          );

          for (const customerId of targetCustomerIds) {
            const current =
              totalsByCustomer.get(customerId) ??
              createEmptySummaryRow(customerId);

            current.contractValue += annualized;
            totalsByCustomer.set(customerId, current);
          }
        }
      }

      const totalHours = Array.from(totalsByCustomer.values()).reduce(
        (sum, row) => sum + row.customerHours,
        0,
      );

      const finalRows = Array.from(totalsByCustomer.values())
        .map((row) => ({
          ...row,
          workloadPercentage:
            totalHours > 0 ? (row.customerHours / totalHours) * 100 : 0,
        }))
        .sort((a, b) => b.turnover - a.turnover);

      if (cancelled) return;

      setManagerCustomerSummaryRows(finalRows);
      setManagerCustomerSummaryLoading(false);
    }

    fetchManagerCustomerSummary().catch(() => {
      if (!cancelled) {
        setManagerCustomerSummaryRows([]);
        setManagerCustomerSummaryLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [filteredCustomers, rollingWindow, selectedCustomerId, selectedManagerId]);

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

        const sourceEmployeeId = row.employee_id;
        const normalizedEmployeeId = normalizeIdentifier(sourceEmployeeId);
        const contributorName = row.employee_name?.trim()
          ? row.employee_name.trim()
          : normalizedEmployeeId
            ? `${t("reports.unknown", "Unknown")} (ID: ${normalizedEmployeeId})`
            : t("reports.unknown", "Unknown");
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
          managerProfileId: managerMatch?.id ?? null,
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
    t,
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
          monthLabel: `${month.label} ${String(month.year).slice(-2)}`,
          turnover: 0,
          turnoverFromTotal: false,
          hours: 0,
          turnoverPerHour: null,
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

        const turnover = invoiceTurnoverExVat(row);
        if (turnover.amount == null) {
          continue;
        }

        target.turnover = Number(target.turnover ?? 0) + turnover.amount;
        target.turnoverFromTotal = target.turnoverFromTotal || turnover.fromTotal;
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
          monthLabel: `${month.label} ${String(month.year).slice(-2)}`,
          turnover: 0,
          turnoverFromTotal: false,
          hours: 0,
          turnoverPerHour: null,
        };

        return {
          ...row,
          turnoverPerHour:
            row.turnover != null && row.hours > 0 ? row.turnover / row.hours : null,
        };
      });

      const averageHours =
        orderedRows.length > 0
          ? orderedRows.reduce((sum, row) => sum + row.hours, 0) /
            orderedRows.length
          : 0;
      const averageTurnover =
        orderedRows.length > 0
          ? orderedRows.reduce((sum, row) => sum + Number(row.turnover ?? 0), 0) /
            orderedRows.length
          : 0;
      const hasFallbackTurnover = orderedRows.some((row) => row.turnoverFromTotal);

      const averageRow: CustomerMonthlyEconomicsRow = {
        monthKey: "average",
        monthLabel: t("reports.average", "Average"),
        turnover: averageTurnover,
        turnoverFromTotal: hasFallbackTurnover,
        hours: averageHours,
        turnoverPerHour:
          averageTurnover != null && averageHours > 0
            ? averageTurnover / averageHours
            : null,
      };

      setCustomerMonthlyEconomicsRows([...orderedRows, averageRow]);
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
  }, [selectedCustomerId, selectedCustomer, rollingWindow, t]);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchArticleGroups() {
      if (!selectedCustomerId && !selectedManagerId) {
        setArticleGroupRows([]);
        setArticleGroupsLoading(false);
        return;
      }

      const scopedCustomers = filteredCustomers;
      if (scopedCustomers.length === 0) {
        setArticleGroupRows([]);
        setArticleGroupsLoading(false);
        return;
      }

      setArticleGroupsLoading(true);
      const supabase = createClient();

      const customerIds = scopedCustomers.map((customer) => customer.id);
      const customerIdChunks = chunkArray(customerIds, 200);
      const customerNumbers = Array.from(
        new Set(
          scopedCustomers
            .map((customer) => customer.fortnox_customer_number)
            .filter(
              (value): value is string =>
                Boolean(value && value.trim().length > 0),
            ),
        ),
      );
      const customerNumberChunks = chunkArray(customerNumbers, 200);

      const invoiceNumbersSet = new Set<string>();
      const seenInvoiceIds = new Set<string>();

      for (const idChunk of customerIdChunks) {
        const { data, error } = await supabase
          .from("invoices")
          .select("id, document_number")
          .in("customer_id", idChunk)
          .gte("invoice_date", rollingWindow.from)
          .lte("invoice_date", rollingWindow.to);

        if (cancelled) return;

        if (error) {
          setArticleGroupRows([]);
          setArticleGroupsLoading(false);
          return;
        }

        for (const row of (data ?? []) as Array<{ id: string; document_number: string | null }>) {
          seenInvoiceIds.add(row.id);
          const documentNumber = row.document_number?.trim();
          if (!documentNumber) continue;
          invoiceNumbersSet.add(documentNumber);
        }
      }

      for (const numberChunk of customerNumberChunks) {
        const { data, error } = await supabase
          .from("invoices")
          .select("id, document_number")
          .in("fortnox_customer_number", numberChunk)
          .gte("invoice_date", rollingWindow.from)
          .lte("invoice_date", rollingWindow.to);

        if (cancelled) return;

        if (error) {
          setArticleGroupRows([]);
          setArticleGroupsLoading(false);
          return;
        }

        for (const row of (data ?? []) as Array<{ id: string; document_number: string | null }>) {
          if (seenInvoiceIds.has(row.id)) continue;
          seenInvoiceIds.add(row.id);

          const documentNumber = row.document_number?.trim();
          if (!documentNumber) continue;
          invoiceNumbersSet.add(documentNumber);
        }
      }

      const invoiceNumbers = Array.from(invoiceNumbersSet);

      if (invoiceNumbers.length === 0) {
        setArticleGroupRows([]);
        setArticleGroupsLoading(false);
        return;
      }

      const { data: mappingsData } = await supabase
        .from("article_group_mappings")
        .select("article_number, group_name, article_name, active");

      if (cancelled) return;

      const mappingByArticleNumber = new Map<
        string,
        { groupName: string; articleName: string | null }
      >();
      for (const row of (mappingsData ?? []) as Array<{
        article_number: string | null;
        group_name: string | null;
        article_name: string | null;
        active: boolean | null;
      }>) {
        if (row.active === false) continue;
        const articleNumber = row.article_number?.trim();
        const groupName = row.group_name?.trim();
        if (!articleNumber || !groupName) continue;
        mappingByArticleNumber.set(articleNumber, {
          groupName,
          articleName: row.article_name?.trim() || null,
        });
      }

      const invoiceNumberChunks = chunkArray(invoiceNumbers, 200);

      const groupMap = new Map<
        string,
        {
          turnoverExVat: number;
          rowCount: number;
          quantity: number;
          articles: Map<
            string,
            {
              articleNumber: string | null;
              articleName: string;
              turnoverExVat: number;
              rowCount: number;
              quantity: number;
            }
          >;
        }
      >();

      let totalTurnoverExVat = 0;

      for (const chunk of invoiceNumberChunks) {
        const { data: invoiceRowsData, error: invoiceRowsError } = await supabase
          .from("invoice_rows")
          .select("article_number, article_name, quantity, total_ex_vat, total")
          .in("invoice_number", chunk);

        if (cancelled) return;

        if (invoiceRowsError) {
          setArticleGroupRows([]);
          setArticleGroupsLoading(false);
          return;
        }

        for (const row of (invoiceRowsData ?? []) as Array<{
          article_number: string | null;
          article_name: string | null;
          quantity: number | null;
          total_ex_vat: number | null;
          total: number | null;
        }>) {
          const articleNumber = row.article_number?.trim() || null;
          const mapping = articleNumber
            ? mappingByArticleNumber.get(articleNumber)
            : null;
          const articleName =
            mapping?.articleName ||
            row.article_name?.trim() ||
            t("reports.unknown", "Unknown");
          const groupName = (mapping?.groupName ?? null) ??
            t("reports.articleGroups.unmapped", "Unmapped");
          const turnoverExVat = Number(row.total_ex_vat ?? row.total ?? 0);
          const quantity = Number(row.quantity ?? 0);

          totalTurnoverExVat += turnoverExVat;

          const currentGroup =
            groupMap.get(groupName) ??
            {
              turnoverExVat: 0,
              rowCount: 0,
              quantity: 0,
              articles: new Map(),
            };

          currentGroup.turnoverExVat += turnoverExVat;
          currentGroup.rowCount += 1;
          currentGroup.quantity += quantity;

          const articleKey = articleNumber ?? `name:${articleName}`;
          const currentArticle =
            currentGroup.articles.get(articleKey) ??
            {
              articleNumber,
              articleName,
              turnoverExVat: 0,
              rowCount: 0,
              quantity: 0,
            };

          currentArticle.turnoverExVat += turnoverExVat;
          currentArticle.rowCount += 1;
          currentArticle.quantity += quantity;

          currentGroup.articles.set(articleKey, currentArticle);
          groupMap.set(groupName, currentGroup);
        }
      }

      const rows: ArticleGroupSummaryRow[] = Array.from(groupMap.entries())
        .map(([groupName, group]) => {
          const articles = Array.from(group.articles.values())
            .map((article) => ({
              articleNumber: article.articleNumber,
              articleName: article.articleName,
              turnoverExVat: article.turnoverExVat,
              rowCount: article.rowCount,
              quantity: article.quantity,
              shareOfGroup:
                group.turnoverExVat > 0
                  ? (article.turnoverExVat / group.turnoverExVat) * 100
                  : 0,
            }))
            .sort((a, b) => b.turnoverExVat - a.turnoverExVat);

          return {
            groupName,
            turnoverExVat: group.turnoverExVat,
            articleCount: articles.length,
            rowCount: group.rowCount,
            quantity: group.quantity,
            shareOfTotal:
              totalTurnoverExVat > 0
                ? (group.turnoverExVat / totalTurnoverExVat) * 100
                : 0,
            articles,
          };
        })
        .sort((a, b) => b.turnoverExVat - a.turnoverExVat);

      setArticleGroupRows(rows);
      setOpenArticleGroups((current) => {
        if (rows.length === 0) return {};
        if (Object.keys(current).length > 0) return current;
        return { [rows[0].groupName]: true };
      });
      setArticleGroupsLoading(false);
    }

    fetchArticleGroups().catch(() => {
      if (!cancelled) {
        setArticleGroupRows([]);
        setArticleGroupsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    filteredCustomers,
    rollingWindow,
    selectedCustomerId,
    selectedManagerId,
    t,
  ]);

  const monthlyTimeReportingColumns: ColumnDef<
    MonthlyTimeReportingRow,
    unknown
  >[] = [
    {
      id: "monthLabel",
      accessorFn: (row) => row.monthKey,
      header: t("reports.columns.month", "Month"),
      size: 160,
      enableSorting: true,
      sortingFn: (rowA, rowB) =>
        compareMonthKeys(rowA.original.monthKey, rowB.original.monthKey),
      cell: ({ row }) => row.original.monthLabel,
    },
    {
      id: "customerHours",
      accessorKey: "customerHours",
      header: t("reports.columns.customerHours", "Customer Hours"),
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
        header: t("reports.columns.absence", "Absence"),
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
        header: t("reports.columns.internal", "Internal"),
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
        header: t("reports.columns.total", "Total"),
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
      header: t("reports.columns.customerManager", "Customer Manager"),
      size: 220,
      enableSorting: false,
    },
    {
      id: "groupName",
      accessorKey: "groupName",
      header: t("reports.columns.group", "Group"),
      size: 180,
      enableSorting: false,
    },
    {
      id: "customerHours",
      accessorKey: "customerHours",
      header: t("reports.columns.customerHours", "Customer Hours"),
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
      header: t("reports.columns.workloadShare", "Workload Share"),
      size: 160,
      enableSorting: false,
      cell: ({ row }) => renderWorkloadShareCell(row.original.workloadPercentage),
    },
  ];

  const otherManagersTimeReportingColumns: ColumnDef<
    CustomerTimeReportingRow,
    unknown
  >[] = [
    {
      id: "contributorName",
      accessorKey: "contributorName",
      header: t("reports.columns.customerManager", "Customer Manager"),
      size: 220,
      enableSorting: false,
    },
    {
      id: "groupName",
      accessorKey: "groupName",
      header: t("reports.columns.group", "Group"),
      size: 180,
      enableSorting: false,
    },
    {
      id: "customerHours",
      accessorKey: "customerHours",
      header: t("reports.columns.customerHours", "Customer Hours"),
      size: 180,
      enableSorting: false,
      cell: ({ row }) =>
        renderHourCell(row.original.customerHours, () =>
          openOtherManagersTimeDetails(row.original, "customerHours"),
        ),
    },
    {
      id: "workloadPercentage",
      accessorKey: "workloadPercentage",
      header: t("reports.columns.workloadShare", "Workload Share"),
      size: 160,
      enableSorting: false,
      cell: ({ row }) => renderWorkloadShareCell(row.original.workloadPercentage),
    },
  ];

  const managerCustomerSummaryColumns: ColumnDef<
    ManagerCustomerSummaryRow,
    unknown
  >[] = [
    {
      id: "customerName",
      accessorKey: "customerName",
      header: t("reports.columns.customerName", "Customer name"),
      size: 260,
      enableSorting: false,
    },
    {
      id: "turnover",
      accessorKey: "turnover",
      header: t("reports.columns.turnover", "Turnover"),
      size: 180,
      enableSorting: false,
      cell: ({ row }) =>
        renderTurnoverCell(row.original.turnover, () =>
          openManagerCustomerInvoiceDetails(row.original),
        ),
    },
    {
      id: "invoiceCount",
      accessorKey: "invoiceCount",
      header: t("reports.columns.invoices", "Invoices"),
      size: 140,
      enableSorting: false,
      cell: ({ row }) => row.original.invoiceCount.toLocaleString("sv-SE"),
    },
    {
      id: "contractValue",
      accessorKey: "contractValue",
      header: t("reports.columns.contractValue", "Contract value"),
      size: 180,
      enableSorting: false,
      cell: ({ row }) =>
        renderTurnoverCell(row.original.contractValue, () =>
          openManagerCustomerContractDetails(row.original),
        ),
    },
    {
      id: "workloadPercentage",
      accessorKey: "workloadPercentage",
      header: t("reports.columns.workload", "Workload"),
      size: 140,
      enableSorting: false,
      cell: ({ row }) => renderWorkloadShareCell(row.original.workloadPercentage),
    },
    {
      id: "openCustomer",
      header: "",
      size: 56,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setSelectedCustomerId(row.original.customerId)}
              aria-label={`${t("reports.actions.open", "Open")} ${row.original.customerName} ${t("reports.actions.inReport", "in report")}`}
            >
              <ChevronRight className="size-4" />
            </Button>
        </div>
      ),
    },
  ];

  const helpedCustomerManagersColumns: ColumnDef<
    HelpedCustomerManagerRow,
    unknown
  >[] = [
    {
      id: "managerName",
      accessorKey: "managerName",
      header: t("reports.columns.customerManager", "Customer manager"),
      size: 240,
      enableSorting: false,
    },
    {
      id: "groupName",
      accessorKey: "groupName",
      header: t("reports.columns.group", "Group"),
      size: 180,
      enableSorting: false,
    },
    {
      id: "customerHours",
      accessorKey: "customerHours",
      header: t("reports.columns.customerHours", "Customer Hours"),
      size: 180,
      enableSorting: false,
      cell: ({ row }) =>
        renderHourCell(row.original.customerHours, () =>
          openHelpedCustomerManagersDetails(row.original, "customerHours"),
        ),
    },
    {
      id: "workloadPercentage",
      accessorKey: "workloadPercentage",
      header: t("reports.columns.workload", "Workload"),
      size: 140,
      enableSorting: false,
      cell: ({ row }) => renderWorkloadShareCell(row.original.workloadPercentage),
    },
  ];

  const customerMonthlyEconomicsColumns: ColumnDef<
    CustomerMonthlyEconomicsRow,
    unknown
  >[] = [
    {
      id: "monthLabel",
      accessorFn: (row) => row.monthKey,
      header: t("reports.columns.month", "Month"),
      size: 180,
      enableSorting: true,
      sortingFn: (rowA, rowB) =>
        compareMonthKeysWithAverageFixed(rowA.original, rowB.original),
      cell: ({ row }) => row.original.monthLabel,
    },
    {
      id: "turnover",
      accessorKey: "turnover",
      header: t("reports.columns.turnover", "Turnover"),
      size: 180,
      enableSorting: false,
      cell: ({ row }) =>
        renderTurnoverCell(
          row.original.turnover,
          row.original.monthKey !== "average"
            ? () => openMonthlyInvoiceDetails(row.original)
            : undefined,
          row.original.turnoverFromTotal,
        ),
    },
    {
      id: "hours",
      accessorKey: "hours",
      header: t("reports.columns.hours", "Hours"),
      size: 140,
      enableSorting: false,
      cell: ({ row }) =>
        renderHourCell(
          row.original.hours,
          row.original.monthKey !== "average"
            ? () =>
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
                )
            : undefined,
        ),
    },
    {
      id: "turnoverPerHour",
      accessorKey: "turnoverPerHour",
      header: t("reports.columns.turnoverPerHours", "Turnover / Hours"),
      size: 220,
      enableSorting: false,
      cell: ({ row }) => {
        if (row.original.turnover == null) {
          return t("reports.missing", "missing");
        }
        if (row.original.hours <= 0) {
          return "-";
        }
        const turnoverPerHour =
          row.original.turnoverPerHour ?? row.original.turnover / row.original.hours;
        return `${sekFormatter.format(turnoverPerHour)} / h`;
      },
    },
  ];

  const customerAccrualColumns: ColumnDef<ContractAccrual, unknown>[] = [
    {
      id: "contract_number",
      accessorKey: "contract_number",
      header: t("reports.columns.contract", "Contract"),
      size: 140,
      enableSorting: false,
    },
    {
      id: "description",
      accessorKey: "description",
      header: t("reports.columns.description", "Description"),
      size: 220,
      enableSorting: false,
      cell: ({ row }) => row.original.description ?? "-",
    },
    {
      id: "period",
      accessorKey: "period",
      header: t("reports.columns.period", "Period"),
      size: 100,
      enableSorting: false,
      cell: ({ row }) => row.original.period ?? "-",
    },
    {
      id: "start_date",
      accessorKey: "start_date",
      header: t("reports.columns.start", "Start"),
      size: 120,
      enableSorting: false,
      cell: ({ row }) => row.original.start_date ?? "-",
    },
    {
      id: "end_date",
      accessorKey: "end_date",
      header: t("reports.columns.end", "End"),
      size: 120,
      enableSorting: false,
      cell: ({ row }) => row.original.end_date ?? "-",
    },
    {
      id: "total",
      accessorKey: "total",
      header: t("reports.columns.total", "Total"),
      size: 140,
      enableSorting: false,
      cell: ({ row }) =>
        sekFormatter.format(
          Number(row.original.total_ex_vat ?? row.original.total ?? 0),
        ),
    },
    {
      id: "annualized",
      header: t("reports.columns.annualized", "Annualized"),
      size: 160,
      enableSorting: false,
      cell: ({ row }) =>
        sekFormatter.format(
          annualizeContractTotal(
            row.original.total_ex_vat ?? row.original.total,
            row.original.period,
          ),
        ),
    },
    {
      id: "is_active",
      accessorKey: "is_active",
      header: t("reports.columns.status", "Status"),
      size: 120,
      enableSorting: false,
      cell: ({ row }) => (row.original.is_active ? "Active" : "Inactive"),
    },
  ];

  const timeDetailsColumns: ColumnDef<TimeDetailRow, unknown>[] = [
    {
      id: "reportDate",
      accessorKey: "reportDate",
      header: t("reports.columns.date", "Date"),
      size: 120,
      enableSorting: false,
      cell: ({ row }) => row.original.reportDate ?? "-",
    },
    {
      id: "customerName",
      accessorKey: "customerName",
      header: t("reports.columns.customer", "Customer"),
      size: 220,
      enableSorting: false,
      cell: ({ row }) => row.original.customerName ?? "-",
    },
    {
      id: "employeeName",
      accessorKey: "employeeName",
      header: t("reports.columns.costCenter", "Cost center"),
      size: 180,
      enableSorting: false,
      cell: ({ row }) => row.original.employeeName ?? "-",
    },
    {
      id: "entryType",
      accessorKey: "entryType",
      header: t("reports.columns.type", "Type"),
      size: 140,
      enableSorting: false,
      cell: ({ row }) => row.original.entryType ?? "-",
    },
    {
      id: "hours",
      accessorKey: "hours",
      header: t("reports.columns.hours", "Hours"),
      size: 110,
      enableSorting: false,
      cell: ({ row }) => hoursFormatter.format(row.original.hours),
    },
    {
      id: "projectName",
      accessorKey: "projectName",
      header: t("reports.columns.project", "Project"),
      size: 200,
      enableSorting: false,
      cell: ({ row }) => row.original.projectName ?? "-",
    },
    {
      id: "activity",
      accessorKey: "activity",
      header: t("reports.columns.activity", "Activity"),
      size: 180,
      enableSorting: false,
      cell: ({ row }) => row.original.activity ?? "-",
    },
    {
      id: "description",
      accessorKey: "description",
      header: t("reports.columns.description", "Description"),
      size: 260,
      enableSorting: false,
      cell: ({ row }) => row.original.description ?? "-",
    },
  ];

  const invoiceDetailsColumns: ColumnDef<InvoiceDetailRow, unknown>[] = [
    {
      id: "documentNumber",
      accessorKey: "documentNumber",
      header: t("reports.columns.invoiceNumber", "Invoice #"),
      size: 160,
      enableSorting: false,
    },
    {
      id: "invoiceDate",
      accessorKey: "invoiceDate",
      header: t("reports.columns.date", "Date"),
      size: 120,
      enableSorting: false,
      cell: ({ row }) => row.original.invoiceDate ?? "-",
    },
    {
      id: "dueDate",
      accessorKey: "dueDate",
      header: t("reports.columns.dueDate", "Due date"),
      size: 120,
      enableSorting: false,
      cell: ({ row }) => row.original.dueDate ?? "-",
    },
    {
      id: "turnover",
      accessorKey: "turnover",
      header: t("reports.columns.turnover", "Turnover"),
      size: 180,
      enableSorting: false,
      cell: ({ row }) =>
        renderTurnoverCell(
          row.original.turnover,
          undefined,
          row.original.turnoverFromTotal,
        ),
    },
    {
      id: "currencyCode",
      accessorKey: "currencyCode",
      header: t("reports.columns.currency", "Currency"),
      size: 100,
      enableSorting: false,
    },
  ];

  function renderArticleGroupsSection() {
    return (
      <section className="space-y-3">
        <div className="space-y-1 border-t border-[#8b6f2a] pt-6">
          <h3 className="text-base font-semibold">
            {t("reports.sections.articleGroups.title", "Article groups")} ({articleGroupRows.length})
          </h3>
          <p className="text-sm text-muted-foreground">
            {t(
              "reports.sections.articleGroups.description",
              "Mapped follow-up per article group for current selection.",
            )}
          </p>
        </div>

        {articleGroupsLoading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : articleGroupRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t(
              "reports.empty.noArticleGroups",
              "No article group rows found for this customer in the selected range.",
            )}
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[20%]">{t("reports.articleGroups.group", "Group")}</TableHead>
                  <TableHead className="w-[18%]">{t("reports.articleGroups.turnoverExVat", "Turnover ex. VAT")}</TableHead>
                  <TableHead className="w-[10%]">{t("reports.articleGroups.articles", "Articles")}</TableHead>
                  <TableHead className="w-[10%]">{t("reports.articleGroups.count", "Count")}</TableHead>
                  <TableHead className="w-[10%]">{t("reports.articleGroups.quantity", "Quantity")}</TableHead>
                  <TableHead className="w-[32%]">{t("reports.articleGroups.share", "Share")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {articleGroupRows.map((group) => {
                  const isOpen = openArticleGroups[group.groupName] ?? false;
                  return (
                    <React.Fragment key={group.groupName}>
                      <TableRow>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-1"
                            onClick={() =>
                              setOpenArticleGroups((current) => ({
                                ...current,
                                [group.groupName]: !isOpen,
                              }))
                            }
                          >
                            {isOpen ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                            <span className="font-medium">{group.groupName}</span>
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium">
                          {sekFormatter.format(group.turnoverExVat)}
                        </TableCell>
                        <TableCell>{group.articleCount}</TableCell>
                        <TableCell>{group.rowCount}</TableCell>
                        <TableCell>{hoursFormatter.format(group.quantity)}</TableCell>
                        <TableCell>{renderWorkloadShareCell(group.shareOfTotal)}</TableCell>
                      </TableRow>

                      {isOpen ? (
                        <TableRow>
                          <TableCell colSpan={6} className="p-0">
                            <Table className="table-fixed">
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-[14%]">
                                    {t("reports.articleGroups.articleNumber", "Article #")}
                                  </TableHead>
                                  <TableHead className="w-[30%]">
                                    {t("reports.articleGroups.name", "Name")}
                                  </TableHead>
                                  <TableHead className="w-[18%]">
                                    {t("reports.articleGroups.turnoverExVat", "Turnover ex. VAT")}
                                  </TableHead>
                                  <TableHead className="w-[10%]">
                                    {t("reports.articleGroups.count", "Count")}
                                  </TableHead>
                                  <TableHead className="w-[10%]">
                                    {t("reports.articleGroups.quantity", "Quantity")}
                                  </TableHead>
                                  <TableHead className="w-[18%]">
                                    {t("reports.articleGroups.share", "Share")}
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {group.articles.map((article) => (
                                  <TableRow
                                    key={`${group.groupName}:${article.articleNumber ?? article.articleName}`}
                                  >
                                    <TableCell className="text-muted-foreground">
                                      {article.articleNumber ?? "—"}
                                    </TableCell>
                                    <TableCell>{article.articleName}</TableCell>
                                    <TableCell className="font-medium">
                                      {sekFormatter.format(article.turnoverExVat)}
                                    </TableCell>
                                    <TableCell>{article.rowCount}</TableCell>
                                    <TableCell>
                                      {hoursFormatter.format(article.quantity)}
                                    </TableCell>
                                    <TableCell>
                                      <span className="text-muted-foreground">
                                        {Math.round(article.shareOfGroup)}%
                                      </span>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className={cn("grid gap-4 lg:flex-1", filterGridClass)}>
          {showTeamFilter ? (
            <SearchSelect
              placeholder={t("reports.filters.allTeams", "All teams")}
              searchPlaceholder={t("reports.filters.searchTeams", "Search teams...")}
              options={teamOptions}
              value={selectedTeamId}
              onChange={(value) => {
                setSelectedTeamId(value);
                setSelectedManagerId(null);
                setSelectedCustomerId(null);
              }}
              disabled={teamFilterDisabled}
              allLabel={t("reports.filters.allTeams", "All teams")}
              noOptionsLabel={t("reports.filters.noOptions", "No options found.")}
            />
          ) : null}

          <SearchSelect
            placeholder={managerAllLabel}
            searchPlaceholder={t(
              "reports.filters.searchCustomerManagers",
              "Search customer managers...",
            )}
            options={managerOptions}
            value={selectedManagerId}
            onChange={(value) => {
              setSelectedManagerId(value);
              setSelectedCustomerId(null);
            }}
            disabled={loading || managerOptions.length === 0 || user.role === "user"}
            allLabel={managerAllLabel}
            noOptionsLabel={t("reports.filters.noOptions", "No options found.")}
          />

          <SearchSelect
            placeholder={customerAllLabel}
            searchPlaceholder={t("reports.filters.searchCustomers", "Search customers...")}
            options={customerOptions}
            value={selectedCustomerId}
            onChange={setSelectedCustomerId}
            disabled={loading || customerOptions.length === 0}
            allLabel={customerAllLabel}
            noOptionsLabel={t("reports.filters.noOptions", "No options found.")}
          />

          <SearchSelect
            placeholder={t("reports.filters.selectMonth", "Select month")}
            searchPlaceholder={t("reports.filters.searchMonth", "Search month...")}
            options={monthOptions}
            value={selectedMonth}
            onChange={(value) =>
              setSelectedMonth(value ?? toMonthKey(new Date()))
            }
            allowClear={false}
            noOptionsLabel={t("reports.filters.noOptions", "No options found.")}
          />

          <SearchSelect
            placeholder={t("reports.filters.selectPeriod", "Select period")}
            searchPlaceholder={t("reports.filters.searchPeriod", "Search period...")}
            options={reportingWindowOptions}
            value={selectedWindowMode}
            onChange={(value) =>
              setSelectedWindowMode(
                (value as ReportingWindowMode | null) ?? "rolling-12-months",
              )
            }
            allowClear={false}
            noOptionsLabel={t("reports.filters.noOptions", "No options found.")}
          />
        </div>

        <div className="inline-flex h-10 items-center px-1 text-sm font-medium text-muted-foreground lg:shrink-0">
          <span className="text-[#d4af37]">{filteredCustomers.length}</span>
          <span>
            &nbsp;
            {filteredCustomers.length === 1
              ? t("reports.filters.customerSingular", "customer")
              : t("reports.filters.customerPlural", "customers")}{" "}
            {t("reports.filters.inCurrentFilter", "in current filter")}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-10">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>

          <section className="space-y-3">
            <div className="space-y-2 border-t border-[#8b6f2a] pt-6">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <Skeleton className="h-[280px] w-full" />
          </section>

          <section className="space-y-3">
            <div className="space-y-2 border-t border-[#8b6f2a] pt-6">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>
            <Skeleton className="h-[420px] w-full" />
          </section>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <EmptyState
          icon={Filter}
          title={t("reports.empty.noCustomers.title", "No customers match this filter")}
          description={t(
            "reports.empty.noCustomers.description",
            "Adjust team, customer manager, or customer selection to view KPIs.",
          )}
        />
      ) : (
        <div className="space-y-10">
          <div className="space-y-2">
              <KpiCards
                values={kpis}
                compact
                hoursMode={selectedCustomerId ? "turnoverPerHour" : "hours"}
                turnoverPerHour={
                  kpis.hours > 0 ? kpis.turnover / kpis.hours : 0
                }
              />
            {kpiLoading ? (
              <p className="text-sm text-muted-foreground">
                {t("reports.kpis.updating", "Updating KPIs...")}
              </p>
            ) : null}
          </div>

          <section className="space-y-3">
            <div className="space-y-1 border-t border-[#8b6f2a] pt-6">
              <h3 className="text-base font-semibold">
                {t("reports.sections.turnoverPerMonth.title", "Turnover per month")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t(
                  "reports.sections.turnoverPerMonth.description",
                  "Based on current filters and rolling 12-month window.",
                )}
              </p>
            </div>
            {kpiLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : (
              <ChartContainer
                config={turnoverChartConfig}
                className="h-[280px]"
              >
                <BarChart
                  accessibilityLayer
                  data={[...turnoverByMonthRows].reverse().map((row) => ({
                    month: row.monthLabel,
                    turnover: row.turnover,
                    invoiceCount: row.invoiceCount,
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
                  />
                  <YAxis
                    hide
                    tickCount={6}
                    domain={[
                      0,
                      (dataMax: number) => getRoundedChartMax(dataMax),
                    ]}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <TurnoverTooltipContent
                        turnoverLabel={t("reports.columns.turnover", "Turnover")}
                        invoicesLabel={t("reports.columns.invoices", "Invoices")}
                      />
                    }
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
            <div className="space-y-1 border-t border-[#8b6f2a] pt-6">
              <h3 className="text-base font-semibold">
                {t("reports.sections.timeReporting.title", "Time reporting")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {selectedWindowMode === "current-month"
                  ? t(
                      "reports.sections.timeReporting.currentMonthDescription",
                      "Current month view based on selected month.",
                    )
                  : selectedWindowMode === "rolling-year"
                    ? t(
                        "reports.sections.timeReporting.rollingYearDescription",
                        "Calendar year view based on selected month year.",
                      )
                    : t(
                        "reports.sections.timeReporting.rolling12MonthsDescription",
                        "Rolling 12-month view based on selected month.",
                      )}
              </p>
            </div>
            {!selectedCustomerId ? (
              <DataTable
                columns={monthlyTimeReportingColumns}
                data={monthlyTimeReportingRows}
                loading={monthlyTimeReportingLoading}
                hideRowCount
                pageSize={12}
                sortingStorageKey="reports.monthly-time-reporting.sort"
                emptyState={{
                  icon: Filter,
                  title: t("reports.empty.noTimeReportingData.title", "No time reporting data"),
                  description: t(
                    "reports.empty.noTimeReportingData.description",
                    "No time reporting data found for this scope.",
                  ),
                }}
              />
            ) : (
              <DataTable
                columns={customerTimeReportingColumns}
                data={customerTimeReportingRows}
                loading={customerTimeReportingLoading}
                hideRowCount
                pageSize={12}
                emptyState={{
                  icon: Filter,
                  title: t("reports.empty.noCustomerHourEntries.title", "No customer-hour entries"),
                  description: t(
                    "reports.empty.noCustomerHourEntries.description",
                    "No customer-hour entries found for this customer in the selected rolling window.",
                  ),
                }}
              />
            )}

            {selectedManagerId && !selectedCustomerId ? (
              <div className="mt-8 space-y-3">
                <div className="space-y-1 border-t border-[#8b6f2a] pt-6">
                  <h4 className="text-sm font-semibold">
                    {t(
                      "reports.sections.otherManagersOnSelected.title",
                      "Other customer managers on selected manager customers",
                    )}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "reports.sections.otherManagersOnSelected.description",
                      "Customer-hour time reported by other customer managers on the selected manager customer scope.",
                    )}
                  </p>
                </div>

                <DataTable
                  columns={otherManagersTimeReportingColumns}
                  data={otherManagersTimeReportingRows}
                  loading={otherManagersTimeReportingLoading}
                  hideRowCount
                  pageSize={12}
                  emptyState={{
                    icon: Filter,
                    title: t("reports.empty.noOtherManagerReports.title", "No other manager reports"),
                    description: t(
                      "reports.empty.noOtherManagerReports.description",
                      "No customer-hour entries from other customer managers were found for this scope.",
                    ),
                  }}
                />
              </div>
            ) : null}

            {selectedManagerId && !selectedCustomerId ? (
              <div className="mt-8 space-y-3">
                <div className="space-y-1 border-t border-[#8b6f2a] pt-6">
                  <h4 className="text-sm font-semibold">
                    {t(
                      "reports.sections.helpedManagers.title",
                      "Customer managers helped most by selected manager",
                    )}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "reports.sections.helpedManagers.description",
                      "Customer-hour entries where the selected customer manager has worked on customers owned by other customer managers.",
                    )}
                  </p>
                </div>

                <DataTable
                  columns={helpedCustomerManagersColumns}
                  data={helpedCustomerManagersRows}
                  loading={helpedCustomerManagersLoading}
                  hideRowCount
                  pageSize={12}
                  emptyState={{
                    icon: Filter,
                    title: t("reports.empty.noHelpedManagerRows.title", "No helped manager rows"),
                    description: t(
                      "reports.empty.noHelpedManagerRows.description",
                      "No customer-hour entries were found where this manager worked on other managers' customer scope.",
                    ),
                  }}
                />
              </div>
            ) : null}
          </section>

          {selectedManagerId && !selectedCustomerId ? (
            <section className="space-y-3">
              <div className="space-y-1 border-t border-[#8b6f2a] pt-6">
                <h3 className="text-base font-semibold">
                  {t("reports.sections.customersInCostCenter.title", "Customers in cost center")}{" "}
                  {selectedManager?.fortnox_cost_center ?? "-"} -{" "}
                  {selectedManager?.full_name ?? t("reports.selectedCustomerManager", "Selected customer manager")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t(
                    "reports.sections.customersInCostCenter.description",
                    "Period summary for customers in the selected customer manager scope.",
                  )}
                </p>
              </div>

              <DataTable
                columns={managerCustomerSummaryColumns}
                data={managerCustomerSummaryRows}
                loading={managerCustomerSummaryLoading}
                hideRowCount
                pageSize={12}
                emptyState={{
                  icon: Filter,
                  title: t("reports.empty.noCustomerSummaryRows.title", "No customer summary rows"),
                  description: t(
                    "reports.empty.noCustomerSummaryRows.description",
                    "No customer KPI rows were found for this manager and period.",
                  ),
                }}
              />
            </section>
          ) : null}

          {selectedManagerId && !selectedCustomerId ? renderArticleGroupsSection() : null}

          {selectedCustomerId ? (
            <div className="space-y-10">
              <section className="space-y-3">
                <div className="space-y-1 border-t border-[#8b6f2a] pt-6">
                  <h3 className="text-base font-semibold">
                    {t("reports.sections.customerAccruals.title", "Customer Accruals")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedCustomer?.name ?? t("reports.selectedCustomer", "Selected customer")}
                  </p>
                </div>
                <DataTable
                  columns={customerAccrualColumns}
                  data={customerAccruals}
                  loading={accrualsLoading}
                  hideRowCount
                  pageSize={12}
                  emptyState={{
                    icon: Filter,
                    title: t("reports.empty.noContractAccruals.title", "No contract accruals"),
                    description: t(
                      "reports.empty.noContractAccruals.description",
                      "No contract accruals found for this customer.",
                    ),
                  }}
                />
              </section>

              <section className="space-y-3">
                <div className="space-y-1 border-t border-[#8b6f2a] pt-6">
                  <h3 className="text-base font-semibold">
                    {t("reports.sections.monthlyTurnoverAndHours.title", "Monthly turnover and hours")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedCustomer?.name ?? t("reports.selectedCustomer", "Selected customer")} ·{" "}
                    {rollingWindow.title}
                  </p>
                </div>
                {customerMonthlyEconomicsLoading ? (
                  <Skeleton className="h-[420px] w-full" />
                ) : customerMonthlyEconomicsRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "reports.empty.noTurnoverOrHourData",
                      "No turnover or hour data found for this customer in the selected range.",
                    )}
                  </p>
                ) : (
                  <DataTable
                    columns={customerMonthlyEconomicsColumns}
                    data={customerMonthlyEconomicsRows}
                    loading={customerMonthlyEconomicsLoading}
                    hideRowCount
                    pageSize={Math.max(customerMonthlyEconomicsRows.length, 1)}
                    sortingStorageKey="reports.monthly-turnover-hours.sort"
                    emptyState={{
                      icon: Filter,
                      title: t("reports.empty.noMonthlyEconomics.title", "No monthly economics"),
                      description: t(
                        "reports.empty.noTurnoverOrHourData",
                        "No turnover or hour data found for this customer in the selected range.",
                      ),
                    }}
                  />
                )}
              </section>

              {renderArticleGroupsSection()}
            </div>
          ) : null}
        </div>
      )}

      <Dialog open={timeDetailsOpen} onOpenChange={setTimeDetailsOpen}>
        <DialogContent className="flex h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] w-[calc(100vw-4rem)] max-w-none flex-col sm:max-w-none">
          <DialogHeader>
            <DialogTitle>{timeDetailsTitle}</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-hidden">
            <DataTable
              columns={timeDetailsColumns}
              data={timeDetailsRows}
              loading={timeDetailsLoading}
              pageSize={20}
              emptyState={{
                icon: Filter,
                title: t("reports.empty.noMatchingRows.title", "No matching rows"),
                description: t("reports.empty.noMatchingRows.description", "No matching rows found."),
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={invoiceDetailsOpen} onOpenChange={setInvoiceDetailsOpen}>
        <DialogContent className="flex h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] w-[calc(100vw-4rem)] max-w-none flex-col sm:max-w-none">
          <DialogHeader>
            <DialogTitle>{invoiceDetailsTitle}</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-hidden">
            <DataTable
              columns={invoiceDetailsColumns}
              data={invoiceDetailsRows}
              loading={invoiceDetailsLoading}
              pageSize={20}
              emptyState={{
                icon: Filter,
                title: t("reports.empty.noMatchingInvoices.title", "No matching invoices"),
                description: t(
                  "reports.empty.noMatchingInvoices.description",
                  "No matching invoices found for this month.",
                ),
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={contractDetailsOpen} onOpenChange={setContractDetailsOpen}>
        <DialogContent className="flex h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] w-[calc(100vw-4rem)] max-w-none flex-col sm:max-w-none">
          <DialogHeader>
            <DialogTitle>{contractDetailsTitle}</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-hidden">
            <DataTable
              columns={customerAccrualColumns}
              data={contractDetailsRows}
              loading={contractDetailsLoading}
              pageSize={20}
              emptyState={{
                icon: Filter,
                title: t("reports.empty.noContractAccruals.title", "No contract accruals"),
                description: t(
                  "reports.empty.noContractAccrualRows.description",
                  "No contract accrual rows found for this customer.",
                ),
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
