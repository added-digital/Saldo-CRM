import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  syncCostCenters,
  fetchAllCustomerNumbers,
  syncCustomerBatch,
  linkCostCentersToProfiles,
  setSyncStatus,
} from "@/lib/fortnox/sync"
import type { Profile } from "@/types/database"

export const maxDuration = 60

const DEFAULT_BATCH_SIZE = 20

async function authorize() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return null
  }

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
    const step = (body.step as string) ?? "full"
    const adminClient = createAdminClient()

    if (step === "init") {
      await setSyncStatus(adminClient, "syncing")

      const costCenterResult = await syncCostCenters(adminClient)
      const { customerNumbers, total } = await fetchAllCustomerNumbers(adminClient)

      return NextResponse.json({
        step: "init",
        costCenters: costCenterResult,
        customerNumbers,
        total,
      })
    }

    if (step === "customers") {
      const customerNumbers: string[] = body.customerNumbers ?? []
      const fromIndex = Math.max(0, Number(body.fromIndex ?? 0))
      const batchSize = Math.max(1, Math.min(50, Number(body.batchSize ?? DEFAULT_BATCH_SIZE)))

      const result = await syncCustomerBatch(
        adminClient,
        customerNumbers,
        fromIndex,
        batchSize
      )

      return NextResponse.json({
        step: "customers",
        ...result,
      })
    }

    if (step === "link") {
      const linkResult = await linkCostCentersToProfiles(adminClient)
      await setSyncStatus(adminClient, "idle")

      return NextResponse.json({
        step: "link",
        accountManagers: linkResult,
      })
    }

    const costCenterResult = await syncCostCenters(adminClient)
    const { customerNumbers } = await fetchAllCustomerNumbers(adminClient)

    let totalSynced = 0
    let totalErrors = 0
    let fromIndex = 0
    const batchSize = DEFAULT_BATCH_SIZE

    while (fromIndex < customerNumbers.length) {
      const result = await syncCustomerBatch(
        adminClient,
        customerNumbers,
        fromIndex,
        batchSize
      )
      totalSynced += result.synced
      totalErrors += result.errors
      if (result.nextIndex === null) break
      fromIndex = result.nextIndex
    }

    const linkResult = await linkCostCentersToProfiles(adminClient)

    return NextResponse.json({
      costCenters: costCenterResult,
      customers: { synced: totalSynced, errors: totalErrors, total: customerNumbers.length },
      accountManagers: linkResult,
    })
  } catch (error) {
    console.error("Sync error:", error)

    try {
      const adminClient = createAdminClient()
      await setSyncStatus(
        adminClient,
        "error",
        error instanceof Error ? error.message : "Unknown error"
      )
    } catch {
      /* best effort */
    }

    return NextResponse.json(
      {
        error: "Sync failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
