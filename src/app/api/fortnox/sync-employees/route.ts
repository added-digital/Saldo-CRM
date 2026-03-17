import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { syncEmployees, linkCostCentersToProfiles } from "@/lib/fortnox/sync"
import type { Profile } from "@/types/database"

export async function POST() {
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

    const employeeResult = await syncEmployees(adminClient)
    const linkResult = await linkCostCentersToProfiles(adminClient)

    return NextResponse.json({
      employees: employeeResult,
      customerLinks: linkResult,
    })
  } catch (error) {
    console.error("Employee sync error:", error)
    return NextResponse.json(
      {
        error: "Employee sync failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
