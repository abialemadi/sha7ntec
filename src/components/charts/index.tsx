import * as React from 'react';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// Horizontal bar row — label on the left, value on the right, gradient fill.
export function HBar({
  label,
  value,
  max,
  right,
  gradient = 'from-blue to-green',
  sub,
}: {
  label: React.ReactNode;
  value: number;
  max: number;
  right?: React.ReactNode;
  gradient?: string;
  sub?: React.ReactNode;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className="truncate font-medium text-ink">{label}</span>
        {right && <span className="mono shrink-0 text-xs font-semibold">{right}</span>}
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panelAlt">
          <div
            className={cx('h-full rounded-full bg-gradient-to-r', gradient)}
            style={{ width: `${pct}%` }}
          />
        </div>
        {sub && <span className="shrink-0 whitespace-nowrap text-xs text-faint">{sub}</span>}
      </div>
    </div>
  );
}

// Vertical mini-bars — a compact monthly trend.
export function TrendBars({
  data,
  color = 'from-green to-blue',
  height = 80,
  showValue,
}: {
  data: { label: string; value: number; display?: string }[];
  color?: string;
  height?: number;
  showValue?: boolean;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <div
            className={cx('w-full rounded-t bg-gradient-to-b', color)}
            style={{ height: `${Math.max(4, (d.value / max) * (height - 20))}px` }}
          />
          <span className="text-[10px] text-faint">{showValue ? d.display ?? d.value : d.label}</span>
        </div>
      ))}
    </div>
  );
}

// Rank medal for leaderboards.
export function RankMedal({ i }: { i: number }) {
  const bg = i === 0 ? '#E0A23A' : i === 1 ? '#B8C4CE' : i === 2 ? '#CD9B6A' : undefined;
  return (
    <span
      className={cx(
        'mono flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
        bg ? 'text-white' : 'bg-panelAlt text-dim',
      )}
      style={bg ? { backgroundColor: bg } : undefined}
    >
      {i + 1}
    </span>
  );
}
