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
  CostCenter: string | null
}

export interface FortnoxCostCenter {
  Code: string
  Description: string
  Note: string
  Active: boolean
}

export interface FortnoxCostCenterListResponse {
  CostCenters: FortnoxCostCenter[]
}

export interface FortnoxEmployee {
  EmployeeId: string
  PersonalIdentityNumber: string | null
  FirstName: string | null
  LastName: string | null
  FullName: string | null
  Address1: string | null
  Address2: string | null
  PostCode: string | null
  City: string | null
  Country: string | null
  Phone1: string | null
  Phone2: string | null
  Email: string | null
  EmploymentDate: string | null
  EmploymentForm: string | null
  JobTitle: string | null
  MonthlySalary: string | null
  Inactive: boolean
}

export interface FortnoxEmployeeListResponse {
  Employees: FortnoxEmployee[]
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
