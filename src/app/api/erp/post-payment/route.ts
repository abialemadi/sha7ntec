import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import type { Payment, Profile, PurchaseOrder } from '@/lib/types';

// ============================================================
// POST /api/erp/post-payment   Body: { paymentId }
//
// MOCKED SAP posting (spec §9, §17). Builds a realistic SAP payload, stores
// it on payments.erp_payload, sets erp_posted_at and a generated
// erp_reference (SHA7NTEC-{po_number}), returns simulated success. The UI
// shows the payload and labels it "Simulated" (spec §18.5).
// ============================================================
export async function POST(req: Request) {
  const { paymentId } = (await req.json().catch(() => ({}))) as { paymentId?: string };
  if (!paymentId) return NextResponse.json({ error: 'paymentId required' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const profile = profileRow as Profile | null;
  if (!profile || !['finance', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: paymentRow } = await admin.from('payments').select('*').eq('id', paymentId).single();
  const payment = paymentRow as Payment | null;
  if (!payment || payment.org_id !== profile.org_id) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }
  if (payment.is_on_hold) {
    return NextResponse.json({ error: 'Payment is on hold — resolve the 3-way match first' }, { status: 409 });
  }
  if (!payment.approved_at) {
    return NextResponse.json({ error: 'Payment must be approved before posting' }, { status: 409 });
  }
  if (payment.erp_posted_at) {
    return NextResponse.json({ error: 'Already posted to ERP', erp_reference: payment.erp_reference }, { status: 409 });
  }

  const { data: poRow } = await admin
    .from('purchase_orders')
    .select('*')
    .eq('id', payment.po_id)
    .single();
  const po = poRow as PurchaseOrder;

  const erpReference = `SHA7NTEC-${po.po_number}`;
  const postedAt = new Date().toISOString();

  // Realistic-looking SAP S/4HANA supplier-invoice payload.
  const erpPayload = {
    _simulated: true,
    interface: 'SAP S/4HANA — Supplier Invoice (MIRO)',
    CompanyCode: '1000',
    DocumentType: 'RE',
    Reference: erpReference,
    PostingDate: postedAt.slice(0, 10),
    Currency: payment.currency,
    GrossAmount: payment.amount,
    PurchaseOrder: po.po_number,
    Supplier: payment.forwarder_id,
    Items: [
      {
        PurchaseOrderItem: '00010',
        Amount: payment.amount,
        TaxCode: 'V0',
        GLAccount: '6100000', // freight expense
        CostCenter: 'LOGISTICS',
      },
    ],
    ThreeWayMatch: {
      deliveryNote: payment.match_delivery_note,
      invoice: payment.match_invoice,
      goodsReceipt: payment.match_goods_receipt,
    },
  };

  await admin
    .from('payments')
    .update({ erp_payload: erpPayload, erp_posted_at: postedAt, erp_reference: erpReference })
    .eq('id', paymentId);
  await admin.from('purchase_orders').update({ status: 'paid' }).eq('id', payment.po_id);

  await writeAudit({
    orgId: profile.org_id,
    actorProfileId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: 'payment.posted_to_erp',
    entityType: 'payment',
    entityId: paymentId,
    poId: payment.po_id,
    metadata: { erp_reference: erpReference, amount: payment.amount, simulated: true },
  });

  return NextResponse.json({
    ok: true,
    simulated: true,
    erp_reference: erpReference,
    erp_posted_at: postedAt,
    erp_payload: erpPayload,
  });
}
