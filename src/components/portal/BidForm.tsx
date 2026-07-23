'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Textarea, Money } from '@/components/ui';
import type { Bid } from '@/lib/types';

// Forwarder submits or amends their ONE sealed bid. They never see anything
// about other bids — not even how many exist.
export function BidForm({ tenderId, existing }: { tenderId: string; existing: Bid | null }) {
  const router = useRouter();
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [transit, setTransit] = useState(existing?.transit_days ? String(existing.transit_days) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    const res = await fetch('/api/bids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenderId,
        amount: Number(amount),
        transitDays: transit ? Number(transit) : undefined,
        notes: notes || undefined,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? 'Failed to submit bid');
      return;
    }
    setMsg(json.amended ? 'Bid amended.' : 'Sealed bid submitted.');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="rounded-md border border-violet/30 bg-violet/10 p-3 text-xs text-violet">
        Your bid is sealed. Other forwarders cannot see it, and procurement cannot see any bid until
        the tender closes.
      </div>
      {existing && (
        <div className="text-sm text-dim">
          Current bid: <Money amount={Number(existing.amount)} currency={existing.currency} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bid amount (USD)">
          <Input
            type="number"
            min="1"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </Field>
        <Field label="Transit days">
          <Input type="number" min="1" value={transit} onChange={(e) => setTransit(e.target.value)} />
        </Field>
      </div>
      <Field label="Notes (optional)">
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && <p className="text-sm text-red">{error}</p>}
      {msg && <p className="text-sm text-green">{msg}</p>}
      <Button type="submit" disabled={busy}>
        {busy ? 'Submitting…' : existing ? 'Amend bid' : 'Submit sealed bid'}
      </Button>
    </form>
  );
}
