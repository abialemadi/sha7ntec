import { createClient } from '@/lib/supabase/server';
import { Panel, Money, Badge } from '@/components/ui';
import { HBar, TrendBars, RankMedal } from '@/components/charts';
import { CsvExport } from '@/components/CsvExport';
import type { Award, Delivery, Forwarder, LandedCost, PurchaseOrder, Tender, Vendor } from '@/lib/types';

export const dynamic = 'force-dynamic';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthKey(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(key: string): string {
  const [, m] = key.split('-');
  return MONTHS[Number(m) - 1] ?? key;
}

export default async function InsightsPage() {
  const supabase = await createClient();
  const [
    { data: fwd },
    { data: awards },
    { data: pos },
    { data: vendors },
    { data: deliveries },
    { data: landed },
    { data: tenders },
  ] = await Promise.all([
    supabase.from('forwarders').select('*'),
    supabase.from('awards').select('*'),
    supabase.from('purchase_orders').select('*'),
    supabase.from('vendors').select('*'),
    supabase.from('deliveries').select('*'),
    supabase.from('landed_costs').select('*'),
    supabase.from('tenders').select('*'),
  ]);

  const forwarders = (fwd ?? []) as Forwarder[];
  const allAwards = (awards ?? []) as Award[];
  const purchaseOrders = (pos ?? []) as PurchaseOrder[];
  const allVendors = (vendors ?? []) as Vendor[];
  const allDeliveries = (deliveries ?? []) as Delivery[];
  const landedCosts = (landed ?? []) as LandedCost[];
  const allTenders = (tenders ?? []) as Tender[];

  const vendorById = new Map(allVendors.map((v) => [v.id, v]));
  const poById = new Map(purchaseOrders.map((p) => [p.id, p]));
  const tenderById = new Map(allTenders.map((t) => [t.id, t]));

  // ---- Total savings + monthly trend (bucket by tender close month) ----
  const totalSavings = allAwards.reduce((s, a) => s + Number(a.savings_vs_highest ?? 0), 0);
  const totalAwarded = allAwards.reduce((s, a) => s + Number(a.awarded_amount ?? 0), 0);
  const savingsByMonth = new Map<string, number>();
  for (const a of allAwards) {
    const t = tenderById.get(a.tender_id);
    const key = monthKey(t?.closed_at ?? t?.opened_at ?? null) ?? monthKey(a.awarded_at);
    if (!key) continue;
    savingsByMonth.set(key, (savingsByMonth.get(key) ?? 0) + Number(a.savings_vs_highest ?? 0));
  }
  const savingsTrend = [...savingsByMonth.entries()]
    .sort()
    .map(([k, v]) => ({ label: monthLabel(k), value: v }));

  // ---- On-time rate + monthly trend ----
  const deliveredWithPromise = allDeliveries.filter((d) => {
    const po = poById.get(d.po_id);
    return d.delivered_at && po?.promised_date;
  });
  const isOnTime = (d: Delivery) => {
    const po = poById.get(d.po_id)!;
    return new Date(d.delivered_at!) <= new Date(po.promised_date + 'T23:59:59');
  };
  const onTime = deliveredWithPromise.filter(isOnTime).length;
  const onTimeRate =
    deliveredWithPromise.length > 0 ? Math.round((onTime / deliveredWithPromise.length) * 100) : 0;
  const onTimeByMonth = new Map<string, { on: number; total: number }>();
  for (const d of deliveredWithPromise) {
    const key = monthKey(d.delivered_at);
    if (!key) continue;
    const cur = onTimeByMonth.get(key) ?? { on: 0, total: 0 };
    cur.total += 1;
    if (isOnTime(d)) cur.on += 1;
    onTimeByMonth.set(key, cur);
  }
  const onTimeTrend = [...onTimeByMonth.entries()]
    .sort()
    .map(([k, v]) => ({ label: monthLabel(k), value: Math.round((v.on / v.total) * 100), display: `${Math.round((v.on / v.total) * 100)}%` }));

  // ---- Best carrier (spend from awards) ----
  const spendByForwarder = new Map<string, number>();
  for (const a of allAwards) {
    spendByForwarder.set(a.forwarder_id, (spendByForwarder.get(a.forwarder_id) ?? 0) + Number(a.awarded_amount));
  }
  const bestCarriers = forwarders
    .map((f) => ({
      ...f,
      spend: spendByForwarder.get(f.id) ?? 0,
      score: Math.round(Number(f.on_time_pct) * 0.6 + Math.min(40, f.total_wins * 4)),
    }))
    .sort((a, b) => b.total_wins - a.total_wins || Number(b.on_time_pct) - Number(a.on_time_pct))
    .slice(0, 6);

  // ---- Freight cost by origin country ----
  const costByCountry = new Map<string, { cost: number; shipments: number }>();
  for (const lc of landedCosts) {
    const po = poById.get(lc.po_id);
    const country = po ? vendorById.get(po.vendor_id)?.country ?? 'Unknown' : 'Unknown';
    const cur = costByCountry.get(country) ?? { cost: 0, shipments: 0 };
    cur.cost += Number(lc.freight_cost);
    cur.shipments += 1;
    costByCountry.set(country, cur);
  }
  const costRows = [...costByCountry.entries()].sort((a, b) => b[1].cost - a[1].cost);
  const maxCost = Math.max(1, ...costRows.map(([, v]) => v.cost));

  // ---- Delay-causing suppliers ----
  const lateByVendor = new Map<string, { late: number; total: number }>();
  for (const d of deliveredWithPromise) {
    const po = poById.get(d.po_id)!;
    const name = vendorById.get(po.vendor_id)?.name ?? 'Unknown';
    const cur = lateByVendor.get(name) ?? { late: 0, total: 0 };
    cur.total += 1;
    if (!isOnTime(d)) cur.late += 1;
    lateByVendor.set(name, cur);
  }
  const delayRows = [...lateByVendor.entries()]
    .filter(([, v]) => v.late > 0)
    .map(([name, v]) => ({ name, rate: Math.round((v.late / v.total) * 100), late: v.late }))
    .sort((a, b) => b.rate - a.rate);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-navy">Insights &amp; Intelligence</h1>
          <p className="text-sm text-dim">
            Advanced analytics built from your shipment history — the data moat competitors can&apos;t replicate.
          </p>
        </div>
        <CsvExport
          filename="carrier-performance.csv"
          headers={['Forwarder', 'Total bids', 'Total wins', 'On-time %', 'Spend']}
          rows={bestCarriers.map((c) => [c.name, c.total_bids, c.total_wins, Number(c.on_time_pct), c.spend])}
        />
      </div>

      {/* Hero: savings + on-time with trend bars */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="💰 Total savings achieved" className="border-t-[3px] border-t-green">
          <div className="mono mb-3 text-3xl font-bold text-green">
            <Money amount={totalSavings} />
          </div>
          {savingsTrend.length > 0 ? (
            <TrendBars data={savingsTrend} color="from-green to-blue" />
          ) : (
            <p className="text-sm text-dim">No awards yet.</p>
          )}
        </Panel>
        <Panel title="✅ On-time delivery rate" className="border-t-[3px] border-t-blue">
          <div className="mono mb-3 text-3xl font-bold text-blue">{onTimeRate}%</div>
          {onTimeTrend.length > 0 ? (
            <TrendBars data={onTimeTrend} color="from-blue to-green" showValue />
          ) : (
            <p className="text-sm text-dim">No deliveries recorded.</p>
          )}
          <p className="mt-2 text-xs text-dim">
            {onTime}/{deliveredWithPromise.length} on or before the promised date.
          </p>
        </Panel>
      </div>

      {/* Best carrier — last 12 months */}
      <Panel title="🏆 Best carrier — last 12 months">
        {bestCarriers.length === 0 ? (
          <p className="text-sm text-dim">No carrier data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                  <th className="pb-2 pr-3 font-medium">#</th>
                  <th className="pb-2 pr-3 font-medium">Carrier</th>
                  <th className="pb-2 pr-3 text-right font-medium">Wins</th>
                  <th className="pb-2 pr-3 text-right font-medium">On-time</th>
                  <th className="pb-2 pr-3 text-right font-medium">Spend</th>
                  <th className="pb-2 text-right font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {bestCarriers.map((c, i) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3"><RankMedal i={i} /></td>
                    <td className="py-2 pr-3 font-medium text-navy">{c.name}</td>
                    <td className="mono py-2 pr-3 text-right">{c.total_wins}</td>
                    <td className="mono py-2 pr-3 text-right font-semibold text-green">{Number(c.on_time_pct)}%</td>
                    <td className="mono py-2 pr-3 text-right text-dim">
                      <Money amount={c.spend} />
                    </td>
                    <td className="py-2 text-right">
                      <Badge tone={c.score >= 90 ? 'green' : 'blue'} dot={false}>{c.score}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="🌍 Freight cost by origin country">
          {costRows.length === 0 ? (
            <p className="text-sm text-dim">No landed-cost data yet.</p>
          ) : (
            costRows.map(([country, v]) => (
              <HBar
                key={country}
                label={<>{country} <span className="text-faint">· {v.shipments} shp</span></>}
                value={v.cost}
                max={maxCost}
                gradient="from-blue to-violet"
                right={<span>{`USD ${v.cost.toLocaleString()}`}</span>}
              />
            ))
          )}
        </Panel>
        <Panel title="⏱️ Delay-causing suppliers">
          {delayRows.length === 0 ? (
            <p className="text-sm text-dim">No late deliveries recorded. 🎉</p>
          ) : (
            delayRows.map((r) => (
              <HBar
                key={r.name}
                label={r.name}
                value={r.rate}
                max={100}
                gradient="from-amber to-red"
                right={<span className="text-red">{r.rate}% late</span>}
                sub={`${r.late} late`}
              />
            ))
          )}
        </Panel>
      </div>

      <div className="rounded-xl border border-blue/20 bg-blue/5 p-4 text-sm text-dim">
        <span className="font-semibold text-blue">Strategic note: </span>
        These analytics are built automatically from the shipments flowing through Sha7ntec. The more
        the platform is used, the more valuable the data becomes — the competitive moat rivals can&apos;t copy.
      </div>
    </div>
  );
}
