import type { ToolHandler } from "./types";

export type GetCustomerOverviewInput = {
  customer_id: string;
};

/**
 * Compact customer dossier. Returns the customer record, the latest available
 * monthly customer_kpi row, the count of active contracts, and a peek at
 * recent activities. Designed to be the "first call" for any customer-scoped
 * question — Claude can decide if it needs to drill in further.
 */
export const getCustomerOverview: ToolHandler<GetCustomerOverviewInput> = async (
  input,
  { supabase },
) => {
  const customerId = input.customer_id?.trim();
  if (!customerId) {
    return { error: "customer_id is required." };
  }

  const customerRes = await supabase
    .from("customers")
    .select(
      "id, name, org_number, fortnox_customer_number, status, industry, " +
        "office, start_date, total_turnover, invoice_count, total_hours, " +
        "contract_value, fortnox_active",
    )
    .eq("id", customerId)
    .maybeSingle();

  if (customerRes.error || !customerRes.data) {
    return {
      error: customerRes.error?.message ?? "Customer not found.",
    };
  }

  const customer = customerRes.data as unknown as {
    id: string;
    name: string;
    org_number: string | null;
    fortnox_customer_number: string | null;
    status: string | null;
    industry: string | null;
    office: string | null;
    start_date: string | null;
    total_turnover: number | null;
    invoice_count: number | null;
    total_hours: number | null;
    contract_value: number | null;
    fortnox_active: boolean | null;
  };
  const fortnoxCustomerNumber = customer.fortnox_customer_number;

  const [kpiRes, activitiesRes, contractsRes] = await Promise.all([
    supabase
      .from("customer_kpis")
      .select(
        "period_type, period_year, period_month, total_turnover, invoice_count, " +
          "total_hours, customer_hours, absence_hours, internal_hours, " +
          "other_hours, contract_value",
      )
      .eq("customer_id", customerId)
      .eq("period_type", "month")
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("customer_activities")
      .select("id, activity_type, date, description, created_at")
      .eq("customer_id", customerId)
      .order("date", { ascending: false })
      .limit(5),
    fortnoxCustomerNumber
      ? supabase
          .from("contract_accruals")
          .select("id, contract_number, total_ex_vat, period, end_date", {
            count: "exact",
          })
          .eq("is_active", true)
          .eq("fortnox_customer_number", fortnoxCustomerNumber)
      : Promise.resolve({ data: [], count: 0, error: null }),
  ]);

  return {
    customer,
    latest_monthly_kpi: kpiRes.data ?? null,
    active_contract_count: contractsRes.count ?? (contractsRes.data?.length ?? 0),
    active_contracts_sample: (contractsRes.data ?? []).slice(0, 5),
    recent_activities: activitiesRes.data ?? [],
  };
};
