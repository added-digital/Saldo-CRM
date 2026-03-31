import { createAdminClient } from "../_shared/supabase.ts"
import { getFortnoxClient, updateSyncJob, delay, corsHeaders } from "../_shared/sync-helpers.ts"

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

const INVOICE_DETAIL_DELAY_MS = 220
const INVOICE_BATCH_SIZE = 90

type InvoiceRowInsert = {
  invoice_number: string
  article_number: string | null
  article_name: string | null
  description: string | null
  quantity: number | null
  unit_price: number | null
  total_ex_vat: number | null
  total: number | null
}

function readNumberField(
  record: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = record[key]
    if (value == null) continue
    const numeric = Number(value)
    if (!Number.isNaN(numeric)) {
      return numeric
    }
  }

  return null
}

function resolveExVatTotal(record: Record<string, unknown>): number | null {
  const explicitExVat = readNumberField(record, [
    "PriceExcludingVAT",
    "PriceExcludingVat",
    "RowAmountExcludingVAT",
    "RowAmountExcludingVat",
    "TotalExcludingVAT",
    "TotalExcludingVat",
    "TotalExVAT",
    "TotalExVat",
    "Net",
    "NetAmount",
    "TotalNet",
  ])

  if (explicitExVat != null) {
    return explicitExVat
  }

  return readNumberField(record, ["Price", "UnitPrice"])
}

