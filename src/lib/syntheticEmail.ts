/**
 * Supabase Auth's email/password sign-up requires an email-shaped string,
 * but this app's UI never shows or asks for one — people log in with
 * Store ID + Username + Password. This generates a unique, invisible
 * placeholder to satisfy Auth's requirement under the hood.
 */
export function generateSyntheticEmail(username: string): string {
  const cleaned = username.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user';
  const unique = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `${cleaned}.${unique}@accounts.vansales.internal`;
}
