import { writeFile } from "node:fs/promises"
import path from "node:path"

import { loadEnvConfig } from "@next/env"

import type { Database } from "@/types/database"
import { createAdminClient } from "@/lib/supabase/admin"

loadEnvConfig(process.cwd())

type CustomerRow = Pick<
  Database["public"]["Tables"]["customers"]["Row"],
  | "id"
  | "name"
  | "contact_name"
  | "email"
  | "phone"
  | "fortnox_customer_number"
  | "fortnox_raw"
>

type PrimaryContactRow = Pick<
  Database["public"]["Tables"]["customer_contacts"]["Row"],
  "id" | "name" | "first_name" | "last_name" | "email" | "phone"
>

type PrimaryLinkRow = {
  customer_id: string
  contact_id: string
  is_primary: boolean
  contact: PrimaryContactRow
}

type DuplicateContactRecord = {
  customer_id: string
  fortnox_customer_number: string | null
  customer_name: string
  full_name: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  existing_contact_id: string
  existing_customer_id: string
}

const CUSTOMER_PAGE_SIZE = 500
const PRIMARY_LINK_PAGE_SIZE = 1000
const DUPLICATE_CONTACTS_FILE = path.join(process.cwd(), "duplicate_contacts.json")
const MISSING_NAME_FIRST = "Not"
const MISSING_NAME_LAST = "Imported"

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null

  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const normalized = normalizeWhitespace(fullName)
  if (!normalized) {
    return { firstName: "", lastName: "" }
  }

  const [firstName, ...rest] = normalized.split(" ")
  return {
    firstName,
    lastName: rest.join(" "),
  }
}

function getContactNameParts(customer: CustomerRow): {
  fullName: string
  firstName: string
  lastName: string
  hasSourceName: boolean
} {
  const rawData = customer.fortnox_raw as Record<string, unknown> | null
  const fullName = normalizeWhitespace(
    getRawField(rawData, "YourReference") ?? customer.contact_name ?? ""
  )

  if (!fullName) {
    return {
      fullName: `${MISSING_NAME_FIRST} ${MISSING_NAME_LAST}`,
      firstName: MISSING_NAME_FIRST,
      lastName: MISSING_NAME_LAST,
      hasSourceName: false,
    }
  }

  const { firstName, lastName } = splitName(fullName)
  return {
    fullName,
    firstName,
    lastName,
    hasSourceName: true,
  }
}

