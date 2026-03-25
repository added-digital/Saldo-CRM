import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { FortnoxClient } from "@/lib/fortnox/client"
import { requestAccessToken } from "@/lib/fortnox/auth"
import { fetchRegistrationsV2 } from "@/lib/fortnox/time-registrations"
import type { Profile, FortnoxConnection } from "@/types/database"

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readTextField(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = asText(record[key])
    if (value) return value
  }

  return null
}

function readCollection(payload: Record<string, unknown>, keys: string[]): Record<string, unknown>[] {
  for (const key of keys) {
    const value = payload[key]
    if (!Array.isArray(value)) continue

    return value
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
  }

  return []
}

async function getFortnoxClient(adminClient: ReturnType<typeof createAdminClient>): Promise<FortnoxClient> {
  const { data: connData } = await adminClient
    .from("fortnox_connection")
    .select("*")
    .limit(1)
    .single()

  if (!connData) {
    throw new Error("No Fortnox connection")
  }

  const conn = connData as unknown as FortnoxConnection

  if (!conn.fortnox_tenant_id) {
    throw new Error("No TenantId stored. Reconnect Fortnox via Settings → Integrations.")
  }

  const tokenExpiry = new Date(conn.token_expires_at)
  if (tokenExpiry.getTime() - 5 * 60 * 1000 < Date.now()) {
    const tokens = await requestAccessToken(conn.fortnox_tenant_id)
    const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    await adminClient
      .from("fortnox_connection")
      .update({
        access_token: tokens.access_token,
        token_expires_at: newExpiry,
      } as never)
      .eq("id", conn.id as never)

    return new FortnoxClient(tokens.access_token)
  }

  return new FortnoxClient(conn.access_token)
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single<Pick<Profile, "role">>()

    if (profile?.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      )
    }

    const adminClient = createAdminClient()

    const registrationsPreview = request.nextUrl.searchParams.get("registrations")
    if (registrationsPreview === "v2") {
      const fortnox = await getFortnoxClient(adminClient)
      const fromDate = request.nextUrl.searchParams.get("fromDate") ?? "2025-01-01"
      const params = new URLSearchParams({ fromDate })
      const result = await fortnox.requestPath<Record<string, unknown> | Array<Record<string, unknown>>>(
        `/api/time/registrations-v2?${params.toString()}`
      )

      const rows = Array.isArray(result)
        ? result
        : Array.isArray(result.rows)
          ? (result.rows as Array<Record<string, unknown>>)
          : []

      const dates = rows
        .map((row) => {
          const rawDate = row.workedDate ?? row.Date ?? row.ReportDate ?? row.TimeReportDate ?? row.WorkDate ?? row.TransactionDate ?? row.EntryDate
          return typeof rawDate === "string" ? rawDate.slice(0, 10) : null
        })
        .filter((date): date is string => Boolean(date))
        .sort()

      return NextResponse.json({
        endpoint: "/api/time/registrations-v2",
        fromDate,
        total: rows.length,
        returned_date_range: {
          from: dates[0] ?? null,
          to: dates[dates.length - 1] ?? null,
        },
      })
    }

    const customerNumber = request.nextUrl.searchParams.get("customer")
    if (customerNumber) {
      const fortnox = await getFortnoxClient(adminClient)
      const result = await fortnox.getCustomer(customerNumber)

      return NextResponse.json({
        customer_number: customerNumber,
        raw: result.Customer,
      })
    }

    const invoicesCustomerNumber = request.nextUrl.searchParams.get("invoicesCustomer")?.trim() ?? ""
    if (invoicesCustomerNumber) {
      const fortnox = await getFortnoxClient(adminClient)
      const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? 100)
      const pageRaw = Number(request.nextUrl.searchParams.get("page") ?? 1)
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100
      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1
      const endpoint = `/3/invoices?limit=${limit}&page=${page}&customernumber=${encodeURIComponent(invoicesCustomerNumber)}`
      const result = await fortnox.requestPath<Record<string, unknown>>(endpoint)

      const invoices = readCollection(result, ["Invoices", "invoices"])
      const normalizedCustomer = invoicesCustomerNumber.trim()
      const strictMatches = invoices.filter((invoice) => {
        const fromCustomerNumber = readTextField(invoice, ["CustomerNumber", "customerNumber"])
        return fromCustomerNumber === normalizedCustomer
      })

      return NextResponse.json({
        customer_number: invoicesCustomerNumber,
        endpoint,
        returned_count: invoices.length,
        strict_match_count: strictMatches.length,
        invoices: strictMatches.length > 0 ? strictMatches : invoices,
      })
    }

    const contractNumber = request.nextUrl.searchParams.get("contract")?.trim() ?? ""
    if (contractNumber) {
      const fortnox = await getFortnoxClient(adminClient)
      const endpoint = `/3/contracts/${encodeURIComponent(contractNumber)}`
      const result = await fortnox.requestPath<Record<string, unknown>>(endpoint)

      return NextResponse.json({
        contract_number: contractNumber,
        endpoint,
        raw: result,
      })
    }

    const invoiceNumber = request.nextUrl.searchParams.get("invoice")?.trim() ?? ""
    if (invoiceNumber) {
      const fortnox = await getFortnoxClient(adminClient)
      const endpoint = `/3/invoices/${encodeURIComponent(invoiceNumber)}`
      const result = await fortnox.requestPath<Record<string, unknown>>(endpoint)

      return NextResponse.json({
        invoice_number: invoiceNumber,
        endpoint,
        raw: result,
      })
    }

    const fortnoxUsersDump = request.nextUrl.searchParams.get("fortnoxusersdump")
    if (fortnoxUsersDump === "1") {
      const fortnox = await getFortnoxClient(adminClient)
      const endpointCandidates = [
        "/3/users?limit=500",
        "/api/users?limit=500",
        "/api/users",
      ]

      const attempts: Array<{ endpoint: string; ok: boolean; error?: string }> = []

      for (const endpoint of endpointCandidates) {
        try {
          const result = await fortnox.requestPath<Record<string, unknown>>(endpoint)

          return NextResponse.json({
            debug: "fortnoxusersdump",
            endpoint,
            raw: result,
            attempts: [...attempts, { endpoint, ok: true }],
          })
        } catch (error) {
          attempts.push({
            endpoint,
            ok: false,
            error: error instanceof Error ? error.message : "Unknown error",
          })
        }
      }

      return NextResponse.json(
        {
          error: "Could not fetch Fortnox users from available endpoints",
          attempts,
        },
        { status: 404 }
      )
    }

    const fortnoxEmployeesDump = request.nextUrl.searchParams.get("fortnoxemployeesdump")
    if (fortnoxEmployeesDump === "1") {
      const fortnox = await getFortnoxClient(adminClient)
      const result = await fortnox.requestPath<Record<string, unknown>>("/3/employees")

      return NextResponse.json({
        debug: "fortnoxemployeesdump",
        endpoint: "/3/employees",
        raw: result,
      })
    }

    const fortnoxUserDump = request.nextUrl.searchParams.get("fortnoxuserdump")
    if (fortnoxUserDump === "1") {
      const fortnox = await getFortnoxClient(adminClient)
      const userId = request.nextUrl.searchParams.get("userId")?.trim() ?? ""

      if (!userId) {
        return NextResponse.json(
          { error: "userId is required for fortnoxuserdump=1" },
          { status: 400 }
        )
      }

      const endpointCandidates = [
        `/3/employees/${encodeURIComponent(userId)}`,
        `/3/users/${encodeURIComponent(userId)}`,
        `/api/time/users/${encodeURIComponent(userId)}`,
      ]

      const attempts: Array<{ endpoint: string; ok: boolean; error?: string }> = []
      let employeeRaw: Record<string, unknown> | null = null
      let directUserRaw: Record<string, unknown> | null = null

      for (const endpoint of endpointCandidates) {
        try {
          const result = await fortnox.requestPath<Record<string, unknown>>(endpoint)
          const rawResult = asRecord(result) ?? {}
          const employeeFromResult = asRecord(rawResult.Employee)
          const userFromResult = asRecord(rawResult.User)

          if (employeeFromResult) {
            employeeRaw = employeeFromResult
          }

          if (userFromResult) {
            directUserRaw = userFromResult
          }

          attempts.push({ endpoint, ok: true })
        } catch (error) {
          attempts.push({
            endpoint,
            ok: false,
            error: error instanceof Error ? error.message : "Unknown error",
          })
        }
      }

      const employeesResponse = await fortnox.getEmployees()

      const userListEndpoints = [
        "/3/users?limit=500",
        "/api/users?limit=500",
        "/api/users",
      ]

      let usersListPayload: Record<string, unknown> | null = null

      for (const endpoint of userListEndpoints) {
        try {
          const result = await fortnox.requestPath<Record<string, unknown>>(endpoint)
          usersListPayload = asRecord(result)
          attempts.push({ endpoint, ok: true })
          if (usersListPayload) break
        } catch (error) {
          attempts.push({
            endpoint,
            ok: false,
            error: error instanceof Error ? error.message : "Unknown error",
          })
        }
      }

      const employeeFromList = (employeesResponse.Employees ?? []).find((employee) => {
        const employeeId = String(employee.EmployeeId ?? "").trim()
        return employeeId === userId
      })

      if (!employeeRaw && employeeFromList) {
        const fallbackEmployeeRecord = asRecord(employeeFromList)
        if (fallbackEmployeeRecord) {
          employeeRaw = fallbackEmployeeRecord
        }
      }

      const usersPayload = usersListPayload ?? {}
      const users = readCollection(usersPayload, ["Users", "users", "Data", "data"])

      const employeeEmail = employeeRaw ? readTextField(employeeRaw, ["Email", "email"]) : null
      const employeeId = employeeRaw ? readTextField(employeeRaw, ["EmployeeId", "employeeId", "Id", "id"]) : null

      const matchingUsers = users.filter((userRecord) => {
        const userEmail = readTextField(userRecord, ["Email", "email", "UserEmail", "userEmail"])
        const linkedEmployeeId = readTextField(userRecord, ["EmployeeId", "employeeId", "LinkedEmployeeId", "linkedEmployeeId"])
        const directUserId = readTextField(userRecord, ["UserId", "userId", "Id", "id"])

        const matchesEmail = employeeEmail && userEmail && employeeEmail.toLowerCase() === userEmail.toLowerCase()
        const matchesEmployeeId = employeeId && linkedEmployeeId && employeeId === linkedEmployeeId
        const matchesDirectId = directUserId && directUserId === userId

        return Boolean(matchesEmail || matchesEmployeeId || matchesDirectId)
      })

      const likelyUserId = matchingUsers.length > 0
        ? readTextField(matchingUsers[0], ["UserId", "userId", "Id", "id"])
        : null

      if (!directUserRaw && matchingUsers.length > 0) {
        directUserRaw = matchingUsers[0]
      }

      return NextResponse.json({
        debug: "fortnoxuserdump",
        lookup_id: userId,
        likely_user_id: likelyUserId,
        endpoint: directUserRaw ? "resolved:/3/users" : employeeRaw ? "resolved:/3/employees" : null,
        raw: {
          user: directUserRaw,
          employee: employeeRaw,
        },
        users_match_count: matchingUsers.length,
        users_matches: matchingUsers,
        attempts,
      })
    }

    const fortnoxDump = request.nextUrl.searchParams.get("fortnoxdump")
    if (fortnoxDump === "1") {
      const fortnox = await getFortnoxClient(adminClient)
      const fromDate = request.nextUrl.searchParams.get("fromDate") ?? "2025-01-01"

      const [timeRows, employeesResponse] = await Promise.all([
        fetchRegistrationsV2(fortnox, fromDate),
        fortnox.getEmployees(),
      ])

      const timeReports = timeRows.slice(0, 10).map((row) => ({
        report_date: row.report_date,
        employee_id: row.employee_id,
        employee_name: row.employee_name,
        customer_name: row.customer_name,
        entry_type: row.entry_type,
        hours: row.hours,
        project_name: row.project_name,
        activity: row.activity,
      }))

      const employees = (employeesResponse.Employees ?? []).slice(0, 10).map((employee) => ({
        employee_id: employee.EmployeeId ?? null,
        full_name: employee.FullName ?? null,
        first_name: employee.FirstName ?? null,
        last_name: employee.LastName ?? null,
        email: employee.Email ?? null,
        inactive: Boolean(employee.Inactive),
      }))

      return NextResponse.json({
        debug: "fortnoxdump",
        fromDate,
        limits: {
          time_reports: 10,
          employees: 10,
        },
        time_reports: timeReports,
        employees,
      })
    }

    const dbDump = request.nextUrl.searchParams.get("dbdump")
    if (dbDump === "1") {
      const [timeReportsRes, usersRes] = await Promise.all([
        adminClient
          .from("time_reports")
          .select("id, report_date, employee_id, employee_name, customer_name, entry_type, hours, project_name, activity, description, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
        adminClient
          .from("profiles")
          .select("id, email, full_name, fortnox_employee_id, team_id, role, is_active, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
      ])

      return NextResponse.json({
        debug: "dbdump",
        limits: {
          time_reports: 10,
          users: 10,
        },
        time_reports: timeReportsRes.data ?? [],
        users: usersRes.data ?? [],
      })
    }

    const [costCentersRes, profilesRes, customersWithCCRes] = await Promise.all([
      adminClient.from("cost_centers").select("code, name, active"),
      adminClient.from("profiles").select("id, full_name, fortnox_cost_center, is_active").eq("is_active", true),
      adminClient.from("customers").select("id, name, fortnox_cost_center").not("fortnox_cost_center", "is", null).limit(20),
    ])

    const costCenters = (costCentersRes.data ?? []) as unknown as { code: string; name: string | null; active: boolean }[]
    const profiles = (profilesRes.data ?? []) as unknown as { id: string; full_name: string | null; fortnox_cost_center: string | null; is_active: boolean }[]
    const customersWithCC = customersWithCCRes.data ?? []

    const profileNames = profiles.map((p) => p.full_name?.toLowerCase().trim()).filter(Boolean)
    const costCenterNames = costCenters.map((cc) => cc.name?.toLowerCase().trim()).filter(Boolean)

    const matchingNames = costCenterNames.filter((ccName) => profileNames.includes(ccName))
    const unmatchedCostCenters = costCenters.filter(
      (cc) => cc.name && !profileNames.includes(cc.name.toLowerCase().trim())
    )
    const unmatchedProfiles = profiles.filter(
      (p) => p.full_name && !costCenterNames.includes(p.full_name.toLowerCase().trim())
    )

    const profilesWithCostCenter = profiles.filter((p) => p.fortnox_cost_center)

    return NextResponse.json({
      cost_centers: costCenters,
      profiles: profiles.map((p) => ({ id: p.id, full_name: p.full_name, fortnox_cost_center: p.fortnox_cost_center })),
      customers_with_cost_center: customersWithCC,
      profiles_with_cost_center: profilesWithCostCenter.map((p) => ({ id: p.id, full_name: p.full_name, fortnox_cost_center: p.fortnox_cost_center })),
      matching_names: matchingNames,
      unmatched_cost_centers: unmatchedCostCenters.map((cc) => ({ code: cc.code, name: cc.name })),
      unmatched_profiles: unmatchedProfiles.map((p) => ({ id: p.id, full_name: p.full_name })),
      summary: {
        total_cost_centers: costCenters.length,
        total_active_profiles: profiles.length,
        total_customers_with_cost_center: customersWithCC.length,
        total_profiles_with_cost_center: profilesWithCostCenter.length,
        name_matches: matchingNames.length,
      },
    })
  } catch (error) {
    console.error("Debug error:", error)
    return NextResponse.json(
      {
        error: "Debug failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
