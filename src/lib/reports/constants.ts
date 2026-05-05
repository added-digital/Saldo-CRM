import type { ChartConfig } from "@/components/ui/chart";

import type {
  ComparisonMode,
  ReportingWindowMode,
  SavedReportsFilters,
} from "./types";

export const REPORTS_MANAGER_ALIAS: Record<string, string> = {
  "added@saldoredo.se": "Matias.a@saldoredo.se",
};

export const REPORT_MONTH_OPTIONS_COUNT = 36;
export const TIME_REPORTS_PAGE_SIZE = 1000;
export const FETCH_ALL_PAGE_SIZE = 1000;
export const MONTHLY_UNMAPPED_ARTICLE_GROUP = "__UNMAPPED__";
export const MONTHLY_DEFAULT_EXCLUDED_ARTICLE_GROUP = "Licenser";

export const REPORTS_FILTERS_STORAGE_KEY = "reports.filters.v1";

export const turnoverChartConfig = {
  turnover: {
    label: "Turnover",
    color: "var(--chart-1)",
  },
  turnoverPrevious: {
    label: "Turnover (previous)",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export function parseSavedReportsFilters(
  value: string | null,
): SavedReportsFilters | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<SavedReportsFilters>;
    const isWindowMode =
      parsed.selectedWindowMode === "current-month" ||
      parsed.selectedWindowMode === "rolling-12-months" ||
      parsed.selectedWindowMode === "rolling-year";
    const isComparisonMode =
      parsed.comparisonMode === "year-over-year" ||
      parsed.comparisonMode === "period-over-period" ||
      parsed.comparisonMode === "none";

    return {
      selectedMonth:
        typeof parsed.selectedMonth === "string" ? parsed.selectedMonth : null,
      selectedWindowMode: isWindowMode
        ? (parsed.selectedWindowMode as ReportingWindowMode)
        : null,
      selectedTeamId:
        typeof parsed.selectedTeamId === "string" ? parsed.selectedTeamId : null,
      selectedManagerId:
        typeof parsed.selectedManagerId === "string"
          ? parsed.selectedManagerId
          : null,
      selectedCustomerId:
        typeof parsed.selectedCustomerId === "string"
          ? parsed.selectedCustomerId
          : null,
      comparisonMode: isComparisonMode
        ? (parsed.comparisonMode as ComparisonMode)
        : null,
    };
  } catch {
    return null;
  }
}
