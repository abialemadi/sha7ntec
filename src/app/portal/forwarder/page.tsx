import { createClient } from '@/lib/supabase/server';
import { Panel, Badge, Money } from '@/components/ui';
import { BidForm } from '@/components/portal/BidForm';
import { DeliveryConfirm } from '@/components/portal/DeliveryConfirm';
import { formatDate } from '@/lib/format';
import type { Award, Bid, Delivery, PurchaseOrder, Tender } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ForwarderPortalPage() {
  const supabase = await createClient();

  // RLS: forwarder sees only tenders they were invited to.
  const { data: tenderRows } = await supabase.from('tenders').select('*');
  const tenders = (tenderRows ?? []) as Tender[];

  const poIds = [...new Set(tenders.map((t) => t.po_id))];
  const { data: poRows } = await supabase
    .from('purchase_orders')
    .select('*')
    .in('id', poIds.length ? poIds : ['00000000-0000-0000-0000-000000000000']);
  const poById = new Map(((poRows ?? []) as PurchaseOrder[]).map((p) => [p.id, p]));

  // RLS: forwarder sees only their own bids.
  const { data: bidRows } = await supabase.from('bids').select('*');
  const bidByTender = new Map(((bidRows ?? []) as Bid[]).map((b) => [b.tender_id, b]));

  // Awards they won + deliveries.
  const { data: awardRows } = await supabase.from('awards').select('*');
  const awards = (awardRows ?? []) as Award[];
  const wonByTender = new Map(awards.map((a) => [a.tender_id, a]));
  const { data: deliveryRows } = await supabase.from('deliveries').select('*');
  const deliveries = (deliveryRows ?? []) as Delivery[];
  const deliveredPoIds = new Set(deliveries.filter((d) => d.delivered_at).map((d) => d.po_id));

  const openTenders = tenders.filter((t) => t.status === 'open');
  const wonTenders = tenders.filter((t) => wonByTender.has(t.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Freight tenders</h1>
        <p className="text-sm text-dim">Tenders you have been invited to bid on.</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">Open for bidding</h2>
        {openTenders.length === 0 && (
          <Panel title="No open tenders">
            <p className="text-sm text-dim">You have no tenders open for bidding right now.</p>
          </Panel>
        )}
        {openTenders.map((t) => {
          const po = poById.get(t.po_id);
          return (
            <Panel
              key={t.id}
              title={po ? <span className="mono">{po.po_number}</span> : 'Tender'}
              subtitle={po?.cargo_description ?? undefined}
              actions={<Badge tone="violet">{t.mode}</Badge>}
            >
              {po && (
                <div className="mb-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <div>
                    <div className="text-xs text-faint">Route</div>
                    <div className="text-ink">
                      {po.origin_location ?? '—'} → {po.destination_location ?? '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-faint">Weight</div>
                    <div className="text-ink">{po.gross_weight_kg ? `${po.gross_weight_kg} kg` : '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-faint">Packages</div>
                    <div className="text-ink">{po.packages_count ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-faint">Promised</div>
                    <div className="text-ink">{formatDate(po.promised_date)}</div>
                  </div>
                </div>
              )}
              <BidForm tenderId={t.id} existing={bidByTender.get(t.id) ?? null} />
            </Panel>
          );
        })}
      </section>

      {wonTenders.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-faint">Awarded to you</h2>
          {wonTenders.map((t) => {
            const po = poById.get(t.po_id);
            const award = wonByTender.get(t.id)!;
            if (!po) return null;
            return (
              <Panel
                key={t.id}
                title={<span className="mono">{po.po_number}</span>}
                subtitle={po.cargo_description ?? undefined}
                actions={<Badge tone="green">won</Badge>}
              >
                <div className="mb-4 text-sm text-dim">
                  Awarded amount: <Money amount={Number(award.awarded_amount)} />
                </div>
                <DeliveryConfirm poId={po.id} delivered={deliveredPoIds.has(po.id)} />
              </Panel>
            );
          })}
        </section>
      )}
    </div>
  );
}
