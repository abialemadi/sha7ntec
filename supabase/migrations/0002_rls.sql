-- ============================================================
-- Sha7ntec — Row Level Security
--
-- THE MOST IMPORTANT MIGRATION. The blind tender is the moat.
--
-- Two hard rules:
--   1. A forwarder can NEVER read another forwarder's bid.
--   2. Procurement can NEVER read any bid amount until the tender is closed.
--
-- Writes that must bypass RLS (tender close, anomaly writes, audit inserts,
-- forwarder-stats triggers) are performed with the service-role key from
-- server routes only — never from the browser.
-- ============================================================

alter table organizations       enable row level security;
alter table profiles            enable row level security;
alter table vendors             enable row level security;
alter table forwarders          enable row level security;
alter table purchase_orders     enable row level security;
alter table po_line_items       enable row level security;
alter table documents           enable row level security;
alter table tenders             enable row level security;
alter table tender_invitations  enable row level security;
alter table bids                enable row level security;
alter table awards              enable row level security;
alter table deliveries          enable row level security;
alter table goods_receipts      enable row level security;
alter table payments            enable row level security;
alter table landed_costs        enable row level security;
alter table notifications       enable row level security;
alter table audit_log           enable row level security;
alter table market_snapshots    enable row level security;

-- ============================================================
-- Helper functions (security definer so they can read profiles under RLS)
-- ============================================================
create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function auth_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid()
$$;

create or replace function auth_forwarder() returns uuid
language sql stable security definer set search_path = public as $$
  select forwarder_id from profiles where id = auth.uid()
$$;

create or replace function auth_vendor() returns uuid
language sql stable security definer set search_path = public as $$
  select vendor_id from profiles where id = auth.uid()
$$;

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
create policy org_read on organizations for select
using (id = auth_org());

-- ============================================================
-- PROFILES
-- ============================================================
-- Everyone can read their own profile.
create policy profiles_self on profiles for select
using (id = auth.uid());
-- Admins can read every profile in their org.
create policy profiles_admin_read on profiles for select
using (auth_role() = 'admin' and org_id = auth_org());

-- ============================================================
-- VENDORS
-- ============================================================
create policy vendors_internal on vendors for select
using (auth_role() in ('procurement','finance','warehouse','admin') and org_id = auth_org());
create policy vendors_self on vendors for select
using (auth_role() = 'vendor' and id = auth_vendor());

-- ============================================================
-- FORWARDERS
-- ============================================================
create policy forwarders_internal on forwarders for select
using (auth_role() in ('procurement','finance','admin') and org_id = auth_org());
create policy forwarders_self on forwarders for select
using (auth_role() = 'forwarder' and id = auth_forwarder());

-- ============================================================
-- PURCHASE ORDERS
-- ============================================================
create policy po_internal on purchase_orders for select
using (auth_role() in ('procurement','finance','warehouse','admin') and org_id = auth_org());

create policy po_vendor on purchase_orders for select
using (auth_role() = 'vendor' and vendor_id = auth_vendor());

create policy po_forwarder on purchase_orders for select
using (
  auth_role() = 'forwarder'
  and exists (
    select 1 from tenders t
    join tender_invitations i on i.tender_id = t.id
    where t.po_id = purchase_orders.id and i.forwarder_id = auth_forwarder()
  )
);

-- Procurement/admin manage POs.
create policy po_internal_write on purchase_orders for insert
with check (auth_role() in ('procurement','admin') and org_id = auth_org());
create policy po_internal_update on purchase_orders for update
using (auth_role() in ('procurement','admin') and org_id = auth_org());

-- ============================================================
-- PO LINE ITEMS (follow visibility of their PO)
-- ============================================================
create policy po_lines_read on po_line_items for select
using (exists (select 1 from purchase_orders p where p.id = po_line_items.po_id));
create policy po_lines_write on po_line_items for insert
with check (
  auth_role() in ('procurement','admin')
  and exists (select 1 from purchase_orders p where p.id = po_line_items.po_id and p.org_id = auth_org())
);

-- ============================================================
-- DOCUMENTS
-- ============================================================
create policy docs_read on documents for select
using (
  org_id = auth_org()
  and (
    auth_role() in ('procurement','finance','warehouse','admin')
    or exists (select 1 from purchase_orders p where p.id = documents.po_id and p.vendor_id = auth_vendor())
    or exists (
      select 1 from purchase_orders p
      join tenders t on t.po_id = p.id
      join awards a on a.tender_id = t.id
      where p.id = documents.po_id and a.forwarder_id = auth_forwarder()
    )
  )
);

create policy docs_vendor_insert on documents for insert
with check (
  auth_role() = 'vendor'
  and org_id = auth_org()
  and exists (select 1 from purchase_orders p where p.id = documents.po_id and p.vendor_id = auth_vendor())
);

-- Forwarder who won may upload delivery_note / freight_invoice.
create policy docs_forwarder_insert on documents for insert
with check (
  auth_role() = 'forwarder'
  and org_id = auth_org()
  and doc_type in ('delivery_note','freight_invoice')
  and exists (
    select 1 from purchase_orders p
    join tenders t on t.po_id = p.id
    join awards a on a.tender_id = t.id
    where p.id = documents.po_id and a.forwarder_id = auth_forwarder()
  )
);

create policy docs_internal_insert on documents for insert
with check (auth_role() in ('procurement','warehouse','admin') and org_id = auth_org());

