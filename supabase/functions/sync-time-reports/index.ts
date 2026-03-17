import { createAdminClient } from "../_shared/supabase.ts"
import { getFortnoxClient, updateSyncJob, delay, corsHeaders } from "../_shared/sync-helpers.ts"

const RATE_LIMIT_DELAY_MS = 350
const PAGES_PER_BATCH = 10
const UPSERT_CHUNK_SIZE = 100

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() })
  }

  const supabase = createAdminClient()
  let jobId: string | null = null

  try {
    const body = await req.json().catch(() => ({}))
    jobId = body.job_id ?? null
    const phase: string = body.phase ?? "list"
    const offset: number = body.offset ?? 0

    const client = await getFortnoxClient(supabase)

    if (phase === "list") {
      if (jobId) {
        await updateSyncJob(supabase, jobId, {
          status: "processing",
          current_step: "Fetching time reports from Fortnox...",
        })
      }

      const startPage = offset + 1
      const allReports: Array<Record<string, unknown>> = []
      let currentPage = startPage
      let totalPages = 1
      let pagesThisBatch = 0

      do {
        const response = await client.getAttendanceTransactions(currentPage, 100)
        totalPages = response.MetaInformation?.["@TotalPages"] ?? 1
        const reports = response.AttendanceTransactions ?? []
        allReports.push(...reports)

        pagesThisBatch++
        currentPage++

        if (currentPage <= totalPages && pagesThisBatch < PAGES_PER_BATCH) {
          await delay(RATE_LIMIT_DELAY_MS)
        }
      } while (currentPage <= totalPages && pagesThisBatch < PAGES_PER_BATCH)

      let existingReports: Array<Record<string, unknown>> = []
      if (jobId) {
        const { data: jobRow } = await supabase
          .from("sync_jobs")
          .select("payload")
          .eq("id", jobId)
          .single()

        const payload = (jobRow as unknown as { payload: Record<string, unknown> } | null)?.payload
        existingReports = (payload?.reports as Array<Record<string, unknown>>) ?? []
      }

      const accumulated = [...existingReports, ...allReports]
      const morePages = currentPage <= totalPages

      if (jobId) {
        if (morePages) {
          await updateSyncJob(supabase, jobId, {
            current_step: `Fetching time reports (page ${currentPage - 1}/${totalPages})...`,
            payload: { step_name: "time-reports", step_label: "Time Reports", reports: accumulated },
            batch_phase: "list",
            batch_offset: currentPage - 1,
            dispatch_lock: false,
          })
        } else {
          const total = accumulated.length
          await updateSyncJob(supabase, jobId, {
            total_items: total,
            processed_items: 0,
            current_step: "Upserting time reports...",
            payload: { step_name: "time-reports", step_label: "Time Reports", reports: accumulated, synced: 0, errors: 0 },
            batch_phase: "process",
            batch_offset: 0,
            dispatch_lock: false,
          })
        }
      }

      return new Response(
        JSON.stringify({ ok: true, phase: "list", morePages }),
        { headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      )
    }

    if (phase === "process") {
      let reports: Array<Record<string, unknown>> = []
      let prevSynced = 0
      let prevErrors = 0

      if (jobId) {
        const { data: jobRow } = await supabase
          .from("sync_jobs")
          .select("payload, total_items")
          .eq("id", jobId)
          .single()

        const payload = (jobRow as unknown as { payload: Record<string, unknown> } | null)?.payload
        reports = (payload?.reports as Array<Record<string, unknown>>) ?? []
        prevSynced = (payload?.synced as number) ?? 0
        prevErrors = (payload?.errors as number) ?? 0
      }

      const total = reports.length
      let synced = prevSynced
      let errors = prevErrors

      for (let i = 0; i < reports.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = reports.slice(i, i + UPSERT_CHUNK_SIZE)

        const mapped = chunk.map((tr) => {
          const transactionId = (tr.id as string) ?? ""
          const employeeId = (tr.EmployeeId as string) ?? ""
          const date = (tr.Date as string) ?? ""
          const causeCode = (tr.CauseCode as string) ?? ""
          const uniqueKey = transactionId || `${employeeId}-${date}-${causeCode}`

          return {
            unique_key: uniqueKey,
            report_id: transactionId || null,
            report_date: date || null,
            employee_id: employeeId || null,
            employee_name: null,
            fortnox_customer_number: (tr.CostCenter as string) ?? null,
            customer_name: null,
            project_number: (tr.Project as string) ?? null,
            project_name: null,
            activity: causeCode || null,
            article_number: null,
            hours: tr.Hours != null ? Number(tr.Hours) : null,
            description: causeCode || null,
          }
        })

        const { error: upsertError } = await supabase
          .from("time_reports")
          .upsert(mapped as never, { onConflict: "unique_key" })

        if (upsertError) {
          errors += chunk.length
        } else {
          synced += chunk.length
        }
      }

      if (jobId) {
        await updateSyncJob(supabase, jobId, {
          progress: 90,
          processed_items: total,
          current_step: "Computing hours KPI...",
          payload: { step_name: "time-reports", step_label: "Time Reports", synced, errors },
          batch_phase: "finalize",
          batch_offset: 0,
          dispatch_lock: false,
        })
      }

      return new Response(
        JSON.stringify({ ok: true, phase: "process", total, synced, errors }),
        { headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      )
    }

    if (phase === "finalize") {
      if (jobId) {
        await updateSyncJob(supabase, jobId, {
          current_step: "Computing hours KPI...",
          progress: 92,
        })
      }

      const { data: hoursRows } = await supabase
        .from("time_reports")
        .select("fortnox_customer_number, hours")

      if (hoursRows) {
        const hoursByCustomer = new Map<string, number>()

        for (const row of hoursRows as Array<{ fortnox_customer_number: string | null; hours: number | null }>) {
          if (!row.fortnox_customer_number) continue
          const existing = hoursByCustomer.get(row.fortnox_customer_number) ?? 0
          hoursByCustomer.set(row.fortnox_customer_number, existing + Number(row.hours ?? 0))
        }

        for (const [customerNumber, totalHours] of hoursByCustomer) {
          await supabase
            .from("customers")
            .update({ total_hours: totalHours } as never)
            .eq("fortnox_customer_number", customerNumber as never)
        }
      }

      let finalSynced = 0
      let finalErrors = 0
      let finalTotal = 0

      if (jobId) {
        const { data: jobRow } = await supabase
          .from("sync_jobs")
          .select("payload, total_items")
          .eq("id", jobId)
          .single()

        const payload = (jobRow as unknown as { payload: Record<string, unknown> } | null)?.payload
        finalSynced = (payload?.synced as number) ?? 0
        finalErrors = (payload?.errors as number) ?? 0
        finalTotal = (jobRow as unknown as { total_items: number } | null)?.total_items ?? 0

        await updateSyncJob(supabase, jobId, {
          status: "completed",
          progress: 100,
          current_step: "Done",
          processed_items: finalTotal,
          payload: { step_name: "time-reports", step_label: "Time Reports", synced: finalSynced, errors: finalErrors, total: finalTotal },
          batch_phase: null,
          dispatch_lock: false,
        })
      }

      return new Response(
        JSON.stringify({ ok: true, done: true, synced: finalSynced, errors: finalErrors, total: finalTotal }),
        { headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({ error: `Unknown phase: ${phase}` }),
      { status: 400, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"

    if (jobId) {
      await updateSyncJob(supabase, jobId, {
        status: "failed",
        error_message: message,
        dispatch_lock: false,
        batch_phase: null,
      })
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    )
  }
})
