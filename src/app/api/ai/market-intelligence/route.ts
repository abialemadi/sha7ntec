import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateTenderSummary } from '@/lib/ai';
import { detectAnomalies, type AnomalyBidInput } from '@/lib/anomaly';
import { fetchBdi } from '@/lib/market';
import type { Bid, Profile } from '@/lib/types';

// POST /api/ai/market-intelligence  Body: { tenderId }
// Loads bids + market snapshot, asks Claude for 2-3 sentences, stores on
// tenders.ai_summary. On failure returns a deterministic fallback (spec §9).
export async function POST(req: Request) {
  const { tenderId } = (await req.json().catch(() => ({}))) as { tenderId?: string };
  if (!tenderId) return NextResponse.json({ error: 'tenderId required' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const profile = profileRow as Profile | null;
  if (!profile || !['procurement', 'finance', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: tender } = await admin.from('tenders').select('*').eq('id', tenderId).single();
  if (!tender || tender.org_id !== profile.org_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: bidRows } = await admin.from('bids').select('*').eq('tender_id', tenderId);
  const bids = (bidRows ?? []) as Bid[];

  const inputs: AnomalyBidInput[] = bids.map((b) => ({
    bidId: b.id,
    forwarderId: b.forwarder_id,
    amount: Number(b.amount),
    forwarderAvgBid: 0,
    forwarderTotalBids: 99,
  }));
  const anomalies = detectAnomalies(inputs);

  let snapshot = tender.market_snapshot ?? null;
  if (!snapshot) {
    try {
      snapshot = await fetchBdi();
    } catch {
      snapshot = null;
    }
  }

  let summary: string;
  let aiUsed = true;
  try {
    summary = await generateTenderSummary({
      bids: bids.map((b) => ({ amount: Number(b.amount), transitDays: b.transit_days })),
      anomalies,
      marketSnapshot: snapshot,
    });
  } catch {
    aiUsed = false;
    const flagged = anomalies.filter((a) => a.severity === 'flagged').length;
    summary = `${bids.length} sealed bid(s) received. ${flagged} flagged by rules-based screening. Baltic Dry Index context ${
      snapshot?.value ? `at ${snapshot.value}` : 'unavailable'
    }. (Deterministic fallback — AI summary unavailable.)`;
  }

  await admin.from('tenders').update({ ai_summary: summary }).eq('id', tenderId);
  return NextResponse.json({ summary, aiUsed });
}
