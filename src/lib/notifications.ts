import 'server-only';
import { createAdminClient } from './supabase/admin';

// ============================================================
// Mocked email (spec §9). v1 only writes a notifications row and leaves
// sent_at null. Phase 2 swaps in Resend and sets sent_at.
//
// The UI labels these as "simulated" so no one mistakes a stored row for a
// delivered email (spec §18.5).
// ============================================================

export interface NotifyParams {
  orgId: string;
  recipientProfileId?: string | null;
  recipientEmail?: string | null;
  title: string;
  body?: string;
  poId?: string | null;
  channel?: 'in_app' | 'email' | 'whatsapp';
}

export async function notify(params: NotifyParams): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('notifications').insert({
    org_id: params.orgId,
    recipient_profile_id: params.recipientProfileId ?? null,
    recipient_email: params.recipientEmail ?? null,
    title: params.title,
    body: params.body ?? null,
    po_id: params.poId ?? null,
    channel: params.channel ?? 'in_app',
    sent_at: null, // mocked — never actually sent in v1
  });
  if (error) {
    console.error('[notify] failed to write notification', error.message);
  }
}
