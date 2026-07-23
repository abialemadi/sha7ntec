import 'server-only';
import { createAdminClient } from './supabase/admin';
import type { UserRole } from './types';

// ============================================================
// Append-only audit log helper.
//
// The audit_log table has NO insert policy for end users — writes go through
// the service role only (spec §10, §18). Always call this from a server route
// or server action, never from the browser.
// ============================================================

export type AuditAction =
  | 'document.uploaded'
  | 'tender.opened'
  | 'bid.submitted'
  | 'bid.amended'
  | 'tender.closed'
  | 'award.made'
  | 'award.overridden'
  | 'delivery.confirmed'
  | 'goods.received'
  | 'payment.approved'
  | 'payment.posted_to_erp'
  | 'user.created'
  | 'admin.acted_as_role';

export interface WriteAuditParams {
  orgId: string;
  actorProfileId?: string | null;
  actorEmail?: string | null;
  actorRole?: UserRole | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string | null;
  poId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function writeAudit(params: WriteAuditParams): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('audit_log').insert({
    org_id: params.orgId,
    actor_profile_id: params.actorProfileId ?? null,
    actor_email: params.actorEmail ?? null,
    actor_role: params.actorRole ?? null,
    action: params.action,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    po_id: params.poId ?? null,
    metadata: params.metadata ?? null,
  });

  if (error) {
    // Audit failures must be loud. A silent audit gap undermines the moat.
    console.error('[audit] failed to write audit row', params.action, error.message);
    throw new Error(`Failed to write audit log: ${error.message}`);
  }
}
