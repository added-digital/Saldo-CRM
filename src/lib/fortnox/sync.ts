import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, FortnoxConnection } from "@/types/database"
import type { FortnoxCustomer, FortnoxEmployee } from "@/types/fortnox"
import { FortnoxClient } from "./client"
import { refreshAccessToken } from "./auth"

type AdminClient = SupabaseClient<Database>

async function getConnectionWithValidToken(
  supabase: AdminClient
): Promise<{ connection: FortnoxConnection; client: FortnoxClient }> {
  const { data, error } = await supabase
    .from("fortnox_connection")
    .select("*")
    .limit(1)
    .single()

  if (error || !data) {
    throw new Error("No Fortnox connection found")
  }

  const connection = data as unknown as FortnoxConnection

  const tokenExpiry = new Date(connection.token_expires_at)
  const bufferMs = 5 * 60 * 1000
  const isExpired = tokenExpiry.getTime() - bufferMs < Date.now()

  if (isExpired) {
    const tokens = await refreshAccessToken(connection.refresh_token)
    const newExpiry = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString()

    await supabase
      .from("fortnox_connection")
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: newExpiry,
      } as never)
      .eq("id", connection.id as never)

    return {
      connection: {
        ...connection,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: newExpiry,
      },
      client: new FortnoxClient(tokens.access_token),
    }
  }

  return {
    connection,
    client: new FortnoxClient(connection.access_token),
  }
}

export function mapFortnoxCustomerToDb(
  fortnoxCustomer: FortnoxCustomer
): Omit<
  Database["public"]["Tables"]["customers"]["Insert"],
  "account_manager_id"
> {
  return {
    fortnox_customer_number: fortnoxCustomer.CustomerNumber,
    name: fortnoxCustomer.Name,
    org_number: fortnoxCustomer.OrganisationNumber,
    email: fortnoxCustomer.Email,
    phone: fortnoxCustomer.Phone1,
    address_line1: fortnoxCustomer.Address1,
    address_line2: fortnoxCustomer.Address2,
    zip_code: fortnoxCustomer.ZipCode,
    city: fortnoxCustomer.City,
    country: fortnoxCustomer.Country ?? "SE",
    status: fortnoxCustomer.Active ? "active" : "archived",
    industry: null,
    revenue: null,
    employees: null,
    office: null,
    notes: null,
    start_date: null,
    fortnox_active: fortnoxCustomer.Active ?? null,
    bolagsverket_status: null,
    bolagsverket_registered_office: null,
    bolagsverket_board_count: null,
    bolagsverket_company_data: null,
    bolagsverket_board_data: null,
    bolagsverket_updated_at: null,
    fortnox_raw: fortnoxCustomer as unknown as Record<string, unknown>,
    last_synced_at: new Date().toISOString(),
  }
}

const BATCH_SIZE = 500
const UPSERT_CHUNK_SIZE = 100
const RATE_LIMIT_DELAY_MS = 250

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function syncAllCustomers(
  supabase: AdminClient
): Promise<{ synced: number; errors: number }> {
  const { connection, client } = await getConnectionWithValidToken(supabase)

  await supabase
    .from("fortnox_connection")
    .update({ sync_status: "syncing", sync_error: null } as never)
    .eq("id", connection.id as never)

  let synced = 0
  let errors = 0

  try {
    let currentPage = 1
    let totalPages = 1

    do {
      const response = await client.getCustomers(currentPage, BATCH_SIZE)

      totalPages = response.MetaInformation["@TotalPages"]
      const customers = response.Customers ?? []

      for (let i = 0; i < customers.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = customers.slice(i, i + UPSERT_CHUNK_SIZE)
        const mapped = chunk.map(mapFortnoxCustomerToDb)

        const { error: upsertError } = await supabase
          .from("customers")
          .upsert(mapped as never, {
            onConflict: "fortnox_customer_number",
            ignoreDuplicates: false,
          })

        if (upsertError) {
          console.error("Upsert error:", upsertError)
          errors += chunk.length
        } else {
          synced += chunk.length
        }
      }

      currentPage++

      if (currentPage <= totalPages) {
        await delay(RATE_LIMIT_DELAY_MS)
      }
    } while (currentPage <= totalPages)

    await supabase
      .from("fortnox_connection")
      .update({
        sync_status: "idle",
        sync_error: null,
        last_sync_at: new Date().toISOString(),
      } as never)
      .eq("id", connection.id as never)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    await supabase
      .from("fortnox_connection")
      .update({
        sync_status: "error",
        sync_error: message,
      } as never)
      .eq("id", connection.id as never)

    throw error
  }

  return { synced, errors }
}

