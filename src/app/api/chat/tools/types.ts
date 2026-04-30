import type { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

/**
 * Context every tool receives. The Supabase client is JWT-scoped to the
 * logged-in user via cookies, so RLS policies are enforced automatically on
 * every query the tool makes.
 *
 * We type the client by inferring from createClient rather than importing
 * SupabaseClient<Database> directly — the generated Database interface in
 * this codebase narrows row types to `never` when used with the SSR helper,
 * so we read fields by casting at the call site.
 */
export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ToolContext = {
  supabase: SupabaseServerClient;
  user: Pick<Profile, "id" | "email" | "full_name" | "role" | "team_id">;
};

/**
 * Tool functions return JSON-serialisable values that we hand back to Claude as
 * a tool_result block. Keep return shapes flat and small — the model pays for
 * every token.
 */
export type ToolResult = unknown;

export type ToolHandler<TInput> = (
  input: TInput,
  context: ToolContext,
) => Promise<ToolResult>;
