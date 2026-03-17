import { createAdminClient } from "../_shared/supabase.ts"
import { getFortnoxClient, updateSyncJob, corsHeaders } from "../_shared/sync-helpers.ts"

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

    if (jobId) {
      await updateSyncJob(supabase, jobId, {
        status: "processing",
        current_step: "Fetching employees from Fortnox...",
      })
    }

    const client = await getFortnoxClient(supabase)
    const response = await client.getEmployees()
    const employees = (response.Employees ?? []) as Array<Record<string, unknown>>

    const { data: existingUsers } = await supabase.auth.admin.listUsers()
    const usersByEmail = new Map(
      (existingUsers?.users ?? [])
        .filter((u: { email?: string }) => u.email)
        .map((u: { email?: string; id: string }) => [u.email!.toLowerCase(), u])
    )

    let created = 0
    let updated = 0
    let skipped = 0
    const errors: string[] = []
    const total = employees.length

    for (let i = 0; i < employees.length; i++) {
      const emp = employees[i]

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
          errors.push(`Failed to create user for ${email}: ${createError?.message ?? "Unknown"}`)
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
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        errors.push(`Error processing employee ${emp.EmployeeId}: ${message}`)
      }

      if (jobId && i % 5 === 0) {
        const progress = Math.round((i / total) * 100)
        await updateSyncJob(supabase, jobId, {
          progress,
          processed_items: i,
          total_items: total,
        })
      }
    }

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

    if (jobId) {
      await updateSyncJob(supabase, jobId, {
        status: "completed",
        progress: 100,
        current_step: "Done",
        processed_items: total,
        payload: { created, updated, skipped, errors: errors.length, linked },
      })
    }

    return new Response(
      JSON.stringify({ created, updated, skipped, errors, linked }),
      { headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("sync-employees error:", message)

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
