import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

export function createAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

export type AdminClient = ReturnType<typeof createAdminClient>
