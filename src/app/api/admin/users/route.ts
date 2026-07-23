import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import type { Profile, UserRole } from '@/lib/types';

// POST /api/admin/users — admin creates a user (accounts are admin-created
// only; public sign-up is disabled). Body:
//   { email, password, fullName, role, forwarderId?, vendorId? }
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    fullName?: string;
    role?: UserRole;
    forwarderId?: string;
    vendorId?: string;
  };
  if (!body.email || !body.password || !body.role) {
    return NextResponse.json({ error: 'email, password and role are required' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const actor = profileRow as Profile | null;
  if (!actor || actor.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    return NextResponse.json({ error: createErr?.message ?? 'Could not create user' }, { status: 400 });
  }

  const { error: profErr } = await admin.from('profiles').insert({
    id: created.user.id,
    org_id: actor.org_id,
    role: body.role,
    full_name: body.fullName ?? null,
    email: body.email,
    forwarder_id: body.role === 'forwarder' ? body.forwarderId ?? null : null,
    vendor_id: body.role === 'vendor' ? body.vendorId ?? null : null,
  });
  if (profErr) {
    // Roll back the auth user so we don't leave an orphan.
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profErr.message }, { status: 400 });
  }

  await writeAudit({
    orgId: actor.org_id,
    actorProfileId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: 'user.created',
    entityType: 'profile',
    entityId: created.user.id,
    metadata: { email: body.email, role: body.role },
  });

  return NextResponse.json({ ok: true, userId: created.user.id });
}
