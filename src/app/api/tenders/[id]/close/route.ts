import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { detectAnomalies, type AnomalyBidInput } from '@/lib/anomaly';
import { writeAudit } from '@/lib/audit';
import { fetchBdi } from '@/lib/market';
import { generateTenderSummary } from '@/lib/ai';
import type { Bid, Forwarder, Profile } from '@/lib/types';

// ============================================================
// POST /api/tenders/[id]/close  — THE SEALED REVEAL
//
// This is the ONLY way a tender can be closed. It never runs client-side.
// Order (spec §8.1):
//   1. Verify caller is procurement/admin in the same org
//   2. Set tender status = closed, closed_at = now()
//   3. Fetch all bids (service role — bypasses the sealed RLS)
//   4. Run anomaly detection, write severity + flags per bid
//   5. Fetch BDI, store market_snapshot
//   6. Call Claude for ai_summary (non-blocking on failure)
//   7. Write audit row tender.closed
//   8. Return revealed bids
// ============================================================
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  // ---- 1. Authorize the caller against RLS-scoped session ----
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  const profile = profileRow as Profile | null;
  if (!profile || !['procurement', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Confirm the tender belongs to the caller's org and is open.
  const admin = createAdminClient();
  const { data: tender, error: tErr } = await admin
    .from('tenders')
    .select('*')
    .eq('id', tenderId)
    .single();
  if (tErr || !tender) return NextResponse.json({ error: 'Tender not found' }, { status: 404 });
  if (tender.org_id !== profile.org_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (tender.status !== 'open') {
    return NextResponse.json({ error: 'Tender is not open' }, { status: 409 });
  }

  const now = new Date().toISOString();

  // ---- 2. Close the tender ----
  await admin.from('tenders').update({ status: 'closed', closed_at: now }).eq('id', tenderId);

  // ---- 3. Fetch all bids (service role bypasses the sealed policies) ----
  const { data: bidRows } = await admin
    .from('bids')
    .select('*')
    .eq('tender_id', tenderId);
  const bids = (bidRows ?? []) as Bid[];

  // Forwarder histories for the "above/below own average" and "unproven" rules.
  const forwarderIds = [...new Set(bids.map((b) => b.forwarder_id))];
  const { data: fwdRows } = await admin
    .from('forwarders')
    .select('id, total_bids, avg_bid_amount')
    .in('id', forwarderIds.length ? forwarderIds : ['00000000-0000-0000-0000-000000000000']);
  const fwdMap = new Map(
    (fwdRows as Pick<Forwarder, 'id' | 'total_bids' | 'avg_bid_amount'>[] | null)?.map((f) => [
      f.id,
      f,
    ]) ?? [],
  );

  // ---- 4. Anomaly detection + write back ----
  const inputs: AnomalyBidInput[] = bids.map((b) => {
    const f = fwdMap.get(b.forwarder_id);
    return {
      bidId: b.id,
      forwarderId: b.forwarder_id,
      amount: Number(b.amount),
      // Exclude this bid's own contribution from "history" where possible;
      // the stored avg already includes it, which is acceptable for v1.
      forwarderAvgBid: Number(f?.avg_bid_amount ?? 0),
      forwarderTotalBids: Number(f?.total_bids ?? 0),
    };
  });
  const results = detectAnomalies(inputs);
  for (const r of results) {
    await admin
      .from('bids')
      .update({ anomaly_severity: r.severity, anomaly_flags: r.flags })
      .eq('id', r.bidId);
  }

  // ---- 5. Market snapshot (BDI) ----
  let marketSnapshot = null;
  try {
    marketSnapshot = await fetchBdi();
    await admin.from('tenders').update({ market_snapshot: marketSnapshot }).eq('id', tenderId);
  } catch (e) {
    console.error('[close] BDI fetch failed, continuing', e);
  }

  // ---- 6. AI summary (never blocks the close) ----
  let aiSummary: string;
  try {
    aiSummary = await generateTenderSummary({
      bids: bids.map((b) => ({ amount: Number(b.amount), transitDays: b.transit_days })),
      anomalies: results,
      marketSnapshot,
    });
  } catch {
    aiSummary = deterministicSummary(bids.length, results);
  }
  await admin.from('tenders').update({ ai_summary: aiSummary }).eq('id', tenderId);

  // ---- 7. Audit ----
  await writeAudit({
    orgId: profile.org_id,
    actorProfileId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: 'tender.closed',
    entityType: 'tender',
    entityId: tenderId,
    poId: tender.po_id,
    metadata: { bid_count: bids.length, flagged: results.filter((r) => r.severity === 'flagged').length },
  });

  // ---- 8. Return the revealed bids ----
  const revealed = bids.map((b) => {
    const r = results.find((x) => x.bidId === b.id);
    return { ...b, anomaly_severity: r?.severity ?? 'normal', anomaly_flags: r?.flags ?? [] };
  });

  return NextResponse.json({
    ok: true,
    tenderId,
    closedAt: now,
    bids: revealed,
    marketSnapshot,
    aiSummary,
  });
}

function deterministicSummary(
  bidCount: number,
  results: { severity: string }[],
): string {
  const flagged = results.filter((r) => r.severity === 'flagged').length;
  const review = results.filter((r) => r.severity === 'review').length;
  return `Tender closed with ${bidCount} sealed bid(s). Rules-based screening marked ${flagged} as flagged and ${review} for review. Recommend awarding the lowest qualified (non-flagged) bid. (AI-assisted summary unavailable — deterministic fallback shown.)`;
}
