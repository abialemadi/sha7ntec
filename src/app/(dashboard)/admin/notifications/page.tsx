import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth';
import { Panel, Badge, SimulatedTag } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { Notification } from '@/lib/types';

export const dynamic = 'force-dynamic';

const CHANNEL_TONE: Record<string, 'blue' | 'green' | 'violet'> = {
  in_app: 'blue',
  email: 'green',
  whatsapp: 'violet',
};

export default async function NotificationsPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'admin') redirect('/dashboard');

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  const notifications = (rows ?? []) as Notification[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-navy">Notification centre</h1>
        <p className="text-sm text-dim">
          Every notification Sha7ntec has raised. Email &amp; WhatsApp delivery is simulated in v1 —
          rows are written but not actually sent (Resend swaps in for phase 2).
        </p>
      </div>

      <Panel title="Notifications" subtitle={`${notifications.length} most recent`}>
        {notifications.length === 0 ? (
          <p className="text-sm text-dim">No notifications yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {notifications.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{n.title}</span>
                    {!n.is_read && <Badge tone="blue">unread</Badge>}
                  </div>
                  {n.body && <p className="mt-0.5 text-sm text-dim">{n.body}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-faint">
                    <span>{n.recipient_email ?? 'in-app'}</span>
                    <span>·</span>
                    <span>{formatDateTime(n.created_at)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge tone={CHANNEL_TONE[n.channel] ?? 'neutral'}>{n.channel}</Badge>
                  {n.channel !== 'in_app' && n.sent_at === null && (
                    <SimulatedTag>not actually sent</SimulatedTag>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
