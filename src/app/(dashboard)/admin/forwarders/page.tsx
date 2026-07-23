import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth';
import { Panel, Badge, Money } from '@/components/ui';
import { CreateForwarderForm } from '@/components/admin/CreateForwarderForm';
import type { Forwarder } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminForwardersPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect('/login');
  if (!['admin', 'procurement'].includes(profile.role)) redirect('/dashboard');

  const supabase = await createClient();
  const { data: forwarders } = await supabase.from('forwarders').select('*').order('name');
  const list = (forwarders ?? []) as Forwarder[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Forwarders</h1>
        <p className="text-sm text-dim">Freight forwarders eligible to bid on sealed tenders.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <Panel title="Forwarders" subtitle={`${list.length} companies`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Modes</th>
                    <th className="pb-2 pr-4 font-medium">Bids</th>
                    <th className="pb-2 pr-4 font-medium">Wins</th>
                    <th className="pb-2 pr-4 font-medium">On-time</th>
                    <th className="pb-2 font-medium">Avg bid</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((f) => (
                    <tr key={f.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-4 font-medium text-ink">{f.name}</td>
                      <td className="py-2 pr-4">
                        <span className="flex gap-1">
                          {f.modes.map((m) => (
                            <Badge key={m} tone="violet">
                              {m}
                            </Badge>
                          ))}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-dim">{f.total_bids}</td>
                      <td className="py-2 pr-4 text-dim">{f.total_wins}</td>
                      <td className="py-2 pr-4 text-dim">{f.on_time_pct}%</td>
                      <td className="py-2">
                        <Money amount={Number(f.avg_bid_amount)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
        <Panel title="Add forwarder">
          <CreateForwarderForm />
        </Panel>
      </div>
    </div>
  );
}
