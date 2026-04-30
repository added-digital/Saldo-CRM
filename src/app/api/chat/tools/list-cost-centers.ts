import type { ToolHandler } from "./types";

export type ListCostCentersInput = {
  active_only?: boolean;
};

type CostCenterRow = {
  id: string;
  code: string;
  name: string | null;
  active: boolean;
};

type CodeOnlyRow = { fortnox_cost_center: string | null };

/**
 * Return every cost center the caller can see, with the number of customers
 * and consultants currently assigned to each. Counts are computed in the API
 * layer (not via SQL aggregates) because the joins go through
 * `fortnox_cost_center` strings on both sides, not foreign keys.
 */
export const listCostCenters: ToolHandler<ListCostCentersInput> = async (
  input,
  { supabase },
) => {
  const activeOnly = input.active_only ?? true;

  let centerQuery = supabase
    .from("cost_centers")
    .select("id, code, name, active")
    .order("code", { ascending: true });

  if (activeOnly) {
    centerQuery = centerQuery.eq("active", true);
  }

  const [centersRes, customersRes, profilesRes] = await Promise.all([
    centerQuery,
    supabase.from("customers").select("fortnox_cost_center"),
    supabase.from("profiles").select("fortnox_cost_center"),
  ]);

  if (centersRes.error) {
    return { error: centersRes.error.message, cost_centers: [] };
  }

  const centers = (centersRes.data ?? []) as unknown as CostCenterRow[];
  const customers = (customersRes.data ?? []) as unknown as CodeOnlyRow[];
  const profiles = (profilesRes.data ?? []) as unknown as CodeOnlyRow[];

  const customerCounts = new Map<string, number>();
  for (const row of customers) {
    const code = row.fortnox_cost_center?.trim();
    if (!code) continue;
    customerCounts.set(code, (customerCounts.get(code) ?? 0) + 1);
  }

  const consultantCounts = new Map<string, number>();
  for (const row of profiles) {
    const code = row.fortnox_cost_center?.trim();
    if (!code) continue;
    consultantCounts.set(code, (consultantCounts.get(code) ?? 0) + 1);
  }

  return {
    cost_centers: centers.map((center) => ({
      id: center.id,
      code: center.code,
      name: center.name,
      active: center.active,
      customer_count: customerCounts.get(center.code) ?? 0,
      consultant_count: consultantCounts.get(center.code) ?? 0,
    })),
    count: centers.length,
  };
};
