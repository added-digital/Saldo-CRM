import { z } from "zod/v4"

export const updateProfileSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(100),
  avatar_url: z.url("Invalid URL").optional().or(z.literal("")),
})

export const inviteUserSchema = z.object({
  email: z.email("Invalid email address"),
})

export const createUserSchema = z.object({
  email: z.email("Invalid email address"),
  full_name: z.string().min(1, "Name is required").max(100),
  fortnox_employee_id: z.string().trim().max(100).optional().or(z.literal("")),
  fortnox_user_id: z.string().trim().max(100).optional().or(z.literal("")),
  fortnox_group_name: z.string().trim().max(100).optional().or(z.literal("")),
  fortnox_cost_center: z.string().trim().max(100).optional().or(z.literal("")),
})

export const updateUserRoleSchema = z.object({
  role: z.enum(["admin", "team_lead", "user"]),
})

export const assignTeamSchema = z.object({
  team_id: z.uuid("Invalid team ID").nullable(),
})

export const assignScopesSchema = z.object({
  scope_ids: z.array(z.uuid("Invalid scope ID")),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type InviteUserInput = z.infer<typeof inviteUserSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>
export type AssignTeamInput = z.infer<typeof assignTeamSchema>
export type AssignScopesInput = z.infer<typeof assignScopesSchema>
