import { createClient } from './supabase/server';
import type { Profile } from './types';

// Server-side helpers for the current session's profile + role routing.

export async function getSessionProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return (profile as Profile | null) ?? null;
}

// Where each role lands after login (spec §7 — page.tsx redirects by role).
export function landingPathForRole(role: Profile['role']): string {
  switch (role) {
    case 'vendor':
      return '/portal/vendor';
    case 'forwarder':
      return '/portal/forwarder';
    case 'warehouse':
      return '/shipments';
    case 'finance':
      return '/dashboard';
    case 'procurement':
      return '/dashboard';
    case 'admin':
      return '/dashboard';
    default:
      return '/dashboard';
  }
}

export const INTERNAL_ROLES: Profile['role'][] = [
  'admin',
  'procurement',
  'finance',
  'warehouse',
];
