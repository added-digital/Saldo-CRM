import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { FortnoxClient } from "@/lib/fortnox/client"
import { refreshAccessToken } from "@/lib/fortnox/auth"
import type { Profile, FortnoxConnection } from "@/types/database"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single<Pick<Profile, "role">>()

    if (profile?.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      )
    }

    const adminClient = createAdminClient()

    const customerNumber = request.nextUrl.searchParams.get("customer")
    if (customerNumber) {
      const { data: connData } = await adminClient
        .from("fortnox_connection")
        .select("*")
        .limit(1)
        .single()

      if (!connData) {
        return NextResponse.json({ error: "No Fortnox connection" }, { status: 400 })
      }

      const conn = connData as unknown as FortnoxConnection
      let accessToken = conn.access_token

      const tokenExpiry = new Date(conn.token_expires_at)
      if (tokenExpiry.getTime() - 5 * 60 * 1000 < Date.now()) {
        const tokens = await refreshAccessToken(conn.refresh_token)
        accessToken = tokens.access_token
      }

      const fortnox = new FortnoxClient(accessToken)
      const result = await fortnox.getCustomer(customerNumber)

      return NextResponse.json({
        customer_number: customerNumber,
        raw: result.Customer,
      })
    }

    const [costCentersRes, profilesRes, customersWithCCRes, customersWithManagerRes] = await Promise.all([
      adminClient.from("cost_centers").select("code, name, active"),
      adminClient.from("profiles").select("id, full_name, is_active").eq("is_active", true),
      adminClient.from("customers").select("id, name, fortnox_cost_center").not("fortnox_cost_center", "is", null).limit(20),
      adminClient.from("customers").select("id, name, account_manager_id").not("account_manager_id", "is", null).limit(20),
    ])

    const costCenters = (costCentersRes.data ?? []) as unknown as { code: string; name: string | null; active: boolean }[]
    const profiles = (profilesRes.data ?? []) as unknown as { id: string; full_name: string | null; is_active: boolean }[]
    const customersWithCC = customersWithCCRes.data ?? []
    const customersWithManager = customersWithManagerRes.data ?? []

    const profileNames = profiles.map((p) => p.full_name?.toLowerCase().trim()).filter(Boolean)
    const costCenterNames = costCenters.map((cc) => cc.name?.toLowerCase().trim()).filter(Boolean)

    const matchingNames = costCenterNames.filter((ccName) => profileNames.includes(ccName))
    const unmatchedCostCenters = costCenters.filter(
      (cc) => cc.name && !profileNames.includes(cc.name.toLowerCase().trim())
    )
    const unmatchedProfiles = profiles.filter(
      (p) => p.full_name && !costCenterNames.includes(p.full_name.toLowerCase().trim())
    )

    return NextResponse.json({
      cost_centers: costCenters,
      profiles: profiles.map((p) => ({ id: p.id, full_name: p.full_name })),
      customers_with_cost_center: customersWithCC,
      customers_with_account_manager: customersWithManager,
      matching_names: matchingNames,
      unmatched_cost_centers: unmatchedCostCenters.map((cc) => ({ code: cc.code, name: cc.name })),
      unmatched_profiles: unmatchedProfiles.map((p) => ({ id: p.id, full_name: p.full_name })),
      summary: {
        total_cost_centers: costCenters.length,
        total_active_profiles: profiles.length,
        total_customers_with_cost_center: customersWithCC.length,
        total_customers_with_manager: customersWithManager.length,
        name_matches: matchingNames.length,
      },
    })
  } catch (error) {
    console.error("Debug error:", error)
    return NextResponse.json(
      {
        error: "Debug failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
