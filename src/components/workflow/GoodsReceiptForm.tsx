'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Textarea, SimulatedTag } from '@/components/ui';
import type { GoodsReceipt, ReceiptCondition } from '@/lib/types';

const CONDITIONS: { value: ReceiptCondition; label: string; icon: string; desc: string; accent: string }[] = [
  { value: 'good', label: 'Good condition', icon: '✅', desc: 'All items received intact and as ordered.', accent: 'green' },
  { value: 'courier_damage', label: 'Courier / package damage', icon: '📦', desc: 'Outer packaging damaged in transit.', accent: 'amber' },
  { value: 'material_damage', label: 'Material damaged', icon: '🔴', desc: 'Goods themselves are damaged or defective.', accent: 'red' },
  { value: 'missing_items', label: 'Missing items', icon: '📋', desc: 'Quantity received is short of the packing list.', accent: 'violet' },
];

const ACCENT_RING: Record<string, string> = {
  green: 'border-green bg-green/10',
  amber: 'border-amber bg-amber/10',
  red: 'border-red bg-red/10',
  violet: 'border-violet bg-violet/10',
};

export function GoodsReceiptForm({ poId, existing }: { poId: string; existing: GoodsReceipt | null }) {
  const router = useRouter();
  const [condition, setCondition] = useState<ReceiptCondition>('good');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (existing) {
    return (
      <div className="space-y-2 text-sm">
        <div>
          Condition:{' '}
          <span className={existing.has_discrepancy ? 'font-medium text-red' : 'font-medium text-green'}>
            {existing.condition.replace(/_/g, ' ')}
          </span>
        </div>
        {existing.keeper_note && <div className="text-dim">Note: {existing.keeper_note}</div>}
        <div className="flex items-center gap-2 text-dim">
          SAP service entry:{' '}
          <span className="mono text-ink">{existing.sap_service_entry_ref}</span>
          <SimulatedTag>simulated SAP posting</SimulatedTag>
        </div>
      </div>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/goods-receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poId, condition, keeperNote: note || undefined }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? 'Failed to record receipt');
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 text-xs font-semibold text-dim">Receiving condition</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CONDITIONS.map((c) => {
            const active = condition === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setCondition(c.value)}
                className={
                  'flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ' +
                  (active ? ACCENT_RING[c.accent] : 'border-border bg-panelAlt hover:bg-border/30')
                }
              >
                <span className="text-lg leading-none">{c.icon}</span>
                <span>
                  <span className={'block text-sm font-bold ' + (active ? 'text-ink' : 'text-navy')}>
                    {c.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-dim">{c.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <Field label="Store keeper note (optional)">
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error && <p className="text-sm text-red">{error}</p>}
      <Button onClick={submit} disabled={busy}>
        {busy ? 'Posting…' : 'Record receipt & post SAP service entry'}
      </Button>
    </div>
  );
}
