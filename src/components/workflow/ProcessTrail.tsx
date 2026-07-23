import { Money } from '@/components/ui';

// "PO value under control" progress trail (MVP signature element). Shows the
// PO value and how far the shipment has moved from vendor upload to ERP posting.
export function ProcessTrail({
  value,
  currency = 'USD',
  stage,
  total = 7,
  done = false,
}: {
  value: number;
  currency?: string;
  stage: number;
  total?: number;
  done?: boolean;
}) {
  const pct = done ? 100 : Math.round(((stage - 1) / (total - 1)) * 100);
  return (
    <div className="rounded-xl border border-border bg-panel p-4 shadow-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="shrink-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">
            PO value under control
          </div>
          <div className="mono mt-1 text-xl font-bold text-navy">
            <Money amount={value} currency={currency} />
          </div>
        </div>
        <div className="flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue to-green transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] font-semibold text-faint">
            <span>Vendor Upload</span>
            <span>SAP Service Entry</span>
          </div>
        </div>
      </div>
    </div>
  );
}
