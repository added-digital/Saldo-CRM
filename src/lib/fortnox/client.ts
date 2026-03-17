import type {
  FortnoxCustomerListResponse,
  FortnoxCustomerSingleResponse,
  FortnoxEmployeeListResponse,
  FortnoxCostCenterListResponse,
} from "@/types/fortnox"
import { FORTNOX_API_BASE } from "./auth"

export class FortnoxClient {
  private accessToken: string

  constructor(accessToken: string) {
    this.accessToken = accessToken
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${FORTNOX_API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
        ...options?.headers,
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

  async requestPath<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>(path, options)
  }

  async getCustomers(page: number = 1, limit: number = 500): Promise<FortnoxCustomerListResponse> {
    return this.request<FortnoxCustomerListResponse>(
      `/3/customers?limit=${limit}&page=${page}`
    )
  }

  async getCustomer(customerNumber: string): Promise<FortnoxCustomerSingleResponse> {
    return this.request<FortnoxCustomerSingleResponse>(
      `/3/customers/${customerNumber}`
    )
  }

  async getEmployees(): Promise<FortnoxEmployeeListResponse> {
    return this.request<FortnoxEmployeeListResponse>(`/3/employees`)
  }

  async getCostCenters(): Promise<FortnoxCostCenterListResponse> {
    return this.request<FortnoxCostCenterListResponse>(`/3/costcenters`)
  }
}