export async function syncSingleCustomer(
  supabase: AdminClient,
  customerNumber: string
): Promise<void> {
  const { client } = await getConnectionWithValidToken(supabase)

  const response = await client.getCustomer(customerNumber)
  const mapped = mapFortnoxCustomerToDb(response.Customer)

  const { error } = await supabase
    .from("customers")
    .upsert(mapped as never, {
      onConflict: "fortnox_customer_number",
      ignoreDuplicates: false,
    })

  if (error) {
    throw new Error(`Failed to upsert customer ${customerNumber}: ${error.message}`)
  }
}

export async function syncEmployees(
  supabase: AdminClient
): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
  const { client } = await getConnectionWithValidToken(supabase)
  const response = await client.getEmployees()
  const employees = response.Employees ?? []

  const { data: existingUsers } = await supabase.auth.admin.listUsers()
  const usersByEmail = new Map(
    (existingUsers?.users ?? [])
      .filter((u) => u.email)
      .map((u) => [u.email!.toLowerCase(), u])
  )

  let created = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []

  for (const emp of employees) {
    try {
      if (emp.Inactive) {
        skipped++
        continue
      }

      if (!emp.Email) {
        skipped++
        continue
      }

      const fullName = emp.FullName ?? `${emp.FirstName ?? ""} ${emp.LastName ?? ""}`.trim()

      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id, fortnox_employee_id")
        .eq("fortnox_employee_id", emp.EmployeeId)
        .single<{ id: string; fortnox_employee_id: string | null }>()

      if (existingProfile) {
        await supabase
          .from("profiles")
          .update({
            full_name: fullName,
            fortnox_employee_id: emp.EmployeeId,
          } as never)
          .eq("id", existingProfile.id as never)

        updated++
        continue
      }

      const existingUser = usersByEmail.get(emp.Email.toLowerCase())

      if (existingUser) {
        await supabase
          .from("profiles")
          .update({
            full_name: fullName,
            fortnox_employee_id: emp.EmployeeId,
          } as never)
          .eq("id", existingUser.id as never)

        updated++
        continue
      }

      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: emp.Email,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      })

      if (createError || !newUser?.user) {
        errors.push(`Failed to create user for ${emp.Email}: ${createError?.message ?? "Unknown"}`)
        continue
      }

      await supabase
        .from("profiles")
        .update({
          fortnox_employee_id: emp.EmployeeId,
          full_name: fullName,
        } as never)
        .eq("id", newUser.user.id as never)

      created++
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      errors.push(`Error processing employee ${emp.EmployeeId}: ${message}`)
    }
  }

  return { created, updated, skipped, errors }
}

export async function linkCustomerAccountManagers(
  supabase: AdminClient
): Promise<{ linked: number; unmatched: number }> {
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, fortnox_employee_id")
    .not("fortnox_employee_id", "is", null)

  if (!profiles || profiles.length === 0) {
    return { linked: 0, unmatched: 0 }
  }

  const employeeMap = new Map<string, string>()
  for (const p of profiles) {
    const profile = p as unknown as { id: string; fortnox_employee_id: string }
    if (profile.fortnox_employee_id) {
      employeeMap.set(profile.fortnox_employee_id, profile.id)
    }
  }

  const { data: customers } = await supabase
    .from("customers")
    .select("id, fortnox_raw")
    .not("fortnox_raw", "is", null)

  if (!customers || customers.length === 0) {
    return { linked: 0, unmatched: 0 }
  }

  const typedCustomers = customers as unknown as {
    id: string
    fortnox_raw: Record<string, unknown> | null
  }[]

  let linked = 0
  let unmatched = 0

  for (const customer of typedCustomers) {
    const responsible = customer.fortnox_raw?.CustomerResponsible as string | undefined

    if (!responsible) {
      continue
    }

    const profileId = employeeMap.get(responsible)

    if (profileId) {
      await supabase
        .from("customers")
        .update({ account_manager_id: profileId } as never)
        .eq("id", customer.id as never)

      linked++
    } else {
      unmatched++
    }
  }

  return { linked, unmatched }
}
