-- ============================================================
-- Sha7ntec — core schema
-- Multi-tenant-ready: every business table carries org_id.
-- Run in the Supabase SQL editor (or via the Supabase CLI).
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================
create type user_role as enum ('admin','procurement','vendor','forwarder','warehouse','finance');
create type po_status as enum ('draft','docs_pending','docs_received','tender_open','tender_closed','awarded','in_transit','goods_received','payment_pending','paid','cancelled');
create type freight_mode as enum ('sea','air','both');
create type tender_status as enum ('open','closed','awarded','cancelled');
create type bid_status as enum ('submitted','withdrawn','won','lost','disqualified');
create type receipt_condition as enum ('good','courier_damage','material_damage','missing_items');
create type doc_type as enum ('commercial_invoice','packing_list','certificate_of_origin','test_certificate','delivery_note','freight_invoice','other');
create type anomaly_severity as enum ('normal','review','flagged');

-- ============================================================
-- ORGANIZATIONS (multi-tenant root)
-- ============================================================
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text default 'Qatar',
  erp_system text default 'SAP S/4HANA',
  created_at timestamptz default now()
);

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id),
  role user_role not null,
  full_name text,
  email text not null,
  forwarder_id uuid,
  vendor_id uuid,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ============================================================
-- COUNTERPARTIES
-- ============================================================
create table vendors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  contact_email text,
  contact_person text,
  country text,
  created_at timestamptz default now()
);

create table forwarders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  contact_email text,
  modes freight_mode[] default '{sea}',
  total_bids int default 0,
  total_wins int default 0,
  on_time_pct numeric(5,2) default 0,
  avg_bid_amount numeric(14,2) default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

alter table profiles add constraint fk_forwarder foreign key (forwarder_id) references forwarders(id);
alter table profiles add constraint fk_vendor foreign key (vendor_id) references vendors(id);

-- ============================================================
-- PURCHASE ORDERS
-- ============================================================
create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  po_number text not null,
  vendor_id uuid not null references vendors(id),
  status po_status default 'docs_pending',
  cargo_description text,
  total_value numeric(14,2) not null,
  currency text default 'USD',
  incoterm text,
  origin_location text,
  destination_location text,
  hs_code text,
  gross_weight_kg numeric(10,2),
  packages_count int,
  packages_description text,
  promised_date date,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  unique (org_id, po_number)
);

create table po_line_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references purchase_orders(id) on delete cascade,
  line_no int not null,
  material_code text,
  description text,
  quantity numeric(12,2),
  unit text default 'EA',
  unit_price numeric(14,2),
  amount numeric(14,2)
);

-- ============================================================
-- DOCUMENTS (metadata; files live in Supabase Storage)
-- ============================================================
create table documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  po_id uuid not null references purchase_orders(id) on delete cascade,
  doc_type doc_type not null,
  file_name text not null,
  storage_path text not null,
  file_size_bytes bigint,
  mime_type text,
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz default now()
);

-- ============================================================
-- TENDERS
-- ============================================================
create table tenders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  po_id uuid not null references purchase_orders(id) on delete cascade,
  mode freight_mode not null,
  status tender_status default 'open',
  opened_at timestamptz default now(),
  closes_at timestamptz,
  closed_at timestamptz,
  opened_by uuid references profiles(id),
  market_snapshot jsonb,
  ai_summary text,
  unique (po_id)
);

create table tender_invitations (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references tenders(id) on delete cascade,
  forwarder_id uuid not null references forwarders(id),
  invited_at timestamptz default now(),
  unique (tender_id, forwarder_id)
);

-- ============================================================
-- BIDS  ** SEALED — see RLS migration, this is the core integrity **
-- ============================================================
create table bids (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  tender_id uuid not null references tenders(id) on delete cascade,
  forwarder_id uuid not null references forwarders(id),
  amount numeric(14,2) not null,
  currency text default 'USD',
  transit_days int,
  notes text,
  status bid_status default 'submitted',
  submitted_by uuid references profiles(id),
  submitted_at timestamptz default now(),
  anomaly_severity anomaly_severity,
  anomaly_flags jsonb,
  unique (tender_id, forwarder_id)
);

-- ============================================================
-- AWARD
-- ============================================================
create table awards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  tender_id uuid not null references tenders(id) on delete cascade,
  bid_id uuid not null references bids(id),
  forwarder_id uuid not null references forwarders(id),
  awarded_amount numeric(14,2) not null,
  savings_vs_highest numeric(14,2),
  cheapest_bid_skipped boolean default false,
  skip_reason text,
  awarded_by uuid references profiles(id),
  awarded_at timestamptz default now(),
  connection_sent_at timestamptz
);

-- ============================================================
-- DELIVERY / RECEIPT / PAYMENT
-- ============================================================
create table deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  po_id uuid not null references purchase_orders(id) on delete cascade,
  forwarder_id uuid not null references forwarders(id),
  delivered_at timestamptz,
  confirmed_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table goods_receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  po_id uuid not null references purchase_orders(id) on delete cascade,
  condition receipt_condition not null,
  missing_qty_note text,
  keeper_note text,
  has_discrepancy boolean generated always as (condition <> 'good') stored,
  received_by uuid references profiles(id),
  received_at timestamptz default now(),
  sap_service_entry_ref text,
  sap_posted_at timestamptz
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  po_id uuid not null references purchase_orders(id) on delete cascade,
  forwarder_id uuid not null references forwarders(id),
  amount numeric(14,2) not null,
  currency text default 'USD',
  match_delivery_note boolean default false,
  match_invoice boolean default false,
  match_goods_receipt boolean default false,
  is_on_hold boolean default false,
  hold_reason text,
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  erp_payload jsonb,
  erp_posted_at timestamptz,
  erp_reference text
);

-- ============================================================
-- LANDED COST
-- ============================================================
create table landed_costs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  po_id uuid not null references purchase_orders(id) on delete cascade,
  product_cost numeric(14,2) default 0,
  freight_cost numeric(14,2) default 0,
  duties numeric(14,2) default 0,
  insurance numeric(14,2) default 0,
  handling numeric(14,2) default 0,
  total_landed_cost numeric(14,2) generated always as
    (product_cost + freight_cost + duties + insurance + handling) stored,
  calculated_at timestamptz default now()
);

-- ============================================================
-- NOTIFICATIONS (email-ready; v1 just writes rows)
-- ============================================================
create table notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  recipient_profile_id uuid references profiles(id),
  recipient_email text,
  title text not null,
  body text,
  po_id uuid references purchase_orders(id),
  channel text default 'in_app',
  is_read boolean default false,
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================================
-- AUDIT LOG (immutable)
-- ============================================================
create table audit_log (
  id bigserial primary key,
  org_id uuid not null references organizations(id),
  actor_profile_id uuid references profiles(id),
  actor_email text,
  actor_role user_role,
  action text not null,
  entity_type text,
  entity_id uuid,
  po_id uuid references purchase_orders(id),
  metadata jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- MARKET DATA CACHE (BDI etc.)
-- ============================================================
create table market_snapshots (
  id bigserial primary key,
  index_code text not null,
  value numeric(14,4) not null,
  unit text,
  source text,
  fetched_at timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index on purchase_orders (org_id, status);
create index on documents (po_id);
create index on bids (tender_id);
create index on tender_invitations (forwarder_id);
create index on notifications (recipient_profile_id, is_read);
create index on audit_log (org_id, created_at desc);
