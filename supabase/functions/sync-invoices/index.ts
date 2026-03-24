import { createAdminClient } from "../_shared/supabase.ts"
import { getFortnoxClient, updateSyncJob, delay, corsHeaders } from "../_shared/sync-helpers.ts"

const RATE_LIMIT_DELAY_MS = 350
const INVOICE_DETAIL_DELAY_MS = 120
const PAGES_PER_BATCH = 10
const INVOICE_FROM_DATE = "2025-01-01"
const KPI_BATCH_SIZE = 1000

type InvoiceRowInsert = {
  invoice_number: string
  article_number: string | null
  article_name: string | null
  description: string | null
  quantity: number | null
  unit_price: number | null
  total: number | null
}

function toInvoiceRows(
  invoiceNumber: string,
  invoicePayload: Record<string, unknown> | null | undefined
): InvoiceRowInsert[] {
  const rawRows = (invoicePayload?.InvoiceRows ?? invoicePayload?.Rows ?? []) as unknown[]
  if (!Array.isArray(rawRows)) return []

  return rawRows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    .map((row) => ({
      invoice_number: invoiceNumber,
      article_number: row.ArticleNumber != null ? String(row.ArticleNumber) : (row.ArticleNo != null ? String(row.ArticleNo) : null),
      article_name: row.ArticleName != null ? String(row.ArticleName) : null,
      description: row.Description != null ? String(row.Description) : null,
      quantity: row.DeliveredQuantity != null
        ? Number(row.DeliveredQuantity)
        : (row.Quantity != null ? Number(row.Quantity) : null),
      unit_price: row.Price != null
        ? Number(row.Price)
        : (row.UnitPrice != null ? Number(row.UnitPrice) : null),
      total: row.Total != null ? Number(row.Total) : null,
    }))
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
          current_step: `Fetching invoices from ${INVOICE_FROM_DATE}...`,
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

      let prevSynced = 0
      let prevErrors = 0
      let prevTotal = 0

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
      }

      let synced = prevSynced
      let errors = prevErrors
      let totalFetched = prevTotal
      let skipped = 0
      let firstError: string | null = null

      const startPage = offset + 1
      let currentPage = startPage
      let totalPages = 1
      let pagesThisBatch = 0

      do {
        const response = await client.getInvoices(currentPage, 100, INVOICE_FROM_DATE)
        totalPages = response.MetaInformation["@TotalPages"]
        const invoices = response.Invoices ?? []

        const mapped = invoices
          .filter((inv: Record<string, unknown>) => {
            if (inv.DocumentNumber == null) return false
            const cn = inv.CustomerNumber != null ? String(inv.CustomerNumber) : null
            if (!cn || !customerMap.has(cn)) {
              skipped++
              return false
            }
            return true
          })
          .map((inv: Record<string, unknown>) => {
            const customerNumber = String(inv.CustomerNumber)
            return {
              document_number: String(inv.DocumentNumber),
              customer_id: customerMap.get(customerNumber) ?? null,
              fortnox_customer_number: customerNumber,
              customer_name: inv.CustomerName != null ? String(inv.CustomerName) : null,
              invoice_date: (inv.InvoiceDate as string) ?? null,
              total: inv.Total != null ? Number(inv.Total) : null,
              balance: inv.Balance != null ? Number(inv.Balance) : null,
              currency_code: inv.Currency != null ? String(inv.Currency) : "SEK",
            }
          })

        if (mapped.length > 0) {
          const { error: upsertError } = await supabase
            .from("invoices")
            .upsert(mapped as never, { onConflict: "document_number" })

          if (upsertError) {
            console.error("Invoice upsert error:", upsertError.message, upsertError.details)
            if (!firstError) firstError = upsertError.message
            errors += invoices.length
          } else {
            synced += mapped.length

            const invoiceNumbers = mapped.map((invoice) => invoice.document_number)
            const invoiceRows: InvoiceRowInsert[] = []

            for (const [index, invoiceNumber] of invoiceNumbers.entries()) {
              try {
                const invoiceResponse = await client.getInvoice(invoiceNumber)
                invoiceRows.push(...toInvoiceRows(invoiceNumber, invoiceResponse.Invoice))
              } catch (detailError) {
                const detailMessage = detailError instanceof Error ? detailError.message : "Unknown invoice detail error"
                if (!firstError) firstError = detailMessage
                errors += 1
              }

              if (index < invoiceNumbers.length - 1) {
                await delay(INVOICE_DETAIL_DELAY_MS)
              }
            }

            const { error: deleteRowsError } = await supabase
              .from("invoice_rows")
              .delete()
              .in("invoice_number", invoiceNumbers)

            if (deleteRowsError) {
              console.error("Invoice row delete error:", deleteRowsError.message, deleteRowsError.details)
              if (!firstError) firstError = deleteRowsError.message
              errors += invoiceNumbers.length
            } else if (invoiceRows.length > 0) {
              const { error: insertRowsError } = await supabase
                .from("invoice_rows")
                .insert(invoiceRows as never)

              if (insertRowsError) {
                console.error("Invoice row insert error:", insertRowsError.message, insertRowsError.details)
                if (!firstError) firstError = insertRowsError.message
                errors += invoiceRows.length
              }
            }
          }
        }

        totalFetched += invoices.length

        pagesThisBatch++
        currentPage++

        if (currentPage <= totalPages && pagesThisBatch < PAGES_PER_BATCH) {
          await delay(RATE_LIMIT_DELAY_MS)
        }
      } while (currentPage <= totalPages && pagesThisBatch < PAGES_PER_BATCH)

      const morePages = currentPage <= totalPages

      if (jobId) {
        const updatePayload: Record<string, unknown> = {
          step_name: "invoices",
          step_label: "Invoices",
          synced,
          errors,
          skipped,
          total: totalFetched,
        }
        if (firstError) updatePayload.upsert_error = firstError

        if (morePages) {
          await updateSyncJob(supabase, jobId, {
            current_step: `Syncing invoices (page ${currentPage - 1}/${totalPages}, ${synced} saved, ${skipped} skipped)...`,
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
            current_step: errors > 0 ? `Synced with ${errors} errors (${skipped} skipped), computing KPIs...` : `${synced} invoices saved (${skipped} skipped), computing KPIs...`,
            payload: updatePayload,
            batch_phase: "finalize",
            batch_offset: 0,
            dispatch_lock: false,
          })
        }
      }

      return new Response(
        JSON.stringify({ ok: true, phase: "list", morePages, synced, errors, skipped }),
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

      const turnoverByCustomer = new Map<string, { turnover: number; count: number }>()
      let offset = 0

      while (true) {
        const { data: kpiRows, error: kpiError } = await supabase
          .from("invoices")
          .select("fortnox_customer_number, total")
          .range(offset, offset + KPI_BATCH_SIZE - 1)

        if (kpiError) {
          throw new Error(`Failed to fetch invoice KPIs: ${kpiError.message}`)
        }

        const rows = (kpiRows ?? []) as Array<{ fortnox_customer_number: string | null; total: number | null }>
        if (rows.length === 0) break

        for (const row of rows) {
          if (!row.fortnox_customer_number) continue
          const existing = turnoverByCustomer.get(row.fortnox_customer_number) ?? { turnover: 0, count: 0 }
          existing.turnover += Number(row.total ?? 0)
          existing.count += 1
          turnoverByCustomer.set(row.fortnox_customer_number, existing)
        }

        if (rows.length < KPI_BATCH_SIZE) break
        offset += KPI_BATCH_SIZE
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