function toInvoiceRows(
  invoiceNumber: string,
  invoicePayload: Record<string, unknown> | null | undefined,
): InvoiceRowInsert[] {
  const rawRows = (invoicePayload?.InvoiceRows ?? invoicePayload?.Rows ?? []) as unknown[]
  if (!Array.isArray(rawRows)) return []

  return rawRows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    .map((row) => {
      const price = readNumberField(row, ["Price", "UnitPrice"])

      if (price === 0) {
        return null
      }

      return {
      invoice_number: invoiceNumber,
      article_number: row.ArticleNumber != null ? String(row.ArticleNumber) : (row.ArticleNo != null ? String(row.ArticleNo) : null),
      article_name: row.ArticleName != null ? String(row.ArticleName) : null,
      description: row.Description != null ? String(row.Description) : null,
      quantity: row.DeliveredQuantity != null
        ? Number(row.DeliveredQuantity)
        : (row.Quantity != null ? Number(row.Quantity) : null),
      unit_price: price,
      total_ex_vat: resolveExVatTotal(row),
      total: row.Total != null ? Number(row.Total) : null,
    }
    })
    .filter((row): row is InvoiceRowInsert => row !== null)
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
          current_step: "Preparing invoice row sync...",
          progress: 5,
        })
      }

      const { count, error: countError } = await supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })

      if (countError) {
        throw new Error(`Failed to count invoices: ${countError.message}`)
      }

      const total = count ?? 0

      if (jobId) {
        await updateSyncJob(supabase, jobId, {
          total_items: total,
          processed_items: 0,
          progress: total > 0 ? 10 : 100,
          current_step: total > 0 ? `Syncing invoice rows (0/${total})...` : "No invoices found",
          payload: {
            step_name: "invoice-rows",
            step_label: "Invoice Rows",
            synced: 0,
            errors: 0,
            total,
          },
          status: total > 0 ? "processing" : "completed",
          batch_phase: total > 0 ? "process" : null,
          batch_offset: 0,
          dispatch_lock: false,
        })
      }

      return new Response(
        JSON.stringify({ ok: true, phase: "list", total }),
        { headers: { ...corsHeaders(), "Content-Type": "application/json" } },
      )
    }

    if (phase === "process") {
      let prevSynced = 0
      let prevErrors = 0
      let total = 0

      if (jobId) {
        const { data: jobRow } = await supabase
          .from("sync_jobs")
          .select("payload, total_items")
          .eq("id", jobId)
          .single()

        const payload = (jobRow as unknown as { payload: Record<string, unknown> } | null)?.payload
        prevSynced = (payload?.synced as number) ?? 0
        prevErrors = (payload?.errors as number) ?? 0
        total = (jobRow as unknown as { total_items: number } | null)?.total_items ?? 0
      }

      const { data: invoiceRows, error: invoiceListError } = await supabase
        .from("invoices")
        .select("document_number")
        .order("id", { ascending: true })
        .range(offset, offset + INVOICE_BATCH_SIZE - 1)

      if (invoiceListError) {
        throw new Error(`Failed to read invoices for row sync: ${invoiceListError.message}`)
      }

      const invoices = (invoiceRows ?? []) as Array<{ document_number: string }>
      if (invoices.length === 0) {
        if (jobId) {
          await updateSyncJob(supabase, jobId, {
            progress: 95,
            current_step: "Finalizing invoice rows sync...",
            batch_phase: "finalize",
            batch_offset: 0,
            dispatch_lock: false,
          })
        }

        return new Response(
          JSON.stringify({ ok: true, phase: "process", processed: offset, total }),
          { headers: { ...corsHeaders(), "Content-Type": "application/json" } },
        )
      }

      const invoiceNumbers = invoices.map((invoice) => invoice.document_number)
      const rowInserts: InvoiceRowInsert[] = []
      let synced = prevSynced
      let errors = prevErrors
      let firstError: string | null = null

      for (const [index, invoiceNumber] of invoiceNumbers.entries()) {
        try {
          const invoiceResponse = await client.getInvoice(invoiceNumber)
          rowInserts.push(...toInvoiceRows(invoiceNumber, invoiceResponse.Invoice))
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
        if (!firstError) firstError = deleteRowsError.message
        errors += invoiceNumbers.length
      } else if (rowInserts.length > 0) {
        const { error: insertRowsError } = await supabase
          .from("invoice_rows")
          .insert(rowInserts as never)

        if (insertRowsError) {
          if (!firstError) firstError = insertRowsError.message
          errors += rowInserts.length
        }
      }

      synced += invoiceNumbers.length

      const processed = offset + invoices.length
      const isDone = total > 0 ? processed >= total : invoices.length < INVOICE_BATCH_SIZE

      if (jobId) {
        const updatePayload: Record<string, unknown> = {
          step_name: "invoice-rows",
          step_label: "Invoice Rows",
          synced,
          errors,
          total,
        }

        if (firstError) updatePayload.upsert_error = firstError

        await updateSyncJob(supabase, jobId, {
          current_step: isDone
            ? `Synced invoice rows (${processed}/${total}), finalizing...`
            : `Syncing invoice rows (${processed}/${total})...`,
          total_items: total,
          processed_items: processed,
          progress: total > 0 ? Math.min(95, 10 + Math.round((processed / total) * 85)) : 95,
          payload: updatePayload,
          batch_phase: isDone ? "finalize" : "process",
          batch_offset: isDone ? 0 : processed,
          dispatch_lock: false,
        })
      }

      return new Response(
        JSON.stringify({ ok: true, phase: "process", processed, total }),
        { headers: { ...corsHeaders(), "Content-Type": "application/json" } },
      )
    }

    if (phase === "finalize") {
      let synced = 0
      let errors = 0
      let total = 0

      if (jobId) {
        const { data: jobRow } = await supabase
          .from("sync_jobs")
          .select("payload, total_items")
          .eq("id", jobId)
          .single()

        const payload = (jobRow as unknown as { payload: Record<string, unknown> } | null)?.payload
        synced = (payload?.synced as number) ?? 0
        errors = (payload?.errors as number) ?? 0
        total = (jobRow as unknown as { total_items: number } | null)?.total_items ?? 0

        await updateSyncJob(supabase, jobId, {
          status: "completed",
          progress: 100,
          current_step: "Done",
          processed_items: total,
          payload: {
            step_name: "invoice-rows",
            step_label: "Invoice Rows",
            synced,
            errors,
            total,
          },
          batch_phase: null,
          dispatch_lock: false,
        })
      }

      return new Response(
        JSON.stringify({ ok: true, done: true, synced, errors, total }),
        { headers: { ...corsHeaders(), "Content-Type": "application/json" } },
      )
    }

    return new Response(
      JSON.stringify({ error: `Unknown phase: ${phase}` }),
      { status: 400, headers: { ...corsHeaders(), "Content-Type": "application/json" } },
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
      { status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" } },
    )
  }
})
