const FORTNOX_API_BASE = "https://api.fortnox.se"
const FORTNOX_AUTH_BASE = "https://apps.fortnox.se/oauth-v1"

function authHeader(): string {
  const clientId = Deno.env.get("FORTNOX_CLIENT_ID")!
  const clientSecret = Deno.env.get("FORTNOX_CLIENT_SECRET")!
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`
}

interface ClientCredentialsResponse {
  access_token: string
  expires_in: number
  token_type: string
  scope: string
}

export async function requestAccessToken(
  tenantId: string
): Promise<ClientCredentialsResponse> {
  const response = await fetch(`${FORTNOX_AUTH_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: authHeader(),
      TenantId: tenantId,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Client credentials error: ${text}`)
  }

  return response.json() as Promise<ClientCredentialsResponse>
}

export class FortnoxClient {
  private accessToken: string

  constructor(accessToken: string) {
    this.accessToken = accessToken
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${FORTNOX_API_BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
    })

    if (response.status === 429) {
      throw new Error("Rate limited by Fortnox. Retry after backoff.")
    }

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Fortnox API error (${response.status}): ${text}`)
    }

    return response.json() as Promise<T>
  }

  async getCustomers(page = 1, limit = 500) {
    return this.request<{
      Customers: Array<Record<string, unknown>>
      MetaInformation: { "@TotalResources": number; "@TotalPages": number; "@CurrentPage": number }
    }>(`/3/customers?limit=${limit}&page=${page}`)
  }

  async getCustomer(customerNumber: string) {
    return this.request<{ Customer: Record<string, unknown> }>(
      `/3/customers/${customerNumber}`
    )
  }

  async getEmployees() {
    return this.request<{ Employees: Array<Record<string, unknown>> }>(`/3/employees`)
  }

  async getCostCenters() {
    return this.request<{ CostCenters: Array<Record<string, unknown>> }>(`/3/costcenters`)
  }

  async getInvoices(page = 1, limit = 100) {
    return this.request<{
      Invoices: Array<Record<string, unknown>>
      MetaInformation: { "@TotalResources": number; "@TotalPages": number; "@CurrentPage": number }
    }>(`/3/invoices?limit=${limit}&page=${page}`)
  }

  async getInvoice(documentNumber: string) {
    return this.request<{ Invoice: Record<string, unknown> }>(
      `/3/invoices/${documentNumber}`
    )
  }

  async getAttendanceTransactions(page = 1, limit = 100) {
    return this.request<{
      AttendanceTransactions: Array<Record<string, unknown>>
      MetaInformation: { "@TotalResources": number; "@TotalPages": number; "@CurrentPage": number }
    }>(`/3/attendancetransactions?limit=${limit}&page=${page}`)
  }

  async getContracts(page = 1) {
    return this.request<{
      Contracts: Array<Record<string, unknown>>
      MetaInformation: { "@TotalResources": number; "@TotalPages": number; "@CurrentPage": number }
    }>(`/3/contracts?page=${page}`)
  }

  async getContract(contractNumber: string) {
    return this.request<{ Contract: Record<string, unknown> }>(
      `/3/contracts/${contractNumber}`
    )
  }
}
