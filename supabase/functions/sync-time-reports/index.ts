import { createAdminClient } from "../_shared/supabase.ts"
import { corsHeaders, getFortnoxClient, updateSyncJob } from "../_shared/sync-helpers.ts"

const TIME_REPORT_FROM_DATE = "2025-01-01"
const SOURCE_ENDPOINT = "/api/time/registrations-v2"

interface DateWindow {
  fromDate: string
  toDate: string
}

function normalizeText(value: unknown): string {
  if (value == null) return ""
  return String(value).trim()
}

function normalizeDate(value: unknown): string | null {
  const normalized = normalizeText(value)
  if (!normalized) return null
  return normalized.slice(0, 10)
}

function isOnOrAfter(dateValue: string | null, minDate: string): boolean {
  if (!dateValue) return false
  return dateValue >= minDate
}

function toHours(value: unknown): number {
  const parsed = Number.parseFloat(normalizeText(value))
  return Number.isFinite(parsed) ? parsed : 0
}

function buildPath(fromDate?: string, toDate?: string): string {
  const params = new URLSearchParams()
  if (fromDate) {
    params.set("fromDate", fromDate)
  }
  if (toDate) {
    params.set("toDate", toDate)
  }
  return `${SOURCE_ENDPOINT}${params.toString() ? `?${params.toString()}` : ""}`
}

function createMonthlyWindows(fromDate: string, today: Date = new Date()): DateWindow[] {
  const windows: DateWindow[] = []
  const current = new Date(`${fromDate}T00:00:00.000Z`)
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))

  while (current <= end) {
    const year = current.getUTCFullYear()
    const month = current.getUTCMonth()
    const windowStart = new Date(Date.UTC(year, month, 1))
    const windowEnd = new Date(Date.UTC(year, month + 1, 0))
    const actualStart = current > windowStart ? current : windowStart
    const actualEnd = windowEnd > end ? end : windowEnd

    windows.push({
      fromDate: actualStart.toISOString().slice(0, 10),
      toDate: actualEnd.toISOString().slice(0, 10),
    })

    current.setUTCMonth(current.getUTCMonth() + 1)
    current.setUTCDate(1)
  }

  return windows
}

async function fetchRows(
  client: Awaited<ReturnType<typeof getFortnoxClient>>,
  window: DateWindow
): Promise<Array<Record<string, unknown>>> {
  try {
    const response = await client.requestPath<Record<string, unknown> | Array<Record<string, unknown>>>(
      buildPath(window.fromDate, window.toDate)
    )
    if (Array.isArray(response)) return response
    if (Array.isArray(response.rows)) return response.rows as Array<Record<string, unknown>>
    return []
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    const isInvalidParameter = message.includes('"code":2000588') || message.includes("Ogiltig parameter")

    if (isInvalidParameter) {
      const response = await client.requestPath<Record<string, unknown> | Array<Record<string, unknown>>>(buildPath(window.fromDate))
      const rows = Array.isArray(response)
        ? response
        : Array.isArray(response.rows)
          ? (response.rows as Array<Record<string, unknown>>)
          : []

      return rows.filter((row) =>
        isOnOrAfter(
          normalizeDate(row.Date ?? row.ReportDate ?? row.TimeReportDate ?? row.WorkDate ?? row.TransactionDate ?? row.EntryDate),
          window.fromDate
        )
      )
    }

    throw error
  }
}

