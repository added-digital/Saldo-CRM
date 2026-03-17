import { NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { syncSingleCustomer } from "@/lib/fortnox/sync"
import type { Customer, Profile } from "@/types/database"

async function authorize() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>()

  return profile?.role === "admin" ? user : null
}

export async function POST(request: NextRequest) {
  try {
    const user = await authorize()
    if (!user) {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const customerId = (body.customerId as string | undefined)?.trim()

    if (!customerId) {
      return NextResponse.json({ error: "customerId is required" }, { status: 400 })
    }

    const adminClient = createAdminClient()
    const { data: customerRow } = await adminClient
      .from("customers")
      .select("id, name, fortnox_customer_number")
      .eq("id", customerId)
      .single()

    const customer = customerRow as Pick<Customer, "id" | "name" | "fortnox_customer_number"> | null

    if (!customer?.fortnox_customer_number) {
      return NextResponse.json(
        { error: "Customer is missing a Fortnox customer number" },
        { status: 400 }
      )
    }

    await syncSingleCustomer(adminClient, customer.fortnox_customer_number)

    return NextResponse.json({
      customerId,
      fortnoxCustomerNumber: customer.fortnox_customer_number,
      message: `Synced ${customer.name}`,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: "Customer sync failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
