import { createClient } from "@/lib/supabase/server";
import { DashboardAskQuestion } from "@/components/app/dashboard-ask-question";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type DashboardCustomerOptionRow = {
  id: string;
  name: string;
  fortnox_customer_number: string | null;
};

type DashboardUserOptionRow = {
  id: string;
  full_name: string | null;
  email: string;
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: recentCustomerRows } = await supabase
    .from("customers")
    .select("id, name, fortnox_customer_number")
    .eq("status", "active")
    .order("name")
    .limit(300);

  const { data: userRows } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("is_active", true)
    .order("full_name")
    .limit(300);

  const dashboardCustomers = (recentCustomerRows ??
    []) as DashboardCustomerOptionRow[];
  const dashboardUsers = (userRows ?? []) as DashboardUserOptionRow[];

  const customerOptions = dashboardCustomers.map((customer) => ({
    id: customer.id,
    label: customer.name,
    subLabel: customer.fortnox_customer_number
      ? `#${customer.fortnox_customer_number}`
      : undefined,
  }));

  const userOptions = dashboardUsers.map((userRow) => ({
    id: userRow.id,
    label: userRow.full_name ?? userRow.email,
    subLabel: userRow.email,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Home" description="Overview of your operations" />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Ask a question</CardTitle>
          <Badge variant="outline">Beta</Badge>
        </CardHeader>
        <CardContent>
          <DashboardAskQuestion customers={customerOptions} users={userOptions} />
        </CardContent>
      </Card>
    </div>
  );
}
