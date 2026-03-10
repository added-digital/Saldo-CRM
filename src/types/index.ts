export type { Role, CustomerStatus, SyncStatus, Profile, Team, Scope, UserScope, Customer, FortnoxConnection, AuditLogEntry, Database } from "./database"
export type { FortnoxCustomer, FortnoxCustomerListResponse, FortnoxCustomerSingleResponse, FortnoxTokenResponse, FortnoxWebsocketEvent, FortnoxApiError } from "./fortnox"

export interface ActionResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
