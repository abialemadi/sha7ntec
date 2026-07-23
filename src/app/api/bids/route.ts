import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import type { Profile } from '@/lib/types';

// POST /api/bids  Body: { tenderId, amount, transitDays?, notes? }
//
// Forwarder submits or amends their ONE sealed bid. The INSERT/UPDATE runs
// through the RLS-scoped session client, so the sealed-bid policies apply —
// this route cannot be used to see or touch anyone else's bid. Audit is
// written with the service role.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    tenderId?: string;
    amount?: number;
    transitDays?: number;
    notes?: string;
  };
  if (!body.tenderId || !body.amount || body.amount <= 0) {
    return NextResponse.json({ error: 'tenderId and a positive amount are required' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const profile = profileRow as Profile | null;
  if (!profile || profile.role !== 'forwarder' || !profile.forwarder_id) {
    return NextResponse.json({ error: 'Only invited forwarders can bid' }, { status: 403 });
  }

  // Does a bid already exist for this forwarder+tender? (upsert semantics)
  const { data: existing } = await supabase
    .from('bids')
    .select('id')
    .eq('tender_id', body.tenderId)
    .eq('forwarder_id', profile.forwarder_id)
    .maybeSingle();

  let bidId: string | null = null;
  if (existing) {
    // Amend — RLS bids_forwarder_update only allows while the tender is open.
    const { data, error } = await supabase
      .from('bids')
      .update({ amount: body.amount, transit_days: body.transitDays ?? null, notes: body.notes ?? null })
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    bidId = data.id;
  } else {
    // Submit — RLS bids_forwarder_insert enforces invited + open.
    const { data, error } = await supabase
      .from('bids')
      .insert({
        org_id: profile.org_id,
        tender_id: body.tenderId,
        forwarder_id: profile.forwarder_id,
        amount: body.amount,
        transit_days: body.transitDays ?? null,
        notes: body.notes ?? null,
        submitted_by: profile.id,
      })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    bidId = data.id;
  }

  // Audit (service role). We deliberately do NOT log the amount here — the
  // audit log is readable by admins and the tender is still sealed.
  const admin = createAdminClient();
  const { data: tender } = await admin.from('tenders').select('po_id').eq('id', body.tenderId).single();
  await writeAudit({
    orgId: profile.org_id,
    actorProfileId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: existing ? 'bid.amended' : 'bid.submitted',
    entityType: 'bid',
    entityId: bidId,
    poId: tender?.po_id ?? null,
    metadata: { forwarder_id: profile.forwarder_id },
  });

  return NextResponse.json({ ok: true, bidId, amended: Boolean(existing) });
}
