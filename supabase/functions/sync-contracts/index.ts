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
        current_step: "Fetching contracts from Fortnox...",
      })
    }

    const client = await getFortnoxClient(supabase)

    const allContracts: Array<Record<string, unknown>> = []
    let currentPage = 1
    let totalPages = 1

    do {
      const response = await client.getContracts(currentPage)
      totalPages = response.MetaInformation?.["@TotalPages"] ?? 1
      const contracts = response.Contracts ?? []
      allContracts.push(...contracts)

      currentPage++
      if (currentPage <= totalPages) await delay(RATE_LIMIT_DELAY_MS)
    } while (currentPage <= totalPages)

    const total = allContracts.length

    if (jobId) {
      await updateSyncJob(supabase, jobId, {
        current_step: "Fetching contract details...",
        total_items: total,
        processed_items: 0,
      })
    }

    let synced = 0
    let errors = 0

    for (let i = 0; i < allContracts.length; i++) {
      const contract = allContracts[i]
      const contractNumber = contract.DocumentNumber as string

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
          console.error("Contract upsert error:", upsertError)
          errors++
        } else {
          synced++
        }
      } catch {
        errors++
      }

      if (jobId && i % 5 === 0) {
        const progress = Math.round((i / total) * 90)
        await updateSyncJob(supabase, jobId, {
          progress,
          processed_items: i,
        })
      }

      await delay(RATE_LIMIT_DELAY_MS)
    }

    if (jobId) {
      await updateSyncJob(supabase, jobId, {
        current_step: "Computing contract value KPI...",
        progress: 92,
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
    console.error("sync-contracts error:", message)

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
