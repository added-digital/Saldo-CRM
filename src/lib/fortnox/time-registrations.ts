type FortnoxRequester = {
  requestPath<T>(path: string, options?: RequestInit): Promise<T>
}

export interface NormalizedTimeRegistration {
  unique_key: string
  entry_type: "time" | "absence"
  registration_code: string | null
  registration_type: string | null
  report_id: string | null
  report_date: string | null
  employee_id: string | null
  employee_name: string | null
  fortnox_customer_number: string | null
  customer_name: string | null
  project_number: string | null
  project_name: string | null
  activity: string | null
  article_number: string | null
  hours: number | null
  description: string | null
  source_endpoint: string
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

function toHours(value: unknown): number {
  const parsed = Number.parseFloat(normalizeText(value))
  return Number.isFinite(parsed) ? parsed : 0
}

function isOnOrAfter(dateValue: string | null, minDate: string): boolean {
  if (!dateValue) return false
  return dateValue >= minDate
}

function buildPath(endpoint: string, fromDate?: string): string {
  const params = new URLSearchParams()
  if (fromDate) {
    params.set("fromDate", fromDate)
  }
  return `${endpoint}${params.toString() ? `?${params.toString()}` : ""}`
}

async function requestRows(
  client: FortnoxRequester,
  endpoint: string,
  collectionKey: string,
  fromDate?: string
): Promise<Array<Record<string, unknown>>> {
  try {
    const response = await client.requestPath<Record<string, unknown> | Array<Record<string, unknown>>>(buildPath(endpoint, fromDate))
    if (Array.isArray(response)) {
      return response
    }
    if (Array.isArray(response.rows)) {
      return response.rows as Array<Record<string, unknown>>
    }
    return Array.isArray(response[collectionKey]) ? (response[collectionKey] as Array<Record<string, unknown>>) : []
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    const isInvalidParameter = message.includes('"code":2000588') || message.includes("Ogiltig parameter")
    if (fromDate && isInvalidParameter) {
      const response = await client.requestPath<Record<string, unknown> | Array<Record<string, unknown>>>(buildPath(endpoint))
      const rows = Array.isArray(response)
        ? response
        : Array.isArray(response.rows)
          ? (response.rows as Array<Record<string, unknown>>)
          : Array.isArray(response[collectionKey])
            ? (response[collectionKey] as Array<Record<string, unknown>>)
            : []
      return rows.filter((row) => isOnOrAfter(normalizeDate(row.Date ?? row.ReportDate ?? row.TransactionDate), fromDate))
    }
    throw error
  }
}

function mapRow(
  row: Record<string, unknown>,
  index: number,
  entryType: "time" | "absence",
  sourceEndpoint: string
): NormalizedTimeRegistration | null {
  const registrationCodeField = (row.registrationCode ?? row.RegistrationCode) as Record<string, unknown> | undefined
  const customerField = row.customer as Record<string, unknown> | undefined
  const costCenterField = row.costCenter as Record<string, unknown> | undefined
  const serviceField = row.service as Record<string, unknown> | undefined
  const registrationCode = normalizeText(
    registrationCodeField?.code ?? registrationCodeField?.Code ?? row.RegistrationCode ?? row.RegistrationCodeCode ?? row.CauseCode
  )
  const registrationType = normalizeText(registrationCodeField?.type ?? registrationCodeField?.Type ?? (entryType === "absence" ? "ABSENCE" : "WORK"))
  const reportId = normalizeText(row.id ?? row.TimeReportId ?? row.Id ?? row.TimeReportNumber ?? row.TimeSheetRowId ?? row.Number)
  const reportDate = normalizeDate(
    row.Date ?? row.ReportDate ?? row.TimeReportDate ?? row.WorkDate ?? row.workedDate ?? row.TransactionDate ?? row.EntryDate
  )
  const employeeId = normalizeText(row.EmployeeId ?? row.EmployeeNumber ?? row.UserId ?? row.userId ?? row.StaffId)
  const employeeName = normalizeText(row.EmployeeName ?? row.Name ?? row.StaffName ?? row.UserName)
  const customerNumber = normalizeText(row.CustomerNumber ?? row.CustomerNo ?? row.CustomerId ?? customerField?.number ?? customerField?.id)
  const customerName = normalizeText(row.CustomerName ?? row.Customer ?? row.CustomerFullName ?? customerField?.name)
  const costCenterId = normalizeText(row.CostCenter ?? costCenterField?.id)
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

  if (registrationCode.toUpperCase() === "FRX") return null
  if (hours === 0) return null

  const uniqueKey = normalizeText(
    reportId || `${entryType}|${reportDate}|${employeeId}|${customerNumber}|${projectNumber}|${articleNumber}|${hours}|${description}|${index}`
  )

  if (!uniqueKey || !reportDate) return null

  return {
    unique_key: uniqueKey,
    entry_type: entryType,
    registration_code: registrationCode || null,
    registration_type: registrationType || null,
    report_id: reportId || null,
    report_date: reportDate,
    employee_id: employeeId || null,
    employee_name: employeeName || null,
    fortnox_customer_number: customerNumber || null,
    customer_name: customerName || null,
    project_number: projectNumber || null,
    project_name: projectName || null,
    activity: activity || null,
    article_number: articleNumber || null,
    hours,
    description: description || null,
    source_endpoint: sourceEndpoint,
  }
}

export async function fetchRegistrationsV2(
  client: FortnoxRequester,
  fromDate: string
): Promise<NormalizedTimeRegistration[]> {
  const rows = await requestRows(client, "/api/time/registrations-v2", "rows", fromDate)

  return rows
    .map((row, index) => {
      const registrationCodeField = (row.registrationCode ?? row.RegistrationCode) as Record<string, unknown> | undefined
      const registrationType = normalizeText(
        registrationCodeField?.type ?? registrationCodeField?.Type ?? row.RegistrationType
      )
      const entryType = registrationType && registrationType !== "WORK" ? "absence" : "time"
      return mapRow(row, index, entryType, "/api/time/registrations-v2")
    })
    .filter((row): row is NormalizedTimeRegistration => row !== null)
}
