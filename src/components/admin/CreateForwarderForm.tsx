'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Select } from '@/components/ui';
import type { FreightMode } from '@/lib/types';

export function CreateForwarderForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [modes, setModes] = useState<FreightMode>('sea');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const modeList: FreightMode[] = modes === 'both' ? ['sea', 'air'] : [modes];
    const res = await fetch('/api/admin/forwarders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, contactEmail, modes: modeList }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? 'Failed');
      return;
    }
    setName('');
    setContactEmail('');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Company name">
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Contact email">
        <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
      </Field>
      <Field label="Freight modes">
        <Select value={modes} onChange={(e) => setModes(e.target.value as FreightMode)}>
          <option value="sea">Sea</option>
          <option value="air">Air</option>
          <option value="both">Sea &amp; Air</option>
        </Select>
      </Field>
      {error && <p className="text-sm text-red">{error}</p>}
      <Button type="submit" disabled={busy}>
        {busy ? 'Adding…' : 'Add forwarder'}
      </Button>
    </form>
  );
}
