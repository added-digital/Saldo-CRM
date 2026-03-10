import { z } from "zod/v4"

export const createCustomerSchema = z.object({
  name: z.string().min(1, "Customer name is required").max(200),
  org_number: z.string().max(20).optional().or(z.literal("")),
  email: z.email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  address_line1: z.string().max(200).optional().or(z.literal("")),
  address_line2: z.string().max(200).optional().or(z.literal("")),
  zip_code: z.string().max(10).optional().or(z.literal("")),
  city: z.string().max(100).optional().or(z.literal("")),
  country: z.string().max(2).optional().default("SE"),
  account_manager_id: z.uuid("Invalid user ID").nullable().optional(),
})

export const updateCustomerSchema = createCustomerSchema.partial()

export const assignAccountManagerSchema = z.object({
  account_manager_id: z.uuid("Invalid user ID").nullable(),
})

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>
export type AssignAccountManagerInput = z.infer<typeof assignAccountManagerSchema>
