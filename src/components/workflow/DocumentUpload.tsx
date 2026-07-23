'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DocType } from '@/lib/types';
import { Button, Field, Select } from '@/components/ui';
import { MAX_FILE_BYTES, validateUpload } from '@/lib/storage';

// Upload form. `docTypes` restricts the selectable types (vendors upload
// shipping docs; forwarders upload delivery note / freight invoice).
export function DocumentUpload({
  poId,
  docTypes,
}: {
  poId: string;
  docTypes: { value: DocType; label: string }[];
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocType>(docTypes[0]?.value ?? 'other');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError('Choose a file.');
      return;
    }
    const v = validateUpload({ size: file.size, type: file.type });
    if (v) {
      setError(v);
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.append('file', file);
    form.append('poId', poId);
    form.append('docType', docType);
    const res = await fetch('/api/documents', { method: 'POST', body: form });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? 'Upload failed');
      return;
    }
    setFile(null);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Document type">
        <Select value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
          {docTypes.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="File" hint={`PDF, JPG or PNG · max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB`}>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-dim file:mr-3 file:rounded-md file:border-0 file:bg-blue file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
        />
      </Field>
      {error && <p className="text-sm text-red">{error}</p>}
      <Button type="submit" disabled={busy}>
        {busy ? 'Uploading…' : 'Upload document'}
      </Button>
    </form>
  );
}
