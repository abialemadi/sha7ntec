import type { PoStatus } from '@/lib/types';

// The seven stages (spec §8). Order is intentional: goods receipt (5) comes
// before delivery confirmation (6), mirroring the prototype.
export const STAGES = [
  { n: 1, label: 'Vendor Documents', role: 'vendor' },
  { n: 2, label: 'Shipment Ready', role: 'procurement' },
  { n: 3, label: 'Blind Tender', role: 'procurement' },
  { n: 4, label: 'Award & Connect', role: 'procurement' },
  { n: 5, label: 'Goods Receipt & SAP', role: 'warehouse' },
  { n: 6, label: 'Delivery Confirmation', role: 'forwarder' },
  { n: 7, label: 'Finance Payment', role: 'finance' },
] as const;

// Which stage number a PO status currently sits at.
export function stageForStatus(status: PoStatus): number {
  switch (status) {
    case 'draft':
    case 'docs_pending':
      return 1;
    case 'docs_received':
      return 2;
    case 'tender_open':
    case 'tender_closed':
      return 3;
    case 'awarded':
      return 4;
    case 'goods_received':
      return 5;
    case 'in_transit':
      return 6;
    case 'payment_pending':
    case 'paid':
      return 7;
    default:
      return 1;
  }
}

export function StageStepper({ status }: { status: PoStatus }) {
  const current = stageForStatus(status);
  const done = status === 'paid';

  return (
    <div className="rounded-xl border border-border bg-panel p-3 shadow-card">
      <ol className="flex items-center gap-1 overflow-x-auto pb-1">
        {STAGES.map((s, idx) => {
          const state = done || s.n < current ? 'done' : s.n === current ? 'active' : 'todo';
          return (
            <li key={s.n} className="flex shrink-0 items-center gap-1">
              {idx > 0 && (
                <span
                  className={
                    'h-0.5 w-4 rounded-full ' +
                    (state === 'todo' ? 'bg-border' : 'bg-gradient-to-r from-blue to-green')
                  }
                />
              )}
              <span
                className={
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ' +
                  (state === 'done'
                    ? 'border-green/30 bg-green/5 text-green'
                    : state === 'active'
                      ? 'border-blue/40 bg-blue/10 text-blue'
                      : 'border-border bg-panelAlt text-faint')
                }
              >
                <span
                  className={
                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px] ' +
                    (state === 'done'
                      ? 'bg-green text-white'
                      : state === 'active'
                        ? 'bg-blue text-white'
                        : 'bg-border text-dim')
                  }
                >
                  {state === 'done' ? '✓' : s.n}
                </span>
                <span className="whitespace-nowrap">{s.label}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
