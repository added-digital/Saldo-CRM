import { createAdminClient } from "../_shared/supabase.ts"
import { updateSyncJob, corsHeaders } from "../_shared/sync-helpers.ts"

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

const KPI_BATCH_SIZE = 1000

type CustomerRef = {
  id: string
  fortnoxCustomerNumber: string | null
}

type CustomerTotals = {
  customerId: string
  turnover: number
  invoiceCount: number
  hours: number
  contractValue: number
}

type PeriodType = "year" | "month"

type PeriodKpi = {
  customerId: string
  fortnoxCustomerNumber: string | null
  periodType: PeriodType
  periodYear: number
  periodMonth: number
  totalTurnover: number
  invoiceCount: number
  totalHours: number
  customerHours: number
  absenceHours: number
  internalHours: number
  otherHours: number
  contractValue: number
}

function annualizeContractTotal(total: number | null, period: string | null): number {
  const base = Number(total ?? 0)
  const periodNumber = Number(period ?? "")

  if (periodNumber === 1) return base * 12
  if (periodNumber === 3) return base * 4
  return base
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function getDateParts(value: string | null): { year: number; month: number } | null {
  if (!value) return null

  const [yearValue, monthValue] = value.split("-")
  const year = Number(yearValue)
  const month = Number(monthValue)

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }

  return { year, month }
}

function getContractBounds(input: {
  startDate: string | null
  endDate: string | null
}): {
  startYear: number
  startMonth: number
  endYear: number
  endMonth: number
} | null {
  const start = getDateParts(input.startDate)
  const end = getDateParts(input.endDate)
  const currentYear = new Date().getUTCFullYear()

  const startYear = start?.year ?? end?.year ?? currentYear
  const startMonth = start?.month ?? 1
  const endYear = end?.year ?? currentYear
  const endMonth = end?.month ?? 12

  if (startYear > endYear) return null
  if (startYear === endYear && startMonth > endMonth) return null

  return {
    startYear,
    startMonth,
    endYear,
    endMonth,
  }
}

function getCustomerTotals(map: Map<string, CustomerTotals>, customerId: string): CustomerTotals {
  const existing = map.get(customerId)

  if (existing) {
    return existing
  }

  const next: CustomerTotals = {
    customerId,
    turnover: 0,
    invoiceCount: 0,
    hours: 0,
    contractValue: 0,
  }

  map.set(customerId, next)
  return next
}

function getPeriodKpi(
  map: Map<string, PeriodKpi>,
  customer: CustomerRef,
  periodType: PeriodType,
  periodYear: number,
  periodMonth: number,
): PeriodKpi {
  const key = `${customer.id}:${periodType}:${periodYear}:${periodMonth}`
  const existing = map.get(key)

  if (existing) {
    return existing
  }

  const next: PeriodKpi = {
    customerId: customer.id,
    fortnoxCustomerNumber: customer.fortnoxCustomerNumber,
    periodType,
    periodYear,
    periodMonth,
    totalTurnover: 0,
    invoiceCount: 0,
    totalHours: 0,
    customerHours: 0,
    absenceHours: 0,
    internalHours: 0,
    otherHours: 0,
    contractValue: 0,
  }

  map.set(key, next)
  return next
}

function addDatedKpiValues(
  map: Map<string, PeriodKpi>,
  customer: CustomerRef,
  date: string | null,
  values: {
    turnover?: number
    invoiceCount?: number
    hours?: number
    customerHours?: number
    absenceHours?: number
    internalHours?: number
    otherHours?: number
    contractValue?: number
  },
) {
  const parts = getDateParts(date)

  if (!parts) return

  const yearly = getPeriodKpi(map, customer, "year", parts.year, 0)
  yearly.totalTurnover += values.turnover ?? 0
  yearly.invoiceCount += values.invoiceCount ?? 0
  yearly.totalHours += values.hours ?? 0
  yearly.customerHours += values.customerHours ?? 0
  yearly.absenceHours += values.absenceHours ?? 0
  yearly.internalHours += values.internalHours ?? 0
  yearly.otherHours += values.otherHours ?? 0
  yearly.contractValue += values.contractValue ?? 0

  const monthly = getPeriodKpi(map, customer, "month", parts.year, parts.month)
  monthly.totalTurnover += values.turnover ?? 0
  monthly.invoiceCount += values.invoiceCount ?? 0
  monthly.totalHours += values.hours ?? 0
  monthly.customerHours += values.customerHours ?? 0
  monthly.absenceHours += values.absenceHours ?? 0
  monthly.internalHours += values.internalHours ?? 0
  monthly.otherHours += values.otherHours ?? 0
  monthly.contractValue += values.contractValue ?? 0
}

