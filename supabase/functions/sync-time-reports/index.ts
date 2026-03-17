import { createAdminClient } from "../_shared/supabase.ts"
import { getFortnoxClient, updateSyncJob, delay, corsHeaders } from "../_shared/sync-helpers.ts"

const RATE_LIMIT_DELAY_MS = 350
const PAGES_PER_BATCH = 10
const TIME_REPORT_FROM_DATE = "2025-01-01"

function isOnOrAfter(dateValue: string | null, minDate: string): boolean {
  if (!dateValue) return false
  return dateValue >= minDate
}

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
          current_step: `Fetching time reports from ${TIME_REPORT_FROM_DATE}...`,
        })
      }

      const { data: customers } = await supabase
        .from("customers")
        .select("id, name, fortnox_customer_number, fortnox_cost_center")

      const customerByCostCenter = new Map<string, {
        id: string
        name: string
        fortnox_customer_number: string | null
      }>()

      if (customers) {
        for (const customer of customers as Array<{
          id: string
          name: string
          fortnox_customer_number: string | null
          fortnox_cost_center: string | null
        }>) {
          if (customer.fortnox_cost_center) {
            customerByCostCenter.set(customer.fortnox_cost_center, {
              id: customer.id,
              name: customer.name,
              fortnox_customer_number: customer.fortnox_customer_number,
            })
          }
        }
      }

      let prevSynced = 0
      let prevErrors = 0
      let prevTotal = 0
      let prevSkipped = 0

      if (jobId && offset > 0) {
        const { data: jobRow } = await supabase
          .from("sync_jobs")
          .select("payload")
          .eq("id", jobId)
          .single()

        const payload = (jobRow as unknown as { payload: Record<string, unknown> } | null)?.payload
        prevSynced = (payload?.synced as number) ?? 0
        prevErrors = (payload?.errors as number) ?? 0
        prevTotal = (payload?.total as number) ?? 0
        prevSkipped = (payload?.skipped as number) ?? 0
      }

      let synced = prevSynced
      let errors = prevErrors
      let totalFetched = prevTotal
      let skipped = prevSkipped
      let firstError: string | null = null

      const startPage = offset + 1
      let currentPage = startPage
      let totalPages = 1
      let pagesThisBatch = 0

      do {
        const response = await client.getAttendanceTransactions(currentPage, 100)
        totalPages = response.MetaInformation?.["@TotalPages"] ?? 1
        const reports = response.AttendanceTransactions ?? []

        const mapped = reports
          .filter((tr: Record<string, unknown>) => {
            const transactionId = tr.id != null ? String(tr.id) : ""
            const employeeId = tr.EmployeeId != null ? String(tr.EmployeeId) : ""
            const date = tr.Date != null ? String(tr.Date) : ""
            const causeCode = tr.CauseCode != null ? String(tr.CauseCode) : ""
            const costCenter = tr.CostCenter != null ? String(tr.CostCenter) : ""
            if (!isOnOrAfter(date || null, TIME_REPORT_FROM_DATE)) {
              skipped++
              return false
            }
            if (!costCenter || !customerByCostCenter.has(costCenter)) {
              skipped++
              return false
            }
            return transactionId || (employeeId && date && causeCode)
          })
          .map((tr: Record<string, unknown>) => {
            const transactionId = tr.id != null ? String(tr.id) : ""
            const employeeId = tr.EmployeeId != null ? String(tr.EmployeeId) : ""
            const date = tr.Date != null ? String(tr.Date) : ""
            const causeCode = tr.CauseCode != null ? String(tr.CauseCode) : ""
            const costCenter = tr.CostCenter != null ? String(tr.CostCenter) : ""
            const uniqueKey = transactionId || `${employeeId}-${date}-${causeCode}`
            const customer = customerByCostCenter.get(costCenter) ?? null

            return {
              unique_key: uniqueKey,
              customer_id: customer?.id ?? null,
              report_id: transactionId || null,
              report_date: date || null,
              employee_id: employeeId || null,
              employee_name: null,
              fortnox_customer_number: customer?.fortnox_customer_number ?? null,
              customer_name: customer?.name ?? null,
              project_number: tr.Project != null ? String(tr.Project) : null,
              project_name: null,
              activity: causeCode || null,
              article_number: null,
              hours: tr.Hours != null ? Number(tr.Hours) : null,
              description: causeCode || null,
            }
          })

        if (mapped.length > 0) {
          const { error: upsertError } = await supabase
            .from("time_reports")
            .upsert(mapped as never, { onConflict: "unique_key" })

          if (upsertError) {
            console.error("Time report upsert error:", upsertError.message, upsertError.details)
            if (!firstError) firstError = upsertError.message
            errors += reports.length
          } else {
            synced += mapped.length
          }
        }

        totalFetched += reports.length

        pagesThisBatch++
        currentPage++

        if (currentPage <= totalPages && pagesThisBatch < PAGES_PER_BATCH) {
          await delay(RATE_LIMIT_DELAY_MS)
        }
      } while (currentPage <= totalPages && pagesThisBatch < PAGES_PER_BATCH)

      const morePages = currentPage <= totalPages

      if (jobId) {
        const updatePayload: Record<string, unknown> = {
          step_name: "time-reports",
          step_label: "Time Reports",
          synced,
          errors,
          skipped,
          total: totalFetched,
        }
        if (firstError) updatePayload.upsert_error = firstError

        if (morePages) {
          await updateSyncJob(supabase, jobId, {
            current_step: `Syncing time reports (page ${currentPage - 1}/${totalPages}, ${synced} saved, ${skipped} skipped)...`,
            total_items: totalPages * 100,
            processed_items: totalFetched,
            progress: Math.round(((currentPage - 1) / totalPages) * 80),
            payload: updatePayload,
            batch_phase: "list",
            batch_offset: currentPage - 1,
            dispatch_lock: false,
          })
        } else {
          await updateSyncJob(supabase, jobId, {
            total_items: totalFetched,
            processed_items: totalFetched,
            progress: 90,
            current_step: errors > 0 ? `Synced with ${errors} errors (${skipped} skipped), computing KPIs...` : `${synced} time reports saved (${skipped} skipped), computing KPIs...`,
            payload: updatePayload,
            batch_phase: "finalize",
            batch_offset: 0,
            dispatch_lock: false,
          })
        }
      }

      return new Response(
        JSON.stringify({ ok: true, phase: "list", morePages, synced, errors }),
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
        .select("customer_id, fortnox_customer_number, hours")

      if (hoursRows) {
        const hoursByCustomerId = new Map<string, number>()

        for (const row of hoursRows as Array<{ customer_id?: string | null; fortnox_customer_number: string | null; hours: number | null }>) {
          if (!row.customer_id) continue
          const existing = hoursByCustomerId.get(row.customer_id) ?? 0
          hoursByCustomerId.set(row.customer_id, existing + Number(row.hours ?? 0))
        }

        for (const [customerId, totalHours] of hoursByCustomerId) {
          await supabase
            .from("customers")
            .update({ total_hours: totalHours } as never)
            .eq("id", customerId as never)
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
