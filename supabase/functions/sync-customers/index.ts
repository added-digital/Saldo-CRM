import { createAdminClient } from "../_shared/supabase.ts"
import { getFortnoxClient, updateSyncJob, delay, corsHeaders } from "../_shared/sync-helpers.ts"

const RATE_LIMIT_DELAY_MS = 350
const BATCH_SIZE = 25
const LIST_PAGE_SIZE = 500

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() })
  }

  const supabase = createAdminClient()
  let jobId: string | null = null

  try {
    const body = await req.json().catch(() => ({}))
    jobId = body.job_id ?? null
    const offset: number = body.offset ?? 0
    const phase: string = body.phase ?? "list"

    const client = await getFortnoxClient(supabase)

    if (phase === "list") {
      if (jobId) {
        await updateSyncJob(supabase, jobId, {
          status: "processing",
          current_step: "Syncing cost centers...",
        })
      }

      const costCenterResponse = await client.getCostCenters()
      const costCenters = (costCenterResponse.CostCenters ?? []) as Array<{
        Code: string
        Description: string
        Active: boolean
      }>

      if (costCenters.length > 0) {
        const mapped = costCenters.map((cc) => ({
          code: cc.Code,
          name: cc.Description ?? null,
          active: cc.Active ?? true,
        }))

        await supabase
          .from("cost_centers")
          .upsert(mapped as never, { onConflict: "code" })
      }

      if (jobId) {
        await updateSyncJob(supabase, jobId, {
          current_step: "Fetching customer list...",
        })
      }

      const allCustomerNumbers: string[] = []
      let currentPage = 1
      let totalPages = 1

      do {
        const response = await client.getCustomers(currentPage, LIST_PAGE_SIZE)
        totalPages = response.MetaInformation["@TotalPages"]
        const customers = response.Customers ?? []

        for (const c of customers) {
          const num = c.CustomerNumber as string | undefined
          if (num) allCustomerNumbers.push(num)
        }

        currentPage++
        if (currentPage <= totalPages) await delay(RATE_LIMIT_DELAY_MS)
      } while (currentPage <= totalPages)

      const total = allCustomerNumbers.length

      if (jobId) {
        await updateSyncJob(supabase, jobId, {
          current_step: "Syncing customers...",
          total_items: total,
          processed_items: 0,
          payload: { step_name: "customers", step_label: "Customers", customer_numbers: allCustomerNumbers, synced: 0, errors: 0 },
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
      let customerNumbers: string[] = []
      let prevSynced = 0
      let prevErrors = 0

      if (jobId) {
        const { data: jobRow } = await supabase
          .from("sync_jobs")
          .select("payload, total_items")
          .eq("id", jobId)
          .single()

        const payload = (jobRow as unknown as { payload: Record<string, unknown> } | null)?.payload
        customerNumbers = (payload?.customer_numbers as string[]) ?? []
        prevSynced = (payload?.synced as number) ?? 0
        prevErrors = (payload?.errors as number) ?? 0
      }

      const total = customerNumbers.length
      const batch = customerNumbers.slice(offset, offset + BATCH_SIZE)

      let synced = prevSynced
      let errors = prevErrors

      for (const customerNumber of batch) {
        try {
          const response = await client.getCustomer(customerNumber)
          const fc = response.Customer as Record<string, unknown>

          const mapped = {
            fortnox_customer_number: fc.CustomerNumber as string,
            name: fc.Name as string,
            org_number: (fc.OrganisationNumber as string) ?? null,
            email: (fc.Email as string) ?? null,
            phone: (fc.Phone1 as string) ?? null,
            contact_name: (fc.YourReference as string) ?? null,
            address_line1: (fc.Address1 as string) ?? null,
            address_line2: (fc.Address2 as string) ?? null,
            zip_code: (fc.ZipCode as string) ?? null,
            city: (fc.City as string) ?? null,
            country: (fc.Country as string) ?? "SE",
            status: fc.Active ? "active" : "archived",
            fortnox_cost_center: (fc.CostCenter as string) ?? null,
            fortnox_active: (fc.Active as boolean) ?? null,
            fortnox_raw: fc,
            last_synced_at: new Date().toISOString(),
          }

          const { error: upsertError } = await supabase
            .from("customers")
            .upsert(mapped as never, {
              onConflict: "fortnox_customer_number",
              ignoreDuplicates: false,
            })

          if (upsertError) {
            console.error("Customer upsert error:", upsertError.message, upsertError.details)
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
      const progress = Math.round((Math.min(nextOffset, total) / total) * (isDone ? 100 : 95))

      if (jobId) {
        await updateSyncJob(supabase, jobId, {
          progress,
          processed_items: Math.min(nextOffset, total),
          payload: { step_name: "customers", step_label: "Customers", customer_numbers: customerNumbers, synced, errors },
          current_step: isDone ? "Linking cost centers..." : `Syncing customers (${Math.min(nextOffset, total)}/${total})...`,
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
          current_step: "Linking cost centers to profiles...",
          progress: 96,
        })
      }

      const { data: activeCostCenters } = await supabase
        .from("cost_centers")
        .select("code, name")
        .eq("active", true)

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)

      if (activeCostCenters && profiles) {
        const nameToProfileId = new Map<string, string>()
        for (const p of profiles as Array<{ id: string; full_name: string | null }>) {
          if (p.full_name) {
            nameToProfileId.set(p.full_name.replace(/\s+/g, " ").trim().toLowerCase(), p.id)
          }
        }

        for (const cc of activeCostCenters as Array<{ code: string; name: string | null }>) {
          if (!cc.name) continue
          const profileId = nameToProfileId.get(cc.name.replace(/\s+/g, " ").trim().toLowerCase())
          if (profileId) {
            await supabase
              .from("profiles")
              .update({ fortnox_cost_center: cc.code } as never)
              .eq("id", profileId as never)
          }
        }
      }

      await supabase
        .from("fortnox_connection")
        .update({
          sync_status: "idle",
          sync_error: null,
          last_sync_at: new Date().toISOString(),
        } as never)
        .neq("id", "" as never)

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
          payload: { step_name: "customers", step_label: "Customers", synced: finalSynced, errors: finalErrors, total: finalTotal },
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
    console.error("sync-customers error:", message)

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
