import {
  formatSwedishMonthShort,
  formatSwedishMonthYear,
} from "./formatters";
import type {
  ComparisonMode,
  CustomerMonthlyEconomicsRow,
  ReportingWindowMode,
  RollingMonth,
  SelectOption,
} from "./types";

export function toMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseMonthKey(monthKey: string): {
  year: number;
  month: number;
} {
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

export function createMonthOptions(count: number): SelectOption[] {
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

export function getReportingWindowRange(
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
      to: toDateKey(endDate),
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
    to: toDateKey(endDate),
    months,
    title:
      mode === "rolling-year"
        ? String(year)
        : formatSwedishMonthYear(new Date(year, month - 1, 1)),
  };
}

export function getMonthDateRange(monthKey: string): {
  from: string;
  to: string;
} {
  const { year, month } = parseMonthKey(monthKey);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  return {
    from: toMonthKey(firstDay) + "-01",
    to: toDateKey(lastDay),
  };
}

export function getDefaultReportsMonthKey(): string {
  const now = new Date();
  return toMonthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

export function compareMonthKeys(a: string, b: string): number {
  if (a === "average" && b === "average") return 0;
  if (a === "average") return 1;
  if (b === "average") return -1;
  return a.localeCompare(b);
}

export function compareMonthKeysWithAverageFixed(
  a: CustomerMonthlyEconomicsRow,
  b: CustomerMonthlyEconomicsRow,
): number {
  if (a.monthKey === "average" || b.monthKey === "average") {
    return 0;
  }

  return a.monthKey.localeCompare(b.monthKey);
}

/**
 * Returns the comparison-period equivalent of a reporting window.
 *
 * Year-over-year always shifts back by 12 months, regardless of mode — the
 * usual "this March vs last March" mental model.
 *
 * Period-over-period shifts back by the window's own length:
 *   - current-month (1 month) → the immediately preceding month
 *   - rolling-12-months (12 months) → the 12 months before that (collides
 *     with year-over-year, intentionally)
 *   - rolling-year (Jan–N months) → the N months immediately before
 */
export function getPreviousReportingWindowRange(
  selectedMonthKey: string,
  mode: ReportingWindowMode,
  comparison: ComparisonMode,
): {
  from: string;
  to: string;
  months: RollingMonth[];
  title: string;
} {
  const current = getReportingWindowRange(selectedMonthKey, mode);
  const monthCount = current.months.length;
  const shiftMonths = comparison === "year-over-year" ? 12 : monthCount;

  const previousMonths: RollingMonth[] = current.months.map((entry) => {
    const shiftedDate = new Date(entry.year, entry.month - 1 - shiftMonths, 1);
    return {
      key: toMonthKey(shiftedDate),
      label: formatSwedishMonthShort(shiftedDate),
      year: shiftedDate.getFullYear(),
      month: shiftedDate.getMonth() + 1,
    };
  });

  const firstMonth = previousMonths[0];
  const lastMonth = previousMonths[previousMonths.length - 1];
  const startDate = new Date(firstMonth.year, firstMonth.month - 1, 1);
  const endDate = new Date(lastMonth.year, lastMonth.month, 0);

  const title =
    monthCount === 1
      ? formatSwedishMonthYear(startDate)
      : `${formatSwedishMonthYear(startDate)} – ${formatSwedishMonthYear(
          new Date(lastMonth.year, lastMonth.month - 1, 1),
        )}`;

  return {
    from: toMonthKey(startDate) + "-01",
    to: toDateKey(endDate),
    months: previousMonths,
    title,
  };
}
