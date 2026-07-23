// ============================================================
// Sha7ntec domain types.
//
// These mirror the SQL schema. In a real project you would generate this
// file with `supabase gen types typescript`; it is maintained by hand here
// so the repo is self-contained.
// ============================================================

export type UserRole =
  | 'admin'
  | 'procurement'
  | 'vendor'
  | 'forwarder'
  | 'warehouse'
  | 'finance';

export type PoStatus =
  | 'draft'
  | 'docs_pending'
  | 'docs_received'
  | 'tender_open'
  | 'tender_closed'
  | 'awarded'
  | 'in_transit'
  | 'goods_received'
  | 'payment_pending'
  | 'paid'
  | 'cancelled';

export type FreightMode = 'sea' | 'air' | 'both';
export type TenderStatus = 'open' | 'closed' | 'awarded' | 'cancelled';
export type BidStatus = 'submitted' | 'withdrawn' | 'won' | 'lost' | 'disqualified';
export type ReceiptCondition = 'good' | 'courier_damage' | 'material_damage' | 'missing_items';
export type DocType =
  | 'commercial_invoice'
  | 'packing_list'
  | 'certificate_of_origin'
  | 'test_certificate'
  | 'delivery_note'
  | 'freight_invoice'
  | 'other';
export type AnomalySeverity = 'normal' | 'review' | 'flagged';

export interface Organization {
  id: string;
  name: string;
  country: string | null;
  erp_system: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  org_id: string;
  role: UserRole;
  full_name: string | null;
  email: string;
  forwarder_id: string | null;
  vendor_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Vendor {
  id: string;
  org_id: string;
  name: string;
  contact_email: string | null;
  contact_person: string | null;
  country: string | null;
  created_at: string;
}

export interface Forwarder {
  id: string;
  org_id: string;
  name: string;
  contact_email: string | null;
  modes: FreightMode[];
  total_bids: number;
  total_wins: number;
  on_time_pct: number;
  avg_bid_amount: number;
  is_active: boolean;
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  org_id: string;
  po_number: string;
  vendor_id: string;
  status: PoStatus;
  cargo_description: string | null;
  total_value: number;
  currency: string;
  incoterm: string | null;
  origin_location: string | null;
  destination_location: string | null;
  hs_code: string | null;
  gross_weight_kg: number | null;
  packages_count: number | null;
  packages_description: string | null;
  promised_date: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PoLineItem {
  id: string;
  po_id: string;
  line_no: number;
  material_code: string | null;
  description: string | null;
  quantity: number | null;
  unit: string;
  unit_price: number | null;
  amount: number | null;
}

export interface DocumentRow {
  id: string;
  org_id: string;
  po_id: string;
  doc_type: DocType;
  file_name: string;
  storage_path: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface Tender {
  id: string;
  org_id: string;
  po_id: string;
  mode: FreightMode;
  status: TenderStatus;
  opened_at: string;
  closes_at: string | null;
  closed_at: string | null;
  opened_by: string | null;
  market_snapshot: MarketSnapshotJson | null;
  ai_summary: string | null;
}

export interface TenderInvitation {
  id: string;
  tender_id: string;
  forwarder_id: string;
  invited_at: string;
}

export interface AnomalyFlag {
  rule: string;
  message: string;
  severity: AnomalySeverity;
}

export interface Bid {
  id: string;
  org_id: string;
  tender_id: string;
  forwarder_id: string;
  amount: number;
  currency: string;
  transit_days: number | null;
  notes: string | null;
  status: BidStatus;
  submitted_by: string | null;
  submitted_at: string;
  anomaly_severity: AnomalySeverity | null;
  anomaly_flags: AnomalyFlag[] | null;
}

export interface Award {
  id: string;
  org_id: string;
  tender_id: string;
  bid_id: string;
  forwarder_id: string;
  awarded_amount: number;
  savings_vs_highest: number | null;
  cheapest_bid_skipped: boolean;
  skip_reason: string | null;
  awarded_by: string | null;
  awarded_at: string;
  connection_sent_at: string | null;
}

export interface Delivery {
  id: string;
  org_id: string;
  po_id: string;
  forwarder_id: string;
  delivered_at: string | null;
  confirmed_by: string | null;
  created_at: string;
}

export interface GoodsReceipt {
  id: string;
  org_id: string;
  po_id: string;
  condition: ReceiptCondition;
  missing_qty_note: string | null;
  keeper_note: string | null;
  has_discrepancy: boolean;
  received_by: string | null;
  received_at: string;
  sap_service_entry_ref: string | null;
  sap_posted_at: string | null;
}

export interface Payment {
  id: string;
  org_id: string;
  po_id: string;
  forwarder_id: string;
  amount: number;
  currency: string;
  match_delivery_note: boolean;
  match_invoice: boolean;
  match_goods_receipt: boolean;
  is_on_hold: boolean;
  hold_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  erp_payload: Record<string, unknown> | null;
  erp_posted_at: string | null;
  erp_reference: string | null;
}

export interface LandedCost {
  id: string;
  org_id: string;
  po_id: string;
  product_cost: number;
  freight_cost: number;
  duties: number;
  insurance: number;
  handling: number;
  total_landed_cost: number;
  calculated_at: string;
}

export interface Notification {
  id: string;
  org_id: string;
  recipient_profile_id: string | null;
  recipient_email: string | null;
  title: string;
  body: string | null;
  po_id: string | null;
  channel: string;
  is_read: boolean;
  sent_at: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: number;
  org_id: string;
  actor_profile_id: string | null;
  actor_email: string | null;
  actor_role: UserRole | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  po_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface MarketSnapshotJson {
  index_code: string;
  value: number;
  unit: string | null;
  source: string | null;
  fetched_at: string;
  stale?: boolean;
}
