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
        current_step: "Fetching invoices from Fortnox...",
      })
    }

    const client = await getFortnoxClient(supabase)

    const allInvoices: Array<Record<string, unknown>> = []
    let currentPage = 1
    let totalPages = 1

    do {
      const response = await client.getInvoices(currentPage, 100)
      totalPages = response.MetaInformation["@TotalPages"]
      const invoices = response.Invoices ?? []
      allInvoices.push(...invoices)

      currentPage++
      if (currentPage <= totalPages) await delay(RATE_LIMIT_DELAY_MS)
    } while (currentPage <= totalPages)

    const total = allInvoices.length

    if (jobId) {
      await updateSyncJob(supabase, jobId, {
        current_step: "Upserting invoices...",
        total_items: total,
        processed_items: 0,
      })
    }

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

    let synced = 0
    let errors = 0
    const CHUNK_SIZE = 100

    for (let i = 0; i < allInvoices.length; i += CHUNK_SIZE) {
      const chunk = allInvoices.slice(i, i + CHUNK_SIZE)

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
        console.error("Invoice upsert error:", upsertError)
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
        current_step: "Computing KPIs...",
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
    console.error("sync-invoices error:", message)

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
