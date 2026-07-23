'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Badge, Money, AnomalyBadge, Panel, Field, Select, SimulatedTag } from '@/components/ui';
import { recommendAward, type AwardCandidate } from '@/lib/anomaly';
import { WhatsAppMock } from '@/components/workflow/WhatsAppMock';
import { formatDateTime } from '@/lib/format';
import type { Bid, Forwarder, FreightMode, Award, Tender, MarketSnapshotJson } from '@/lib/types';

interface Props {
  poId: string;
  tender: Tender | null;
  eligibleForwarders: Forwarder[];
  invitedForwarderIds: string[];
  bids: Bid[]; // empty while sealed (RLS); populated after close
  award: Award | null;
  forwarderNames: Record<string, string>;
}

const MODE_META: { key: FreightMode; label: string; icon: string; desc: string; transit: string }[] = [
  { key: 'sea', label: 'Sea Freight', icon: '🚢', desc: 'Ocean FCL/LCL — high-volume, non-urgent.', transit: '3–7 days' },
  { key: 'air', label: 'Air Freight', icon: '✈️', desc: 'Air cargo — urgent, high-value.', transit: '1–3 days' },
  { key: 'both', label: 'Both Modes', icon: '🚢✈️', desc: 'Invite sea + air to compete.', transit: '1–7 days' },
];

// Supplementary lane benchmarks shown alongside the live BDI at close. These
// are estimates (not a live feed) and are labelled as such in the UI.
const LANE_BENCHMARKS = [
  { name: 'Gulf–UAE Lane (FEU)', value: '41,200', unit: 'USD/FEU' },
  { name: 'Bunker Fuel VLSFO', value: '498', unit: 'USD/MT' },
  { name: 'Jebel Ali Congestion', value: '1.2', unit: 'days delay' },
];

export function TenderPanel(props: Props) {
  const { tender } = props;
  if (!tender) return <OpenTenderForm poId={props.poId} forwarders={props.eligibleForwarders} />;
  if (tender.status === 'open') return <OpenTenderState {...props} tender={tender} />;
  return <ClosedTenderState {...props} tender={tender} />;
}

