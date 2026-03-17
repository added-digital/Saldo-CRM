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
          current_step: "Fetching invoices from Fortnox...",
        })
      }

      const startPage = offset + 1
      const allInvoices: Array<Record<string, unknown>> = []
      let currentPage = startPage
      let totalPages = 1
      let pagesThisBatch = 0

      do {
        const response = await client.getInvoices(currentPage, 100)
        totalPages = response.MetaInformation["@TotalPages"]
        const invoices = response.Invoices ?? []
        allInvoices.push(...invoices)

        pagesThisBatch++
        currentPage++

        if (currentPage <= totalPages && pagesThisBatch < PAGES_PER_BATCH) {
          await delay(RATE_LIMIT_DELAY_MS)
        }
      } while (currentPage <= totalPages && pagesThisBatch < PAGES_PER_BATCH)

      let existingInvoices: Array<Record<string, unknown>> = []
      if (jobId) {
        const { data: jobRow } = await supabase
          .from("sync_jobs")
          .select("payload")
          .eq("id", jobId)
          .single()

        const payload = (jobRow as unknown as { payload: Record<string, unknown> } | null)?.payload
        existingInvoices = (payload?.invoices as Array<Record<string, unknown>>) ?? []
      }

      const accumulated = [...existingInvoices, ...allInvoices]
      const morePages = currentPage <= totalPages

      if (jobId) {
        if (morePages) {
          await updateSyncJob(supabase, jobId, {
            current_step: `Fetching invoices (page ${currentPage - 1}/${totalPages})...`,
            payload: { step_name: "invoices", step_label: "Invoices", invoices: accumulated },
            batch_phase: "list",
            batch_offset: currentPage - 1,
            dispatch_lock: false,
          })
        } else {
          const total = accumulated.length
          await updateSyncJob(supabase, jobId, {
            total_items: total,
            processed_items: 0,
            current_step: "Upserting invoices...",
            payload: { step_name: "invoices", step_label: "Invoices", invoices: accumulated, synced: 0, errors: 0 },
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
      let invoices: Array<Record<string, unknown>> = []
      let prevSynced = 0
      let prevErrors = 0

      if (jobId) {
        const { data: jobRow } = await supabase
          .from("sync_jobs")
          .select("payload, total_items")
          .eq("id", jobId)
          .single()

        const payload = (jobRow as unknown as { payload: Record<string, unknown> } | null)?.payload
        invoices = (payload?.invoices as Array<Record<string, unknown>>) ?? []
        prevSynced = (payload?.synced as number) ?? 0
        prevErrors = (payload?.errors as number) ?? 0
      }

      const total = invoices.length

      const { data: customers } = await supabase
        .from("customers")
        .select("id, fortnox_customer_number")

      const customerMap = new Map<string, string>()
      if (customers) {
        for (const c of customers as Array<{ id: string; fortnox_customer_number: string | null }>) {
          if (c.fortnox_customer_number) {
            customerMap.set(c.fortnox_customer_number, c.id)
          }
        }
      }

      let synced = prevSynced
      let errors = prevErrors

      for (let i = 0; i < invoices.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = invoices.slice(i, i + UPSERT_CHUNK_SIZE)

        const mapped = chunk.map((inv) => {
          const customerNumber = (inv.CustomerNumber as string) ?? null
          return {
            document_number: inv.DocumentNumber as string,
            customer_id: customerNumber ? (customerMap.get(customerNumber) ?? null) : null,
            fortnox_customer_number: customerNumber,
            customer_name: (inv.CustomerName as string) ?? null,
            invoice_date: (inv.InvoiceDate as string) ?? null,
            total: inv.Total != null ? Number(inv.Total) : null,
            balance: inv.Balance != null ? Number(inv.Balance) : null,
            currency_code: (inv.Currency as string) ?? "SEK",
          }
        })

        const { error: upsertError } = await supabase
          .from("invoices")
          .upsert(mapped as never, { onConflict: "document_number" })

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
          current_step: "Computing KPIs...",
          payload: { step_name: "invoices", step_label: "Invoices", synced, errors },
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
          current_step: "Computing invoice KPIs...",
          progress: 92,
        })
      }

      const { data: kpiRows } = await supabase
        .from("invoices")
        .select("fortnox_customer_number, total")

      if (kpiRows) {
        const turnoverByCustomer = new Map<string, { turnover: number; count: number }>()

        for (const row of kpiRows as Array<{ fortnox_customer_number: string | null; total: number | null }>) {
          if (!row.fortnox_customer_number) continue
          const existing = turnoverByCustomer.get(row.fortnox_customer_number) ?? { turnover: 0, count: 0 }
          existing.turnover += Number(row.total ?? 0)
          existing.count += 1
          turnoverByCustomer.set(row.fortnox_customer_number, existing)
        }

        for (const [customerNumber, kpi] of turnoverByCustomer) {
          await supabase
            .from("customers")
            .update({
              total_turnover: kpi.turnover,
              invoice_count: kpi.count,
            } as never)
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
          payload: { step_name: "invoices", step_label: "Invoices", synced: finalSynced, errors: finalErrors, total: finalTotal },
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
