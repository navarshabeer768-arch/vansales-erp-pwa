import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/**
 * Use this (never the main `supabase` client) for supabase.auth.signUp()
 * calls made *on behalf of someone else* while an admin is signed in — e.g.
 * a platform admin creating a new tenant's login. The main client persists
 * sessions to storage and would otherwise silently swap the admin's own
 * session for the newly created user's session.
 */
export function createEphemeralAuthClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
