import { z } from "zod/v4"

export const createTeamSchema = z.object({
  name: z.string().min(1, "Team name is required").max(100),
  description: z.string().max(500).optional().or(z.literal("")),
})

export const updateTeamSchema = createTeamSchema.partial()

export const assignTeamLeadSchema = z.object({
  lead_id: z.uuid("Invalid user ID").nullable(),
})

export const addTeamMemberSchema = z.object({
  user_id: z.uuid("Invalid user ID"),
})

export type CreateTeamInput = z.infer<typeof createTeamSchema>
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>
export type AssignTeamLeadInput = z.infer<typeof assignTeamLeadSchema>
export type AddTeamMemberInput = z.infer<typeof addTeamMemberSchema>
