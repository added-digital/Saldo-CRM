import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createUserSchema } from "@/lib/validations/user"
import type { Profile } from "@/types/database"

export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => ({}))
    const parsed = createUserSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 }
      )
    }

    const payload = parsed.data
    const fullName = payload.full_name.trim()
    const fortnoxEmployeeId = payload.fortnox_employee_id?.trim() || null
    const fortnoxUserId = payload.fortnox_user_id?.trim() || null
    const fortnoxGroupName = payload.fortnox_group_name?.trim() || null
    const fortnoxCostCenter = payload.fortnox_cost_center?.trim() || null

    const adminClient = createAdminClient()

    const { data, error } = await adminClient.auth.admin.createUser({
      email: payload.email,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const userId = data.user.id

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({
        full_name: fullName,
        fortnox_employee_id: fortnoxEmployeeId,
        fortnox_user_id: fortnoxUserId,
        fortnox_group_name: fortnoxGroupName,
        fortnox_cost_center: fortnoxCostCenter,
      } as never)
      .eq("id", userId)

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, userId })
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to create user",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
