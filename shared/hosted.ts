/**
 * The hosted class service (Supabase) this build talks to: Quoli Classes on the website and
 * Settings → Class sync in the local app. Both values are public by design (the publishable key
 * only reaches what row-level security allows; see supabase/migrations). The secret key is never
 * used by Quoli and must never appear here. Environment variables override them for development:
 * QUOLI_SYNC_URL / QUOLI_SYNC_ANON_KEY (local app), VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 * (class page).
 */
export const HOSTED_SUPABASE = {
  url: "https://fuyorcqpxsrndkioccra.supabase.co",
  publishableKey: "sb_publishable_7_PxtqdlUy0FSdklA3F2dA_W1uw5nb8",
};
