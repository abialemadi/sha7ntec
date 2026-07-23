/**
 * Sha7ntec — RLS moat verification (Definition of Done §16, items 1 & 2).
 *
 * Proves the sealed-bid guarantees against a LIVE, SEEDED Supabase project,
 * by signing in as real users with the anon key (the same path the browser
 * uses) — not the service role. This is the "verified by direct API call, not
 * just UI" check the spec demands.
 *
 * Asserts:
 *   1. A forwarder can read ONLY their own bid — never another forwarder's.
 *   2. Procurement CANNOT read any bid while the tender is open (sealed),
 *      and CAN once it is closed.
 *
 * Prereqs: run the migrations and `npm run seed` first (the seed creates the
 * demo users and an open tender with sealed bids on PO 4000004597).
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm run verify:rls
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = process.env.SEED_PASSWORD ?? 'Sha7ntec!Demo2026';

if (!url || !anon) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  process.exit(1);
}

let failures = 0;
function check(name: string, pass: boolean, detail = '') {
  if (pass) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

async function signIn(email: string): Promise<SupabaseClient> {
  const c = createClient(url!, anon!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return c;
}

async function forwarderId(c: SupabaseClient): Promise<string | null> {
  const { data } = await c.from('profiles').select('forwarder_id').single();
  return (data?.forwarder_id as string | null) ?? null;
}

async function main() {
  console.log('\nSha7ntec RLS moat verification\n');

  const gwc = await signIn('bids@gwclogistics.demo');
  const dsv = await signIn('bids@dsv.demo');
  const proc = await signIn('procurement@rasgirtas.demo');

  const gwcFwd = await forwarderId(gwc);
  const dsvFwd = await forwarderId(dsv);

  // Locate the open tender the forwarder is invited to.
  const { data: openTenders } = await gwc.from('tenders').select('id, status').eq('status', 'open');
  const tenderId = openTenders?.[0]?.id as string | undefined;

  console.log('Rule 1 — a forwarder sees only their own bid:');
  check('forwarder GWC can see the open tender they were invited to', Boolean(tenderId));

  const { data: gwcBids } = await gwc.from('bids').select('id, forwarder_id');
  const { data: dsvBids } = await dsv.from('bids').select('id, forwarder_id');

  check('GWC reads at least one bid (their own)', (gwcBids ?? []).length >= 1);
  check(
    'every bid GWC can read belongs to GWC',
    (gwcBids ?? []).every((b) => b.forwarder_id === gwcFwd),
    `saw forwarder_ids ${JSON.stringify([...new Set((gwcBids ?? []).map((b) => b.forwarder_id))])}`,
  );
  check(
    "GWC can NOT see DSV's bid",
    !(gwcBids ?? []).some((b) => b.forwarder_id === dsvFwd),
  );
  check(
    'every bid DSV can read belongs to DSV',
    (dsvBids ?? []).every((b) => b.forwarder_id === dsvFwd),
  );

  console.log('\nRule 2 — procurement cannot read any bid before close:');
  if (tenderId) {
    const { data: procBidsOpen } = await proc
      .from('bids')
      .select('id, amount')
      .eq('tender_id', tenderId);
    check(
      'procurement reads ZERO bids while the tender is open (sealed)',
      (procBidsOpen ?? []).length === 0,
      `saw ${(procBidsOpen ?? []).length} bids`,
    );
  } else {
    check('open tender present to test the seal', false, 'no open tender — did you run the seed?');
  }

  // Sanity: procurement CAN read bids on an already-closed/awarded tender.
  const { data: closed } = await proc
    .from('tenders')
    .select('id')
    .in('status', ['closed', 'awarded'])
    .limit(1);
  const closedId = closed?.[0]?.id as string | undefined;
  if (closedId) {
    const { data: procBidsClosed } = await proc.from('bids').select('id').eq('tender_id', closedId);
    check('procurement CAN read bids once the tender is closed/awarded', (procBidsClosed ?? []).length >= 1);
  } else {
    console.log('  (no closed/awarded tender seeded to test the post-close read — skipped)');
  }

  console.log('');
  if (failures > 0) {
    console.error(`RLS verification FAILED — ${failures} check(s) did not pass. The moat is broken.\n`);
    process.exit(1);
  }
  console.log('RLS verification PASSED — the sealed-bid moat holds.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
