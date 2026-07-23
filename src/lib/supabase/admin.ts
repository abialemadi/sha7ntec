import 'server-only';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// SERVICE-ROLE CLIENT — SERVER ONLY.
//
// This client BYPASSES Row Level Security. It exists so that trusted server
// routes can do things the RLS policies deliberately forbid for end users:
//   - read every bid at tender close (the sealed reveal)
//   - write anomaly results back onto bids
//   - insert into the append-only audit_log
//   - create auth users / profiles (admin user management)
//
// The `server-only` import above makes the build fail if this module is ever
// imported from a client component. Never expose the returned client to the
// browser and never pass its results to the client without an authz check.
// ============================================================
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for admin client.',
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
