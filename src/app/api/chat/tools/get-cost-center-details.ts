import type { ToolHandler } from "./types";

export type GetCostCenterDetailsInput = {
  code: string;
  customer_limit?: number;
};

type CostCenterRow = {
  id: string;
  code: string;
  name: string | null;
  active: boolean;
};

type CustomerRow = {
  id: string;
  name: string;
  fortnox_customer_number: string | null;
  status: string | null;
  total_turnover: number | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: string | null;
  team_id: string | null;
};

/**
 * Detailed view of a single cost center: the centre record plus all customers
 * and consultants assigned to it. Customers can be paginated via
 * `customer_limit` (default 50); set higher when the caller is asking for the
 * full list. Consultants are returned in full — there are far fewer of them.
 */
export const getCostCenterDetails: ToolHandler<GetCostCenterDetailsInput> = async (
  input,
  { supabase },
) => {
  const code = input.code?.trim();
  if (!code) {
    return { error: "code is required." };
  }

  const customerLimit = Math.min(Math.max(input.customer_limit ?? 50, 1), 500);

  const [centerRes, customersRes, profilesRes] = await Promise.all([
    supabase
      .from("cost_centers")
      .select("id, code, name, active")
      .eq("code", code)
      .maybeSingle(),
    supabase
      .from("customers")
      .select("id, name, fortnox_customer_number, status, total_turnover")
      .eq("fortnox_cost_center", code)
      .order("name", { ascending: true })
      .limit(customerLimit),
    supabase
      .from("profiles")
      .select("id, full_name, email, role, team_id")
      .eq("fortnox_cost_center", code)
      .order("full_name", { ascending: true }),
  ]);

  if (centerRes.error || !centerRes.data) {
    return {
      error: centerRes.error?.message ?? `Cost center not found: ${code}`,
    };
  }

  const center = centerRes.data as unknown as CostCenterRow;
  const customers = (customersRes.data ?? []) as unknown as CustomerRow[];
  const consultants = (profilesRes.data ?? []) as unknown as ProfileRow[];

  return {
    cost_center: center,
    customer_count: customers.length,
    customers,
    consultant_count: consultants.length,
    consultants,
  };
};
