import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Panel, Badge, Money, AnomalyBadge } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { Bid, Forwarder, PurchaseOrder, Tender } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function TenderDetailPage({
  params,
}: {
  params: Promise<{ tenderId: string }>;
}) {
  const { tenderId } = await params;
  const supabase = await createClient();

  const { data: tenderRow } = await supabase.from('tenders').select('*').eq('id', tenderId).maybeSingle();
  const tender = tenderRow as Tender | null;
  if (!tender) notFound();

  const [{ data: po }, { data: bidRows }, { data: forwarders }] = await Promise.all([
    supabase.from('purchase_orders').select('*').eq('id', tender.po_id).maybeSingle(),
    supabase.from('bids').select('*').eq('tender_id', tenderId),
    supabase.from('forwarders').select('*'),
  ]);

  const purchaseOrder = po as PurchaseOrder | null;
  const bids = (bidRows ?? []) as Bid[];
  const names: Record<string, string> = Object.fromEntries(
    ((forwarders ?? []) as Forwarder[]).map((f) => [f.id, f.name]),
  );
  const sealed = tender.status === 'open';

  return (
    <div className="space-y-6">
      <div>
        {purchaseOrder && (
          <Link href={`/shipments/${purchaseOrder.id}`} className="text-sm text-blue hover:underline">
            ← {purchaseOrder.po_number}
          </Link>
        )}
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink">Tender</h1>
          <Badge tone="violet">{tender.status}</Badge>
        </div>
      </div>

      <Panel title="Tender" subtitle={`Mode: ${tender.mode} · opened ${formatDateTime(tender.opened_at)}`}>
        {sealed ? (
          <p className="text-sm text-dim">
            This tender is sealed. Bids — and even the number of bids — are hidden until it is closed.
          </p>
        ) : bids.length === 0 ? (
          <p className="text-sm text-dim">No bids were submitted.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                <th className="pb-2 pr-4 font-medium">Forwarder</th>
                <th className="pb-2 pr-4 font-medium">Amount</th>
                <th className="pb-2 pr-4 font-medium">Transit</th>
                <th className="pb-2 font-medium">Screening</th>
              </tr>
            </thead>
            <tbody>
              {[...bids]
                .sort((a, b) => Number(a.amount) - Number(b.amount))
                .map((b) => (
                  <tr key={b.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 font-medium text-ink">{names[b.forwarder_id] ?? '—'}</td>
                    <td className="py-2 pr-4">
                      <Money amount={Number(b.amount)} currency={b.currency} />
                    </td>
                    <td className="py-2 pr-4 text-dim">{b.transit_days ?? '—'} d</td>
                    <td className="py-2">
                      <AnomalyBadge severity={b.anomaly_severity} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </Panel>

      {tender.ai_summary && (
        <Panel title="Market intelligence" actions={<Badge tone="blue">AI-assisted (rules-based)</Badge>}>
          <p className="text-sm text-ink">{tender.ai_summary}</p>
        </Panel>
      )}
    </div>
  );
}
