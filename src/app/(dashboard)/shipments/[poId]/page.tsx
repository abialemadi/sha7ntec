import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth';
import { Panel, Badge, Money, SimulatedTag } from '@/components/ui';
import { StageStepper, stageForStatus } from '@/components/workflow/StageStepper';
import { ProcessTrail } from '@/components/workflow/ProcessTrail';
import { DocumentList } from '@/components/workflow/DocumentList';
import { DocumentUpload } from '@/components/workflow/DocumentUpload';
import { TenderPanel } from '@/components/workflow/TenderPanel';
import { GoodsReceiptForm } from '@/components/workflow/GoodsReceiptForm';
import { PaymentPanel } from '@/components/workflow/PaymentPanel';
import { poStatusLabel, formatDate } from '@/lib/format';
import type {
  Award,
  Bid,
  Delivery,
  DocumentRow,
  Forwarder,
  GoodsReceipt,
  LandedCost,
  Payment,
  PoLineItem,
  PurchaseOrder,
  Tender,
  TenderInvitation,
  Vendor,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ poId: string }>;
}) {
  const { poId } = await params;
  const profile = await getSessionProfile();
  if (!profile) notFound();
  const supabase = await createClient();

  const { data: poRow } = await supabase.from('purchase_orders').select('*').eq('id', poId).single();
  const po = poRow as PurchaseOrder | null;
  if (!po) notFound();

  const [
    { data: vendor },
    { data: lines },
    { data: docs },
    { data: tenderRow },
    { data: forwarders },
    { data: award },
    { data: gr },
    { data: delivery },
    { data: payment },
    { data: landed },
  ] = await Promise.all([
    supabase.from('vendors').select('*').eq('id', po.vendor_id).maybeSingle(),
    supabase.from('po_line_items').select('*').eq('po_id', poId).order('line_no'),
    supabase.from('documents').select('*').eq('po_id', poId).order('uploaded_at', { ascending: false }),
    supabase.from('tenders').select('*').eq('po_id', poId).maybeSingle(),
    supabase.from('forwarders').select('*').order('name'),
    supabase.from('awards').select('*').eq('org_id', po.org_id),
    supabase.from('goods_receipts').select('*').eq('po_id', poId).maybeSingle(),
    supabase.from('deliveries').select('*').eq('po_id', poId).maybeSingle(),
    supabase.from('payments').select('*').eq('po_id', poId).maybeSingle(),
    supabase.from('landed_costs').select('*').eq('po_id', poId).maybeSingle(),
  ]);

  const tender = (tenderRow as Tender | null) ?? null;

  // Bids + invitations only if there is a tender. RLS gates bids: procurement
  // sees them only after close; anyone else sees only their own.
  let bids: Bid[] = [];
  let invitations: TenderInvitation[] = [];
  if (tender) {
    const [{ data: bidRows }, { data: invRows }] = await Promise.all([
      supabase.from('bids').select('*').eq('tender_id', tender.id),
      supabase.from('tender_invitations').select('*').eq('tender_id', tender.id),
    ]);
    bids = (bidRows ?? []) as Bid[];
    invitations = (invRows ?? []) as TenderInvitation[];
  }

  const allForwarders = (forwarders ?? []) as Forwarder[];
  const forwarderNames: Record<string, string> = Object.fromEntries(
    allForwarders.map((f) => [f.id, f.name]),
  );
  const thisAward = ((award ?? []) as Award[]).find((a) => a.tender_id === tender?.id) ?? null;
  const v = vendor as Vendor | null;
  const lineItems = (lines ?? []) as PoLineItem[];
  const documents = (docs ?? []) as DocumentRow[];
  const goodsReceipt = (gr as GoodsReceipt | null) ?? null;
  const deliveryRow = (delivery as Delivery | null) ?? null;
  const paymentRow = (payment as Payment | null) ?? null;
  const landedCost = (landed as LandedCost | null) ?? null;

  const isProcurement = ['procurement', 'admin'].includes(profile.role);
  const isWarehouse = ['warehouse', 'admin'].includes(profile.role);
  const isFinance = ['finance', 'admin'].includes(profile.role);
  const canTender = isProcurement && ['docs_received', 'tender_open', 'tender_closed', 'awarded', 'in_transit', 'goods_received', 'payment_pending', 'paid'].includes(po.status);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/shipments" className="text-sm text-blue hover:underline">
          ← Shipments
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="mono text-xl font-semibold text-ink">{po.po_number}</h1>
            <p className="text-sm text-dim">
              {v?.name ?? 'Unknown vendor'} · {po.cargo_description}
            </p>
          </div>
          <Badge tone="blue">{poStatusLabel(po.status)}</Badge>
        </div>
      </div>

      <ProcessTrail
        value={Number(po.total_value)}
        currency={po.currency}
        stage={stageForStatus(po.status)}
        done={po.status === 'paid'}
      />

      <StageStepper status={po.status} />

      {/* PO summary */}
      <Panel title="Purchase order">
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <Detail label="Value">
            <Money amount={Number(po.total_value)} currency={po.currency} />
          </Detail>
          <Detail label="Incoterm">{po.incoterm ?? '—'}</Detail>
          <Detail label="Route">
            {po.origin_location ?? '—'} → {po.destination_location ?? '—'}
          </Detail>
          <Detail label="HS code"><span className="mono">{po.hs_code ?? '—'}</span></Detail>
          <Detail label="Weight">{po.gross_weight_kg ? `${po.gross_weight_kg} kg` : '—'}</Detail>
          <Detail label="Packages">
            {po.packages_count ?? '—'} {po.packages_description ? `· ${po.packages_description}` : ''}
          </Detail>
          <Detail label="Promised">{formatDate(po.promised_date)}</Detail>
          <Detail label="Currency">{po.currency}</Detail>
        </div>
        {lineItems.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                  <th className="pb-2 pr-4 font-medium">#</th>
                  <th className="pb-2 pr-4 font-medium">Material</th>
                  <th className="pb-2 pr-4 font-medium">Description</th>
                  <th className="pb-2 pr-4 font-medium">Qty</th>
                  <th className="pb-2 pr-4 font-medium">Unit price</th>
                  <th className="pb-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li) => (
                  <tr key={li.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 text-dim">{li.line_no}</td>
                    <td className="py-2 pr-4 mono">{li.material_code ?? '—'}</td>
                    <td className="py-2 pr-4 text-dim">{li.description ?? '—'}</td>
                    <td className="py-2 pr-4">{li.quantity} {li.unit}</td>
                    <td className="py-2 pr-4"><Money amount={Number(li.unit_price)} currency={po.currency} /></td>
                    <td className="py-2"><Money amount={Number(li.amount)} currency={po.currency} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Stage 1 — documents */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Panel title="Stage 1 · Shipping documents" subtitle="Uploaded by the vendor">
          <DocumentList documents={documents} />
        </Panel>
        {isProcurement && (
          <Panel title="Add a document" subtitle="Procurement / internal upload">
            <DocumentUpload
              poId={poId}
              docTypes={[
                { value: 'commercial_invoice', label: 'Commercial Invoice' },
                { value: 'packing_list', label: 'Packing List' },
                { value: 'certificate_of_origin', label: 'Certificate of Origin' },
                { value: 'test_certificate', label: 'Test Certificate' },
                { value: 'other', label: 'Other' },
              ]}
            />
          </Panel>
        )}
      </div>

      {/* Stage 3 & 4 — tender + award */}
      {(canTender || tender) && (
        <Panel
          title="Stage 3–4 · Blind tender & award"
          subtitle="Sealed competitive freight tender"
          actions={tender && <Badge tone="violet">{tender.status}</Badge>}
        >
          {isProcurement ? (
            <TenderPanel
              poId={poId}
              tender={tender}
              eligibleForwarders={allForwarders}
              invitedForwarderIds={invitations.map((i) => i.forwarder_id)}
              bids={bids}
              award={thisAward}
              forwarderNames={forwarderNames}
            />
          ) : (
            <p className="text-sm text-dim">
              {tender ? `Tender is ${tender.status}.` : 'No tender opened yet.'} Bid details are visible
              to procurement only, and only after close.
            </p>
          )}
        </Panel>
      )}

      {/* Stage 4 — Award & Connect: vendor ↔ winning forwarder */}
      {thisAward && (
        <Panel
          title="Stage 4 · Award & connect"
          subtitle="Vendor and winning forwarder are linked to coordinate directly"
          actions={<Badge tone="green">connected</Badge>}
        >
          <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <div className="rounded-lg border border-amber/30 bg-amber/5 p-3 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">Vendor</div>
              <div className="mt-1 text-sm font-bold text-navy">{v?.name ?? '—'}</div>
              <div className="text-xs text-faint">{v?.contact_email ?? po.origin_location}</div>
            </div>
            <div className="flex items-center justify-center text-lg text-faint">＋</div>
            <div className="rounded-lg border border-violet/30 bg-violet/5 p-3 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">
                Freight forwarder
              </div>
              <div className="mt-1 text-sm font-bold text-navy">
                {forwarderNames[thisAward.forwarder_id]}
              </div>
              <div className="mono text-xs text-green">
                <Money amount={Number(thisAward.awarded_amount)} />
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-dim">
            Connection sent — both parties coordinate pickup directly.
            <SimulatedTag>simulated email</SimulatedTag>
          </div>
        </Panel>
      )}

      {/* Stage 5 — goods receipt */}
      {(isWarehouse || goodsReceipt) && ['awarded', 'in_transit', 'goods_received', 'payment_pending', 'paid'].includes(po.status) && (
        <Panel title="Stage 5 · Goods receipt & SAP service entry" subtitle="Warehouse">
          {isWarehouse ? (
            <GoodsReceiptForm poId={poId} existing={goodsReceipt} />
          ) : goodsReceipt ? (
            <div className="text-sm text-dim">
              Received in <strong>{goodsReceipt.condition.replace(/_/g, ' ')}</strong> condition ·{' '}
              SAP <span className="mono">{goodsReceipt.sap_service_entry_ref}</span>{' '}
              <SimulatedTag>simulated</SimulatedTag>
            </div>
          ) : null}
        </Panel>
      )}

      {/* Stage 6 — delivery (status view; confirmation happens in the forwarder portal) */}
      {['goods_received', 'in_transit', 'payment_pending', 'paid'].includes(po.status) && (
        <Panel title="Stage 6 · Delivery confirmation" subtitle="Winning forwarder">
          {deliveryRow?.delivered_at ? (
            <div className="text-sm text-green">Delivery confirmed on {formatDate(deliveryRow.delivered_at)}.</div>
          ) : (
            <div className="text-sm text-dim">Awaiting the forwarder&apos;s delivery confirmation.</div>
          )}
        </Panel>
      )}

      {/* Stage 7 — finance payment */}
      {(isFinance || paymentRow) && ['goods_received', 'payment_pending', 'paid'].includes(po.status) && (
        <Panel title="Stage 7 · Finance payment & ERP posting" subtitle="Three-way match → approve → post">
          {isFinance ? (
            <PaymentPanel poId={poId} payment={paymentRow} />
          ) : paymentRow?.erp_posted_at ? (
            <div className="text-sm text-green">
              Paid · ERP ref <span className="mono">{paymentRow.erp_reference}</span>
            </div>
          ) : (
            <div className="text-sm text-dim">Awaiting finance approval.</div>
          )}
        </Panel>
      )}

      {/* Landed cost */}
      {landedCost && (
        <Panel title="Landed cost">
          <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
            <Detail label="Product"><Money amount={Number(landedCost.product_cost)} /></Detail>
            <Detail label="Freight"><Money amount={Number(landedCost.freight_cost)} /></Detail>
            <Detail label="Duties"><Money amount={Number(landedCost.duties)} /></Detail>
            <Detail label="Insurance"><Money amount={Number(landedCost.insurance)} /></Detail>
            <Detail label="Handling"><Money amount={Number(landedCost.handling)} /></Detail>
            <Detail label="Total landed cost">
              <span className="font-semibold text-ink">
                <Money amount={Number(landedCost.total_landed_cost)} />
              </span>
            </Detail>
          </div>
        </Panel>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-1 text-ink">{children}</div>
    </div>
  );
}
