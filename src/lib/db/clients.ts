import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/** Cookie-bound client acting as the signed-in user; every query is subject to RLS. */
export async function createUserClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(env.supabaseUrl()!, env.supabaseAnonKey()!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => {
        try {
          items.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* called from a Server Component; the proxy refreshes sessions instead */
        }
      },
    },
  });
}

let admin: SupabaseClient | null = null;

/** Service-role client. Bypasses RLS: only use after an explicit organization authorization check. */
export function createAdminClient(): SupabaseClient {
  admin ??= createClient(env.supabaseUrl()!, env.supabaseServiceKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
