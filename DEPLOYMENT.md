# Deploying Sha7ntec

Two things need accounts: **Supabase** (database + auth + file storage) and
**Vercel** (hosting). Both have free tiers that are enough to run this. You do
everything from their web dashboards plus a few `npm` commands on your own
machine.

Order matters: **Supabase first**, then Vercel.

---

## 0. Get the code on your machine

```bash
git clone <your-repo-url> sha7ntec
cd sha7ntec
git checkout claude/sha7ntec-production-spec-fsl46d
npm install
cp .env.example .env.local
```

Leave `.env.local` open — you'll paste keys into it as you go.

---

## 1. Supabase — create the project

1. Go to <https://supabase.com> → sign in → **New project**.
2. Name it (e.g. `sha7ntec`), pick a region near Qatar (e.g. *Frankfurt* or
   *Mumbai*), set a database password (save it), **Create**.
3. Wait ~2 minutes for it to provision.

### Get your keys

Project → **Settings → API**. Copy three values into `.env.local`:

| Supabase field | .env.local variable |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` `secret` key | `SUPABASE_SERVICE_ROLE_KEY` |

Then add your two API keys:

- `ANTHROPIC_API_KEY` — from <https://console.anthropic.com> (Settings → API keys).
- `OILPRICE_API_KEY` — from <https://www.oilpriceapi.com> (free tier). Optional;
  without it the BDI falls back to the last cached value.

### Run the database migrations

Supabase → **SQL Editor → New query**. Open each file in
`supabase/migrations/` **in order** and run them one at a time:

1. `0001_schema.sql` — tables + enums
2. `0002_rls.sql` — Row Level Security (the moat) + helper functions
3. `0003_triggers.sql` — forwarder performance triggers
4. `0004_storage.sql` — the private `shipment-docs` bucket + storage policies
5. `0005_notifications_admin.sql` — admin notification read policy

(Or, with the Supabase CLI: `supabase db push`.)

After `0004`, confirm **Storage → Buckets** shows a **private** bucket named
`shipment-docs`.

### Seed the demo data

From your machine (uses the service-role key from `.env.local`):

```bash
set -a && source .env.local && set +a
npm run seed
```

This creates the Ras Girtas org, vendors, forwarders, the real POs, historical
shipments for analytics, one user per role, and an **open tender** on PO
4000004597 with five sealed bids. Default password: `Sha7ntec!Demo2026`.

### Verify the moat (optional but recommended)

```bash
npm run verify:rls
```

It signs in as two forwarders + procurement and proves neither forwarder can see
the other's bid and procurement can't read bids before close.

### Lock down auth

Supabase → **Authentication → Providers → Email** → turn **OFF** "Allow new
users to sign up". Accounts are admin-created only.

---

## 2. Run it locally (optional sanity check)

```bash
npm run dev
```

Open <http://localhost:3000> → sign in as `procurement@rasgirtas.demo` /
`Sha7ntec!Demo2026`. Open PO 4000004597 → close the tender → watch the sealed
reveal + anomaly flags.

> There's also a no-backend click-through at <http://localhost:3000/demo> that
> needs no Supabase at all.

---

## 3. Vercel — deploy

1. Push your branch to a **private** GitHub repo (if it isn't already).
2. Go to <https://vercel.com> → **Add New → Project** → import that repo.
3. Framework preset auto-detects **Next.js** — leave the defaults.
4. **Environment Variables** — add all five from `.env.local`, for both
   **Production** and **Preview**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - `OILPRICE_API_KEY`
5. **Deploy**. First build takes ~2 minutes.

### Point Supabase auth at the deployed URL

Supabase → **Authentication → URL Configuration** → add your Vercel URL (e.g.
`https://sha7ntec.vercel.app`) to **Redirect URLs** and **Site URL**. Without
this, login redirects fail in production.

### Custom domain

Vercel project → **Settings → Domains** → add `app.sha7ntec.com`, then create
the CNAME it shows you at your DNS provider. Add that domain to the Supabase
redirect URLs too.

---

## 4. Done — what "live" looks like

- App at your Vercel URL (and `app.sha7ntec.com` once DNS propagates).
- Sign in with any seeded demo account (each role lands on the right screen).
- Real PDF uploads → Supabase Storage; downloads via 60-second signed URLs.
- Closing a tender runs server-side, scans bids, snapshots the BDI, and calls
  Claude — none of those keys ever reach the browser.

## Costs

Free tiers cover a demo. Supabase free = 500 MB DB + 1 GB storage. Vercel
Hobby = fine for this. Anthropic + oilpriceapi are pay/'free-tier' per their
own limits. No other paid services — email, WhatsApp, and the SAP connector are
mocked in v1.

## Troubleshooting

- **Login does nothing / redirect loop** → Supabase redirect URLs missing the
  Vercel domain (step 3).
- **"new row violates row-level security"** on upload → migrations `0002`/`0004`
  not fully applied; re-run them.
- **Build fails on a server key** → a server-only secret was referenced in
  client code; `npm run check:keys` names the file.
- **BDI shows a stale value** → `OILPRICE_API_KEY` missing or rate-limited; this
  is by design and never blocks a tender.
