import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify } from '@/lib/notifications';
import type { FreightMode, Profile } from '@/lib/types';

// POST /api/tenders/open  Body: { poId, mode, forwarderIds: string[] }
// Opens the sealed tender, records invitations, notifies invited forwarders.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    poId?: string;
    mode?: FreightMode;
    forwarderIds?: string[];
  };
  if (!body.poId || !body.mode || !body.forwarderIds?.length) {
    return NextResponse.json({ error: 'poId, mode and forwarderIds are required' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const profile = profileRow as Profile | null;
  if (!profile || !['procurement', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: po } = await admin.from('purchase_orders').select('*').eq('id', body.poId).single();
  if (!po || po.org_id !== profile.org_id) {
    return NextResponse.json({ error: 'PO not found' }, { status: 404 });
  }

  // One tender per PO.
  const { data: existing } = await admin
    .from('tenders')
    .select('id')
    .eq('po_id', body.poId)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: 'A tender already exists for this PO' }, { status: 409 });

  const { data: tender, error: tErr } = await admin
    .from('tenders')
    .insert({
      org_id: profile.org_id,
      po_id: body.poId,
      mode: body.mode,
      status: 'open',
      opened_by: profile.id,
    })
    .select('*')
    .single();
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  // Invitations (only forwarders in this org that support the mode).
  const { data: eligible } = await admin
    .from('forwarders')
    .select('id, name, contact_email, modes')
    .eq('org_id', profile.org_id)
    .in('id', body.forwarderIds);

  const invites = (eligible ?? []).filter(
    (f) => body.mode === 'both' || f.modes.includes(body.mode!) || f.modes.includes('both'),
  );
  if (invites.length > 0) {
    await admin.from('tender_invitations').insert(
      invites.map((f) => ({ tender_id: tender.id, forwarder_id: f.id })),
    );
  }

  await admin.from('purchase_orders').update({ status: 'tender_open' }).eq('id', body.poId);

  // Notify each invited forwarder (mocked email).
  for (const f of invites) {
    await notify({
      orgId: profile.org_id,
      recipientEmail: f.contact_email,
      title: 'You are invited to a sealed freight tender',
      body: `You have been invited to bid on PO ${po.po_number}. Submit one sealed bid via your forwarder portal.`,
      poId: body.poId,
      channel: 'email',
    });
  }

  await writeAudit({
    orgId: profile.org_id,
    actorProfileId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: 'tender.opened',
    entityType: 'tender',
    entityId: tender.id,
    poId: body.poId,
    metadata: { mode: body.mode, invited: invites.map((f) => f.id) },
  });

  return NextResponse.json({ ok: true, tender, invited: invites.length });
}
