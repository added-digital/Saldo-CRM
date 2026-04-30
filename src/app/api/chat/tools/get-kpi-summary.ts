import { chunkArray } from "@/lib/reports";

import type { ToolHandler } from "./types";

export type GetKpiSummaryInput = {
  year: number;
  month?: number | null;
  customer_id?: string | null;
  include_inactive?: boolean;
};

type KpiRow = {
  customer_id: string;
  period_year: number;
  period_month: number;
  total_turnover: number | null;
  invoice_count: number | null;
  total_hours: number | null;
  customer_hours: number | null;
  absence_hours: number | null;
  internal_hours: number | null;
  other_hours: number | null;
  contract_value: number | null;
};

const KPI_COLUMNS =
  "customer_id, period_year, period_month, total_turnover, invoice_count, " +
  "total_hours, customer_hours, absence_hours, internal_hours, other_hours, " +
  "contract_value";

const CUSTOMER_ID_CHUNK = 200;

/**
 * Returns aggregated KPI numbers from the precomputed `customer_kpis` rollup
 * — the same source the reports dashboard uses. This is the *correct* tool
 * for "how much did we invoice / how many invoices / total hours" style
 * questions, because the rollup already applies business rules (Licenser
 * exclusion, status filters, etc.) at sync time.
 *
 * Aggregation strategy mirrors the dashboard:
 *   1. Resolve the customer scope: a single customer_id, or all active
 *      customers visible under RLS (set include_inactive=true to widen).
 *   2. Pull customer_kpis rows for those customers in the requested period
 *      (period_type='month' for both the single-month and per-month-of-year
 *      cases; we filter by period_year and optionally period_month).
 *   3. Sum across rows and return totals plus a per-month breakdown.
 */
export const getKpiSummary: ToolHandler<GetKpiSummaryInput> = async (
  input,
  { supabase },
) => {
  const year = Math.trunc(input.year);
  if (!Number.isInteger(year) || year < 2000 || year > 3000) {
    return { error: "`year` must be a sensible integer (e.g. 2026)." };
  }

  const month =
    input.month != null && input.month !== undefined
      ? Math.trunc(Number(input.month))
      : null;

  if (month != null && (month < 1 || month > 12)) {
    return { error: "`month` must be an integer between 1 and 12." };
  }

  const customerIdFilter = input.customer_id?.trim() || null;
  const includeInactive = input.include_inactive ?? false;

  // -------------------------------------------------------------------------
  // 1. Resolve customer scope
  // -------------------------------------------------------------------------
  let scopedCustomerIds: string[] | null = null;

  if (customerIdFilter) {
    scopedCustomerIds = [customerIdFilter];
  } else if (!includeInactive) {
    let customerQuery = supabase
      .from("customers")
      .select("id")
      .eq("status", "active");

    const { data, error } = await customerQuery;
    if (error) {
      return { error: error.message };
    }
    scopedCustomerIds = (
      (data ?? []) as unknown as Array<{ id: string }>
    ).map((row) => row.id);
  }

  // -------------------------------------------------------------------------
  // 2. Pull KPI rows
  // -------------------------------------------------------------------------
  const allRows: KpiRow[] = [];

  const runQuery = async (idChunk: string[] | null) => {
    let query = supabase
      .from("customer_kpis")
      .select(KPI_COLUMNS)
      .eq("period_type", "month")
      .eq("period_year", year);

    if (month != null) {
      query = query.eq("period_month", month);
    }
    if (idChunk) {
      query = query.in("customer_id", idChunk);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    allRows.push(...((data ?? []) as unknown as KpiRow[]));
  };

  try {
    if (scopedCustomerIds == null) {
      // include_inactive=true and no customer_id → pull every visible KPI row.
      await runQuery(null);
    } else if (scopedCustomerIds.length === 0) {
      // Nothing in scope — return zeroed result rather than erroring.
    } else {
      for (const chunk of chunkArray(scopedCustomerIds, CUSTOMER_ID_CHUNK)) {
        await runQuery(chunk);
      }
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to load KPIs.",
    };
  }

  // -------------------------------------------------------------------------
  // 3. Aggregate
  // -------------------------------------------------------------------------
  const totals = {
    total_turnover: 0,
    invoice_count: 0,
    total_hours: 0,
    customer_hours: 0,
    absence_hours: 0,
    internal_hours: 0,
    other_hours: 0,
    contract_value: 0,
  };

  const byMonth = new Map<
    number,
    {
      period_month: number;
      total_turnover: number;
      invoice_count: number;
      total_hours: number;
      contributing_customers: number;
    }
  >();
  const customersContributing = new Set<string>();

  for (const row of allRows) {
    const turnover = Number(row.total_turnover ?? 0);
    const invoiceCount = Number(row.invoice_count ?? 0);
    const totalHours = Number(row.total_hours ?? 0);

    totals.total_turnover += turnover;
    totals.invoice_count += invoiceCount;
    totals.total_hours += totalHours;
    totals.customer_hours += Number(row.customer_hours ?? 0);
    totals.absence_hours += Number(row.absence_hours ?? 0);
    totals.internal_hours += Number(row.internal_hours ?? 0);
    totals.other_hours += Number(row.other_hours ?? 0);
    totals.contract_value += Number(row.contract_value ?? 0);

    customersContributing.add(row.customer_id);

    const target = byMonth.get(row.period_month) ?? {
      period_month: row.period_month,
      total_turnover: 0,
      invoice_count: 0,
      total_hours: 0,
      contributing_customers: 0,
    };
    target.total_turnover += turnover;
    target.invoice_count += invoiceCount;
    target.total_hours += totalHours;
    target.contributing_customers += 1;
    byMonth.set(row.period_month, target);
  }

  return {
    period: {
      year,
      month: month ?? null,
      type: month != null ? "month" : "year",
    },
    scope: {
      customer_id: customerIdFilter,
      include_inactive: includeInactive,
      customers_in_scope: scopedCustomerIds?.length ?? null,
      customers_contributing: customersContributing.size,
    },
    totals,
    by_month: Array.from(byMonth.values()).sort(
      (a, b) => a.period_month - b.period_month,
    ),
    source: "customer_kpis (precomputed rollup — matches reports dashboard)",
  };
};
