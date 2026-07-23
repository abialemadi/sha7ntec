import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import type { Profile, ReceiptCondition } from '@/lib/types';

// POST /api/goods-receipts  Body: { poId, condition, missingQtyNote?, keeperNote? }
// Warehouse records the goods receipt and posts a MOCKED SAP service entry.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    poId?: string;
    condition?: ReceiptCondition;
    missingQtyNote?: string;
    keeperNote?: string;
  };
  if (!body.poId || !body.condition) {
    return NextResponse.json({ error: 'poId and condition are required' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const profile = profileRow as Profile | null;
  if (!profile || !['warehouse', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: po } = await admin.from('purchase_orders').select('*').eq('id', body.poId).single();
  if (!po || po.org_id !== profile.org_id) {
    return NextResponse.json({ error: 'PO not found' }, { status: 404 });
  }

  // Mocked SAP service entry reference.
  const sapRef = `SES-${po.po_number}-${Date.now().toString().slice(-5)}`;
  const now = new Date().toISOString();

  const { data: gr, error } = await admin
    .from('goods_receipts')
    .insert({
      org_id: profile.org_id,
      po_id: body.poId,
      condition: body.condition,
      missing_qty_note: body.missingQtyNote ?? null,
      keeper_note: body.keeperNote ?? null,
      received_by: profile.id,
      sap_service_entry_ref: sapRef,
      sap_posted_at: now,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from('purchase_orders').update({ status: 'goods_received' }).eq('id', body.poId);

  await writeAudit({
    orgId: profile.org_id,
    actorProfileId: profile.id,
    actorEmail: profile.email,
    actorRole: profile.role,
    action: 'goods.received',
    entityType: 'goods_receipt',
    entityId: gr.id,
    poId: body.poId,
    metadata: { condition: body.condition, sap_service_entry_ref: sapRef, simulated: true },
  });

  return NextResponse.json({ ok: true, goodsReceipt: gr, simulated: true });
}
