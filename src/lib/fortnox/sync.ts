import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, FortnoxConnection } from "@/types/database"
import type { FortnoxCustomer } from "@/types/fortnox"
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
