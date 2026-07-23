'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { DocumentUpload } from '@/components/workflow/DocumentUpload';

// Stage 6: the winning forwarder uploads the delivery note + freight invoice
// and marks the shipment delivered.
export function DeliveryConfirm({
  poId,
  delivered,
}: {
  poId: string;
  delivered: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/deliveries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poId }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? 'Failed');
      return;
    }
    router.refresh();
  }

  if (delivered) {
    return <p className="text-sm text-green">Delivery confirmed. Thank you.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
          Upload proof of delivery
        </div>
        <DocumentUpload
          poId={poId}
          docTypes={[
            { value: 'delivery_note', label: 'Delivery Note' },
            { value: 'freight_invoice', label: 'Freight Invoice' },
          ]}
        />
      </div>
      {error && <p className="text-sm text-red">{error}</p>}
      <Button onClick={confirm} disabled={busy}>
        {busy ? 'Confirming…' : 'Mark as delivered'}
      </Button>
    </div>
  );
}
