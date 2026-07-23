import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify } from '@/lib/notifications';
import { recommendAward, type AwardCandidate } from '@/lib/anomaly';
import type { Bid, Profile } from '@/lib/types';

// ============================================================
// POST /api/tenders/[id]/award
// Body: { bidId?: string }   (omit to accept the recommended qualified bid)
//
// Awards the tender. If procurement overrides the recommendation (picks a
// bid other than the lowest qualified), we still allow it but record
// award.overridden in the audit log (spec §8.2, §10).
// ============================================================
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;
  const body = (await req.json().catch(() => ({}))) as { bidId?: string };

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
  const { data: tender } = await admin.from('tenders').select('*').eq('id', tenderId).single();
  if (!tender) return NextResponse.json({ error: 'Tender not found' }, { status: 404 });
  if (tender.org_id !== profile.org_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (tender.status !== 'closed') {
    return NextResponse.json({ error: 'Tender must be closed before awarding' }, { status: 409 });
  }

  // Prevent double-award.
  const { data: existingAward } = await admin
    .from('awards')
    .select('id')
    .eq('tender_id', tenderId)
    .maybeSingle();
  if (existingAward) {
    return NextResponse.json({ error: 'Tender already awarded' }, { status: 409 });
  }

  const { data: bidRows } = await admin.from('bids').select('*').eq('tender_id', tenderId);
  const bids = (bidRows ?? []) as Bid[];
  if (bids.length === 0) {
    return NextResponse.json({ error: 'No bids to award' }, { status: 409 });
  }

  const candidates: AwardCandidate[] = bids.map((b) => ({
    bidId: b.id,
    forwarderId: b.forwarder_id,
    amount: Number(b.amount),
    severity: b.anomaly_severity ?? 'normal',
  }));
  const rec = recommendAward(candidates);

  const chosenBidId = body.bidId ?? rec.recommendedBidId;
  if (!chosenBidId) {
    return NextResponse.json(
      { error: 'No qualified bid to award. Every bid is flagged; choose explicitly to override.' },
      { status: 409 },
    );
  }
  const chosen = bids.find((b) => b.id === chosenBidId);
  if (!chosen) return NextResponse.json({ error: 'Bid not found' }, { status: 404 });

  const isOverride = rec.recommendedBidId !== null && chosenBidId !== rec.recommendedBidId;
  const highest = Math.max(...bids.map((b) => Number(b.amount)));

  // Write the award.
  const { data: award, error: awErr } = await admin
    .from('awards')
    .insert({
      org_id: profile.org_id,
      tender_id: tenderId,
      bid_id: chosen.id,
      forwarder_id: chosen.forwarder_id,
      awarded_amount: chosen.amount,
      savings_vs_highest: highest - Number(chosen.amount),
      cheapest_bid_skipped: rec.cheapestBidSkipped && chosenBidId === rec.recommendedBidId,
      skip_reason: chosenBidId === rec.recommendedBidId ? rec.skipReason : null,
      awarded_by: profile.id,
      connection_sent_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (awErr) return NextResponse.json({ error: awErr.message }, { status: 500 });

  // Update statuses.
  await admin.from('tenders').update({ status: 'awarded' }).eq('id', tenderId);
  await admin.from('purchase_orders').update({ status: 'awarded' }).eq('id', tender.po_id);
  await admin.from('bids').update({ status: 'won' }).eq('id', chosen.id);
  await admin
    .from('bids')
    .update({ status: 'lost' })
    .eq('tender_id', tenderId)
    .neq('id', chosen.id);

  // Audit — both the award and, if applicable, the override.
  await writeAudit({
    orgId: profile.org_id,
    actorProfileId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: 'award.made',
    entityType: 'award',
    entityId: award.id,
    poId: tender.po_id,
    metadata: { bid_id: chosen.id, forwarder_id: chosen.forwarder_id, amount: chosen.amount },
  });
  if (isOverride) {
    await writeAudit({
      orgId: profile.org_id,
      actorProfileId: profile.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      action: 'award.overridden',
      entityType: 'award',
      entityId: award.id,
      poId: tender.po_id,
      metadata: {
        recommended_bid_id: rec.recommendedBidId,
        chosen_bid_id: chosen.id,
        chosen_severity: chosen.anomaly_severity,
      },
    });
  }

  // Notify the winning forwarder (mocked email).
  await notify({
    orgId: profile.org_id,
    title: 'You have been awarded a freight tender',
    body: `Your bid was selected for PO ${tender.po_id}. A connection has been sent.`,
    poId: tender.po_id,
    channel: 'email',
  });

  return NextResponse.json({ ok: true, award, override: isOverride });
}
