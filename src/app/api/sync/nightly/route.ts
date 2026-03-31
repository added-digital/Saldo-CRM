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

function readStepIndex(payload: Record<string, unknown> | null): number | null {
  const value = payload?.nightly_step_index
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null
  }
  return value
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

  if (chainJobs.some((job) => job.status === "pending" || job.status === "processing")) {
    return NextResponse.json({
      ok: true,
      chain_id: chainId,
      message: "Nightly chain in progress.",
    })
  }

  const completedStepIndexes = chainJobs
    .filter((job) => job.status === "completed")
    .map((job) => readStepIndex(job.payload))
    .filter((value): value is number => value != null)

  const lastCompletedStep = completedStepIndexes.length > 0 ? Math.max(...completedStepIndexes) : -1
  const nextStepIndex = lastCompletedStep + 1

  if (nextStepIndex >= NIGHTLY_SYNC_STEPS.length) {
    return NextResponse.json({
      ok: true,
      chain_id: chainId,
      message: "Nightly chain already completed.",
    })
  }

  const step = NIGHTLY_SYNC_STEPS[nextStepIndex]
  const label = STEP_LABELS[step]
  const payload: Record<string, unknown> = {
    step_name: step,
    step_label: label,
    nightly_chain_id: chainId,
    nightly_step_index: nextStepIndex,
  }

  if (step === "invoices") {
    payload.sync_mode = "full"
  }

  const { data: insertedJob, error: insertError } = await supabase
    .from("sync_jobs")
    .insert({
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
    } as never)
    .select("id")
    .single()

  if (insertError || !insertedJob) {
    return NextResponse.json(
      {
        error: "Failed to enqueue nightly sync step",
        detail: insertError?.message,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    chain_id: chainId,
    step,
    job_id: (insertedJob as { id: string }).id,
    message: `Queued ${label}.`,
  })
}
