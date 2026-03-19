import { NextRequest, NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { syncPrimaryContactToFortnox } from "@/lib/fortnox/sync"
import { createClient } from "@/lib/supabase/server"
import type { Customer, CustomerContact, Profile } from "@/types/database"

type PrimaryRow = {
  customer_id: string
  contact: Pick<CustomerContact, "name" | "first_name" | "last_name" | "email" | "phone"> | null
}

async function authorize() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<Pick<Profile, "role">>()

  return profile?.role === "admin" ? user : null
}

function deriveContactName(
  contact: Pick<CustomerContact, "name" | "first_name" | "last_name">
): string | null {
  const fromNames = [contact.first_name?.trim(), contact.last_name?.trim()]
    .filter(Boolean)
    .join(" ")
  if (fromNames) return fromNames
  return contact.name?.trim() || null
}

export async function POST(request: NextRequest) {
  try {
    const user = await authorize()
    if (!user) {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const customerIds = Array.isArray(body.customerIds)
      ? body.customerIds.filter(
          (value: unknown): value is string =>
            typeof value === "string" && value.trim().length > 0
        )
      : []

    if (customerIds.length === 0) {
      return NextResponse.json({ synced: 0, skipped: 0, failed: 0 })
    }

    const uniqueCustomerIds = Array.from(new Set(customerIds))
    const adminClient = createAdminClient()

    const { data: customerRows, error: customersError } = await adminClient
      .from("customers")
      .select("id, fortnox_customer_number")
      .in("id", uniqueCustomerIds)

    if (customersError) {
      return NextResponse.json({ error: customersError.message }, { status: 500 })
    }

    const { data: primaryRows, error: primaryError } = await adminClient
      .from("customer_contact_links")
      .select("customer_id, contact:customer_contacts(name, first_name, last_name, email, phone)")
      .in("customer_id", uniqueCustomerIds)
      .eq("is_primary", true)
      .order("created_at", { ascending: false })

    if (primaryError) {
      return NextResponse.json({ error: primaryError.message }, { status: 500 })
    }

    const primaryByCustomerId = new Map<string, NonNullable<PrimaryRow["contact"]>>()
    for (const row of (primaryRows ?? []) as unknown as PrimaryRow[]) {
      if (!row.contact) continue
      if (!primaryByCustomerId.has(row.customer_id)) {
        primaryByCustomerId.set(row.customer_id, row.contact)
      }
    }

    let synced = 0
    let skipped = 0
    let failed = 0
    const failures: Array<{ customerId: string; message: string }> = []

    for (const customer of (customerRows ?? []) as unknown as Pick<Customer, "id" | "fortnox_customer_number">[]) {
      const primaryContact = primaryByCustomerId.get(customer.id)
      if (!primaryContact) {
        const { error: clearLocalError } = await adminClient
          .from("customers")
          .update({
            contact_name: null,
            email: null,
            phone: null,
          } as never)
          .eq("id", customer.id)

        if (clearLocalError) {
          failed++
          failures.push({ customerId: customer.id, message: clearLocalError.message })
          continue
        }

        if (customer.fortnox_customer_number) {
          try {
            await syncPrimaryContactToFortnox(
              adminClient,
              customer.fortnox_customer_number,
              { contactName: null, email: null, phone: null }
            )
            synced++
          } catch (error) {
            failed++
            failures.push({
              customerId: customer.id,
              message: error instanceof Error ? error.message : "Unknown Fortnox error",
            })
          }
          continue
        }

        skipped++
        continue
      }

      const contactName = deriveContactName(primaryContact)
      const email = primaryContact.email?.trim() || null
      const phone = primaryContact.phone?.trim() || null

      const { error: updateLocalError } = await adminClient
        .from("customers")
        .update({
          contact_name: contactName,
          email,
          phone,
        } as never)
        .eq("id", customer.id)

      if (updateLocalError) {
        failed++
        failures.push({ customerId: customer.id, message: updateLocalError.message })
        continue
      }

      if (!customer.fortnox_customer_number) {
        skipped++
        continue
      }

      try {
        await syncPrimaryContactToFortnox(
          adminClient,
          customer.fortnox_customer_number,
          { contactName, email, phone }
        )
        synced++
      } catch (error) {
        failed++
        failures.push({
          customerId: customer.id,
          message: error instanceof Error ? error.message : "Unknown Fortnox error",
        })
      }
    }

    return NextResponse.json({
      synced,
      skipped,
      failed,
      failures,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to sync primary contact fields",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