// ---------------- Open a new tender ----------------
function OpenTenderForm({ poId, forwarders }: { poId: string; forwarders: Forwarder[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<FreightMode>('sea');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible = forwarders.filter(
    (f) => f.is_active && (mode === 'both' || f.modes.includes(mode) || f.modes.includes('both')),
  );

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function open() {
    if (selected.length === 0) {
      setError('Invite at least one forwarder.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch('/api/tenders/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poId, mode, forwarderIds: selected }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? 'Failed to open tender');
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-xs font-semibold text-dim">Select freight mode</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {MODE_META.map((m) => {
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={
                  'rounded-lg border p-3 text-left transition-colors ' +
                  (active ? 'border-blue bg-blue/10' : 'border-border bg-panelAlt hover:bg-border/30')
                }
              >
                <div className="text-xl">{m.icon}</div>
                <div className={'mt-1 text-sm font-bold ' + (active ? 'text-blue' : 'text-navy')}>
                  {m.label}
                </div>
                <div className="mt-0.5 text-xs text-dim">{m.desc}</div>
                <div className="mt-1 text-[11px] font-medium text-faint">⏱ {m.transit}</div>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold text-dim">
          Invite forwarders ({selected.length} selected)
        </div>
        <div className="space-y-1.5">
          {eligible.map((f) => (
            <label
              key={f.id}
              className="flex cursor-pointer items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-panelAlt"
            >
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(f.id)}
                  onChange={() => toggle(f.id)}
                />
                {f.name}
              </span>
              <span className="text-xs text-faint">
                {f.total_wins} wins · {f.on_time_pct}% on-time
              </span>
            </label>
          ))}
          {eligible.length === 0 && (
            <p className="text-sm text-dim">No active forwarders support this mode.</p>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-red">{error}</p>}
      <Button onClick={open} disabled={busy}>
        {busy ? 'Opening…' : 'Open sealed tender'}
      </Button>
    </div>
  );
}

// ---------------- Tender open: sealed ----------------
function OpenTenderState({
  tender,
  invitedForwarderIds,
  forwarderNames,
}: Props & { tender: Tender }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    if (!confirm('Close the tender and reveal all sealed bids? This cannot be undone.')) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tenders/${tender.id}/close`, { method: 'POST' });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? 'Failed to close tender');
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-violet/30 bg-violet/10 p-3 text-sm text-violet">
        <strong>Sealed.</strong> Bids are hidden until you close the tender. You cannot see how many
        forwarders have bid, or any amounts — enforced by the database, not just this screen.
      </div>
      <div>
        <div className="mb-2 text-xs font-medium text-dim">
          Invited forwarders ({invitedForwarderIds.length})
        </div>
        <div className="flex flex-wrap gap-2">
          {invitedForwarderIds.map((id) => (
            <Badge key={id} tone="violet">
              {forwarderNames[id] ?? id}
            </Badge>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-red">{error}</p>}
      <Button onClick={close} disabled={busy}>
        {busy ? 'Closing & revealing…' : 'Close tender & reveal bids'}
      </Button>
    </div>
  );
}

// ---------------- Tender closed: revealed ----------------
function ClosedTenderState({
  tender,
  bids,
  award,
  forwarderNames,
}: Props & { tender: Tender }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrideBidId, setOverrideBidId] = useState<string>('');

  const candidates: AwardCandidate[] = bids.map((b) => ({
    bidId: b.id,
    forwarderId: b.forwarder_id,
    amount: Number(b.amount),
    severity: b.anomaly_severity ?? 'normal',
  }));
  const rec = recommendAward(candidates);
  const sorted = [...bids].sort((a, b) => Number(a.amount) - Number(b.amount));
  const snapshot = tender.market_snapshot as MarketSnapshotJson | null;

  async function doAward(bidId?: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tenders/${tender.id}/award`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bidId }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? 'Failed to award');
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {snapshot && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-dim">
            📈 Freight market index intelligence
            {snapshot.stale ? <Badge tone="amber">stale cache</Badge> : <Badge tone="green">live</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-green/25 bg-green/5 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">
                Baltic Dry Index
              </div>
              <div className="mono mt-1 text-xl font-bold text-navy">
                {Number(snapshot.value).toLocaleString()}
              </div>
              <div className="text-[11px] text-faint">{snapshot.unit ?? 'pts'} · Baltic Exchange</div>
            </div>
            {LANE_BENCHMARKS.map((b) => (
              <div key={b.name} className="rounded-lg border border-border bg-panelAlt p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">
                  {b.name}
                </div>
                <div className="mono mt-1 text-lg font-bold text-navy">{b.value}</div>
                <div className="flex items-center gap-1 text-[11px] text-faint">
                  {b.unit} <SimulatedTag>estimate</SimulatedTag>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tender.ai_summary && (
        <div className="rounded-md border border-blue/20 bg-blue/5 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-blue">
            Market intelligence <Badge tone="blue">AI-assisted (rules-based)</Badge>
          </div>
          <p className="text-sm text-ink">{tender.ai_summary}</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-faint">
              <th className="pb-2 pr-4 font-medium">Forwarder</th>
              <th className="pb-2 pr-4 font-medium">Amount</th>
              <th className="pb-2 pr-4 font-medium">Transit</th>
              <th className="pb-2 font-medium">Screening</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => {
              const isRec = b.id === rec.recommendedBidId;
              const isWinner = award?.bid_id === b.id;
              return (
                <tr key={b.id} className="border-b border-border/60 align-top last:border-0">
                  <td className="py-2 pr-4">
                    <div className="font-medium text-ink">{forwarderNames[b.forwarder_id] ?? '—'}</div>
                    {isRec && !award && (
                      <span className="text-xs font-medium text-green">Recommended</span>
                    )}
                    {isWinner && <Badge tone="green">Awarded</Badge>}
                  </td>
                  <td className="py-2 pr-4">
                    <Money amount={Number(b.amount)} currency={b.currency} />
                  </td>
                  <td className="py-2 pr-4 text-dim">{b.transit_days ?? '—'} d</td>
                  <td className="py-2">
                    <div className="space-y-1">
                      <AnomalyBadge severity={b.anomaly_severity} />
                      {b.anomaly_flags?.map((f, i) => (
                        <div key={i} className="text-xs text-dim">
                          {f.message}
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rec.cheapestBidSkipped && !award && (
        <div className="rounded-md border border-amber/30 bg-amber/10 p-3 text-sm text-amber">
          The cheapest bid was flagged and skipped. Recommendation is the lowest qualified bid.
        </div>
      )}

      {award ? (
        <div className="space-y-4">
          <div className="rounded-md border border-green/30 bg-green/10 p-3 text-sm text-green">
            Awarded to <strong>{forwarderNames[award.forwarder_id]}</strong> ·{' '}
            <Money amount={Number(award.awarded_amount)} /> · saved{' '}
            <Money amount={Number(award.savings_vs_highest ?? 0)} /> vs the highest bid.
            {award.connection_sent_at && (
              <span className="ml-2 inline-flex items-center gap-1">
                Connection sent <SimulatedTag>simulated email</SimulatedTag>
              </span>
            )}
          </div>
          <WhatsAppMock
            title={`📦 PO awarded — ${forwarderNames[award.forwarder_id]}`}
            lines={[
              `Won the tender at USD ${Number(award.awarded_amount).toLocaleString()}.`,
              'Coordinate pickup directly. Tracking is now live.',
            ]}
            time="14:32"
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <Button onClick={() => doAward()} disabled={busy || !rec.recommendedBidId}>
            {busy ? 'Awarding…' : 'Award recommended bid'}
          </Button>
          <div className="flex items-end gap-2">
            <Field label="Or override">
              <Select value={overrideBidId} onChange={(e) => setOverrideBidId(e.target.value)}>
                <option value="">Choose a bid…</option>
                {sorted.map((b) => (
                  <option key={b.id} value={b.id}>
                    {forwarderNames[b.forwarder_id]} — {b.currency} {Number(b.amount).toLocaleString()}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              variant="secondary"
              disabled={busy || !overrideBidId}
              onClick={() => doAward(overrideBidId)}
            >
              Override & award
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red">{error}</p>}
      <p className="text-xs text-faint">Tender closed {formatDateTime(tender.closed_at)}. Overrides are written to the audit log.</p>
    </div>
  );
}
