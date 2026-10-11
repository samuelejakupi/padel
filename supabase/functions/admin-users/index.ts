import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { handleAdminRequest } from "./handler.mjs";

Deno.serve((req: Request) => {
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return handleAdminRequest(req, client);
});
