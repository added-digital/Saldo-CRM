import { NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { syncSingleCustomer } from "@/lib/fortnox/sync"
import type { Customer, Profile } from "@/types/database"

const DELETE_BATCH_SIZE = 200

type AdminClient = ReturnType<typeof createAdminClient>

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return []
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function isFortnoxCustomerNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  if (!error.message.startsWith("Fortnox API error (404):")) {
    return false
  }

  const payloadText = error.message.slice("Fortnox API error (404):".length).trim()
  if (payloadText.length === 0) return false

  try {
    const parsed = JSON.parse(payloadText) as {
      ErrorInformation?: { Code?: number; Message?: string }
    }
    return (
      parsed.ErrorInformation?.Code === 2000433 &&
      parsed.ErrorInformation?.Message === "Kan inte hitta kunden."
    )
  } catch {
    return false
  }
}

async function deleteCustomerAndRelatedData(
  supabase: AdminClient,
  customerId: string,
  fortnoxCustomerNumber: string,
) {
  const invoiceNumbers: string[] = []

  const { data: invoicesByCustomerId, error: invoiceIdScanError } = await supabase
    .from("invoices")
    .select("document_number")
    .eq("customer_id", customerId)

  if (invoiceIdScanError) {
    throw new Error(`Failed to scan invoices by customer id: ${invoiceIdScanError.message}`)
  }

  for (const row of (invoicesByCustomerId ?? []) as Array<{ document_number: string }>) {
    if (row.document_number) invoiceNumbers.push(row.document_number)
  }

  const { data: invoicesByCustomerNumber, error: invoiceNumberScanError } = await supabase
    .from("invoices")
    .select("document_number")
    .eq("fortnox_customer_number", fortnoxCustomerNumber)

  if (invoiceNumberScanError) {
    throw new Error(`Failed to scan invoices by customer number: ${invoiceNumberScanError.message}`)
  }

  for (const row of (invoicesByCustomerNumber ?? []) as Array<{ document_number: string }>) {
    if (row.document_number && !invoiceNumbers.includes(row.document_number)) {
      invoiceNumbers.push(row.document_number)
    }
  }

  let removedInvoiceRows = 0
  for (const invoiceNumberChunk of chunkArray(invoiceNumbers, DELETE_BATCH_SIZE)) {
    const { count, error } = await supabase
      .from("invoice_rows")
      .delete({ count: "exact" })
      .in("invoice_number", invoiceNumberChunk as never)

    if (error) {
      throw new Error(`Failed to delete invoice rows: ${error.message}`)
    }
    removedInvoiceRows += count ?? 0
  }

  const { count: removedInvoicesById, error: removeInvoicesByIdError } = await supabase
    .from("invoices")
    .delete({ count: "exact" })
    .eq("customer_id", customerId)

  if (removeInvoicesByIdError) {
    throw new Error(`Failed to delete invoices by customer id: ${removeInvoicesByIdError.message}`)
  }

  const { count: removedInvoicesByNumber, error: removeInvoicesByNumberError } = await supabase
    .from("invoices")
    .delete({ count: "exact" })
    .eq("fortnox_customer_number", fortnoxCustomerNumber)

  if (removeInvoicesByNumberError) {
    throw new Error(`Failed to delete invoices by customer number: ${removeInvoicesByNumberError.message}`)
  }

  const { count: removedTimeReportsById, error: removeTimeReportsByIdError } = await supabase
    .from("time_reports")
    .delete({ count: "exact" })
    .eq("customer_id", customerId)

  if (removeTimeReportsByIdError) {
    throw new Error(`Failed to delete time reports by customer id: ${removeTimeReportsByIdError.message}`)
  }

  const { count: removedTimeReportsByNumber, error: removeTimeReportsByNumberError } = await supabase
    .from("time_reports")
    .delete({ count: "exact" })
    .eq("fortnox_customer_number", fortnoxCustomerNumber)

  if (removeTimeReportsByNumberError) {
    throw new Error(`Failed to delete time reports by customer number: ${removeTimeReportsByNumberError.message}`)
  }

  const { count: removedContractAccruals, error: removeContractAccrualsError } = await supabase
    .from("contract_accruals")
    .delete({ count: "exact" })
    .eq("fortnox_customer_number", fortnoxCustomerNumber)

  if (removeContractAccrualsError) {
    throw new Error(`Failed to delete contract accruals: ${removeContractAccrualsError.message}`)
  }

  const { count: removedCustomers, error: removeCustomerError } = await supabase
    .from("customers")
    .delete({ count: "exact" })
    .eq("id", customerId)

  if (removeCustomerError) {
    throw new Error(`Failed to delete customer: ${removeCustomerError.message}`)
  }

  return {
    removedCustomers: removedCustomers ?? 0,
    removedInvoices: (removedInvoicesById ?? 0) + (removedInvoicesByNumber ?? 0),
    removedInvoiceRows,
    removedTimeReports: (removedTimeReportsById ?? 0) + (removedTimeReportsByNumber ?? 0),
    removedContractAccruals: removedContractAccruals ?? 0,
  }
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
    const customerId = (body.customerId as string | undefined)?.trim()

    if (!customerId) {
      return NextResponse.json({ error: "customerId is required" }, { status: 400 })
    }

    const adminClient = createAdminClient()
    const { data: customerRow } = await adminClient
      .from("customers")
      .select("id, name, fortnox_customer_number")
      .eq("id", customerId)
      .single()

    const customer = customerRow as Pick<Customer, "id" | "name" | "fortnox_customer_number"> | null

    if (!customer?.fortnox_customer_number) {
      return NextResponse.json(
        { error: "Customer is missing a Fortnox customer number" },
        { status: 400 }
      )
    }

    try {
      await syncSingleCustomer(adminClient, customer.fortnox_customer_number)
    } catch (error) {
      if (isFortnoxCustomerNotFoundError(error)) {
        const cleanup = await deleteCustomerAndRelatedData(
          adminClient,
          customer.id,
          customer.fortnox_customer_number,
        )

        return NextResponse.json({
          customerId,
          fortnoxCustomerNumber: customer.fortnox_customer_number,
          removed: true,
          cleanup,
          message:
            "Customer no longer exists in Fortnox and was removed locally with related data.",
        })
      }

      throw error
    }

    return NextResponse.json({
      customerId,
      fortnoxCustomerNumber: customer.fortnox_customer_number,
      message: `Synced ${customer.name}`,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: "Customer sync failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
