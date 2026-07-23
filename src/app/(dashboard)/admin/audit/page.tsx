import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth';
import { Panel, Badge } from '@/components/ui';
import { CsvExport } from '@/components/CsvExport';
import { formatDateTime } from '@/lib/format';
import type { AuditLogRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect('/login');
  if (profile.role !== 'admin') redirect('/dashboard');

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  const log = (rows ?? []) as AuditLogRow[];

  const csv = log.map((r) => [
    r.created_at,
    r.actor_email ?? '',
    r.actor_role ?? '',
    r.action,
    r.entity_type ?? '',
    r.entity_id ?? '',
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Audit log</h1>
          <p className="text-sm text-dim">Append-only. Every state-changing action is recorded here.</p>
        </div>
        <CsvExport
          filename="audit-log.csv"
          headers={['Timestamp', 'Actor', 'Role', 'Action', 'Entity', 'Entity ID']}
          rows={csv}
        />
      </div>

      <Panel title="Events" subtitle={`${log.length} most recent`}>
        {log.length === 0 ? (
          <p className="text-sm text-dim">No events yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                  <th className="pb-2 pr-4 font-medium">When</th>
                  <th className="pb-2 pr-4 font-medium">Actor</th>
                  <th className="pb-2 pr-4 font-medium">Action</th>
                  <th className="pb-2 font-medium">Entity</th>
                </tr>
              </thead>
              <tbody>
                {log.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 text-dim">{formatDateTime(r.created_at)}</td>
                    <td className="py-2 pr-4">
                      <div className="text-ink">{r.actor_email ?? '—'}</div>
                      {r.actor_role && <span className="text-xs text-faint">{r.actor_role}</span>}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge tone="blue">{r.action}</Badge>
                    </td>
                    <td className="py-2 text-dim">
                      {r.entity_type ?? '—'}
                      {r.entity_id && <span className="mono block text-xs text-faint">{r.entity_id}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
