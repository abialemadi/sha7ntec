import { createClient } from '@/lib/supabase/server';
import { Panel, Badge, Money } from '@/components/ui';
import { DocumentUpload } from '@/components/workflow/DocumentUpload';
import { DocumentList } from '@/components/workflow/DocumentList';
import { poStatusLabel, formatDate } from '@/lib/format';
import type { DocumentRow, PurchaseOrder } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function VendorPortalPage() {
  const supabase = await createClient();
  // RLS: vendor only sees their own POs.
  const { data: pos } = await supabase
    .from('purchase_orders')
    .select('*')
    .order('created_at', { ascending: false });
  const purchaseOrders = (pos ?? []) as PurchaseOrder[];

  const { data: docs } = await supabase.from('documents').select('*');
  const docsByPo = new Map<string, DocumentRow[]>();
  for (const d of (docs ?? []) as DocumentRow[]) {
    docsByPo.set(d.po_id, [...(docsByPo.get(d.po_id) ?? []), d]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Your purchase orders</h1>
        <p className="text-sm text-dim">Upload the shipping documents for each order.</p>
      </div>

      {purchaseOrders.length === 0 && (
        <Panel title="No purchase orders">
          <p className="text-sm text-dim">You have no assigned purchase orders yet.</p>
        </Panel>
      )}

      {purchaseOrders.map((po) => (
        <Panel
          key={po.id}
          title={<span className="mono">{po.po_number}</span>}
          subtitle={po.cargo_description ?? undefined}
          actions={<Badge tone="blue">{poStatusLabel(po.status)}</Badge>}
        >
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div>
              <div className="text-xs text-faint">Value</div>
              <Money amount={Number(po.total_value)} currency={po.currency} />
            </div>
            <div>
              <div className="text-xs text-faint">Incoterm</div>
              <div className="text-ink">{po.incoterm ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-faint">Promised</div>
              <div className="text-ink">{formatDate(po.promised_date)}</div>
            </div>
            <div>
              <div className="text-xs text-faint">Route</div>
              <div className="text-ink">
                {po.origin_location ?? '—'} → {po.destination_location ?? '—'}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                Uploaded documents
              </div>
              <DocumentList documents={docsByPo.get(po.id) ?? []} />
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                Upload a document
              </div>
              <DocumentUpload
                poId={po.id}
                docTypes={[
                  { value: 'commercial_invoice', label: 'Commercial Invoice' },
                  { value: 'packing_list', label: 'Packing List' },
                  { value: 'certificate_of_origin', label: 'Certificate of Origin' },
                  { value: 'test_certificate', label: 'Test Certificate' },
                  { value: 'other', label: 'Other' },
                ]}
              />
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}
