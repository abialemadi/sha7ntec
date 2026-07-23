/**
 * Sha7ntec seed script (spec §15).
 *
 * Creates the demo organization (Ras Girtas Power Company), real vendors and
 * forwarders, the two real POs plus historical POs in mixed states so the
 * analytics and insights pages have something to show, and one user per role.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed
 *
 * Requires the migrations in supabase/migrations to have been applied first.
 * Idempotency: if the RGPC organization already exists the script exits.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'Sha7ntec!Demo2026';

async function main() {
  // Guard: don't double-seed.
  const { data: existingOrg } = await db
    .from('organizations')
    .select('id')
    .eq('name', 'Ras Girtas Power Company')
    .maybeSingle();
  if (existingOrg) {
    console.log('RGPC organization already exists — nothing to seed. Exiting.');
    return;
  }

  // ---- Organization ----
  const { data: org } = await db
    .from('organizations')
    .insert({ name: 'Ras Girtas Power Company', country: 'Qatar', erp_system: 'SAP S/4HANA' })
    .select('id')
    .single();
  const orgId = org!.id as string;
  console.log('org', orgId);

  // ---- Vendors ----
  const vendorSpecs = [
    { name: 'Quinta Raddison Ltd.', country: 'USA', contact_person: 'J. Baker', contact_email: 'sales@quintaraddison.com' },
    { name: 'GPT Corporation', country: 'Korea', contact_email: 'export@gptcorp.co.kr' },
    { name: 'Siemens Energy AG', country: 'Germany', contact_email: 'orders@siemens-energy.com' },
    { name: 'Mitsubishi Heavy Industries', country: 'Japan', contact_email: 'parts@mhi.co.jp' },
    { name: 'Emerson Process Management', country: 'USA', contact_email: 'sales@emerson.com' },
  ];
  const { data: vendors } = await db
    .from('vendors')
    .insert(vendorSpecs.map((v) => ({ ...v, org_id: orgId })))
    .select('id, name');
  const vendorId = (name: string) => vendors!.find((v) => v.name === name)!.id as string;

  // ---- Forwarders ----
  const forwarderSpecs: { name: string; modes: ('sea' | 'air' | 'both')[]; contact_email: string }[] = [
    { name: 'GWC Qatar', modes: ['sea', 'air'], contact_email: 'tenders@gwclogistics.com' },
    { name: 'DSV Panalpina Marine Shipping WLL', modes: ['sea'], contact_email: 'qa.marine@dsv.com' },
    { name: 'Gulf Agency Company Qatar (W.L.L.)', modes: ['sea', 'air'], contact_email: 'doha@gac.com' },
    { name: 'BDP International Logistics Qatar WLL', modes: ['sea'], contact_email: 'qatar@bdpint.com' },
    { name: 'Navio Shipping CO.', modes: ['sea'], contact_email: 'ops@navioshipping.qa' },
    { name: 'DHL Express Qatar', modes: ['air'], contact_email: 'qa.express@dhl.com' },
    { name: 'FedEx Trade Networks Qatar', modes: ['air'], contact_email: 'doha@fedex.com' },
    { name: 'UPS Supply Chain Solutions Qatar', modes: ['air'], contact_email: 'qa.scs@ups.com' },
  ];
  const { data: forwarders } = await db
    .from('forwarders')
    .insert(forwarderSpecs.map((f) => ({ ...f, org_id: orgId })))
    .select('id, name, modes');
  const fwdId = (name: string) => forwarders!.find((f) => f.name === name)!.id as string;

  // ---- Users (one per role) ----
  async function createUser(email: string, role: string, extra: Record<string, unknown> = {}) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.warn(`user ${email}:`, error?.message);
      return;
    }
    await db.from('profiles').insert({
      id: data.user.id,
      org_id: orgId,
      role,
      email,
      full_name: email.split('@')[0],
      ...extra,
    });
    console.log('user', email, role);
  }
  await createUser('admin@rasgirtas.demo', 'admin');
  await createUser('procurement@rasgirtas.demo', 'procurement');
  await createUser('finance@rasgirtas.demo', 'finance');
  await createUser('warehouse@rasgirtas.demo', 'warehouse');
  await createUser('vendor@quintaraddison.demo', 'vendor', { vendor_id: vendorId('Quinta Raddison Ltd.') });
  await createUser('bids@gwclogistics.demo', 'forwarder', { forwarder_id: fwdId('GWC Qatar') });
  await createUser('bids@dsv.demo', 'forwarder', { forwarder_id: fwdId('DSV Panalpina Marine Shipping WLL') });

  // ---- PO 4000004597 (real) ----
  const { data: po1 } = await db
    .from('purchase_orders')
    .insert({
      org_id: orgId,
      po_number: '4000004597',
      vendor_id: vendorId('Quinta Raddison Ltd.'),
      status: 'docs_pending',
      cargo_description: 'Centrifugal Exhaust Fans (models 540C12B, 330C11B, 365C11B)',
      total_value: 28388,
      currency: 'USD',
      incoterm: 'EXW',
      origin_location: 'Springfield PA, USA',
      destination_location: 'Doha, Qatar',
      hs_code: '8487.90.0080',
      gross_weight_kg: 2872,
      packages_count: 6,
      packages_description: '6 crates',
      promised_date: '2026-07-30',
    })
    .select('id')
    .single();
  await db.from('po_line_items').insert([
    { po_id: po1!.id, line_no: 1, material_code: '540C12B', description: 'Centrifugal Exhaust Fan 540C12B', quantity: 2, unit: 'EA', unit_price: 5200, amount: 10400 },
    { po_id: po1!.id, line_no: 2, material_code: '330C11B', description: 'Centrifugal Exhaust Fan 330C11B', quantity: 2, unit: 'EA', unit_price: 4400, amount: 8800 },
    { po_id: po1!.id, line_no: 3, material_code: '365C11B', description: 'Centrifugal Exhaust Fan 365C11B', quantity: 2, unit: 'EA', unit_price: 4594, amount: 9188 },
  ]);
  console.log('PO 4000004597');

  // ---- LIVE OPEN TENDER on 4000004597 — showcases the sealed reveal ----
  // Bids are crafted so that closing the tender trips the anomaly rules:
  // Navio + BDP land within 1.5% of each other (collusion → flagged, cheapest
  // skipped), Gulf Agency is a high outlier (review), DSV is the recommended
  // lowest qualified bid.
  await db.from('purchase_orders').update({ status: 'tender_open' }).eq('id', po1!.id);
  const { data: openTender } = await db
    .from('tenders')
    .insert({ org_id: orgId, po_id: po1!.id, mode: 'sea', status: 'open', opened_at: new Date().toISOString() })
    .select('id')
    .single();
  const demoInvites = [
    'GWC Qatar',
    'DSV Panalpina Marine Shipping WLL',
    'Gulf Agency Company Qatar (W.L.L.)',
    'Navio Shipping CO.',
    'BDP International Logistics Qatar WLL',
  ];
  await db.from('tender_invitations').insert(
    demoInvites.map((n) => ({ tender_id: openTender!.id, forwarder_id: fwdId(n) })),
  );
  const demoBids: Record<string, { amount: number; transit: number }> = {
    'Navio Shipping CO.': { amount: 8900, transit: 24 },
    'BDP International Logistics Qatar WLL': { amount: 8980, transit: 26 },
    'DSV Panalpina Marine Shipping WLL': { amount: 9150, transit: 23 },
    'GWC Qatar': { amount: 9400, transit: 25 },
    'Gulf Agency Company Qatar (W.L.L.)': { amount: 11800, transit: 22 },
  };
  await db.from('bids').insert(
    Object.entries(demoBids).map(([n, b]) => ({
      org_id: orgId,
      tender_id: openTender!.id,
      forwarder_id: fwdId(n),
      amount: b.amount,
      transit_days: b.transit,
      status: 'submitted',
    })),
  );
  console.log('open demo tender on 4000004597 (5 sealed bids)');

  // ---- PO 4000004608 (real) ----
  const { data: po2 } = await db
    .from('purchase_orders')
    .insert({
      org_id: orgId,
      po_number: '4000004608',
      vendor_id: vendorId('GPT Corporation'),
      status: 'docs_pending',
      cargo_description: 'Oil Seal BFP Motor Dia 180 DE/NDE',
      total_value: 6300,
      currency: 'USD',
      incoterm: 'EXW',
      origin_location: 'Incheon, Korea',
      destination_location: 'Doha, Qatar',
      hs_code: '8503.00-1000',
      gross_weight_kg: 3.5,
      packages_count: 1,
      packages_description: '1 carton',
      promised_date: '2026-06-21',
    })
    .select('id')
    .single();
  await db.from('po_line_items').insert([
    { po_id: po2!.id, line_no: 1, material_code: 'OS-180', description: 'Oil Seal BFP Motor Dia 180 DE/NDE', quantity: 10, unit: 'EA', unit_price: 630, amount: 6300 },
  ]);
  console.log('PO 4000004608');

  // ---- Historical POs (mixed states) for analytics ----
  await seedHistorical(orgId, {
    poNumber: '4000004501',
    vendor: vendorId('Siemens Energy AG'),
    vendorCountry: 'Germany',
    cargo: 'Gas turbine blade set',
    value: 142000,
    origin: 'Hamburg, Germany',
    mode: 'sea',
    invited: ['DSV Panalpina Marine Shipping WLL', 'GWC Qatar', 'Gulf Agency Company Qatar (W.L.L.)', 'Navio Shipping CO.'],
    bids: { 'DSV Panalpina Marine Shipping WLL': 8200, 'GWC Qatar': 9100, 'Gulf Agency Company Qatar (W.L.L.)': 8700, 'Navio Shipping CO.': 9600 },
    winner: 'DSV Panalpina Marine Shipping WLL',
    promised: '2026-03-15',
    delivered: '2026-03-14',
    paid: true,
    fwdId,
  });
  await seedHistorical(orgId, {
    poNumber: '4000004512',
    vendor: vendorId('Mitsubishi Heavy Industries'),
    vendorCountry: 'Japan',
    cargo: 'Boiler feed pump spares',
    value: 58000,
    origin: 'Kobe, Japan',
    mode: 'sea',
    invited: ['GWC Qatar', 'BDP International Logistics Qatar WLL', 'Navio Shipping CO.'],
    bids: { 'GWC Qatar': 4300, 'BDP International Logistics Qatar WLL': 4100, 'Navio Shipping CO.': 4500 },
    winner: 'BDP International Logistics Qatar WLL',
    promised: '2026-04-20',
    delivered: '2026-04-27', // late
    paid: true,
    fwdId,
  });
  await seedHistorical(orgId, {
    poNumber: '4000004533',
    vendor: vendorId('Emerson Process Management'),
    vendorCountry: 'USA',
    cargo: 'Control valve actuators',
    value: 33000,
    origin: 'Houston TX, USA',
    mode: 'air',
    invited: ['DHL Express Qatar', 'FedEx Trade Networks Qatar', 'UPS Supply Chain Solutions Qatar'],
    bids: { 'DHL Express Qatar': 6200, 'FedEx Trade Networks Qatar': 5900, 'UPS Supply Chain Solutions Qatar': 6400 },
    winner: 'FedEx Trade Networks Qatar',
    promised: '2026-05-10',
    delivered: '2026-05-09',
    paid: true,
    fwdId,
  });
  await seedHistorical(orgId, {
    poNumber: '4000004544',
    vendor: vendorId('Siemens Energy AG'),
    vendorCountry: 'Germany',
    cargo: 'Generator excitation module',
    value: 87500,
    origin: 'Berlin, Germany',
    mode: 'sea',
    invited: ['DSV Panalpina Marine Shipping WLL', 'GWC Qatar', 'Gulf Agency Company Qatar (W.L.L.)'],
    bids: { 'DSV Panalpina Marine Shipping WLL': 7400, 'GWC Qatar': 7900, 'Gulf Agency Company Qatar (W.L.L.)': 7600 },
    winner: 'DSV Panalpina Marine Shipping WLL',
    promised: '2026-06-30',
    delivered: null, // in transit
    paid: false,
    fwdId,
  });
  await seedHistorical(orgId, {
    poNumber: '4000004555',
    vendor: vendorId('Mitsubishi Heavy Industries'),
    vendorCountry: 'Japan',
    cargo: 'Condenser tube bundle',
    value: 205000,
    origin: 'Osaka, Japan',
    mode: 'sea',
    invited: ['GWC Qatar', 'Navio Shipping CO.', 'BDP International Logistics Qatar WLL', 'Gulf Agency Company Qatar (W.L.L.)'],
    bids: { 'GWC Qatar': 11200, 'Navio Shipping CO.': 10800, 'BDP International Logistics Qatar WLL': 11500, 'Gulf Agency Company Qatar (W.L.L.)': 10950 },
    winner: 'Navio Shipping CO.',
    promised: '2026-07-05',
    delivered: null, // awarded, not yet shipped
    paid: false,
    fwdId,
  });

  console.log('\nSeed complete. Demo password:', DEMO_PASSWORD);
}

interface HistoricalSpec {
  poNumber: string;
  vendor: string;
  vendorCountry: string;
  cargo: string;
  value: number;
  origin: string;
  mode: 'sea' | 'air' | 'both';
  invited: string[];
  bids: Record<string, number>;
  winner: string;
  promised: string;
  delivered: string | null;
  paid: boolean;
  fwdId: (name: string) => string;
}

async function seedHistorical(orgId: string, s: HistoricalSpec) {
  const finalStatus = s.paid ? 'paid' : s.delivered ? 'in_transit' : 'awarded';
  const { data: po } = await db
    .from('purchase_orders')
    .insert({
      org_id: orgId,
      po_number: s.poNumber,
      vendor_id: s.vendor,
      status: finalStatus,
      cargo_description: s.cargo,
      total_value: s.value,
      currency: 'USD',
      incoterm: 'EXW',
      origin_location: s.origin,
      destination_location: 'Doha, Qatar',
      promised_date: s.promised,
    })
    .select('id')
    .single();
  const poId = po!.id as string;

  const { data: tender } = await db
    .from('tenders')
    .insert({ org_id: orgId, po_id: poId, mode: s.mode, status: 'awarded', closed_at: s.promised })
    .select('id')
    .single();
  const tenderId = tender!.id as string;

  await db
    .from('tender_invitations')
    .insert(s.invited.map((n) => ({ tender_id: tenderId, forwarder_id: s.fwdId(n) })));

  const bidRows = Object.entries(s.bids).map(([name, amount]) => ({
    org_id: orgId,
    tender_id: tenderId,
    forwarder_id: s.fwdId(name),
    amount,
    transit_days: s.mode === 'air' ? 4 : 24,
    status: name === s.winner ? 'won' : 'lost',
    anomaly_severity: 'normal' as const,
  }));
  const { data: insertedBids } = await db.from('bids').insert(bidRows).select('id, forwarder_id, amount');
  const winnerBid = insertedBids!.find((b) => b.forwarder_id === s.fwdId(s.winner))!;
  const highest = Math.max(...Object.values(s.bids));

  await db.from('awards').insert({
    org_id: orgId,
    tender_id: tenderId,
    bid_id: winnerBid.id,
    forwarder_id: s.fwdId(s.winner),
    awarded_amount: winnerBid.amount,
    savings_vs_highest: highest - Number(winnerBid.amount),
    connection_sent_at: s.promised,
  });

  if (s.delivered) {
    await db.from('deliveries').insert({
      org_id: orgId,
      po_id: poId,
      forwarder_id: s.fwdId(s.winner),
      delivered_at: s.delivered,
    });
    await db.from('goods_receipts').insert({
      org_id: orgId,
      po_id: poId,
      condition: 'good',
      sap_service_entry_ref: `SES-${s.poNumber}-00001`,
      sap_posted_at: s.delivered,
    });
  }

  if (s.paid) {
    await db.from('landed_costs').insert({
      org_id: orgId,
      po_id: poId,
      product_cost: s.value,
      freight_cost: winnerBid.amount,
    });
    const erpRef = `SHA7NTEC-${s.poNumber}`;
    await db.from('payments').insert({
      org_id: orgId,
      po_id: poId,
      forwarder_id: s.fwdId(s.winner),
      amount: winnerBid.amount,
      match_delivery_note: true,
      match_invoice: true,
      match_goods_receipt: true,
      approved_at: s.delivered,
      erp_reference: erpRef,
      erp_posted_at: s.delivered,
      erp_payload: { _simulated: true, Reference: erpRef, GrossAmount: winnerBid.amount },
    });
  }

  console.log('historical PO', s.poNumber, finalStatus);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