-- ============================================================
-- TENDERS
-- ============================================================
create policy tenders_internal on tenders for select
using (auth_role() in ('procurement','finance','admin') and org_id = auth_org());
create policy tenders_forwarder on tenders for select
using (
  auth_role() = 'forwarder'
  and exists (
    select 1 from tender_invitations i
    where i.tender_id = tenders.id and i.forwarder_id = auth_forwarder()
  )
);
create policy tenders_write on tenders for insert
with check (auth_role() in ('procurement','admin') and org_id = auth_org());
-- Status changes to a tender happen server-side (service role). Client updates
-- by procurement are limited to still-open tenders (defense in depth).
create policy tenders_update on tenders for update
using (auth_role() in ('procurement','admin') and org_id = auth_org() and status = 'open');

-- ============================================================
-- TENDER INVITATIONS
-- ============================================================
create policy invites_internal on tender_invitations for select
using (
  auth_role() in ('procurement','admin')
  and exists (select 1 from tenders t where t.id = tender_invitations.tender_id and t.org_id = auth_org())
);
create policy invites_forwarder on tender_invitations for select
using (auth_role() = 'forwarder' and forwarder_id = auth_forwarder());
create policy invites_write on tender_invitations for insert
with check (
  auth_role() in ('procurement','admin')
  and exists (select 1 from tenders t where t.id = tender_invitations.tender_id and t.org_id = auth_org() and t.status = 'open')
);

-- ============================================================
-- BIDS  ** the core integrity **
-- ============================================================

-- READ: forwarder sees ONLY their own bid, ever.
create policy bids_forwarder_own on bids for select
using (
  auth_role() = 'forwarder'
  and forwarder_id = auth_forwarder()
);

-- READ: internal staff see bids ONLY after the tender is closed.
create policy bids_internal_after_close on bids for select
using (
  auth_role() in ('procurement','finance','admin')
  and org_id = auth_org()
  and exists (
    select 1 from tenders t
    where t.id = bids.tender_id
      and t.status in ('closed','awarded')
  )
);

-- INSERT: forwarder can submit one bid, only if invited, only while open.
create policy bids_forwarder_insert on bids for insert
with check (
  auth_role() = 'forwarder'
  and forwarder_id = auth_forwarder()
  and exists (
    select 1 from tenders t
    join tender_invitations i on i.tender_id = t.id
    where t.id = bids.tender_id
      and t.status = 'open'
      and i.forwarder_id = auth_forwarder()
  )
);

-- UPDATE: forwarder may amend their own bid only while the tender is open.
create policy bids_forwarder_update on bids for update
using (
  auth_role() = 'forwarder'
  and forwarder_id = auth_forwarder()
  and exists (select 1 from tenders t where t.id = bids.tender_id and t.status = 'open')
);

-- No DELETE policy = nobody can delete a bid. Intentional.

-- ============================================================
-- AWARDS
-- ============================================================
create policy awards_internal on awards for select
using (auth_role() in ('procurement','finance','warehouse','admin') and org_id = auth_org());
create policy awards_forwarder on awards for select
using (auth_role() = 'forwarder' and forwarder_id = auth_forwarder());
create policy awards_write on awards for insert
with check (auth_role() in ('procurement','admin') and org_id = auth_org());

-- ============================================================
-- DELIVERIES
-- ============================================================
create policy deliveries_internal on deliveries for select
using (auth_role() in ('procurement','finance','warehouse','admin') and org_id = auth_org());
create policy deliveries_forwarder on deliveries for select
using (auth_role() = 'forwarder' and forwarder_id = auth_forwarder());
create policy deliveries_forwarder_write on deliveries for insert
with check (
  auth_role() = 'forwarder'
  and org_id = auth_org()
  and exists (
    select 1 from purchase_orders p
    join tenders t on t.po_id = p.id
    join awards a on a.tender_id = t.id
    where p.id = deliveries.po_id and a.forwarder_id = auth_forwarder()
  )
);

-- ============================================================
-- GOODS RECEIPTS
-- ============================================================
create policy gr_internal on goods_receipts for select
using (auth_role() in ('procurement','finance','warehouse','admin') and org_id = auth_org());
create policy gr_warehouse_write on goods_receipts for insert
with check (auth_role() in ('warehouse','admin') and org_id = auth_org());

-- ============================================================
-- PAYMENTS
-- ============================================================
create policy payments_internal on payments for select
using (auth_role() in ('finance','procurement','admin') and org_id = auth_org());
create policy payments_forwarder on payments for select
using (auth_role() = 'forwarder' and forwarder_id = auth_forwarder());
create policy payments_finance_write on payments for insert
with check (auth_role() in ('finance','admin') and org_id = auth_org());
create policy payments_finance_update on payments for update
using (auth_role() in ('finance','admin') and org_id = auth_org());

-- ============================================================
-- LANDED COSTS
-- ============================================================
create policy landed_internal on landed_costs for select
using (auth_role() in ('procurement','finance','admin') and org_id = auth_org());
create policy landed_write on landed_costs for insert
with check (auth_role() in ('procurement','finance','admin') and org_id = auth_org());

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
create policy notif_own on notifications for select
using (recipient_profile_id = auth.uid());
create policy notif_own_update on notifications for update
using (recipient_profile_id = auth.uid());

-- ============================================================
-- AUDIT LOG (read-only for admin; inserts via service role only)
-- ============================================================
create policy audit_admin_read on audit_log for select
using (auth_role() = 'admin' and org_id = auth_org());
-- No insert/update/delete policies. All writes go through the service role.

-- ============================================================
-- MARKET SNAPSHOTS (read for any authenticated internal user)
-- ============================================================
create policy market_read on market_snapshots for select
using (auth.uid() is not null);
