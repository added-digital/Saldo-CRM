import { NextRequest, NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  NIGHTLY_SYNC_STEPS,
  STEP_LABELS,
  getNightlyChainId,
  isCronAuthorized,
  shouldStartNightlyChain,
} from "@/lib/sync/nightly"

type NightlyChainJob = {
  id: string
  status: "pending" | "processing" | "completed" | "failed"
  payload: Record<string, unknown> | null
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const chainId = getNightlyChainId(now)

  if (!shouldStartNightlyChain(now)) {
    return NextResponse.json({
      ok: true,
      chain_id: chainId,
      message: "Waiting for 01:00 Europe/Stockholm.",
    })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("sync_jobs")
    .select("id,status,payload")
    .contains("payload", { nightly_chain_id: chainId })
    .order("created_at", { ascending: true })

  if (error) {
    return NextResponse.json(
      { error: "Failed to read nightly sync chain", detail: error.message },
      { status: 500 },
    )
  }

  const chainJobs = (data ?? []) as NightlyChainJob[]

  if (chainJobs.some((job) => job.status === "failed")) {
    return NextResponse.json({
      ok: true,
      chain_id: chainId,
      message: "Nightly chain stopped due to a failed job.",
    })
  }

  if (chainJobs.length > 0) {
    return NextResponse.json({
      ok: true,
      chain_id: chainId,
      message: "Nightly chain already queued.",
    })
  }

  const jobsToInsert = NIGHTLY_SYNC_STEPS.map((step, index) => {
    const label = STEP_LABELS[step]
    const payload: Record<string, unknown> = {
      step_name: step,
      step_label: label,
      nightly_chain_id: chainId,
      nightly_step_index: index,
    }

    if (step === "invoices") {
      payload.sync_mode = "full"
    }

    return {
      status: "pending",
      progress: 0,
      current_step: `Waiting for ${label}...`,
      total_items: 0,
      processed_items: 0,
      step_name: step,
      batch_phase: "list",
      batch_offset: 0,
      dispatch_lock: false,
      payload,
      started_by: null,
    }
  })

  const { data: insertedJobs, error: insertError } = await supabase
    .from("sync_jobs")
    .insert(jobsToInsert as never)
    .select("id")

  if (insertError || !insertedJobs) {
    return NextResponse.json(
      {
        error: "Failed to enqueue nightly sync chain",
        detail: insertError?.message,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    chain_id: chainId,
    queued_steps: NIGHTLY_SYNC_STEPS,
    queued_jobs: insertedJobs.length,
    message: "Queued nightly sync chain.",
  })
}
