import { createClient } from '@/lib/supabase/server';
import { Panel, Money, Badge } from '@/components/ui';
import { CsvExport } from '@/components/CsvExport';
import type { Award, Delivery, Forwarder, LandedCost, PurchaseOrder, Vendor } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function InsightsPage() {
  const supabase = await createClient();
  const [{ data: fwd }, { data: awards }, { data: pos }, { data: vendors }, { data: deliveries }, { data: landed }] =
    await Promise.all([
      supabase.from('forwarders').select('*'),
      supabase.from('awards').select('*'),
      supabase.from('purchase_orders').select('*'),
      supabase.from('vendors').select('*'),
      supabase.from('deliveries').select('*'),
      supabase.from('landed_costs').select('*'),
    ]);

  const forwarders = (fwd ?? []) as Forwarder[];
  const allAwards = (awards ?? []) as Award[];
  const purchaseOrders = (pos ?? []) as PurchaseOrder[];
  const allVendors = (vendors ?? []) as Vendor[];
  const allDeliveries = (deliveries ?? []) as Delivery[];
  const landedCosts = (landed ?? []) as LandedCost[];

  const vendorById = new Map(allVendors.map((v) => [v.id, v]));
  const poById = new Map(purchaseOrders.map((p) => [p.id, p]));

  // 1. Best carrier: most wins, tie-broken by on-time %.
  const bestCarrier = [...forwarders]
    .filter((f) => f.total_wins > 0)
    .sort((a, b) => b.total_wins - a.total_wins || b.on_time_pct - a.on_time_pct)[0];

  // 2. Total freight savings.
  const totalSavings = allAwards.reduce((s, a) => s + Number(a.savings_vs_highest ?? 0), 0);

  // 3. On-time rate across all deliveries with a promised date.
  const deliveredWithPromise = allDeliveries.filter((d) => {
    const po = poById.get(d.po_id);
    return d.delivered_at && po?.promised_date;
  });
  const onTime = deliveredWithPromise.filter((d) => {
    const po = poById.get(d.po_id)!;
    return new Date(d.delivered_at!) <= new Date(po.promised_date + 'T23:59:59');
  }).length;
  const onTimeRate =
    deliveredWithPromise.length > 0 ? Math.round((onTime / deliveredWithPromise.length) * 100) : 0;

  // 4. Cost by country: freight cost grouped by the vendor's country.
  const costByCountry = new Map<string, number>();
  for (const lc of landedCosts) {
    const po = poById.get(lc.po_id);
    const country = po ? vendorById.get(po.vendor_id)?.country ?? 'Unknown' : 'Unknown';
    costByCountry.set(country, (costByCountry.get(country) ?? 0) + Number(lc.freight_cost));
  }
  const costByCountryRows = [...costByCountry.entries()].sort((a, b) => b[1] - a[1]);

  // 5. Delay-causing suppliers: vendors whose POs were delivered late.
  const lateByVendor = new Map<string, number>();
  for (const d of deliveredWithPromise) {
    const po = poById.get(d.po_id)!;
    if (new Date(d.delivered_at!) > new Date(po.promised_date + 'T23:59:59')) {
      const name = vendorById.get(po.vendor_id)?.name ?? 'Unknown';
      lateByVendor.set(name, (lateByVendor.get(name) ?? 0) + 1);
    }
  }
  const delayRows = [...lateByVendor.entries()].sort((a, b) => b[1] - a[1]);

  const carrierCsv = forwarders.map((f) => [
    f.name,
    f.total_bids,
    f.total_wins,
    f.on_time_pct,
    f.avg_bid_amount,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Insights</h1>
          <p className="text-sm text-dim">Carrier performance, freight cost and delivery reliability.</p>
        </div>
        <CsvExport
          filename="carrier-performance.csv"
          headers={['Forwarder', 'Total bids', 'Total wins', 'On-time %', 'Avg bid']}
          rows={carrierCsv}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Panel title="Best carrier">
          {bestCarrier ? (
            <div>
              <div className="text-lg font-semibold text-ink">{bestCarrier.name}</div>
              <div className="mt-1 text-sm text-dim">
                {bestCarrier.total_wins} wins · {bestCarrier.on_time_pct}% on-time
              </div>
            </div>
          ) : (
            <p className="text-sm text-dim">No awards yet.</p>
          )}
        </Panel>
        <Panel title="Total freight savings">
          <div className="text-2xl font-semibold text-green">
            <Money amount={totalSavings} />
          </div>
          <div className="mt-1 text-xs text-dim">Awarded amount vs highest bid, all tenders.</div>
        </Panel>
        <Panel title="On-time delivery rate">
          <div className="text-2xl font-semibold text-ink">{onTimeRate}%</div>
          <div className="mt-1 text-xs text-dim">
            {onTime}/{deliveredWithPromise.length} deliveries on or before promised date.
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="Freight cost by origin country">
          {costByCountryRows.length === 0 ? (
            <p className="text-sm text-dim">No landed-cost data yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {costByCountryRows.map(([country, cost]) => (
                  <tr key={country} className="border-b border-border/60 last:border-0">
                    <td className="py-2 text-dim">{country}</td>
                    <td className="py-2 text-right">
                      <Money amount={cost} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Delay-causing suppliers">
          {delayRows.length === 0 ? (
            <p className="text-sm text-dim">No late deliveries recorded. 🎉</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {delayRows.map(([name, count]) => (
                  <tr key={name} className="border-b border-border/60 last:border-0">
                    <td className="py-2 text-dim">{name}</td>
                    <td className="py-2 text-right">
                      <Badge tone="amber">{count} late</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}
