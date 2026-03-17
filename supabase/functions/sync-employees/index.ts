import { createAdminClient } from "../_shared/supabase.ts"
import { getFortnoxClient, updateSyncJob, corsHeaders } from "../_shared/sync-helpers.ts"

const BATCH_SIZE = 15

function normalizeName(name: string): string {
  return name.replace(/\s+/g, " ").trim()
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
    const offset: number = body.offset ?? 0
    const phase: string = body.phase ?? "list"

    const client = await getFortnoxClient(supabase)

    if (phase === "list") {
      if (jobId) {
        await updateSyncJob(supabase, jobId, {
          status: "processing",
          current_step: "Fetching employees from Fortnox...",
        })
      }

      const response = await client.getEmployees()
      const employees = (response.Employees ?? []) as Array<Record<string, unknown>>

      const employeeList = employees.map((emp) => ({
        EmployeeId: emp.EmployeeId as string,
        Email: (emp.Email as string) ?? null,
        FullName: (emp.FullName as string) ?? null,
        FirstName: (emp.FirstName as string) ?? null,
        LastName: (emp.LastName as string) ?? null,
        Inactive: emp.Inactive as boolean | undefined,
      }))

      const total = employeeList.length

      if (jobId) {
        await updateSyncJob(supabase, jobId, {
          total_items: total,
          processed_items: 0,
          payload: { step_name: "employees", step_label: "Employees", employees: employeeList, created: 0, updated: 0, skipped: 0, errors: 0 },
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
      let employeeList: Array<Record<string, unknown>> = []
      let prevCreated = 0
      let prevUpdated = 0
      let prevSkipped = 0
      let prevErrors = 0

      if (jobId) {
        const { data: jobRow } = await supabase
          .from("sync_jobs")
          .select("payload")
          .eq("id", jobId)
          .single()

        const payload = (jobRow as unknown as { payload: Record<string, unknown> } | null)?.payload
        employeeList = (payload?.employees as Array<Record<string, unknown>>) ?? []
        prevCreated = (payload?.created as number) ?? 0
        prevUpdated = (payload?.updated as number) ?? 0
        prevSkipped = (payload?.skipped as number) ?? 0
        prevErrors = (payload?.errors as number) ?? 0
      }

      const total = employeeList.length
      const batch = employeeList.slice(offset, offset + BATCH_SIZE)

      const { data: existingUsers } = await supabase.auth.admin.listUsers()
      const usersByEmail = new Map(
        (existingUsers?.users ?? [])
          .filter((u: { email?: string }) => u.email)
          .map((u: { email?: string; id: string }) => [u.email!.toLowerCase(), u])
      )

      let created = prevCreated
      let updated = prevUpdated
      let skipped = prevSkipped
      let errors = prevErrors

      for (const emp of batch) {
        try {
          if (emp.Inactive) {
            skipped++
            continue
          }

          if (!emp.Email) {
            skipped++
            continue
          }

          const email = emp.Email as string
          const employeeId = emp.EmployeeId as string

          const fullName = normalizeName(
            (emp.FullName as string) ??
              `${(emp.FirstName as string) ?? ""} ${(emp.LastName as string) ?? ""}`
          )

          const { data: existingProfile } = await supabase
            .from("profiles")
            .select("id, fortnox_employee_id")
            .eq("fortnox_employee_id", employeeId)
            .single()

          if (existingProfile) {
            await supabase
              .from("profiles")
              .update({
                full_name: fullName,
                fortnox_employee_id: employeeId,
              } as never)
              .eq("id", (existingProfile as { id: string }).id as never)

            updated++
            continue
          }

          const existingUser = usersByEmail.get(email.toLowerCase())

          if (existingUser) {
            await supabase
              .from("profiles")
              .update({
                full_name: fullName,
                fortnox_employee_id: employeeId,
              } as never)
              .eq("id", (existingUser as { id: string }).id as never)

            updated++
            continue
          }

          const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          })

          if (createError || !newUser?.user) {
            errors++
            continue
          }

          await supabase
            .from("profiles")
            .update({
              fortnox_employee_id: employeeId,
              full_name: fullName,
            } as never)
            .eq("id", newUser.user.id as never)

          created++
        } catch {
          errors++
        }
      }

      const nextOffset = offset + BATCH_SIZE
      const isDone = nextOffset >= total

      if (jobId) {
        const progress = Math.round((Math.min(nextOffset, total) / total) * (isDone ? 95 : 90))
        await updateSyncJob(supabase, jobId, {
          progress,
          processed_items: Math.min(nextOffset, total),
          current_step: isDone ? "Linking cost centers..." : `Syncing employees (${Math.min(nextOffset, total)}/${total})...`,
          payload: { step_name: "employees", step_label: "Employees", employees: employeeList, created, updated, skipped, errors },
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
      const { data: activeCostCenters } = await supabase
        .from("cost_centers")
        .select("code, name")
        .eq("active", true)

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)

      let linked = 0

      if (activeCostCenters && profiles) {
        const nameToProfileId = new Map<string, string>()
        for (const p of profiles as Array<{ id: string; full_name: string | null }>) {
          if (p.full_name) {
            nameToProfileId.set(normalizeName(p.full_name).toLowerCase(), p.id)
          }
        }

        for (const cc of activeCostCenters as Array<{ code: string; name: string | null }>) {
          if (!cc.name) continue
          const profileId = nameToProfileId.get(normalizeName(cc.name).toLowerCase())
          if (profileId) {
            await supabase
              .from("profiles")
              .update({ fortnox_cost_center: cc.code } as never)
              .eq("id", profileId as never)
            linked++
          }
        }
      }

      let finalCreated = 0
      let finalUpdated = 0
      let finalSkipped = 0
      let finalErrors = 0
      let finalTotal = 0

      if (jobId) {
        const { data: jobRow } = await supabase
          .from("sync_jobs")
          .select("payload, total_items")
          .eq("id", jobId)
          .single()

        const payload = (jobRow as unknown as { payload: Record<string, unknown> } | null)?.payload
        finalCreated = (payload?.created as number) ?? 0
        finalUpdated = (payload?.updated as number) ?? 0
        finalSkipped = (payload?.skipped as number) ?? 0
        finalErrors = (payload?.errors as number) ?? 0
        finalTotal = (jobRow as unknown as { total_items: number } | null)?.total_items ?? 0

        await updateSyncJob(supabase, jobId, {
          status: "completed",
          progress: 100,
          current_step: "Done",
          processed_items: finalTotal,
          payload: { step_name: "employees", step_label: "Employees", created: finalCreated, updated: finalUpdated, skipped: finalSkipped, errors: finalErrors, linked },
          batch_phase: null,
          dispatch_lock: false,
        })
      }

      return new Response(
        JSON.stringify({ ok: true, done: true, created: finalCreated, updated: finalUpdated, skipped: finalSkipped, errors: finalErrors, linked }),
        { headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({ error: `Unknown phase: ${phase}` }),
      { status: 400, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("sync-employees error:", message)

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
