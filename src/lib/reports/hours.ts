import type {
  MonthlyTimeReportingRow,
  RollingMonth,
  TimeDetailMetric,
} from "./types";

export function metricLabel(metric: TimeDetailMetric): string {
  if (metric === "customerHours") return "Customer Hours";
  if (metric === "absenceHours") return "Absence";
  if (metric === "internalHours") return "Internal";
  if (metric === "otherHours") return "Other";
  return "Total Hours";
}

export function matchesMetric(
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

export function createEmptyMonthlyTimeReportingRows(
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
