'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Badge, Money, SimulatedTag } from '@/components/ui';
import type { Payment } from '@/lib/types';

function MatchRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-dim">{label}</span>
      {ok ? <Badge tone="green">match</Badge> : <Badge tone="red">missing</Badge>}
    </div>
  );
}

export function PaymentPanel({ poId, payment }: { poId: string; payment: Payment | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runMatchAndApprove() {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/payments/approve', {
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

  async function postToErp() {
    if (!payment) return;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/erp/post-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId: payment.id }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? 'Failed');
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {payment ? (
        <>
          <div className="space-y-2 rounded-md border border-border bg-panelAlt p-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">
              Three-way match
            </div>
            <MatchRow ok={payment.match_delivery_note} label="Delivery note" />
            <MatchRow ok={payment.match_invoice} label="Freight / commercial invoice" />
            <MatchRow ok={payment.match_goods_receipt} label="Goods receipt (good condition)" />
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-dim">Freight payable</span>
            <Money amount={Number(payment.amount)} currency={payment.currency} />
          </div>

          {payment.is_on_hold ? (
            <div className="rounded-md border border-red/30 bg-red/10 p-3 text-sm text-red">
              Payment on hold — {payment.hold_reason}. Resolve the missing items, then re-run the match.
            </div>
          ) : payment.approved_at ? (
            <div className="rounded-md border border-green/30 bg-green/10 p-3 text-sm text-green">
              Approved. Ready to post to ERP.
            </div>
          ) : null}

          {payment.erp_posted_at ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-green">
                Posted to ERP · reference <span className="mono text-ink">{payment.erp_reference}</span>
                <SimulatedTag>simulated SAP posting</SimulatedTag>
              </div>
              {payment.erp_payload && (
                <details className="overflow-hidden rounded-lg border border-navy/40 bg-navy" open>
                  <summary className="cursor-pointer px-4 py-2 text-xs font-semibold text-[#5BB8F5]">
                    {'// SAP S/4HANA — Supplier Invoice payload'}
                  </summary>
                  <pre className="overflow-x-auto px-4 pb-4 font-mono text-xs leading-relaxed text-[#AFC3D6]">
                    {JSON.stringify(payment.erp_payload, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ) : (
            !payment.is_on_hold &&
            payment.approved_at && (
              <Button onClick={postToErp} disabled={busy}>
                {busy ? 'Posting…' : 'Post payment to ERP (SAP)'}
              </Button>
            )
          )}

          {payment.is_on_hold && (
            <Button variant="secondary" onClick={runMatchAndApprove} disabled={busy}>
              {busy ? 'Re-checking…' : 'Re-run three-way match'}
            </Button>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-dim">
            Run the three-way match to reconcile the delivery note, invoice and goods receipt before
            approving payment.
          </p>
          {error && <p className="text-sm text-red">{error}</p>}
          <Button onClick={runMatchAndApprove} disabled={busy}>
            {busy ? 'Matching…' : 'Run three-way match & approve'}
          </Button>
        </>
      )}
      {error && payment && <p className="text-sm text-red">{error}</p>}
    </div>
  );
}
