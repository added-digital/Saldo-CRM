export type Role = "admin" | "team_lead" | "user"

export type CustomerStatus = "active" | "archived" | "removed"

export type SyncStatus = "idle" | "syncing" | "error"

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: Role
  is_active: boolean
  team_id: string | null
  created_at: string
  updated_at: string
}

export interface Team {
  id: string
  name: string
  description: string | null
  lead_id: string | null
  created_at: string
  updated_at: string
}

export interface Scope {
  id: string
  key: string
  label: string
  description: string | null
  created_at: string
}

export interface UserScope {
  user_id: string
  scope_id: string
  granted_by: string | null
  granted_at: string
}

export interface Customer {
  id: string
  fortnox_customer_number: string | null
  name: string
  org_number: string | null
  email: string | null
  phone: string | null
  address_line1: string | null
  address_line2: string | null
  zip_code: string | null
  city: string | null
  country: string | null
  status: CustomerStatus
  account_manager_id: string | null
  fortnox_raw: Record<string, unknown> | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export interface FortnoxConnection {
  id: string
  access_token: string
  refresh_token: string
  token_expires_at: string
  fortnox_tenant_id: string | null
  connected_at: string
  connected_by: string | null
  last_sync_at: string | null
  sync_status: SyncStatus
  sync_error: string | null
  websocket_offset: string | null
  updated_at: string
}

export interface AuditLogEntry {
  id: string
  user_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  metadata: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, "created_at" | "updated_at">
        Update: Partial<Omit<Profile, "id" | "created_at" | "updated_at">>
      }
      teams: {
        Row: Team
        Insert: Omit<Team, "id" | "created_at" | "updated_at">
        Update: Partial<Omit<Team, "id" | "created_at" | "updated_at">>
      }
      scopes: {
        Row: Scope
        Insert: Omit<Scope, "id" | "created_at">
        Update: Partial<Omit<Scope, "id" | "created_at">>
      }
      user_scopes: {
        Row: UserScope
        Insert: UserScope
        Update: Partial<UserScope>
      }
      customers: {
        Row: Customer
        Insert: Omit<Customer, "id" | "created_at" | "updated_at">
        Update: Partial<Omit<Customer, "id" | "created_at" | "updated_at">>
      }
      fortnox_connection: {
        Row: FortnoxConnection
        Insert: Omit<FortnoxConnection, "id" | "connected_at" | "updated_at">
        Update: Partial<Omit<FortnoxConnection, "id" | "connected_at" | "updated_at">>
      }
      audit_log: {
        Row: AuditLogEntry
        Insert: Omit<AuditLogEntry, "id" | "created_at">
        Update: never
      }
    }
  }
}
