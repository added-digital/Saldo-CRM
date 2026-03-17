import { createAdminClient } from "../_shared/supabase.ts"
import { getFortnoxClient, updateSyncJob, delay, corsHeaders } from "../_shared/sync-helpers.ts"

const RATE_LIMIT_DELAY_MS = 350
const BATCH_SIZE = 15

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
          current_step: "Fetching contracts from Fortnox...",
        })
      }

      const allContractNumbers: string[] = []
      let currentPage = 1
      let totalPages = 1

      do {
        const response = await client.getContracts(currentPage)
        totalPages = response.MetaInformation?.["@TotalPages"] ?? 1
        const contracts = response.Contracts ?? []

        for (const c of contracts) {
          const num = c.DocumentNumber as string | undefined
          if (num) allContractNumbers.push(num)
        }

        currentPage++
        if (currentPage <= totalPages) await delay(RATE_LIMIT_DELAY_MS)
      } while (currentPage <= totalPages)

      const total = allContractNumbers.length

      if (jobId) {
        await updateSyncJob(supabase, jobId, {
          current_step: "Fetching contract details...",
          total_items: total,
          processed_items: 0,
          payload: { step_name: "contracts", step_label: "Contracts", contract_numbers: allContractNumbers, synced: 0, errors: 0 },
          batch_phase: "process",
          batch_offset: 0,
          dispatch_lock: false,
        })
      }

      return new Response(
        JSON.stringify({ ok: true, phase: "list", total }),
        { headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      )
    }

    if (phase === "process") {
      let contractNumbers: string[] = []
      let prevSynced = 0
      let prevErrors = 0

      if (jobId) {
        const { data: jobRow } = await supabase
          .from("sync_jobs")
          .select("payload, total_items")
          .eq("id", jobId)
          .single()

        const payload = (jobRow as unknown as { payload: Record<string, unknown> } | null)?.payload
        contractNumbers = (payload?.contract_numbers as string[]) ?? []
        prevSynced = (payload?.synced as number) ?? 0
        prevErrors = (payload?.errors as number) ?? 0
      }

      const total = contractNumbers.length
      const batch = contractNumbers.slice(offset, offset + BATCH_SIZE)

      let synced = prevSynced
      let errors = prevErrors

      for (const contractNumber of batch) {
        try {
          const detail = await client.getContract(contractNumber)
          const c = detail.Contract as Record<string, unknown>

          const mapped = {
            fortnox_customer_number: (c.CustomerNumber as string) ?? "",
            contract_number: contractNumber,
            customer_name: (c.CustomerName as string) ?? null,
            description: (c.Remarks as string) ?? null,
            start_date: (c.PeriodStart as string) ?? null,
            end_date: (c.PeriodEnd as string) ?? null,
            status: (c.Status as string) ?? null,
            accrual_type: (c.ContractLength as string) ?? null,
            period: (c.InvoiceInterval as string) ?? null,
            total: c.Total != null ? Number(c.Total) : null,
            currency_code: (c.Currency as string) ?? "SEK",
            raw_data: c,
          }

          const { error: upsertError } = await supabase
            .from("contract_accruals")
            .upsert(mapped as never, {
              onConflict: "fortnox_customer_number,contract_number",
            })

          if (upsertError) {
            errors++
          } else {
            synced++
          }
        } catch {
          errors++
        }

        await delay(RATE_LIMIT_DELAY_MS)
      }

      const nextOffset = offset + BATCH_SIZE
      const isDone = nextOffset >= total
      const progress = Math.round((Math.min(nextOffset, total) / total) * (isDone ? 95 : 90))

      if (jobId) {
        await updateSyncJob(supabase, jobId, {
          progress,
          processed_items: Math.min(nextOffset, total),
          current_step: isDone ? "Computing contract KPIs..." : `Syncing contracts (${Math.min(nextOffset, total)}/${total})...`,
          payload: { step_name: "contracts", step_label: "Contracts", contract_numbers: contractNumbers, synced, errors },
          batch_phase: isDone ? "finalize" : "process",
          batch_offset: isDone ? 0 : nextOffset,
          dispatch_lock: false,
        })
      }

      return new Response(
        JSON.stringify({ ok: true, phase: "process", processed: Math.min(nextOffset, total), total }),
        { headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      )
    }

    if (phase === "finalize") {
      if (jobId) {
        await updateSyncJob(supabase, jobId, {
          current_step: "Computing contract value KPI...",
          progress: 96,
        })
      }

      const { data: contractRows } = await supabase
        .from("contract_accruals")
        .select("fortnox_customer_number, total")

      if (contractRows) {
        const valueByCustomer = new Map<string, number>()

        for (const row of contractRows as Array<{ fortnox_customer_number: string; total: number | null }>) {
          if (!row.fortnox_customer_number) continue
          const existing = valueByCustomer.get(row.fortnox_customer_number) ?? 0
          valueByCustomer.set(row.fortnox_customer_number, existing + Number(row.total ?? 0))
        }

        for (const [customerNumber, contractValue] of valueByCustomer) {
          await supabase
            .from("customers")
            .update({ contract_value: contractValue } as never)
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
          payload: { step_name: "contracts", step_label: "Contracts", synced: finalSynced, errors: finalErrors, total: finalTotal },
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
