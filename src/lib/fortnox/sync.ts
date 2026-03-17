import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, FortnoxConnection } from "@/types/database"
import type { FortnoxCustomer, FortnoxEmployee } from "@/types/fortnox"
import { FortnoxClient } from "./client"
import { requestAccessToken } from "./auth"

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

  if (!connection.fortnox_tenant_id) {
    throw new Error("No TenantId stored. Reconnect Fortnox via Settings → Integrations.")
  }

  const tokenExpiry = new Date(connection.token_expires_at)
  const bufferMs = 5 * 60 * 1000
  const isExpired = tokenExpiry.getTime() - bufferMs < Date.now()

  if (isExpired) {
    const tokens = await requestAccessToken(connection.fortnox_tenant_id)
    const newExpiry = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString()

    await supabase
      .from("fortnox_connection")
      .update({
        access_token: tokens.access_token,
        token_expires_at: newExpiry,
      } as never)
      .eq("id", connection.id as never)

    return {
      connection: {
        ...connection,
        access_token: tokens.access_token,
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
): Database["public"]["Tables"]["customers"]["Insert"] {
  return {
    fortnox_customer_number: fortnoxCustomer.CustomerNumber,
    name: fortnoxCustomer.Name,
    org_number: fortnoxCustomer.OrganisationNumber,
    email: fortnoxCustomer.Email,
    phone: fortnoxCustomer.Phone1,
    contact_name: fortnoxCustomer.YourReference ?? null,
    address_line1: fortnoxCustomer.Address1,
    address_line2: fortnoxCustomer.Address2,
    zip_code: fortnoxCustomer.ZipCode,
    city: fortnoxCustomer.City,
    country: fortnoxCustomer.Country ?? "SE",
    status: fortnoxCustomer.Active ? "active" : "archived",
    fortnox_cost_center: fortnoxCustomer.CostCenter ?? null,
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
const RATE_LIMIT_DELAY_MS = 350
const UPSERT_CHUNK_SIZE = 100

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeName(name: string): string {
  return name.replace(/\s+/g, " ").trim()
}

export async function syncCostCenters(
  supabase: AdminClient
): Promise<{ synced: number }> {
  const { client } = await getConnectionWithValidToken(supabase)
  const response = await client.getCostCenters()
  const costCenters = response.CostCenters ?? []

  if (costCenters.length === 0) {
    return { synced: 0 }
  }

  const mapped = costCenters.map((cc) => ({
    code: cc.Code,
    name: cc.Description ?? null,
    active: cc.Active ?? true,
  }))

  const { error } = await supabase
    .from("cost_centers")
    .upsert(mapped as never, { onConflict: "code" })

  if (error) {
    throw new Error(`Failed to upsert cost centers: ${error.message}`)
  }

  return { synced: costCenters.length }
}

export async function fetchAllCustomerNumbers(
  supabase: AdminClient
): Promise<{ customerNumbers: string[]; total: number }> {
  const { client } = await getConnectionWithValidToken(supabase)

  const allCustomerNumbers: string[] = []
  let currentPage = 1
  let totalPages = 1

  do {
    const response = await client.getCustomers(currentPage, BATCH_SIZE)
    totalPages = response.MetaInformation["@TotalPages"]
    const customers = response.Customers ?? []

    for (const c of customers) {
      if (c.CustomerNumber) {
        allCustomerNumbers.push(c.CustomerNumber)
      }
    }

    currentPage++
    if (currentPage <= totalPages) {
      await delay(RATE_LIMIT_DELAY_MS)
    }
  } while (currentPage <= totalPages)

  return { customerNumbers: allCustomerNumbers, total: allCustomerNumbers.length }
}

export async function syncCustomerBatch(
  supabase: AdminClient,
  customerNumbers: string[],
  fromIndex: number,
  batchSize: number
): Promise<{
  synced: number
  errors: number
  fromIndex: number
  nextIndex: number | null
  total: number
  remaining: number
}> {
  const { client } = await getConnectionWithValidToken(supabase)

  const batch = customerNumbers.slice(fromIndex, fromIndex + batchSize)
  let synced = 0
  let errors = 0

  for (const customerNumber of batch) {
    try {
      const response = await client.getCustomer(customerNumber)
      const mapped = mapFortnoxCustomerToDb(response.Customer)

      const { error: upsertError } = await supabase
        .from("customers")
        .upsert(mapped as never, {
          onConflict: "fortnox_customer_number",
          ignoreDuplicates: false,
        })

      if (upsertError) {
        console.error(`Upsert error for ${customerNumber}:`, upsertError)
        errors++
      } else {
        synced++
      }
    } catch (err) {
      console.error(`Failed to fetch customer ${customerNumber}:`, err)
      errors++
    }

    await delay(RATE_LIMIT_DELAY_MS)
  }

  const nextIndex = fromIndex + batch.length
  const remaining = Math.max(0, customerNumbers.length - nextIndex)

  return {
    synced,
    errors,
    fromIndex,
    nextIndex: remaining > 0 ? nextIndex : null,
    total: customerNumbers.length,
    remaining,
  }
}

export async function setSyncStatus(
  supabase: AdminClient,
  status: "syncing" | "idle" | "error",
  error?: string
) {
  const updateData: Record<string, unknown> = {
    sync_status: status,
    sync_error: error ?? null,
  }

  if (status === "idle") {
    updateData.last_sync_at = new Date().toISOString()
  }

  await supabase
    .from("fortnox_connection")
    .update(updateData as never)
    .neq("id", "" as never)
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

      const fullName = normalizeName(
        emp.FullName ?? `${emp.FirstName ?? ""} ${emp.LastName ?? ""}`
      )

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

export async function linkCostCentersToProfiles(
  supabase: AdminClient
): Promise<{ linked: number; unmatched: number }> {
  const { data: costCenters } = (await supabase
    .from("cost_centers")
    .select("code, name")
    .eq("active", true)) as unknown as {
    data: { code: string; name: string | null }[] | null
  }

  if (!costCenters || costCenters.length === 0) {
    return { linked: 0, unmatched: 0 }
  }

  const { data: profiles } = (await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("is_active", true)) as unknown as {
    data: { id: string; full_name: string | null }[] | null
  }

  if (!profiles || profiles.length === 0) {
    return { linked: 0, unmatched: 0 }
  }

  for (const p of profiles) {
    if (p.full_name && p.full_name !== normalizeName(p.full_name)) {
      await supabase
        .from("profiles")
        .update({ full_name: normalizeName(p.full_name) } as never)
        .eq("id", p.id as never)
      p.full_name = normalizeName(p.full_name)
    }
  }

  const nameToProfileId = new Map<string, string>()
  for (const p of profiles) {
    if (p.full_name) {
      nameToProfileId.set(normalizeName(p.full_name).toLowerCase(), p.id)
    }
  }

  let linked = 0
  let unmatched = 0

  for (const cc of costCenters) {
    if (!cc.name) {
      unmatched++
      continue
    }

    const profileId = nameToProfileId.get(normalizeName(cc.name).toLowerCase())

    if (profileId) {
      await supabase
        .from("profiles")
        .update({ fortnox_cost_center: cc.code } as never)
        .eq("id", profileId as never)

      linked++
    } else {
      unmatched++
    }
  }

  return { linked, unmatched }
}