function addContractKpiValues(
  map: Map<string, PeriodKpi>,
  customer: CustomerRef,
  input: {
    startDate: string | null
    endDate: string | null
    annualizedValue: number
  },
) {
  const bounds = getContractBounds({
    startDate: input.startDate,
    endDate: input.endDate,
  })

  if (!bounds || input.annualizedValue === 0) return

  const monthlyValue = input.annualizedValue / 12
  let year = bounds.startYear
  let month = bounds.startMonth

  while (year < bounds.endYear || (year === bounds.endYear && month <= bounds.endMonth)) {
    const yearly = getPeriodKpi(map, customer, "year", year, 0)
    yearly.contractValue += monthlyValue

    const monthly = getPeriodKpi(map, customer, "month", year, month)
    monthly.contractValue += monthlyValue

    month += 1

    if (month > 12) {
      month = 1
      year += 1
    }
  }
}

function resolveCustomerRef(
  input: {
    customerId: string | null
    fortnoxCustomerNumber: string | null
  },
  customerById: Map<string, CustomerRef>,
  customerByNumber: Map<string, CustomerRef>,
): CustomerRef | null {
  if (input.customerId) {
    const byId = customerById.get(input.customerId)
    if (byId) return byId
  }

  if (input.fortnoxCustomerNumber) {
    return customerByNumber.get(input.fortnoxCustomerNumber) ?? null
  }

  return null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() })
  }

  const supabase = createAdminClient()
  let jobId: string | null = null

  async function heartbeat() {
    if (!jobId) return
    const now = new Date().toISOString()
    await supabase
      .from("sync_jobs")
      .update({
        updated_at: now,
        last_dispatched_at: now,
      } as never)
      .eq("id", jobId as never)
  }

  try {
    const body = await req.json().catch(() => ({}))
    jobId = body.job_id ?? null

    if (jobId) {
      await updateSyncJob(supabase, jobId, {
        status: "processing",
        progress: 5,
        current_step: "Loading customer mappings...",
      })
    }

    const customerById = new Map<string, CustomerRef>()
    const customerByNumber = new Map<string, CustomerRef>()
    let customerOffset = 0

    while (true) {
      await heartbeat()

      const { data: customerRows, error: customerError } = await supabase
        .from("customers")
        .select("id, fortnox_customer_number")
        .order("id", { ascending: true })
        .range(customerOffset, customerOffset + KPI_BATCH_SIZE - 1)

      if (customerError) {
        throw new Error(`Failed to read customers for KPI generation: ${customerError.message}`)
      }

      const rows = (customerRows ?? []) as Array<{
        id: string
        fortnox_customer_number: string | null
      }>

      if (rows.length === 0) break

      for (const row of rows) {
        const customer: CustomerRef = {
          id: row.id,
          fortnoxCustomerNumber: row.fortnox_customer_number,
        }

        customerById.set(row.id, customer)

        if (row.fortnox_customer_number) {
          customerByNumber.set(row.fortnox_customer_number, customer)
        }
      }

      if (rows.length < KPI_BATCH_SIZE) break
      customerOffset += KPI_BATCH_SIZE
    }

    const customerTotals = new Map<string, CustomerTotals>()
    const periodKpis = new Map<string, PeriodKpi>()
    let invoiceOffset = 0

    if (jobId) {
      await updateSyncJob(supabase, jobId, {
        progress: 20,
        current_step: "Generating invoice KPIs...",
      })
    }

    while (true) {
      await heartbeat()

      const { data: invoiceRows, error: invoiceError } = await supabase
        .from("invoices")
        .select("customer_id, fortnox_customer_number, invoice_date, total_ex_vat, total")
        .order("id", { ascending: true })
        .range(invoiceOffset, invoiceOffset + KPI_BATCH_SIZE - 1)

      if (invoiceError) {
        throw new Error(`Failed to read invoices for KPI generation: ${invoiceError.message}`)
      }

      const rows = (invoiceRows ?? []) as Array<{
        customer_id: string | null
        fortnox_customer_number: string | null
        invoice_date: string | null
        total_ex_vat: number | null
        total: number | null
      }>

      if (rows.length === 0) break

      for (const row of rows) {
        const customer = resolveCustomerRef(
          {
            customerId: row.customer_id,
            fortnoxCustomerNumber: row.fortnox_customer_number,
          },
          customerById,
          customerByNumber,
        )

        if (!customer) continue

        const amount = Number(row.total_ex_vat ?? row.total ?? 0)
        const totals = getCustomerTotals(customerTotals, customer.id)
        totals.turnover += amount
        totals.invoiceCount += 1

        addDatedKpiValues(periodKpis, customer, row.invoice_date, {
          turnover: amount,
          invoiceCount: 1,
        })
      }

      if (rows.length < KPI_BATCH_SIZE) break
      invoiceOffset += KPI_BATCH_SIZE
    }

    if (jobId) {
      await updateSyncJob(supabase, jobId, {
        progress: 40,
        current_step: "Generating hour KPIs...",
      })
    }

    let timeOffset = 0

    while (true) {
      await heartbeat()

      const { data: timeRows, error: timeError } = await supabase
        .from("time_reports")
        .select("customer_id, fortnox_customer_number, report_date, entry_type, hours")
        .order("id", { ascending: true })
        .range(timeOffset, timeOffset + KPI_BATCH_SIZE - 1)

      if (timeError) {
        throw new Error(`Failed to read time reports for KPI generation: ${timeError.message}`)
      }

      const rows = (timeRows ?? []) as Array<{
        customer_id: string | null
        fortnox_customer_number: string | null
        report_date: string | null
        entry_type: string | null
        hours: number | null
      }>

      if (rows.length === 0) break

      for (const row of rows) {
        const customer = resolveCustomerRef(
          {
            customerId: row.customer_id,
            fortnoxCustomerNumber: row.fortnox_customer_number,
          },
          customerById,
          customerByNumber,
        )

        if (!customer) continue

        const amount = Number(row.hours ?? 0)
        const totals = getCustomerTotals(customerTotals, customer.id)
        totals.hours += amount

        const entryType = (row.entry_type ?? "").toLowerCase()
        const isCustomerHours = entryType === "time"
        const isAbsenceHours = entryType === "absence"
        const isInternalHours = entryType === "internal"
        const isOtherHours = !isCustomerHours && !isAbsenceHours && !isInternalHours

        addDatedKpiValues(periodKpis, customer, row.report_date, {
          hours: amount,
          customerHours: isCustomerHours ? amount : 0,
          absenceHours: isAbsenceHours ? amount : 0,
          internalHours: isInternalHours ? amount : 0,
          otherHours: isOtherHours ? amount : 0,
        })
      }

      if (rows.length < KPI_BATCH_SIZE) break
      timeOffset += KPI_BATCH_SIZE
    }

    if (jobId) {
      await updateSyncJob(supabase, jobId, {
        progress: 60,
        current_step: "Generating contract KPIs...",
      })
    }

    let contractOffset = 0

    while (true) {
      await heartbeat()

      const { data: contractRows, error: contractError } = await supabase
        .from("contract_accruals")
        .select("fortnox_customer_number, start_date, end_date, total_ex_vat, total, period, is_active")
        .order("id", { ascending: true })
        .range(contractOffset, contractOffset + KPI_BATCH_SIZE - 1)

      if (contractError) {
        throw new Error(`Failed to read contracts for KPI generation: ${contractError.message}`)
      }

      const rows = (contractRows ?? []) as Array<{
        fortnox_customer_number: string | null
        start_date: string | null
        end_date: string | null
        total_ex_vat: number | null
        total: number | null
        period: string | null
        is_active: boolean
      }>

      if (rows.length === 0) break

      for (const row of rows) {
        if (!row.fortnox_customer_number) continue

        const customer = customerByNumber.get(row.fortnox_customer_number)
        if (!customer) continue

        if (!row.is_active) continue

        const annualizedValue = annualizeContractTotal(row.total_ex_vat ?? row.total, row.period)
        const totals = getCustomerTotals(customerTotals, customer.id)
        totals.contractValue += annualizedValue

        addContractKpiValues(periodKpis, customer, {
          startDate: row.start_date,
          endDate: row.end_date,
          annualizedValue,
        })
      }

      if (rows.length < KPI_BATCH_SIZE) break
      contractOffset += KPI_BATCH_SIZE
    }

    if (jobId) {
      await updateSyncJob(supabase, jobId, {
        progress: 80,
        current_step: "Updating customer and period KPIs...",
      })
    }

    const { error: resetCustomerError } = await supabase
      .from("customers")
      .update({
        total_turnover: 0,
        invoice_count: 0,
        total_hours: 0,
        contract_value: 0,
      } as never)
      .neq("id", "00000000-0000-0000-0000-000000000000" as never)

    if (resetCustomerError) {
      throw new Error(`Failed to reset customer KPI columns: ${resetCustomerError.message}`)
    }

    const { error: resetPeriodError } = await supabase
      .from("customer_kpis")
      .delete()
      .gte("period_year", 0 as never)

    if (resetPeriodError) {
      throw new Error(`Failed to reset customer KPI periods: ${resetPeriodError.message}`)
    }

    for (const totals of customerTotals.values()) {
      await heartbeat()

      const { error } = await supabase
        .from("customers")
        .update({
          total_turnover: totals.turnover,
          invoice_count: totals.invoiceCount,
          total_hours: totals.hours,
          contract_value: totals.contractValue,
        } as never)
        .eq("id", totals.customerId as never)

      if (error) {
        throw new Error(`Failed updating customer KPIs for customer ${totals.customerId}: ${error.message}`)
      }
    }

    const periodRows = Array.from(periodKpis.values()).map((row) => ({
      customer_id: row.customerId,
      fortnox_customer_number: row.fortnoxCustomerNumber,
      period_type: row.periodType,
      period_year: row.periodYear,
      period_month: row.periodMonth,
      total_turnover: row.totalTurnover,
      invoice_count: row.invoiceCount,
      total_hours: row.totalHours,
      customer_hours: row.customerHours,
      absence_hours: row.absenceHours,
      internal_hours: row.internalHours,
      other_hours: row.otherHours,
      contract_value: row.contractValue,
    }))

    for (const chunk of chunkArray(periodRows, 500)) {
      if (chunk.length === 0) continue

      await heartbeat()

      const { error } = await supabase
        .from("customer_kpis")
        .upsert(chunk as never, {
          onConflict: "customer_id,period_type,period_year,period_month",
        })

      if (error) {
        throw new Error(`Failed inserting customer KPI periods: ${error.message}`)
      }
    }

    if (jobId) {
      await updateSyncJob(supabase, jobId, {
        status: "completed",
        progress: 100,
        current_step: "Done",
        payload: {
          step_name: "generate-kpis",
          step_label: "Generate KPIs",
          generated: true,
          period_rows: periodRows.length,
        },
        batch_phase: null,
        dispatch_lock: false,
      })
    }

    return new Response(
      JSON.stringify({ ok: true, done: true, period_rows: periodRows.length }),
      { headers: { ...corsHeaders(), "Content-Type": "application/json" } },
    )
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

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders(), "Content-Type": "application/json" } },
    )
  }
})
