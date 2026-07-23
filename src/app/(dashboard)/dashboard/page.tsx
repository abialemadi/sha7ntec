import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Panel, Badge, Money, Kpi } from '@/components/ui';
import { HBar, RankMedal } from '@/components/charts';
import { poStatusLabel, formatDate } from '@/lib/format';
import type { Award, Forwarder, PurchaseOrder, Tender } from '@/lib/types';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'neutral' | 'blue' | 'green' | 'amber' | 'violet'> = {
  paid: 'green',
  awarded: 'violet',
  in_transit: 'blue',
  tender_open: 'amber',
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: pos }, { data: tenders }, { data: awards }, { data: forwarders }] = await Promise.all([
    supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }),
    supabase.from('tenders').select('*'),
    supabase.from('awards').select('*'),
    supabase.from('forwarders').select('*'),
  ]);

  const purchaseOrders = (pos ?? []) as PurchaseOrder[];
  const allTenders = (tenders ?? []) as Tender[];
  const allAwards = (awards ?? []) as Award[];
  const allForwarders = (forwarders ?? []) as Forwarder[];

  const activeTenders = allTenders.filter((t) => t.status === 'open').length;
  const totalSavings = allAwards.reduce((s, a) => s + Number(a.savings_vs_highest ?? 0), 0);
  const totalAwarded = allAwards.reduce((s, a) => s + Number(a.awarded_amount ?? 0), 0);
  const avgSavingsPct =
    totalAwarded + totalSavings > 0 ? (totalSavings / (totalAwarded + totalSavings)) * 100 : 0;
  const inTransit = purchaseOrders.filter((p) => p.status === 'in_transit').length;

  // Per-forwarder average savings % (from awards).
  const savingsByForwarder = new Map<string, { savings: number; awarded: number }>();
  for (const a of allAwards) {
    const cur = savingsByForwarder.get(a.forwarder_id) ?? { savings: 0, awarded: 0 };
    cur.savings += Number(a.savings_vs_highest ?? 0);
    cur.awarded += Number(a.awarded_amount ?? 0);
    savingsByForwarder.set(a.forwarder_id, cur);
  }
  const leaderboard = allForwarders
    .filter((f) => f.total_wins > 0)
    .map((f) => {
      const s = savingsByForwarder.get(f.id);
      const avgSave = s && s.awarded + s.savings > 0 ? (s.savings / (s.awarded + s.savings)) * 100 : 0;
      return { ...f, avgSave };
    })
    .sort((a, b) => b.total_wins - a.total_wins || b.avgSave - a.avgSave)
    .slice(0, 6);

  // Savings by shipment (award → tender → PO).
  const tenderById = new Map(allTenders.map((t) => [t.id, t]));
  const poById = new Map(purchaseOrders.map((p) => [p.id, p]));
  const savingsRows = allAwards
    .map((a) => {
      const t = tenderById.get(a.tender_id);
      const po = t ? poById.get(t.po_id) : undefined;
      return { poNumber: po?.po_number ?? '—', savings: Number(a.savings_vs_highest ?? 0) };
    })
    .filter((r) => r.savings > 0)
    .sort((a, b) => b.savings - a.savings)
    .slice(0, 6);
  const maxSaving = Math.max(1, ...savingsRows.map((r) => r.savings));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-navy">Analytics Dashboard</h1>
        <p className="text-sm text-dim">Financial control across the shipment pipeline.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Freight savings" accent="green" icon="💰" value={<Money amount={totalSavings} />} sub="Awarded vs highest bid" />
        <Kpi label="PO value managed" accent="navy" icon="📦" value={<Money amount={purchaseOrders.reduce((s, p) => s + Number(p.total_value), 0)} />} sub={`${purchaseOrders.length} shipments`} />
        <Kpi label="Avg. savings / tender" accent="blue" icon="📉" value={`${avgSavingsPct.toFixed(1)}%`} sub="vs. highest bid" />
        <Kpi label="Open tenders" accent="violet" icon="🔒" value={activeTenders} sub={`${inTransit} in transit`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Panel title="🏆 Freight forwarder leaderboard" subtitle="Ranked by tenders won">
            {leaderboard.length === 0 ? (
              <p className="text-sm text-dim">No awards yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                      <th className="pb-2 pr-3 font-medium">#</th>
                      <th className="pb-2 pr-3 font-medium">Forwarder</th>
                      <th className="pb-2 pr-3 text-right font-medium">Won</th>
                      <th className="pb-2 pr-3 text-right font-medium">Avg save</th>
                      <th className="pb-2 text-right font-medium">On-time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((f, i) => (
                      <tr key={f.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3"><RankMedal i={i} /></td>
                        <td className="py-2 pr-3 font-medium text-navy">{f.name}</td>
                        <td className="mono py-2 pr-3 text-right">{f.total_wins}</td>
                        <td className="mono py-2 pr-3 text-right font-semibold text-green">{f.avgSave.toFixed(1)}%</td>
                        <td className="mono py-2 text-right text-blue">{Number(f.on_time_pct)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
        <div className="lg:col-span-2">
          <Panel title="📊 Savings by shipment">
            {savingsRows.length === 0 ? (
              <p className="text-sm text-dim">No savings recorded yet.</p>
            ) : (
              savingsRows.map((r) => (
                <HBar
                  key={r.poNumber}
                  label={<span className="mono text-xs">{r.poNumber}</span>}
                  value={r.savings}
                  max={maxSaving}
                  right={<span className="text-green">{`USD ${r.savings.toLocaleString()}`}</span>}
                />
              ))
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Recent shipments" subtitle={`${purchaseOrders.length} total`}>
        {purchaseOrders.length === 0 ? (
          <p className="text-sm text-dim">No shipments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                  <th className="pb-2 pr-4 font-medium">PO</th>
                  <th className="pb-2 pr-4 font-medium">Cargo</th>
                  <th className="pb-2 pr-4 font-medium">Value</th>
                  <th className="pb-2 pr-4 font-medium">Promised</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.slice(0, 10).map((po) => (
                  <tr key={po.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4">
                      <Link href={`/shipments/${po.id}`} className="mono font-medium text-blue hover:underline">
                        {po.po_number}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-dim">{po.cargo_description ?? '—'}</td>
                    <td className="py-2 pr-4">
                      <Money amount={Number(po.total_value)} currency={po.currency} />
                    </td>
                    <td className="py-2 pr-4 text-dim">{formatDate(po.promised_date)}</td>
                    <td className="py-2">
                      <Badge tone={STATUS_TONE[po.status] ?? 'neutral'}>{poStatusLabel(po.status)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
