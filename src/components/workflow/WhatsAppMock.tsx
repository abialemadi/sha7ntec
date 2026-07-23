import { SimulatedTag } from '@/components/ui';

// A visual mockup of the WhatsApp Business alert (spec §17: WhatsApp is a
// visual mockup only in v1). Always rendered with a "simulated" tag so no one
// mistakes it for a real integration.
export function WhatsAppMock({ title, lines, time = 'now' }: { title: string; lines: string[]; time?: string }) {
  return (
    <div className="max-w-sm">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-semibold text-dim">WhatsApp Business alert</span>
        <SimulatedTag>visual mockup</SimulatedTag>
      </div>
      <div className="rounded-xl bg-[#E5DDD5] p-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366] text-base">💬</div>
          <div>
            <div className="text-xs font-bold text-[#075E54]">Sha7ntec Alerts</div>
            <div className="text-[10px] text-[#667781]">WhatsApp Business · Verified ✓</div>
          </div>
        </div>
        <div className="rounded-[0_10px_10px_10px] bg-white p-3 shadow-sm">
          <div className="mb-1.5 text-xs font-bold text-[#075E54]">{title}</div>
          {lines.map((l, i) => (
            <div key={i} className="text-xs leading-relaxed text-[#303030]">
              {l}
            </div>
          ))}
          <div className="mt-1 text-right text-[10px] text-[#8696A0]">{time} ✓✓</div>
        </div>
      </div>
    </div>
  );
}
