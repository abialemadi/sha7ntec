// Small formatting helpers. Money is always shown in monospace with its
// currency (spec §11) — the mono styling is applied where these are rendered.

export function formatMoney(amount: number | null | undefined, currency = 'USD'): string {
  if (amount === null || amount === undefined) return '—';
  return `${currency} ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const PO_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  docs_pending: 'Docs Pending',
  docs_received: 'Docs Received',
  tender_open: 'Tender Open',
  tender_closed: 'Tender Closed',
  awarded: 'Awarded',
  in_transit: 'In Transit',
  goods_received: 'Goods Received',
  payment_pending: 'Payment Pending',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

export function poStatusLabel(status: string): string {
  return PO_STATUS_LABELS[status] ?? status;
}

export function titleCase(s: string): string {
  return s
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
