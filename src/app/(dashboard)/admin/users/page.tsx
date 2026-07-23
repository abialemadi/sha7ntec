import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth';
import { Panel, Badge } from '@/components/ui';
import { CreateUserForm } from '@/components/admin/CreateUserForm';
import type { Forwarder, Profile, Vendor } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'admin') redirect('/dashboard');

  const supabase = await createClient();
  const [{ data: profiles }, { data: forwarders }, { data: vendors }] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('forwarders').select('*').order('name'),
    supabase.from('vendors').select('*').order('name'),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Users</h1>
        <p className="text-sm text-dim">Accounts are admin-created. Public sign-up is disabled.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Panel title="Team" subtitle={`${(profiles ?? []).length} users`}>
          <ul className="divide-y divide-border/60">
            {((profiles ?? []) as Profile[]).map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium text-ink">{p.full_name ?? p.email}</div>
                  <div className="text-xs text-dim">{p.email}</div>
                </div>
                <Badge>{p.role}</Badge>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Create user">
          <CreateUserForm
            forwarders={(forwarders ?? []) as Forwarder[]}
            vendors={(vendors ?? []) as Vendor[]}
          />
        </Panel>
      </div>
    </div>
  );
}
