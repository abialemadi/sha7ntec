# Sha7ntec

**Logistics financial-control middleware.** Sha7ntec sits between an
enterprise ERP (SAP / Oracle / Dynamics) and freight execution, managing one
shipment through **seven stages** — with a **sealed competitive freight tender**
in the middle and an ERP payment posting at the end.

The freight tender is genuinely blind: forwarders cannot see each other's bids,
and procurement cannot see any bid until the tender closes. Every bid is scanned
for anomalies before award, and every state-changing action is written to an
append-only audit log.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript |
| Database / Auth / Storage | Supabase (Postgres + Auth + Storage, RLS enforced) |
| Styling | Tailwind CSS (light theme, forced) |
| AI | Anthropic Claude — **server routes only** |
| Hosting | Vercel |

Tenancy is single-tenant today but the schema is multi-tenant-ready: every
business table carries `org_id`.

---

## Local development

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env.local
#   Fill in the Supabase + API keys (see §Environment variables below).

# 3. Apply the database migrations (see §Database)

# 4. Seed the demo data
npm run seed

# 5. Run
npm run dev        # http://localhost:3000
```

### Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Runs the **server-key leak check**, then `next build` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Anomaly-detection unit tests (Vitest) |
| `npm run seed` | Seed the RGPC demo dataset |
| `npm run verify:rls` | Prove the sealed-bid moat against a live seeded Supabase (DoD §16) |
| `npm run check:keys` | Fail if a server-only secret is referenced from client code |

CI (`.github/workflows/ci.yml`) runs typecheck, unit tests, the server-key leak
check, and the build on every push and PR.

---

## Environment variables

```bash
# Public — safe in the browser
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# SERVER ONLY — never prefix with NEXT_PUBLIC_
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
OILPRICE_API_KEY=
```

`npm run build` fails if any server-only key is referenced from a `"use client"`
file or from anywhere outside an allowed server context
(`scripts/check-no-server-keys.mjs`). Server-only libs additionally
`import 'server-only'`, which makes the bundler fail if they ever reach the
client.

---

## Database

SQL migrations live in `supabase/migrations/`, applied in order:

| File | Contents |
|---|---|
| `0001_schema.sql` | Enums, tables, indexes |
| `0002_rls.sql` | **Row Level Security** — the sealed-bid moat + helper functions |
| `0003_triggers.sql` | Forwarder performance-history triggers |
| `0004_storage.sql` | Private `shipment-docs` bucket + storage policies |

Apply them either by pasting each file into the **Supabase SQL editor** in
order, or with the Supabase CLI:

```bash
supabase db push          # or run each file with: psql "$DATABASE_URL" -f <file>
```

### The moat — Row Level Security

Two rules are enforced **in the database**, not the UI:

1. A forwarder can **never** read another forwarder's bid — before or after
   close (`bids_forwarder_own`).
2. Procurement can **never** read any bid until `tenders.status` is
   `closed`/`awarded` (`bids_internal_after_close`).

Bids have **no DELETE policy** — nobody can delete a bid. The `audit_log` has
**no insert/update/delete policy** for end users; it is written by the service
role only and is read-only for admins.

The sealed reveal happens **server-side only** in
`POST /api/tenders/[id]/close`, which uses the service-role client to read the
bids, run anomaly detection, snapshot the Baltic Dry Index, and generate the AI
summary. There is no client path that can close a tender.

---

## The seven stages

| # | Stage | Role | Route / component |
|---|---|---|---|
| 1 | Vendor document upload | vendor | `/portal/vendor` |
| 2 | Shipment ready | procurement | shipment detail |
| 3 | Blind tender | procurement + forwarders | `TenderPanel`, `/portal/forwarder` |
| 4 | Award & connect | procurement | `TenderPanel` |
| 5 | Goods receipt & SAP | warehouse | `GoodsReceiptForm` |
| 6 | Delivery confirmation | forwarder | `/portal/forwarder` |
| 7 | Finance payment & ERP | finance | `PaymentPanel` |

Stage 5 precedes stage 6, mirroring the prototype.

### Anomaly detection

`src/lib/anomaly.ts` — pure, unit-tested, **rules-based** (not a trained model,
and labelled "AI-assisted (rules-based)" in the UI). Rules: high outlier
(z > 1.1), above/below own history (±12% / 10%), unproven forwarder (< 5 bids),
and collusion (two forwarders within 1.5%). The default award recommendation is
the lowest **non-flagged** bid; skipping the cheapest is recorded, and any
procurement override is written to the audit log.

---

## What is mocked in v1 (labelled "Simulated" in the UI)

Per the spec, these are honestly simulated and clearly tagged:

- **ERP / SAP posting** — realistic payload stored on `payments.erp_payload`;
  no real connector.
- **Email** — writes a `notifications` row, `sent_at` stays null (Resend in
  phase 2).
- **WhatsApp** — not implemented.

Only the Baltic Dry Index is a live feed; lane rates are estimates.

---

## Deployment (Vercel)

1. Push to a **private** GitHub repo.
2. Vercel → New Project → import the repo (Next.js auto-detected).
3. Add all environment variables (§Environment variables) for **Production** and
   **Preview**.
4. Deploy.
5. Supabase → Authentication → URL Configuration → add the Vercel URL to
   **Redirect URLs**.
6. Add the custom domain `app.sha7ntec.com` and point its CNAME at Vercel.
7. Supabase → Authentication → Providers → Email → **turn OFF public sign-ups**.
   Accounts are admin-created only.

---

## Demo accounts

`npm run seed` creates one user per role in the Ras Girtas Power Company org.
Default password: `Sha7ntec!Demo2026` (override with `SEED_PASSWORD`).

| Email | Role |
|---|---|
| admin@rasgirtas.demo | admin |
| procurement@rasgirtas.demo | procurement |
| finance@rasgirtas.demo | finance |
| warehouse@rasgirtas.demo | warehouse |
| vendor@quintaraddison.demo | vendor |
| bids@gwclogistics.demo | forwarder |
| bids@dsv.demo | forwarder |

To verify the moat manually: sign in as `bids@gwclogistics.demo` and
`bids@dsv.demo` on the same open tender — neither can see the other's bid, nor
how many bids exist. Sign in as procurement — bid amounts are invisible until
you close the tender.

To verify it **automatically** (Definition of Done §16, items 1 & 2), after
seeding run:

```bash
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm run verify:rls
```

This signs in as two forwarders and procurement with the anon key (the browser's
path, not the service role) and asserts each forwarder sees only their own bid
and procurement reads zero bids while the tender is open. The seed leaves PO
4000004597 as an open tender with five sealed bids for exactly this check.
