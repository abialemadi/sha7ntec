'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Input, Select } from '@/components/ui';
import type { Forwarder, UserRole, Vendor } from '@/lib/types';

const ROLES: UserRole[] = ['procurement', 'finance', 'warehouse', 'vendor', 'forwarder', 'admin'];

export function CreateUserForm({
  forwarders,
  vendors,
}: {
  forwarders: Forwarder[];
  vendors: Vendor[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('procurement');
  const [forwarderId, setForwarderId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        fullName,
        role,
        forwarderId: role === 'forwarder' ? forwarderId : undefined,
        vendorId: role === 'vendor' ? vendorId : undefined,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? 'Failed');
      return;
    }
    setMsg(`Created ${email}`);
    setEmail('');
    setPassword('');
    setFullName('');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Full name">
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </Field>
      <Field label="Email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Temporary password" hint="Share securely; there is no self-service reset in v1.">
        <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <Field label="Role">
        <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </Field>
      {role === 'forwarder' && (
        <Field label="Linked forwarder company">
          <Select value={forwarderId} onChange={(e) => setForwarderId(e.target.value)} required>
            <option value="">Select…</option>
            {forwarders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {role === 'vendor' && (
        <Field label="Linked vendor company">
          <Select value={vendorId} onChange={(e) => setVendorId(e.target.value)} required>
            <option value="">Select…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {error && <p className="text-sm text-red">{error}</p>}
      {msg && <p className="text-sm text-green">{msg}</p>}
      <Button type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create user'}
      </Button>
    </form>
  );
}