function mapRow(
  row: Record<string, unknown>,
  index: number,
  customerByNumber: Map<string, { id: string; name: string; fortnox_customer_number: string | null }>,
  customerByCostCenter: Map<string, { id: string; name: string; fortnox_customer_number: string | null }>
): Record<string, unknown> | null {
  const registrationCodeField = (row.registrationCode ?? row.RegistrationCode) as Record<string, unknown> | undefined
  const customerField = row.customer as Record<string, unknown> | undefined
  const costCenterField = row.costCenter as Record<string, unknown> | undefined
  const serviceField = row.service as Record<string, unknown> | undefined

  const registrationCode = normalizeText(
    registrationCodeField?.code ?? registrationCodeField?.Code ?? row.RegistrationCode ?? row.RegistrationCodeCode ?? row.CauseCode
  )
  const registrationType = normalizeText(
    registrationCodeField?.type ?? registrationCodeField?.Type ?? row.RegistrationType ?? "WORK"
  )
  const reportId = normalizeText(row.id ?? row.TimeReportId ?? row.Id ?? row.TimeReportNumber ?? row.TimeSheetRowId ?? row.Number)
  const reportDate = normalizeDate(
    row.Date ?? row.ReportDate ?? row.TimeReportDate ?? row.WorkDate ?? row.workedDate ?? row.TransactionDate ?? row.EntryDate
  )
  const employeeId = normalizeText(row.EmployeeId ?? row.EmployeeNumber ?? row.UserId ?? row.userId ?? row.StaffId)
  const employeeName = normalizeText(row.EmployeeName ?? row.Name ?? row.StaffName ?? row.UserName)
  const customerNumber = normalizeText(row.CustomerNumber ?? row.CustomerNo ?? row.CustomerId ?? customerField?.number ?? customerField?.id)
  const customerName = normalizeText(row.CustomerName ?? row.Customer ?? row.CustomerFullName ?? customerField?.name)
  const costCenter = normalizeText(row.CostCenter ?? costCenterField?.id)
  const projectNumber = normalizeText(row.Project ?? row.ProjectNumber ?? row.ProjectNo ?? row.ProjectId)
  const projectName = normalizeText(row.ProjectName ?? row.ProjectDescription)
  const hours = toHours(
    row.Hours ?? row.Time ?? row.Quantity ?? row.Qty ?? row.NumberOfHours ?? row.HoursWorked ?? row.RegisteredHours ?? row.workedHours
  )
  const activity = normalizeText(
    row.Activity ??
      row.ActivityName ??
      row.Task ??
      row.WorkType ??
      serviceField?.description ??
      (registrationCode.toUpperCase() === "SEM" ? "Semester" : registrationType === "WORK" ? registrationCode : "Frånvaro")
  )
  const articleNumber = normalizeText(row.ArticleNumber ?? row.ArticleNo ?? row.ArticleId ?? serviceField?.id)
  const description = normalizeText(
    row.note ?? row.invoiceText ?? row.Description ?? row.Text ?? row.Comment ?? row.Notes ?? row.Note ?? row.ReferenceText
  )

  if (!reportDate || !isOnOrAfter(reportDate, TIME_REPORT_FROM_DATE)) return null
  if (registrationCode.toUpperCase() === "FRX") return null
  if (hours === 0) return null

  const entryType = registrationType && registrationType !== "WORK" ? "absence" : "time"
  const matchedCustomer = customerByNumber.get(customerNumber) ?? customerByCostCenter.get(costCenter) ?? null
  const uniqueKey = normalizeText(
    reportId || `${entryType}|${reportDate}|${employeeId}|${customerNumber}|${projectNumber}|${articleNumber}|${hours}|${description}|${index}`
  )

  if (!uniqueKey) return null

  return {
    unique_key: uniqueKey,
    customer_id: matchedCustomer?.id ?? null,
    entry_type: entryType,
    registration_code: registrationCode || null,
    registration_type: registrationType || null,
    source_endpoint: SOURCE_ENDPOINT,
    report_id: reportId || null,
    report_date: reportDate,
    employee_id: employeeId || null,
    employee_name: employeeName || null,
    fortnox_customer_number: (matchedCustomer?.fortnox_customer_number ?? customerNumber) || null,
    customer_name: (matchedCustomer?.name ?? customerName) || null,
    project_number: projectNumber || null,
    project_name: projectName || null,
    activity: activity || null,
    article_number: articleNumber || null,
    hours,
    description: description || null,
  }
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
    const phase: string = body.phase ?? "list"
    const client = await getFortnoxClient(supabase)
    const windows = createMonthlyWindows(TIME_REPORT_FROM_DATE)

    if (phase === "list") {
      if (jobId) {
        await updateSyncJob(supabase, jobId, {
          status: "processing",
          current_step: `Fetching registrations from ${TIME_REPORT_FROM_DATE}...`,
        })
      }

      const { data: customers } = await supabase
        .from("customers")
        .select("id, name, fortnox_customer_number, fortnox_cost_center")

      const customerByNumber = new Map<string, { id: string; name: string; fortnox_customer_number: string | null }>()
      const customerByCostCenter = new Map<string, { id: string; name: string; fortnox_customer_number: string | null }>()

      for (const customer of (customers ?? []) as Array<{
        id: string
        name: string
        fortnox_customer_number: string | null
        fortnox_cost_center: string | null
      }>) {
        if (customer.fortnox_customer_number) {
          customerByNumber.set(customer.fortnox_customer_number, {
            id: customer.id,
            name: customer.name,
            fortnox_customer_number: customer.fortnox_customer_number,
          })
        }
        if (customer.fortnox_cost_center) {
          customerByCostCenter.set(customer.fortnox_cost_center, {
            id: customer.id,
            name: customer.name,
            fortnox_customer_number: customer.fortnox_customer_number,
          })
        }
      }

      const windowIndex = Number(body.offset ?? 0)
      let previousSynced = 0
      let previousErrors = 0
      let previousSkipped = 0
      let previousTotal = 0

      if (jobId && windowIndex > 0) {
        const { data: jobRow } = await supabase
          .from("sync_jobs")
          .select("payload")
          .eq("id", jobId)
          .single()

        const payload = (jobRow as { payload?: Record<string, unknown> } | null)?.payload
        previousSynced = Number(payload?.synced ?? 0)
        previousErrors = Number(payload?.errors ?? 0)
        previousSkipped = Number(payload?.skipped ?? 0)
        previousTotal = Number(payload?.total ?? 0)
      }

      const window = windows[windowIndex]

      if (!window) {
        throw new Error(`No time-report batch window found for index ${windowIndex}`)
      }

      const rows = await fetchRows(client, window)
      const mapped = rows
        .map((row, index) => mapRow(row, index, customerByNumber, customerByCostCenter))
        .filter((row): row is Record<string, unknown> => row !== null)

      const skipped = previousSkipped + (rows.length - mapped.length)
      let errors = previousErrors
      let synced = previousSynced

      if (mapped.length > 0) {
        const { error } = await supabase
          .from("time_reports")
          .upsert(mapped as never, { onConflict: "unique_key" })

        if (error) {
          console.error("Time report upsert error:", error.message, error.details)
          errors += mapped.length
        } else {
          synced += mapped.length
        }
      }

      const total = previousTotal + rows.length

      const morePages = windowIndex < windows.length - 1

      if (jobId) {
        await updateSyncJob(supabase, jobId, {
          total_items: windows.length,
          processed_items: windowIndex + 1,
          progress: morePages ? Math.round(((windowIndex + 1) / windows.length) * 80) : 90,
          current_step: morePages
            ? `Synced registrations ${window.fromDate} to ${window.toDate} (${synced} saved, ${skipped} skipped)`
            : `${synced} registrations saved (${skipped} skipped), computing KPIs...`,
          payload: {
            step_name: "time-reports",
            step_label: "Time Reports",
            synced,
            errors,
            skipped,
            total,
            source_endpoint: SOURCE_ENDPOINT,
            current_window: window,
          },
          batch_phase: morePages ? "list" : "finalize",
          batch_offset: morePages ? windowIndex + 1 : 0,
          dispatch_lock: false,
        })
      }

      return new Response(
        JSON.stringify({ ok: true, phase: "list", morePages, synced, errors, skipped, window }),
        { headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      )
    }

    if (phase === "finalize") {
      if (jobId) {
        await updateSyncJob(supabase, jobId, {
          current_step: "Computing hours KPI...",
          progress: 92,
        })
      }

      const { data: hoursRows } = await supabase
        .from("time_reports")
        .select("customer_id, fortnox_customer_number, hours")
        .eq("entry_type", "time")

      const hoursByCustomerId = new Map<string, number>()
      const hoursByCustomerNumber = new Map<string, number>()

      for (const row of (hoursRows ?? []) as Array<{ customer_id: string | null; fortnox_customer_number: string | null; hours: number | null }>) {
        if (row.customer_id) {
          hoursByCustomerId.set(row.customer_id, (hoursByCustomerId.get(row.customer_id) ?? 0) + Number(row.hours ?? 0))
        } else if (row.fortnox_customer_number) {
          hoursByCustomerNumber.set(
            row.fortnox_customer_number,
            (hoursByCustomerNumber.get(row.fortnox_customer_number) ?? 0) + Number(row.hours ?? 0)
          )
        }
      }

      for (const [customerId, totalHours] of hoursByCustomerId) {
        await supabase.from("customers").update({ total_hours: totalHours } as never).eq("id", customerId as never)
      }

      for (const [customerNumber, totalHours] of hoursByCustomerNumber) {
        await supabase
          .from("customers")
          .update({ total_hours: totalHours } as never)
          .eq("fortnox_customer_number", customerNumber as never)
      }

      let finalSynced = 0
      let finalErrors = 0
      let finalTotal = 0

      if (jobId) {
        const { data: jobRow } = await supabase
          .from("sync_jobs")
          .select("payload, total_items")
          .eq("id", jobId)
          .single()

        const payload = (jobRow as { payload?: Record<string, unknown>; total_items?: number } | null)?.payload
        finalSynced = Number(payload?.synced ?? 0)
        finalErrors = Number(payload?.errors ?? 0)
        finalTotal = Number((jobRow as { total_items?: number } | null)?.total_items ?? 0)

        await updateSyncJob(supabase, jobId, {
          status: "completed",
          progress: 100,
          current_step: "Done",
          processed_items: finalTotal,
          payload: {
            step_name: "time-reports",
            step_label: "Time Reports",
            synced: finalSynced,
            errors: finalErrors,
            total: finalTotal,
            source_endpoint: SOURCE_ENDPOINT,
          },
          batch_phase: null,
          dispatch_lock: false,
        })
      }

      return new Response(
        JSON.stringify({ ok: true, done: true, synced: finalSynced, errors: finalErrors, total: finalTotal }),
        { headers: { ...corsHeaders(), "Content-Type": "application/json" } }
      )
    }

    return new Response(JSON.stringify({ error: `Unknown phase: ${phase}` }), {
      status: 400,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"

    if (jobId) {
      await updateSyncJob(supabase, jobId, {
        status: "failed",
        error_message: message,
        dispatch_lock: false,
        batch_phase: null,
      })
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    })
  }
})
