import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseAdmin: SupabaseClient | null = null;

/**
 * Returns a Supabase admin client (service role).
 * Used for server-side operations that need to bypass RLS.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (supabaseAdmin) return supabaseAdmin;

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. ' +
        'Copy .env.example to .env and fill in your Supabase credentials.',
    );
  }

  supabaseAdmin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return supabaseAdmin;
}

/**
 * Returns a Supabase client scoped to a specific user session.
 * Used for operations that should respect RLS.
 */
export function getSupabaseClient(accessToken: string): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.');
  }

  return createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
