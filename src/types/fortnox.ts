export interface FortnoxCustomer {
  CustomerNumber: string
  Name: string
  OrganisationNumber: string | null
  Email: string | null
  Phone1: string | null
  Address1: string | null
  Address2: string | null
  ZipCode: string | null
  City: string | null
  Country: string | null
  Active: boolean
}

export interface FortnoxCustomerListResponse {
  Customers: FortnoxCustomer[]
  MetaInformation: {
    "@TotalResources": number
    "@TotalPages": number
    "@CurrentPage": number
  }
}

export interface FortnoxCustomerSingleResponse {
  Customer: FortnoxCustomer
}

export interface FortnoxTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string
}

export interface FortnoxWebsocketEvent {
  topic: string
  offset: string
  type: "created" | "updated" | "deleted"
  tenantId: string
  entityId: string
  timestamp: string
}

export interface FortnoxApiError {
  ErrorInformation: {
    Error: number
    Message: string
    Code: number
  }
}
