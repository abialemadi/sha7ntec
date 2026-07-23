import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Panel, Badge, Money, Kpi } from '@/components/ui';
import { poStatusLabel, formatDate } from '@/lib/format';
import type { Award, PurchaseOrder, Tender } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: pos }, { data: tenders }, { data: awards }] = await Promise.all([
    supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }),
    supabase.from('tenders').select('*'),
    supabase.from('awards').select('*'),
  ]);

  const purchaseOrders = (pos ?? []) as PurchaseOrder[];
  const allTenders = (tenders ?? []) as Tender[];
  const allAwards = (awards ?? []) as Award[];

  const activeTenders = allTenders.filter((t) => t.status === 'open').length;
  const totalSavings = allAwards.reduce((s, a) => s + Number(a.savings_vs_highest ?? 0), 0);
  const pendingPayment = purchaseOrders.filter(
    (p) => p.status === 'payment_pending' || p.status === 'goods_received',
  ).length;
  const inTransit = purchaseOrders.filter((p) => p.status === 'in_transit').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
        <p className="text-sm text-dim">Financial control across the shipment pipeline.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Freight savings" accent="green" icon="💰" value={<Money amount={totalSavings} />} sub="Awarded vs highest bid" />
        <Kpi label="Shipments" accent="navy" icon="📦" value={purchaseOrders.length} sub="Total purchase orders" />
        <Kpi label="Open tenders" accent="blue" icon="🔒" value={activeTenders} sub="Awaiting bids / close" />
        <Kpi label="In transit" accent="violet" icon="🚚" value={inTransit} sub="Awarded & shipping" />
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
                      <Badge>{poStatusLabel(po.status)}</Badge>
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