function getRawField(rawData: Record<string, unknown> | null, key: string): string | null {
  const value = rawData?.[key]
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

async function fetchCustomers() {
  const supabase = createAdminClient()
  const customers: CustomerRow[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, contact_name, email, phone, fortnox_customer_number, fortnox_raw")
      .order("name")
      .range(from, from + CUSTOMER_PAGE_SIZE - 1)

    if (error) {
      throw new Error(`Failed to fetch customers: ${error.message}`)
    }

    const rows = (data ?? []) as CustomerRow[]
    if (rows.length === 0) break

    customers.push(...rows)

    if (rows.length < CUSTOMER_PAGE_SIZE) break
    from += CUSTOMER_PAGE_SIZE
  }

  return customers
}

async function fetchExistingPrimaryLinks() {
  const supabase = createAdminClient()
  const rows: PrimaryLinkRow[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from("customer_contact_links")
      .select(
        "customer_id, contact_id, is_primary, contact:customer_contacts!inner(id, name, first_name, last_name, email, phone)"
      )
      .eq("is_primary", true)
      .range(from, from + PRIMARY_LINK_PAGE_SIZE - 1)

    if (error) {
      throw new Error(`Failed to fetch existing primary contacts: ${error.message}`)
    }

    const pageRows = (data ?? []) as unknown as PrimaryLinkRow[]
    if (pageRows.length === 0) break

    rows.push(...pageRows)

    if (pageRows.length < PRIMARY_LINK_PAGE_SIZE) break
    from += PRIMARY_LINK_PAGE_SIZE
  }

  return rows
}

async function upsertPrimaryContact(customer: CustomerRow, contact: PrimaryContactRow) {
  const supabase = createAdminClient()
  const rawData = customer.fortnox_raw as Record<string, unknown> | null
  const { fullName, firstName, lastName, hasSourceName } = getContactNameParts(customer)
  const phone = getRawField(rawData, "Phone1") ?? customer.phone
  const email = normalizeEmail(getRawField(rawData, "Email") ?? customer.email)

  const existingName = normalizeWhitespace(contact.name ?? "")
  const existingFirstName = normalizeWhitespace(contact.first_name ?? "")
  const existingLastName = normalizeWhitespace(contact.last_name ?? "")
  const hasExistingName = Boolean(existingName || existingFirstName || existingLastName)

  const nameToWrite = hasSourceName || !hasExistingName ? fullName : existingName
  const firstNameToWrite = hasSourceName || !hasExistingName ? firstName : existingFirstName
  const lastNameToWrite = hasSourceName || !hasExistingName ? lastName : existingLastName

  const { error } = await supabase
    .from("customer_contacts")
    .update({
      name: nameToWrite,
      first_name: firstNameToWrite || null,
      last_name: lastNameToWrite || null,
      email,
      phone,
    } as never)
    .eq("id", contact.id)

  if (error) {
    throw new Error(`Failed to update primary contact for ${customer.name}: ${error.message}`)
  }
}

async function createPrimaryContact(customer: CustomerRow) {
  const supabase = createAdminClient()
  const rawData = customer.fortnox_raw as Record<string, unknown> | null
  const { fullName, firstName, lastName } = getContactNameParts(customer)
  const phone = getRawField(rawData, "Phone1") ?? customer.phone
  const email = normalizeEmail(getRawField(rawData, "Email") ?? customer.email)

  const { data, error } = await supabase
    .from("customer_contacts")
    .insert({
      name: fullName,
      first_name: firstName || null,
      last_name: lastName || null,
      email,
      phone,
      role: null,
      linkedin: null,
      notes: "Imported from Fortnox customer data as primary contact",
    } as never)
    .select("id, name, first_name, last_name, email, phone")
    .single()

  if (error || !data) {
    throw new Error(`Failed to create primary contact for ${customer.name}: ${error?.message ?? "Unknown error"}`)
  }

  const createdContact = data as unknown as PrimaryContactRow

  const { error: linkError } = await supabase
    .from("customer_contact_links")
    .upsert(
      {
        customer_id: customer.id,
        contact_id: createdContact.id,
        relationship_label: "Primary",
        is_primary: true,
      } as never,
      { onConflict: "customer_id,contact_id", ignoreDuplicates: false }
    )

  if (linkError) {
    throw new Error(`Failed to link primary contact for ${customer.name}: ${linkError.message}`)
  }

  return createdContact
}

async function main() {
  const customers = await fetchCustomers()
  const existingPrimaryLinks = await fetchExistingPrimaryLinks()

  const primaryByCustomerId = new Map<string, PrimaryLinkRow>()
  const primaryByEmail = new Map<string, PrimaryLinkRow>()

  for (const link of existingPrimaryLinks) {
    primaryByCustomerId.set(link.customer_id, link)
    const normalizedEmail = normalizeEmail(link.contact.email)
    if (normalizedEmail && !primaryByEmail.has(normalizedEmail)) {
      primaryByEmail.set(normalizedEmail, link)
    }
  }

  const duplicates: DuplicateContactRecord[] = []
  let created = 0
  let updated = 0
  let skipped = 0

  for (const customer of customers) {
    const rawData = customer.fortnox_raw as Record<string, unknown> | null
    const { fullName, firstName, lastName } = getContactNameParts(customer)

    const phone = getRawField(rawData, "Phone1") ?? customer.phone
    const email = normalizeEmail(getRawField(rawData, "Email") ?? customer.email)

    const existingPrimaryForCustomer = primaryByCustomerId.get(customer.id)
    if (existingPrimaryForCustomer) {
      await upsertPrimaryContact(customer, existingPrimaryForCustomer.contact)
      updated += 1

      const normalizedEmail = normalizeEmail(email)
      if (normalizedEmail) {
        primaryByEmail.set(normalizedEmail, existingPrimaryForCustomer)
      }
      continue
    }

    if (email) {
      const existingPrimaryForEmail = primaryByEmail.get(email)
      if (existingPrimaryForEmail) {
        duplicates.push({
          customer_id: customer.id,
          fortnox_customer_number: customer.fortnox_customer_number,
          customer_name: customer.name,
          full_name: fullName,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          existing_contact_id: existingPrimaryForEmail.contact_id,
          existing_customer_id: existingPrimaryForEmail.customer_id,
        })
      }
    }

    const createdContact = await createPrimaryContact(customer)
    const createdLink: PrimaryLinkRow = {
      customer_id: customer.id,
      contact_id: createdContact.id,
      is_primary: true,
      contact: createdContact,
    }

    primaryByCustomerId.set(customer.id, createdLink)
    const normalizedEmail = normalizeEmail(createdContact.email)
    if (normalizedEmail) {
      primaryByEmail.set(normalizedEmail, createdLink)
    }
    created += 1
  }

  await writeFile(
    DUPLICATE_CONTACTS_FILE,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        duplicates,
      },
      null,
      2
    ) + "\n",
    "utf8"
  )

  console.log(`Created ${created} primary contacts`)
  console.log(`Updated ${updated} existing primary contacts`)
  console.log(`Skipped ${skipped} customers`)
  console.log(`Wrote ${duplicates.length} duplicates to ${DUPLICATE_CONTACTS_FILE}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
