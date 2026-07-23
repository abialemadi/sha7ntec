import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import type { Profile } from '@/lib/types';

// POST /api/deliveries  Body: { poId }
// The winning forwarder confirms delivery.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { poId?: string };
  if (!body.poId) return NextResponse.json({ error: 'poId required' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const profile = profileRow as Profile | null;
  if (!profile || profile.role !== 'forwarder' || !profile.forwarder_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();

  // Verify this forwarder actually won this PO's tender.
  const { data: award } = await admin
    .from('awards')
    .select('id, tender_id, forwarder_id, tenders!inner(po_id)')
    .eq('forwarder_id', profile.forwarder_id)
    .eq('tenders.po_id', body.poId)
    .maybeSingle();
  if (!award) {
    return NextResponse.json({ error: 'You did not win this shipment' }, { status: 403 });
  }

  const now = new Date().toISOString();
  const { data: delivery, error } = await admin
    .from('deliveries')
    .insert({
      org_id: profile.org_id,
      po_id: body.poId,
      forwarder_id: profile.forwarder_id,
      delivered_at: now,
      confirmed_by: profile.id,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAudit({
    orgId: profile.org_id,
    actorProfileId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: 'delivery.confirmed',
    entityType: 'delivery',
    entityId: delivery.id,
    poId: body.poId,
    metadata: { forwarder_id: profile.forwarder_id },
  });

  return NextResponse.json({ ok: true, delivery });
}
