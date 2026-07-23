import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { FreightMode, Profile } from '@/lib/types';

// POST /api/admin/forwarders — admin/procurement adds a forwarder company.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    contactEmail?: string;
    modes?: FreightMode[];
  };
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const actor = profileRow as Profile | null;
  if (!actor || !['admin', 'procurement'].includes(actor.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('forwarders')
    .insert({
      org_id: actor.org_id,
      name: body.name,
      contact_email: body.contactEmail ?? null,
      modes: body.modes?.length ? body.modes : ['sea'],
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, forwarder: data });
}
