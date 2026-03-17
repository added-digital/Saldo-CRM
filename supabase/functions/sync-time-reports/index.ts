import { createAdminClient } from "../_shared/supabase.ts"
import { getFortnoxClient, updateSyncJob, delay, corsHeaders } from "../_shared/sync-helpers.ts"

const RATE_LIMIT_DELAY_MS = 350

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() })
  }

  const supabase = createAdminClient()
  let jobId: string | null = null

  try {
    const body = await req.json().catch(() => ({}))
    jobId = body.job_id ?? null

    if (jobId) {
      await updateSyncJob(supabase, jobId, {
        status: "processing",
        current_step: "Fetching time reports from Fortnox...",
      })
    }

    const client = await getFortnoxClient(supabase)

    const allReports: Array<Record<string, unknown>> = []
    let currentPage = 1
    let totalPages = 1

    do {
      const response = await client.getAttendanceTransactions(currentPage, 100)
      totalPages = response.MetaInformation?.["@TotalPages"] ?? 1
      const reports = response.AttendanceTransactions ?? []
      allReports.push(...reports)

      currentPage++
      if (currentPage <= totalPages) await delay(RATE_LIMIT_DELAY_MS)
    } while (currentPage <= totalPages)

    const total = allReports.length

    if (jobId) {
      await updateSyncJob(supabase, jobId, {
        current_step: "Upserting time reports...",
        total_items: total,
        processed_items: 0,
      })
    }

    let synced = 0
    let errors = 0
    const CHUNK_SIZE = 100

    for (let i = 0; i < allReports.length; i += CHUNK_SIZE) {
      const chunk = allReports.slice(i, i + CHUNK_SIZE)

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
        console.error("Time report upsert error:", upsertError)
        errors += chunk.length
      } else {
        synced += chunk.length
      }

      if (jobId) {
        const progress = Math.round(((i + chunk.length) / total) * 90)
        await updateSyncJob(supabase, jobId, {
          progress,
          processed_items: i + chunk.length,
        })
      }
    }

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

    if (jobId) {
      await updateSyncJob(supabase, jobId, {
        status: "completed",
        progress: 100,
        current_step: "Done",
        processed_items: total,
        payload: { synced, errors, total },
      })
    }

    return new Response(
      JSON.stringify({ synced, errors, total }),
      { headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("sync-time-reports error:", message)

    if (jobId) {
      await updateSyncJob(supabase, jobId, {
        status: "failed",
        error_message: message,
      })
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    )
  }
})
