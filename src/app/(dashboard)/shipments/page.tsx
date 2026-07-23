import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Panel, Badge, Money } from '@/components/ui';
import { poStatusLabel, formatDate } from '@/lib/format';
import type { PurchaseOrder, Vendor } from '@/lib/types';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'neutral' | 'blue' | 'green' | 'amber' | 'violet'> = {
  paid: 'green',
  awarded: 'violet',
  in_transit: 'blue',
  tender_open: 'amber',
};

export default async function ShipmentsPage() {
  const supabase = await createClient();
  const [{ data: pos }, { data: vendors }] = await Promise.all([
    supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }),
    supabase.from('vendors').select('*'),
  ]);
  const purchaseOrders = (pos ?? []) as PurchaseOrder[];
  const vendorById = new Map(((vendors ?? []) as Vendor[]).map((v) => [v.id, v]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Shipments</h1>
        <p className="text-sm text-dim">The purchase-order pipeline, seven stages each.</p>
      </div>

      <Panel title="All shipments" subtitle={`${purchaseOrders.length} purchase orders`}>
        {purchaseOrders.length === 0 ? (
          <p className="text-sm text-dim">No shipments.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                  <th className="pb-2 pr-4 font-medium">PO</th>
                  <th className="pb-2 pr-4 font-medium">Vendor</th>
                  <th className="pb-2 pr-4 font-medium">Route</th>
                  <th className="pb-2 pr-4 font-medium">Value</th>
                  <th className="pb-2 pr-4 font-medium">Promised</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.map((po) => (
                  <tr key={po.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4">
                      <Link href={`/shipments/${po.id}`} className="mono font-medium text-blue hover:underline">
                        {po.po_number}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-dim">{vendorById.get(po.vendor_id)?.name ?? '—'}</td>
                    <td className="py-2 pr-4 text-dim">
                      {po.origin_location ?? '—'} → {po.destination_location ?? '—'}
                    </td>
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
