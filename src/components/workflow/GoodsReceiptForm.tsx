'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Select, Textarea, SimulatedTag } from '@/components/ui';
import type { GoodsReceipt, ReceiptCondition } from '@/lib/types';

const CONDITIONS: { value: ReceiptCondition; label: string }[] = [
  { value: 'good', label: 'Good — no issues' },
  { value: 'courier_damage', label: 'Courier damage' },
  { value: 'material_damage', label: 'Material damage' },
  { value: 'missing_items', label: 'Missing items' },
];

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
      <Field label="Condition on receipt">
        <Select value={condition} onChange={(e) => setCondition(e.target.value as ReceiptCondition)}>
          {CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
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
