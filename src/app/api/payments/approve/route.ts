import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import type { Profile } from '@/lib/types';

// POST /api/payments/approve  Body: { poId }
//
// Finance runs the three-way match (delivery note + freight invoice + goods
// receipt), creates/updates the payment, and approves it if all three match.
// Also writes the landed-cost breakdown. Posting to the (mocked) ERP is a
// separate step: /api/erp/post-payment.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { poId?: string };
  if (!body.poId) return NextResponse.json({ error: 'poId required' }, { status: 400 });

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
  const { data: po } = await admin.from('purchase_orders').select('*').eq('id', body.poId).single();
  if (!po || po.org_id !== profile.org_id) {
    return NextResponse.json({ error: 'PO not found' }, { status: 404 });
  }

  // Winning award drives the freight amount + forwarder.
  const { data: award } = await admin
    .from('awards')
    .select('*, tenders!inner(po_id)')
    .eq('tenders.po_id', body.poId)
    .maybeSingle();
  if (!award) return NextResponse.json({ error: 'No award for this PO yet' }, { status: 409 });

  // Three-way match.
  const { data: docs } = await admin.from('documents').select('doc_type').eq('po_id', body.poId);
  const docTypes = new Set((docs ?? []).map((d) => d.doc_type));
  const { data: gr } = await admin
    .from('goods_receipts')
    .select('condition')
    .eq('po_id', body.poId)
    .maybeSingle();

  const matchDeliveryNote = docTypes.has('delivery_note');
  const matchInvoice = docTypes.has('freight_invoice') || docTypes.has('commercial_invoice');
  const matchGoodsReceipt = Boolean(gr) && gr?.condition === 'good';
  const allMatch = matchDeliveryNote && matchInvoice && matchGoodsReceipt;

  const holdReasons: string[] = [];
  if (!matchDeliveryNote) holdReasons.push('missing delivery note');
  if (!matchInvoice) holdReasons.push('missing freight/commercial invoice');
  if (!matchGoodsReceipt) holdReasons.push('goods receipt missing or shows a discrepancy');

  const now = new Date().toISOString();
  const freight = Number(award.awarded_amount);

  // Upsert the payment row for this PO.
  const { data: existing } = await admin
    .from('payments')
    .select('id')
    .eq('po_id', body.poId)
    .maybeSingle();

  const paymentFields = {
    org_id: profile.org_id,
    po_id: body.poId,
    forwarder_id: award.forwarder_id,
    amount: freight,
    match_delivery_note: matchDeliveryNote,
    match_invoice: matchInvoice,
    match_goods_receipt: matchGoodsReceipt,
    is_on_hold: !allMatch,
    hold_reason: allMatch ? null : holdReasons.join('; '),
    approved_by: allMatch ? profile.id : null,
    approved_at: allMatch ? now : null,
  };

  let paymentId: string;
  if (existing) {
    const { data, error } = await admin
      .from('payments')
      .update(paymentFields)
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    paymentId = data.id;
  } else {
    const { data, error } = await admin.from('payments').insert(paymentFields).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    paymentId = data.id;
  }

  // Landed cost breakdown (product cost from the PO, freight from the award).
  const { data: lcExisting } = await admin
    .from('landed_costs')
    .select('id')
    .eq('po_id', body.poId)
    .maybeSingle();
  const landedFields = {
    org_id: profile.org_id,
    po_id: body.poId,
    product_cost: Number(po.total_value),
    freight_cost: freight,
    duties: 0,
    insurance: 0,
    handling: 0,
  };
  if (lcExisting) {
    await admin.from('landed_costs').update(landedFields).eq('id', lcExisting.id);
  } else {
    await admin.from('landed_costs').insert(landedFields);
  }

  if (allMatch) {
    await admin.from('purchase_orders').update({ status: 'payment_pending' }).eq('id', body.poId);
    await writeAudit({
      orgId: profile.org_id,
      actorProfileId: profile.id,
      actorEmail: profile.email,
      actorRole: profile.role,
      action: 'payment.approved',
      entityType: 'payment',
      entityId: paymentId,
      poId: body.poId,
      metadata: { amount: freight },
    });
  }

  return NextResponse.json({
    ok: true,
    paymentId,
    threeWayMatch: { matchDeliveryNote, matchInvoice, matchGoodsReceipt },
    onHold: !allMatch,
    holdReason: allMatch ? null : holdReasons.join('; '),
  });
}
