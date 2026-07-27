"use client";

import { useState, useEffect, useRef } from "react";

// ============================================================
// DESIGN TOKENS — Bright Blue + Green Enterprise Theme
// ============================================================
const C = {
  bg: "#F3F8FB",
  panel: "#FFFFFF",
  panelAlt: "#F6FAFC",
  border: "#D9E8F0",
  borderStrong: "#BFDCEA",
  blue: "#2E8FE0",
  blueBright: "#4FA8F0",
  blueDim: "#2E8FE014",
  blueDim2: "#2E8FE022",
  navy: "#13314A",
  text: "#1A2B3D",
  textDim: "#5C7488",
  textFaint: "#9AB0BF",
  green: "#1FAE6E",
  greenDim: "#1FAE6E14",
  greenDim2: "#1FAE6E22",
  amber: "#E0A23A",
  amberDim: "#E0A23A1A",
  gold: "#D9A62E",
  violet: "#7B6FD0",
  violetDim: "#7B6FD018",
  red: "#E0604A",
  redDim: "#E0604A14",
  white: "#FFFFFF",
};

const mono = "'IBM Plex Mono', monospace";
const sans = "'Inter', sans-serif";

// ============================================================
// SAMPLE DATA
// ============================================================
const POOL_PO = {
  id: "4000004597",
  vendor: "Quinta Raddison Ltd.",
  vendorEmail: "SALES@QR-INC.COM",
  vendorContact: "Sean Hostler | Supplier Quote: 942028 JB",
  origin: "Springfield, PA, USA",
  destination: "Ras Laffan Industrial City, Qatar",
  cargo: "Centrifugal Exhaust Fans — 6 EA (Models 540C12B, 330C11B, 365C11B) for STG / GT Roof",
  value: 28388,
  erp: "SAP S/4HANA",
  incoterm: "EXW USA",
  invoiceNo: "250593",
  orderDate: "22.04.2026",
  deliveryDate: "30.07.2026",
  hsCode: "8487.90.0080",
  packing: "6 Crates @ 2,872 KGS Total",
};

const VENDOR_DOCS = [
  { name: "Commercial Invoice 250593.pdf", size: "184 KB" },
  { name: "Packing List 942028 JB.pdf", size: "96 KB" },
  { name: "Certificate of Origin (USA).pdf", size: "112 KB" },
  { name: "Material Test Certificate.pdf", size: "340 KB" },
];

const BIDDERS = [
  { id: "B1", masked: "Freight Forwarder — A", real: "GWC Qatar",                             contact: "freight@gwc.com.qa",    rate: 4200, transit: 5, reliability: 96, histAvg: 4350, monthsActive: 48, pastTenders: 87 },
  { id: "B2", masked: "Freight Forwarder — B", real: "DSV Panalpina Marine Shipping WLL",     contact: "doha@dsv.com",           rate: 3850, transit: 6, reliability: 91, histAvg: 4600, monthsActive: 36, pastTenders: 62 },
  { id: "B3", masked: "Freight Forwarder — C", real: "Gulf Agency Company Qatar (W.L.L.)",    contact: "logistics@gac.com",      rate: 5100, transit: 4, reliability: 97, histAvg: 4800, monthsActive: 60, pastTenders: 94 },
  { id: "B4", masked: "Freight Forwarder — D", real: "BDP International Logistics Qatar WLL", contact: "qatar@bdpinternational.com", rate: 4450, transit: 5, reliability: 93, histAvg: 4380, monthsActive: 3, pastTenders: 4 },
];

// ============================================================
// AI BID ANOMALY DETECTION (rules-based, honestly "AI-assisted")
// Flags outliers, collusion patterns, lowball risk, new vendors.
// ============================================================
function detectAnomalies(bidders) {
  const rates = bidders.map(b => b.rate).sort((a, b) => a - b);
  const median = rates[Math.floor(rates.length / 2)];
  const mean = rates.reduce((s, r) => s + r, 0) / rates.length;
  const std = Math.sqrt(rates.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / rates.length);

  // detect tight clustering (possible collusion): any pair within 1.5% of each other
  const clusterPairs = [];
  for (let i = 0; i < bidders.length; i++) {
    for (let j = i + 1; j < bidders.length; j++) {
      const diff = Math.abs(bidders[i].rate - bidders[j].rate);
      if (diff / median < 0.015) clusterPairs.push([bidders[i].id, bidders[j].id]);
    }
  }
  const clusteredIds = new Set(clusterPairs.flat());

  return bidders.map(b => {
    const flags = [];
    let level = "normal"; // normal | review | flagged

    // 1. Statistical high outlier (possible padding)
    const zScore = std > 0 ? (b.rate - mean) / std : 0;
    if (zScore > 1.1) {
      flags.push({ type: "High Outlier", detail: `Bid is ${Math.round((b.rate / median - 1) * 100)}% above the median — possible cost padding.`, sev: "review" });
    }

    // 2. Deviation from own history (bid far from this forwarder's historical average)
    const histDev = (b.rate - b.histAvg) / b.histAvg;
    if (histDev > 0.12) {
      flags.push({ type: "Above Own History", detail: `${Math.round(histDev * 100)}% higher than this forwarder's 12-month average of ${fmt(b.histAvg)}.`, sev: "review" });
    }

    // 3. Below-cost lowball risk (suspiciously low vs own history — win then change-order)
    if (histDev < -0.10) {
      flags.push({ type: "Lowball Risk", detail: `${Math.round(Math.abs(histDev) * 100)}% below their own average — watch for post-award change orders.`, sev: "review" });
    }

    // 4. New / unproven forwarder
    if (b.monthsActive < 6 || b.pastTenders < 5) {
      flags.push({ type: "Unproven Vendor", detail: `Only ${b.monthsActive} months active, ${b.pastTenders} past tenders — limited track record.`, sev: "review" });
    }

    // 5. Collusion pattern (tight clustering with another bid)
    if (clusteredIds.has(b.id)) {
      flags.push({ type: "Collusion Pattern", detail: `Rate suspiciously close to another bidder — possible coordinated pricing.`, sev: "flagged" });
    }

    if (flags.some(f => f.sev === "flagged")) level = "flagged";
    else if (flags.length > 0) level = "review";

    return { ...b, flags, level };
  });
}

const LANDED_COST_ITEMS = [
  { label: "Product Cost (PO Value)", value: 1840000, color: C.textDim },
  { label: "Winning Freight Bid", value: 38900, color: C.blue },
  { label: "Port Handling & THC", value: 6200, color: C.textDim },
  { label: "Customs Duty (5%)", value: 92000, color: C.textDim },
  { label: "Insurance", value: 4100, color: C.textDim },
];

// ============================================================
// MULTI-SHIPMENT PIPELINE (makes the demo feel like a live system)
// ============================================================
const PIPELINE = [
  { id: "4000004597", vendor: "Quinta Raddison Ltd. (USA)",    cargo: "Centrifugal Exhaust Fans — 6 EA, 2,872 KGS",         value: 28388,   lane: "USA → Ras Laffan",          status: "In Tender",    statusColor: "#2E8FE0", forwarder: "—",                                   freight: 3850,  savings: 1250,  active: true  },
  { id: "4000004608", vendor: "GPT Corporation (South Korea)", cargo: "Oil Seal BFP Motor Dia 180 DE/NDE — 10 EA, 3.5 KGS", value: 6300,    lane: "Incheon, Korea → Doha",     status: "Delivered",    statusColor: "#7B6FD0", forwarder: "DHL Express Qatar",                   freight: 420,   savings: 180,   active: false },
  { id: "4000004581", vendor: "Siemens Energy AG (Germany)",   cargo: "Gas Turbine Spare Parts — 4 crates",                  value: 142600,  lane: "Hamburg → Hamad Port",      status: "Paid",         statusColor: "#1FAE6E", forwarder: "DSV Panalpina Marine Shipping WLL",    freight: 8400,  savings: 2100,  active: false },
  { id: "4000004574", vendor: "Hyundai Electric (Korea)",      cargo: "BFP Motor Bearings — 24 EA",                          value: 38900,   lane: "Busan, Korea → Doha",       status: "Awarded",      statusColor: "#7B6FD0", forwarder: "GWC Qatar",                           freight: 2200,  savings: 780,   active: false },
  { id: "4000004561", vendor: "Emerson Process Mgmt (USA)",    cargo: "Control Valves — 3 EA, HART Protocol",                value: 67400,   lane: "Houston, TX → Ras Laffan",  status: "Paid",         statusColor: "#1FAE6E", forwarder: "Gulf Agency Company Qatar (W.L.L.)",  freight: 3100,  savings: 920,   active: false },
  { id: "4000004549", vendor: "Navio Shipping CO.",            cargo: "Lubrication Oil — 200 x 5L drums",                    value: 24800,   lane: "Jebel Ali, UAE → Doha",     status: "In Transit",   statusColor: "#7B6FD0", forwarder: "Navio Shipping CO.",                  freight: 1850,  savings: 610,   active: false },
  { id: "4000004533", vendor: "ABB Ltd. (Switzerland)",        cargo: "MV Drive Units — 2 EA, 480 KGS",                      value: 198000,  lane: "Zurich → Hamad Port",       status: "Docs Pending", statusColor: "#E0A23A", forwarder: "—",                                   freight: 0,     savings: 0,     active: false },
];

const FORWARDER_LEADERBOARD = [
  { name: "Gulf Agency Company Qatar (W.L.L.)",    won: 18, avgSaving: 16.4, reliability: 97, onTime: 96 },
  { name: "GWC Qatar",                             won: 15, avgSaving: 14.8, reliability: 96, onTime: 94 },
  { name: "DSV Panalpina Marine Shipping WLL",     won: 12, avgSaving: 13.2, reliability: 91, onTime: 93 },
  { name: "BDP International Logistics Qatar WLL", won: 7,  avgSaving: 11.9, reliability: 93, onTime: 90 },
  { name: "FedEx Trade Networks Qatar",            won: 6,  avgSaving: 10.4, reliability: 98, onTime: 97 },
  { name: "Navio Shipping CO.",                    won: 4,  avgSaving: 9.8,  reliability: 89, onTime: 88 },
];

// ============================================================
// INSIGHTS DATA (advanced analytics browser)
// ============================================================
// أفضل شركة شحن خلال آخر 12 شهر
const BEST_CARRIER_12MO = [
  { name: "Gulf Agency Company Qatar (W.L.L.)",    shipments: 38, onTime: 96, spend: 1480000, score: 96 },
  { name: "GWC Qatar",                             shipments: 44, onTime: 94, spend: 1920000, score: 94 },
  { name: "DSV Panalpina Marine Shipping WLL",     shipments: 29, onTime: 93, spend: 1140000, score: 91 },
  { name: "BDP International Logistics Qatar WLL", shipments: 22, onTime: 90, spend: 740000,  score: 88 },
  { name: "FedEx Trade Networks Qatar",            shipments: 18, onTime: 97, spend: 390000,  score: 87 },
  { name: "Navio Shipping CO.",                    shipments: 14, onTime: 88, spend: 280000,  score: 82 },
];

// متوسط تكلفة الشحن حسب الدولة
const AVG_COST_BY_COUNTRY = [
  { country: "USA",          flag: "🇺🇸", avgCost: 4800,   shipments: 28, trend: "-3%" },
  { country: "South Korea",  flag: "🇰🇷", avgCost: 2900,   shipments: 22, trend: "-5%" },
  { country: "Germany",      flag: "🇩🇪", avgCost: 6200,   shipments: 16, trend: "-2%" },
  { country: "UAE",          flag: "🇦🇪", avgCost: 1850,   shipments: 41, trend: "-4%" },
  { country: "UK",           flag: "🇬🇧", avgCost: 5400,   shipments: 12, trend: "+1%" },
  { country: "Switzerland",  flag: "🇨🇭", avgCost: 7100,   shipments: 8,  trend: "-1%" },
  { country: "Japan",        flag: "🇯🇵", avgCost: 3600,   shipments: 11, trend: "-3%" },
];

// الموردون الأكثر تسبباً في التأخير
const TOP_DELAY_SUPPLIERS = [
  { name: "Quinta Raddison Ltd. (USA)",     delays: 4, avgDelayDays: 8.5, shipments: 12, rate: 33 },
  { name: "Siemens Energy AG (Germany)",    delays: 3, avgDelayDays: 6.2, shipments: 18, rate: 17 },
  { name: "ABB Ltd. (Switzerland)",         delays: 3, avgDelayDays: 5.1, shipments: 9,  rate: 33 },
  { name: "GPT Corporation (South Korea)",  delays: 2, avgDelayDays: 3.8, shipments: 14, rate: 14 },
  { name: "Emerson Process Mgmt (USA)",     delays: 1, avgDelayDays: 2.2, shipments: 11, rate: 9  },
];

// نسبة الالتزام بمواعيد التسليم (شهرياً)
const ON_TIME_TREND = [
  { month: "فبراير", pct: 82 }, { month: "مارس", pct: 85 }, { month: "أبريل", pct: 88 },
  { month: "مايو", pct: 86 },  { month: "يونيو", pct: 91 }, { month: "يوليو", pct: 93 },
];

// إجمالي التوفير المحقق (شهرياً)
const SAVINGS_TREND = [
  { month: "فبراير", value: 41000 }, { month: "مارس", value: 52000 }, { month: "أبريل", value: 48000 },
  { month: "مايو", value: 61000 },  { month: "يونيو", value: 67000 }, { month: "يوليو", value: 73000 },
];

// ============================================================
// UTILITIES
// ============================================================
function fmt(n, decimals = 0) {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(target * ease);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target]);
  return val;
}

// ============================================================
// ROLE BADGE — shows which actor performs each stage
// ============================================================
const ROLE_COLORS = {
  Vendor: C.amber,
  Procurement: C.blue,
  System: C.textDim,
  "Freight Forwarder": C.violet,
  "Store / Warehouse": C.green,
  Finance: C.red,
  SAP: C.navy,
};

function RoleTag({ role }) {
  const color = ROLE_COLORS[role] || C.textDim;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px", borderRadius: 5, background: color + "16", border: `1px solid ${color}44`,
      fontSize: 10, fontWeight: 700, color, fontFamily: sans, letterSpacing: 0.4,
    }}>
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
      {role.toUpperCase()}
    </div>
  );
}

// ============================================================
// SIDEBAR
// ============================================================
function Sidebar({ view, setView, stage, setStage, stages }) {
  const NAV = [
    { key: "dashboard", label: "Analytics Dashboard", icon: "📊" },
    { key: "insights",  label: "Insights & Intelligence", icon: "🧠" },
    { key: "pipeline",  label: "Shipping PO",         icon: "📋" },
    { key: "workflow",  label: "Active Workflow",     icon: "⚙️" },
  ];
  return (
    <div style={{ width: 256, background: C.panel, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "22px 20px 18px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 9, height: 9, borderRadius: 3, background: `linear-gradient(135deg, ${C.blue}, ${C.green})` }} />
          <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 15, color: C.navy, letterSpacing: 0.4 }}>SHA7NTEC</div>
        </div>
        <div style={{ fontSize: 10, color: C.textFaint, marginTop: 4, letterSpacing: 0.6, fontFamily: sans, fontWeight: 600 }}>FINANCIAL CONTROL MIDDLEWARE</div>
      </div>

      {/* Top-level nav */}
      <div style={{ padding: "16px 20px 8px", fontSize: 10, color: C.textFaint, letterSpacing: 1, fontFamily: sans, fontWeight: 700 }}>
        NAVIGATION
      </div>
      <div style={{ padding: "0 12px 8px" }}>
        {NAV.map(n => {
          const active = view === n.key;
          return (
            <button key={n.key} onClick={() => setView(n.key)} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 6, marginBottom: 2,
              background: active ? C.blueDim2 : "transparent",
              border: active ? `1px solid ${C.blue}55` : "1px solid transparent",
              cursor: "pointer", textAlign: "left", transition: "all 0.15s",
            }}>
              <span style={{ fontSize: 15 }}>{n.icon}</span>
              <span style={{ fontSize: 12.5, fontFamily: sans, fontWeight: active ? 700 : 500, color: active ? C.navy : C.textDim }}>{n.label}</span>
            </button>
          );
        })}
      </div>

      {/* Workflow stages — only when in workflow view */}
      {view === "workflow" && (
        <>
          <div style={{ padding: "12px 20px 8px", fontSize: 10, color: C.textFaint, letterSpacing: 1, fontFamily: sans, fontWeight: 700, borderTop: `1px solid ${C.border}`, marginTop: 8 }}>
            SHIPMENT LIFECYCLE
          </div>
          <div style={{ flex: 1, padding: "0 12px", overflowY: "auto" }}>
            {stages.map((s, i) => {
              const active = stage === i;
              const done = stage > i;
              return (
                <button key={i} onClick={() => setStage(i)} style={{
                  width: "100%", display: "flex", alignItems: "flex-start", gap: 11,
                  padding: "9px 12px", borderRadius: 6, marginBottom: 2,
                  background: active ? C.blueDim2 : "transparent",
                  border: active ? `1px solid ${C.blue}55` : "1px solid transparent",
                  cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: done ? C.green : active ? C.blue : "transparent",
                    border: done || active ? "none" : `1px solid ${C.borderStrong}`,
                    fontSize: 10, fontFamily: mono, fontWeight: 700,
                    color: done || active ? C.white : C.textFaint,
                  }}>
                    {done ? "✓" : i + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontFamily: sans, fontWeight: active ? 700 : 500, color: active ? C.navy : done ? C.textDim : C.textFaint, lineHeight: 1.3 }}>
                      {s.label}
                    </div>
                    <div style={{ fontSize: 9.5, color: ROLE_COLORS[s.role] || C.textFaint, fontFamily: sans, marginTop: 2, fontWeight: 600 }}>
                      {s.role}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {view !== "workflow" && <div style={{ flex: 1 }} />}

      <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 10, color: C.textFaint, fontFamily: sans, fontWeight: 600 }}>VIEWING AS</div>
        <div style={{ fontSize: 12, color: C.textDim, fontFamily: sans, marginTop: 2 }}>All Roles · Demo Mode</div>
      </div>
    </div>
  );
}

// ============================================================
// MONEY / PROCESS TRAIL
// ============================================================
function ProcessTrail({ stage, total }) {
  const poValue = useCountUp(POOL_PO.value);
  const pct = (stage / (total - 1)) * 100;
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 22px", marginBottom: 18, boxShadow: "0 1px 3px rgba(20,60,90,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div>
          <div style={{ fontSize: 10, color: C.textFaint, letterSpacing: 0.7, fontFamily: sans, fontWeight: 700 }}>PO VALUE UNDER CONTROL</div>
          <div style={{ fontFamily: mono, fontSize: 21, fontWeight: 700, color: C.navy, marginTop: 2 }}>{fmt(poValue)}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: `linear-gradient(90deg, ${C.blue}, ${C.green})`, transition: "width 0.4s cubic-bezier(0.16,1,0.3,1)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: C.textFaint, fontFamily: sans, fontWeight: 600 }}>
            <span>Vendor Upload</span><span>SAP Service Entry</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SHARED UI
// ============================================================
function Header({ eyebrow, title, sub, role }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: C.blue, fontFamily: sans, fontWeight: 700, letterSpacing: 1 }}>{eyebrow}</span>
        <RoleTag role={role} />
      </div>
      <div style={{ fontSize: 24, color: C.navy, fontFamily: sans, fontWeight: 800, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: C.textDim, fontFamily: sans, lineHeight: 1.5, maxWidth: 660 }}>{sub}</div>
    </div>
  );
}

function Panel({ title, sub, right, children }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px", marginBottom: 14, boxShadow: "0 1px 3px rgba(20,60,90,0.04)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, color: C.navy, fontFamily: sans, fontWeight: 700 }}>{title}</div>
          {sub && <div style={{ fontSize: 11, color: C.textFaint, fontFamily: sans, marginTop: 2 }}>{sub}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Grid({ cols, children }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14 }}>{children}</div>;
}

function Field({ label, value, mono: isMono, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.textFaint, fontFamily: sans, letterSpacing: 0.4, marginBottom: 3, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, color: color || C.text, fontFamily: isMono ? mono : sans, fontWeight: isMono ? 700 : 500 }}>{value}</div>
    </div>
  );
}

function ActionBtn({ onClick, label, color, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? C.border : (color || C.blue), color: disabled ? C.textFaint : C.white, border: "none", borderRadius: 6,
      padding: "9px 16px", fontSize: 12, fontWeight: 700, fontFamily: sans,
      cursor: disabled ? "default" : "pointer", whiteSpace: "nowrap", transition: "all 0.15s",
      boxShadow: disabled ? "none" : `0 2px 6px ${(color || C.blue)}33`,
    }}>{label}</button>
  );
}

function Badge({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 5, background: color + "18", border: `1px solid ${color}44` }}>
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
      <span style={{ fontSize: 11, color, fontFamily: sans, fontWeight: 700, letterSpacing: 0.4 }}>{label}</span>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ fontSize: 10, color: C.textFaint, fontFamily: sans }}>{label}</span>
      <span style={{ fontSize: 10, color: C.textDim, fontFamily: mono, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function NextHint({ text }) {
  return <div style={{ marginTop: 14, fontSize: 12, color: C.textDim, fontFamily: sans, textAlign: "center", fontWeight: 500 }}>→ {text}</div>;
}

function NotificationBanner({ to, color, children }) {
  return (
    <div className="fadein" style={{ borderRadius: 10, border: `1px solid ${color}33`, background: C.panelAlt, overflow: "hidden", marginTop: 4 }}>
      <div style={{ padding: "10px 16px", background: color + "14", borderBottom: `1px solid ${color}22`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
          <span style={{ fontSize: 11, color: C.text, fontFamily: sans, fontWeight: 700 }}>{to}</span>
        </div>
        <span style={{ fontSize: 10, color: C.textFaint, fontFamily: mono }}>Auto-sent · just now</span>
      </div>
      <div style={{ padding: "16px 18px" }}>{children}</div>
    </div>
  );
}

function DocRow({ name, size, uploaded }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 7, background: C.panelAlt, border: `1px solid ${C.border}`, marginBottom: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 26, height: 26, borderRadius: 5, background: uploaded ? C.greenDim2 : C.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: uploaded ? C.green : C.textFaint, fontFamily: mono, fontWeight: 700 }}>
          {uploaded ? "✓" : "·"}
        </div>
        <span style={{ fontSize: 12.5, color: C.text, fontFamily: sans, fontWeight: 500 }}>{name}</span>
      </div>
      <span style={{ fontSize: 10.5, color: C.textFaint, fontFamily: mono }}>{size}</span>
    </div>
  );
}

// ============================================================
// STAGE 1 — VENDOR UPLOAD
// ============================================================
function VendorUploadStage() {
  const [uploaded, setUploaded] = useState(false);

  return (
    <div className="fadein">
      <Header eyebrow="Stage 01" role="Vendor" title="Document Upload Portal" sub="The vendor logs into their dedicated web access window to upload the packing list, invoice, and supporting documents — no email attachments, no lost files." />

      <Panel title={`Vendor Portal — ${POOL_PO.vendor}`} sub={POOL_PO.vendorContact} right={!uploaded ? <ActionBtn onClick={() => setUploaded(true)} label="Upload Documents →" color={C.amber} /> : <Badge color={C.green} label="DOCUMENTS RECEIVED" />}>
        <Grid cols={2}>
          <Field label="Purchase Order" value={POOL_PO.id} mono />
          <Field label="Cargo" value={POOL_PO.cargo} />
        </Grid>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, color: C.textFaint, fontFamily: sans, letterSpacing: 0.4, marginBottom: 8, fontWeight: 700 }}>REQUIRED DOCUMENTS</div>
          {VENDOR_DOCS.map((d, i) => <DocRow key={i} name={d.name} size={d.size} uploaded={uploaded} />)}
        </div>

        {!uploaded ? (
          <div style={{ marginTop: 14, padding: "14px 16px", border: `1.5px dashed ${C.borderStrong}`, borderRadius: 8, textAlign: "center", color: C.textFaint, fontSize: 12, fontFamily: sans }}>
            Drag files here, or click "Upload Documents" to simulate the vendor submitting their files through the web portal.
          </div>
        ) : (
          <div className="fadein" style={{ marginTop: 14, padding: "12px 16px", background: C.greenDim, borderRadius: 6, border: `1px solid ${C.green}33`, fontSize: 12, color: C.text, fontFamily: sans, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: C.green, fontFamily: mono, fontWeight: 700 }}>✓</span>
            All required documents uploaded by the vendor. Sha7ntec is now notifying the Procurement team that this shipment is ready to move forward.
          </div>
        )}
      </Panel>

      {uploaded && <NextHint text="Procurement User receives a notification that the shipment is ready for tender" />}
    </div>
  );
}

// ============================================================
// STAGE 2 — SHIPMENT READY NOTIFICATION
// ============================================================
function ShipmentReadyStage() {
  const [seen, setSeen] = useState(false);
  return (
    <div className="fadein">
      <Header eyebrow="Stage 02" role="Procurement" title="Shipment Ready Notification" sub="The moment vendor documents are validated, the Procurement User is notified automatically — no manual checking, no chasing the vendor." />

      <Panel title="Inbox — Procurement User" right={!seen ? <ActionBtn onClick={() => setSeen(true)} label="Open Notification →" color={C.blue} /> : <Badge color={C.green} label="REVIEWED" />}>
        {!seen ? (
          <div style={{ padding: "16px 16px", borderRadius: 8, background: C.blueDim, border: `1px solid ${C.blue}33`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: C.blue }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, fontFamily: sans }}>Shipment {POOL_PO.id} ready to float for tender</div>
                <div style={{ fontSize: 11, color: C.textFaint, fontFamily: sans, marginTop: 2 }}>From Sha7ntec System · just now</div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: C.blue, fontFamily: mono, fontWeight: 700 }}>UNREAD</div>
          </div>
        ) : (
          <NotificationBanner to="To: Procurement User" color={C.blue}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, fontFamily: sans, marginBottom: 8 }}>
              ✓ Shipment {POOL_PO.id} is ready to float for tender
            </div>
            <div style={{ fontSize: 13, color: C.text, fontFamily: sans, lineHeight: 1.7 }}>
              <strong>{POOL_PO.vendor}</strong> has uploaded all required shipping documents — Invoice, Packing List, Certificate of Origin, and Mill Test Certificate. Documents have been auto-validated against PO {POOL_PO.id}.
              <br /><br />
              This shipment is now ready to be opened for freight tender to your approved forwarder network.
            </div>
          </NotificationBanner>
        )}
      </Panel>

      {seen && <NextHint text="Procurement User opens private blind tender to approved freight forwarders" />}
    </div>
  );
}

// ============================================================
// STAGE 3 — TENDER (blind bidding)
// ============================================================
function TenderStage() {
  const [freightMode, setFreightMode] = useState(null);
  const [modeConfirmed, setModeConfirmed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [bdiApiKey, setBdiApiKey] = useState("");
  const [showApiInput, setShowApiInput] = useState(false);
  const [liveBDI, setLiveBDI] = useState(null);
  const [bdiStatus, setBdiStatus] = useState("idle"); // idle | loading | live | error | demo
  const [marketAnalysis, setMarketAnalysis] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const MODES = {
    sea: {
      label: "Sea Freight", icon: "🚢", color: C.blue,
      desc: "Ocean freight — FCL/LCL. Best for high-volume, non-urgent cargo.",
      transitRange: "3–7 days",
      forwarderType: "Ocean Freight Forwarders (FCL/LCL)",
      indices: {
        BDI: { name: "Baltic Dry Index", value: 2671, change: -2.9, unit: "pts" },
        LANE: { name: "Gulf-UAE Lane (FEU)", value: 41200, change: +1.4, unit: "USD/FEU" },
        FUEL: { name: "Bunker Fuel VLSFO", value: 498, change: -0.8, unit: "USD/MT" },
        PORT: { name: "Jebel Ali Congestion", value: 1.2, change: 0, unit: "days delay" },
      },
    },
    air: {
      label: "Air Freight", icon: "✈️", color: C.violet,
      desc: "Air cargo — express and general. Best for urgent, high-value, or perishable goods.",
      transitRange: "1–3 days",
      forwarderType: "Air Cargo Agents (IATA certified)",
      indices: {
        BAI: { name: "Baltic Air Index", value: 3840, change: +2.1, unit: "pts" },
        LANE: { name: "DXB → DOH Air Rate", value: 3.2, change: +0.5, unit: "USD/kg" },
        FUEL: { name: "Jet Fuel Price", value: 874, change: -1.1, unit: "USD/MT" },
        CAP: { name: "Air Capacity Utilization", value: 82, change: +1.5, unit: "% load" },
      },
    },
    both: {
      label: "Both Modes", icon: "🚢✈️", color: C.gold,
      desc: "Dual-mode tender — invite sea and air forwarders to compete across modes.",
      transitRange: "1–7 days",
      forwarderType: "Ocean + Air Forwarders (dual comparison)",
      indices: {
        BDI: { name: "Baltic Dry Index", value: 2671, change: -2.9, unit: "pts" },
        BAI: { name: "Baltic Air Index", value: 3840, change: +2.1, unit: "pts" },
        SEA: { name: "Sea Lane Rate (FEU)", value: 41200, change: +1.4, unit: "USD/FEU" },
        AIR: { name: "Air Rate (DXB→DOH)", value: 3.2, change: +0.5, unit: "USD/kg" },
      },
    },
  };

  const selectedMode = freightMode ? MODES[freightMode] : null;

  const getBidders = () => {
    if (freightMode === "air") return [
      { ...BIDDERS[0], masked: "Air Agent — A", rate: 18400, transit: 2, reliability: 97, histAvg: 19200, monthsActive: 22, pastTenders: 38 },
      { ...BIDDERS[1], masked: "Air Agent — B", rate: 16800, transit: 3, reliability: 91, histAvg: 19500, monthsActive: 15, pastTenders: 29 },
      { ...BIDDERS[2], masked: "Air Agent — C", rate: 22100, transit: 1, reliability: 98, histAvg: 20100, monthsActive: 31, pastTenders: 44 },
      { ...BIDDERS[3], masked: "Air Agent — D", rate: 17200, transit: 2, reliability: 94, histAvg: 18900, monthsActive: 3, pastTenders: 4 },
    ];
    if (freightMode === "both") return [
      { ...BIDDERS[0], masked: "🚢 Sea — Forwarder A", rate: 42500, transit: 4, reliability: 94, histAvg: 43200, monthsActive: 26, pastTenders: 42 },
      { ...BIDDERS[1], masked: "✈️ Air — Agent B", rate: 16800, transit: 3, reliability: 91, histAvg: 19500, monthsActive: 15, pastTenders: 29 },
      { ...BIDDERS[2], masked: "🚢 Sea — Forwarder C", rate: 51200, transit: 3, reliability: 97, histAvg: 45800, monthsActive: 33, pastTenders: 38 },
      { ...BIDDERS[3], masked: "✈️ Air — Agent D", rate: 22100, transit: 1, reliability: 98, histAvg: 20100, monthsActive: 31, pastTenders: 44 },
    ];
    return BIDDERS;
  };

  const activeBidders = getBidders();
  const analyzed = detectAnomalies(activeBidders);
  const sorted = [...analyzed].sort((a, b) => a.rate - b.rate);
  const cleanBids = sorted.filter(b => b.level !== "flagged");
  const winner = cleanBids[0] || sorted[0];
  const flaggedCount = analyzed.filter(b => b.level === "flagged").length;
  const reviewCount = analyzed.filter(b => b.level === "review").length;
  const avgBid = sorted.reduce((s, b) => s + b.rate, 0) / sorted.length;

  // ── Fetch live BDI from oilpriceapi.com ──────────────────────────────────
  const fetchLiveBDI = async (apiKey) => {
    setBdiStatus("loading");
    try {
      const res = await fetch(
        "https://api.oilpriceapi.com/v1/prices/latest?by_code=BALTIC_DRY_INDEX",
        { headers: { "Authorization": `Token ${apiKey}`, "Content-Type": "application/json" } }
      );
      if (!res.ok) throw new Error("API error " + res.status);
      const json = await res.json();
      const value = json?.data?.price ?? json?.price ?? null;
      if (!value) throw new Error("No value in response");
      setLiveBDI({ value: Math.round(value), ts: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), source: "oilpriceapi.com · Baltic Exchange" });
      setBdiStatus("live");
      return Math.round(value);
    } catch (e) {
      setBdiStatus("error");
      return null;
    }
  };

  const buildMarketAnalysis = (bdiValue, isLive) => {
    const avg = Math.round(sorted.reduce((s, b) => s + b.rate, 0) / sorted.length);
    const spread = sorted[sorted.length - 1].rate - sorted[0].rate;
    const spreadPct = avg > 0 ? Math.round((spread / avg) * 100) : 0;
    const flagged = analyzed.filter((b) => b.level === "flagged").length;
    const saving = sorted[sorted.length - 1].rate - winner.rate;
    const bdiTone = bdiValue >= 2800 ? "elevated" : bdiValue <= 2000 ? "soft" : "moderate";
    const timing =
      bdiValue >= 2800
        ? "rates are running hot, so locking in the awarded rate now is prudent"
        : bdiValue <= 2000
        ? "the market is soft and favourable — a good window to commit"
        : "conditions are stable, with no urgency premium expected near term";
    const modeNote =
      freightMode === "both"
        ? " Across modes, the air options trade a higher rate for materially shorter transit — justify the premium only where the cargo is time-critical."
        : freightMode === "air"
        ? " Air capacity on this lane is holding, so transit reliability should track the quoted figures."
        : "";
    const src = isLive ? "live from the Baltic Exchange" : "a simulated benchmark";
    return `With the Baltic Dry Index at ${bdiValue.toLocaleString()} pts (${src}), dry-freight conditions read as ${bdiTone}. The ${sorted.length} sealed bids span a ${spreadPct}% spread; awarding ${winner.masked} at ${fmt(winner.rate)} captures ${fmt(saving)} versus the highest quote${flagged ? `, after screening out ${flagged} bid(s) flagged for anomalies` : ""}.${modeNote} On timing, ${timing}.`;
  };

  const handleReveal = async () => {
    setRevealed(true);
    // Determine the BDI value: live from oilpriceapi.com when a key is
    // supplied, otherwise a realistic demo value. Either path renders the panel.
    let bdiValue = 2671; // demo fallback (last known BDI)
    let isLive = false;
    if (bdiApiKey.trim()) {
      const live = await fetchLiveBDI(bdiApiKey.trim());
      if (live) {
        bdiValue = live;
        isLive = true;
      } else {
        // Live fetch failed — fall back to demo so the panel still renders.
        setLiveBDI({ value: bdiValue, ts: "demo", source: "Live fetch failed — showing simulated BDI" });
      }
    } else {
      setBdiStatus("demo");
      setLiveBDI({ value: bdiValue, ts: "demo", source: "Simulated — add API key for live data" });
    }
    // Generate market intelligence locally — deterministic, always available,
    // and honest for a self-contained demo (no external LLM call).
    setAnalysisLoading(true);
    const analysis = buildMarketAnalysis(bdiValue, isLive);
    setTimeout(() => {
      setMarketAnalysis(analysis);
      setAnalysisLoading(false);
    }, 600);
  };

  const LEVEL = {
    normal:  { color: C.green,  bg: C.greenDim,  label: "Normal",  icon: "🟢" },
    review:  { color: C.amber,  bg: C.amberDim,  label: "Review",  icon: "🟡" },
    flagged: { color: C.red,    bg: C.redDim,    label: "Flagged", icon: "🔴" },
  };

  return (
    <div className="fadein">
      <Header eyebrow="Stage 03" role="Procurement" title="Tender"
        sub="Step 1: select freight mode. Sha7ntec invites the right forwarder type, applies the correct market indices, and runs AI-assisted anomaly detection tailored to the selected mode." />

      {/* ── STEP 1: FREIGHT MODE SELECTION ── */}
      <Panel title="Step 1 — Select Freight Mode"
        sub="Choose the shipping mode before floating the tender. This determines which forwarders are invited and which market benchmarks apply."
        right={modeConfirmed ? <Badge color={selectedMode.color} label={`${selectedMode.icon} ${selectedMode.label.toUpperCase()}`} /> : null}>
        {!modeConfirmed ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {Object.entries(MODES).map(([key, mode]) => {
                const active = freightMode === key;
                return (
                  <button key={key} onClick={() => setFreightMode(key)} style={{
                    padding: "18px 16px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                    background: active ? mode.color + "14" : C.panelAlt,
                    border: `${active ? 2 : 1}px solid ${active ? mode.color : C.border}`,
                    transition: "all 0.18s",
                  }}>
                    <div style={{ fontSize: 26, marginBottom: 10 }}>{mode.icon}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: active ? mode.color : C.navy, fontFamily: sans, marginBottom: 5 }}>{mode.label}</div>
                    <div style={{ fontSize: 11, color: C.textDim, fontFamily: sans, lineHeight: 1.5, marginBottom: 10 }}>{mode.desc}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textFaint, fontFamily: sans, letterSpacing: 0.3 }}>⏱ Transit: {mode.transitRange}</div>
                    <div style={{ fontSize: 10, color: C.textFaint, fontFamily: sans, marginTop: 2 }}>👥 {mode.forwarderType}</div>
                  </button>
                );
              })}
            </div>
            {freightMode && (
              <div className="fadein" style={{ marginTop: 16 }}>
                <div style={{ padding: "12px 16px", background: selectedMode.color + "12", border: `1px solid ${selectedMode.color}33`, borderRadius: 8, marginBottom: 14, fontSize: 12, color: C.text, fontFamily: sans }}>
                  <strong style={{ color: selectedMode.color }}>{selectedMode.icon} {selectedMode.label} selected.</strong> Sha7ntec will invite <strong>{selectedMode.forwarderType}</strong> and apply <strong>{Object.values(selectedMode.indices).map(i => i.name).join(' · ')}</strong> for market benchmarking.
                </div>
                <ActionBtn label={`Confirm ${selectedMode.label} & Float Tender →`} onClick={() => setModeConfirmed(true)} color={selectedMode.color} />
              </div>
            )}
            {!freightMode && <div style={{ marginTop: 14, fontSize: 12, color: C.textFaint, fontFamily: sans, textAlign: "center" }}>Select a freight mode above to proceed.</div>}
          </>
        ) : (
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {[
              { label: "Mode", value: `${selectedMode.icon} ${selectedMode.label}` },
              { label: "Forwarder Type", value: selectedMode.forwarderType },
              { label: "Expected Transit", value: selectedMode.transitRange },
              { label: "Market Indices", value: Object.values(selectedMode.indices).map(i => i.name).join(' · ') },
            ].map((f, i) => (
              <div key={i} style={{ minWidth: 180 }}>
                <div style={{ fontSize: 10, color: C.textFaint, fontWeight: 700, letterSpacing: 0.4, fontFamily: sans, marginBottom: 3 }}>{f.label.toUpperCase()}</div>
                <div style={{ fontSize: 12.5, color: C.text, fontFamily: sans }}>{f.value}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* ── BDI API KEY CONFIG (optional, before floating) ── */}
      {modeConfirmed && !revealed && (
        <div style={{ marginBottom: 14, padding: "12px 16px", background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.navy, fontFamily: sans }}>
                📡 Live Baltic Dry Index — oilpriceapi.com
              </div>
              <div style={{ fontSize: 11, color: C.textDim, fontFamily: sans, marginTop: 2 }}>
                Add a free API key to pull the live BDI from the Baltic Exchange into the AI analysis.{" "}
                <a href="https://www.oilpriceapi.com/auth/signup" target="_blank" rel="noopener noreferrer"
                  style={{ color: C.blue, fontWeight: 600 }}>Get free key →</a>
                {" · "}
                <a href="https://app.terminal.freightos.com/fbx" target="_blank" rel="noopener noreferrer"
                  style={{ color: C.blue, fontWeight: 600 }}>View FBX on Freightos →</a>
              </div>
            </div>
            <button onClick={() => setShowApiInput(s => !s)} style={{
              background: C.blueDim, border: `1px solid ${C.blue}44`, borderRadius: 6,
              padding: "6px 12px", fontSize: 11.5, fontWeight: 700, color: C.blue,
              fontFamily: sans, cursor: "pointer", whiteSpace: "nowrap", marginLeft: 14,
            }}>{showApiInput ? "Hide" : "Add API Key"}</button>
          </div>
          {showApiInput && (
            <div className="fadein" style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="password"
                value={bdiApiKey}
                onChange={e => setBdiApiKey(e.target.value)}
                placeholder="Paste your oilpriceapi.com API key here…"
                style={{ flex: 1, padding: "9px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.panel, fontSize: 12.5, fontFamily: sans, color: C.text, outline: "none" }}
              />
              {bdiApiKey && (
                <div style={{ fontSize: 11, color: C.green, fontFamily: sans, fontWeight: 700, whiteSpace: "nowrap" }}>✓ Key ready</div>
              )}
            </div>
          )}
          {!bdiApiKey && !showApiInput && (
            <div style={{ fontSize: 10.5, color: C.textFaint, fontFamily: sans, marginTop: 6 }}>
              Without a key, a realistic demo BDI value is used. The AI analysis still runs either way.
            </div>
          )}
        </div>
      )}

      {/* ── STEP 2: TENDER (only after mode confirmed) ── */}
      {modeConfirmed && (
        <Panel title={`Step 2 — Tender for ${POOL_PO.id} · ${selectedMode.icon} ${selectedMode.label}`}
          right={!revealed
            ? <ActionBtn onClick={handleReveal} label="Close Tender & Run AI Scan →" color={selectedMode.color} />
            : <Badge color={C.green} label="TENDER CLOSED" />}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {sorted.map((b) => {
              const isWinner = revealed && b.id === winner.id;
              const lv = LEVEL[b.level];
              return (
                <div key={b.id} className={revealed ? "fadein" : ""} style={{ padding: "16px 14px", borderRadius: 8, background: isWinner ? C.greenDim : C.panelAlt, border: `1px solid ${isWinner ? C.green + "55" : revealed && b.level === "flagged" ? C.red + "55" : C.border}`, position: "relative" }}>
                  {isWinner && <div style={{ position: "absolute", top: -9, right: 10, background: C.green, color: C.white, fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 4, fontFamily: sans, letterSpacing: 0.4 }}>SELECTED</div>}
                  {revealed && b.level !== "normal" && !isWinner && (
                    <div style={{ position: "absolute", top: -9, right: 10, background: lv.color, color: C.white, fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 4, fontFamily: sans, letterSpacing: 0.3 }}>{lv.label.toUpperCase()}</div>
                  )}
                  <div style={{ fontSize: 11, color: C.textDim, fontFamily: sans, marginBottom: 8, fontWeight: 600 }}>{b.masked}</div>
                  <div style={{ fontFamily: mono, fontSize: 19, fontWeight: 700, color: !revealed ? C.textFaint : isWinner ? C.green : C.navy, letterSpacing: -0.5 }}>{!revealed ? "SEALED" : fmt(b.rate)}</div>
                  {revealed && (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                      <MiniStat label="Transit" value={`${b.transit} days`} />
                      <MiniStat label="Reliability" value={`${b.reliability}%`} />
                      <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: lv.color, fontFamily: sans }}>
                        <span>{lv.icon}</span> AI: {lv.label}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {!revealed && <div style={{ marginTop: 16, fontSize: 12, color: C.textFaint, fontFamily: sans, textAlign: "center" }}>4 approved {selectedMode.forwarderType} have submitted sealed bids. On close, Sha7ntec runs AI anomaly detection and checks against {selectedMode.label} market indices.</div>}
          {revealed && (
            <div style={{ marginTop: 18, padding: "12px 16px", background: C.greenDim, borderRadius: 6, border: `1px solid ${C.green}33`, fontSize: 12, color: C.text, fontFamily: sans }}>
              <strong style={{ color: C.green }}>{winner.masked}</strong> selected — lowest qualified bid at <strong style={{ fontFamily: mono }}>{fmt(winner.rate)}</strong>, saving <strong style={{ color: C.green, fontFamily: mono }}>{fmt(sorted[sorted.length - 1].rate - winner.rate)}</strong> vs. highest.
              {winner.id !== sorted[0].id && <span style={{ color: C.red }}> (Lowest raw bid skipped — flagged by AI scan.)</span>}
            </div>
          )}
        </Panel>
      )}

      {/* ── MARKET INDEX INTELLIGENCE PANEL ── */}
      {revealed && liveBDI && (
        <Panel
          title="📈 Freight Market Index Intelligence"
          sub="Bids cross-checked against live freight indices — Baltic Dry Index (BDI) from oilpriceapi.com · Baltic Exchange, plus simulated GCC lane rates."
          right={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: bdiStatus === "live" ? C.green : C.amber, animation: bdiStatus === "live" ? "pulse 2s infinite" : "none" }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: bdiStatus === "live" ? C.green : C.amber, fontFamily: sans }}>
                {bdiStatus === "live" ? "LIVE DATA" : "DEMO DATA"}
              </span>
            </div>
          }
        >
          {/* BDI hero — the live number */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            {/* Live BDI card */}
            <div style={{ padding: "14px 15px", background: bdiStatus === "live" ? C.greenDim : C.amberDim, border: `1px solid ${bdiStatus === "live" ? C.green + "55" : C.amber + "55"}`, borderRadius: 9, gridColumn: "1" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ fontSize: 9.5, color: C.textFaint, fontWeight: 700, letterSpacing: 0.5, fontFamily: sans }}>BALTIC DRY INDEX</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: bdiStatus === "live" ? C.green : C.amber, fontFamily: sans, padding: "1px 5px", background: bdiStatus === "live" ? C.greenDim : C.amberDim, borderRadius: 4, border: `1px solid ${bdiStatus === "live" ? C.green + "44" : C.amber + "44"}` }}>
                  {bdiStatus === "live" ? "● LIVE" : "● DEMO"}
                </div>
              </div>
              <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: C.navy }}>{liveBDI.value.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: C.textFaint, fontFamily: sans, marginTop: 3 }}>pts · Baltic Exchange</div>
              <div style={{ fontSize: 9, color: C.textFaint, fontFamily: sans, marginTop: 5 }}>{liveBDI.source}</div>
            </div>
            {/* Simulated supplementary indices */}
            {Object.values(selectedMode.indices).filter(i => i.name !== "Baltic Dry Index").slice(0, 3).map((idx, i) => (
              <div key={i} style={{ padding: "14px 15px", background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 9 }}>
                <div style={{ fontSize: 9.5, color: C.textFaint, fontWeight: 700, letterSpacing: 0.4, fontFamily: sans, marginBottom: 6 }}>{idx.name.toUpperCase()}</div>
                <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: C.navy }}>{typeof idx.value === "number" && idx.value > 100 ? idx.value.toLocaleString() : idx.value}</div>
                <div style={{ fontSize: 10, color: C.textFaint, fontFamily: sans, marginTop: 3 }}>{idx.unit}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: idx.change > 0 ? C.red : idx.change < 0 ? C.green : C.textFaint, marginTop: 5, fontFamily: sans }}>
                  {idx.change > 0 ? "▲" : idx.change < 0 ? "▼" : "●"} {Math.abs(idx.change)}% simulated
                </div>
              </div>
            ))}
          </div>

          {/* Bid vs market */}
          <div style={{ padding: "12px 16px", background: C.blueDim, border: `1px solid ${C.blue}33`, borderRadius: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.navy, fontFamily: sans, marginBottom: 8 }}>📊 Bid vs. Market Benchmark</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[
                { label: "BDI (live)", value: `${liveBDI.value.toLocaleString()} pts`, color: bdiStatus === "live" ? C.green : C.amber },
                { label: "Winning Bid", value: fmt(winner.rate), color: C.green },
                { label: "Avg Bid vs Lane Est.", value: `${((sorted.reduce((s,b)=>s+b.rate,0)/sorted.length - (selectedMode.indices.LANE?.value || 41200)) / (selectedMode.indices.LANE?.value || 41200) * 100).toFixed(1)}%`, color: C.blue },
              ].map((s, i) => (
                <div key={i}>
                  <div style={{ fontSize: 10, color: C.textFaint, fontWeight: 700, letterSpacing: 0.3, fontFamily: sans, marginBottom: 3 }}>{s.label.toUpperCase()}</div>
                  <div style={{ fontFamily: mono, fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Claude AI market intelligence */}
          <div style={{ padding: "13px 16px", background: C.violetDim, border: `1px solid ${C.violet}33`, borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, fontFamily: sans }}>🤖 AI Market Intelligence</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 9.5, color: C.violet, fontWeight: 700, fontFamily: sans, letterSpacing: 0.3 }}>AUTO-GENERATED</span>
                <a href="https://app.terminal.freightos.com/fbx" target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 9.5, color: C.blue, fontWeight: 700, fontFamily: sans, letterSpacing: 0.3, textDecoration: "none" }}>
                  FBX on Freightos ↗
                </a>
              </div>
            </div>
            {analysisLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.textDim, fontFamily: sans }}>
                <div style={{ width: 12, height: 12, border: `2px solid ${C.violet}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                Analysing bids against BDI {liveBDI.value.toLocaleString()} pts and {selectedMode.label} lane rates…
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: C.text, fontFamily: sans, lineHeight: 1.7 }}>{marketAnalysis}</div>
            )}
          </div>

          {bdiStatus !== "live" && (
            <div style={{ marginTop: 12, fontSize: 11, color: C.textFaint, fontFamily: sans, padding: "8px 12px", background: C.panelAlt, borderRadius: 6, border: `1px solid ${C.border}` }}>
              💡 <strong>To activate live BDI data:</strong> add your free API key from{" "}
              <a href="https://www.oilpriceapi.com/auth/signup" target="_blank" rel="noopener noreferrer" style={{ color: C.blue }}>oilpriceapi.com</a>
              {" "}before floating the next tender. The key is saved per session only and never stored.
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

// ============================================================
// STAGE 4 — AWARD & CONNECT (one email, vendor + forwarder)
// ============================================================
function AwardConnectStage() {
  const [sent, setSent] = useState(false);
  const winner = [...BIDDERS].sort((a, b) => a.rate - b.rate)[0];

  return (
    <div className="fadein">
      <Header eyebrow="Stage 04" role="Procurement" title="Award & Connect" sub="One email brings the vendor and the winning freight forwarder together to coordinate pickup directly — no relay through the procurement team." />

      <Panel title="Connect Vendor + Freight Forwarder" right={!sent ? <ActionBtn onClick={() => setSent(true)} label="Send Connection Email →" color={C.violet} /> : <Badge color={C.green} label="SENT" />}>
        {!sent ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 16, padding: "20px 0" }}>
            <div style={{ padding: "14px 16px", borderRadius: 8, background: C.amberDim, border: `1px solid ${C.amber}33`, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: C.textFaint, fontFamily: sans, fontWeight: 700, marginBottom: 4 }}>VENDOR</div>
              <div style={{ fontSize: 13, color: C.navy, fontFamily: sans, fontWeight: 700 }}>{POOL_PO.vendor}</div>
              <div style={{ fontSize: 11, color: C.textFaint, fontFamily: sans, marginTop: 2 }}>{POOL_PO.vendorContact}</div>
            </div>
            <div style={{ fontSize: 18, color: C.textFaint }}>＋</div>
            <div style={{ padding: "14px 16px", borderRadius: 8, background: C.violetDim, border: `1px solid ${C.violet}33`, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: C.textFaint, fontFamily: sans, fontWeight: 700, marginBottom: 4 }}>FREIGHT FORWARDER</div>
              <div style={{ fontSize: 13, color: C.navy, fontFamily: sans, fontWeight: 700 }}>{winner.real}</div>
              <div style={{ fontSize: 11, color: C.textFaint, fontFamily: sans, marginTop: 2 }}>{winner.contact}</div>
            </div>
          </div>
        ) : (
          <NotificationBanner to={`To: ${POOL_PO.vendorContact}, ${winner.contact}`} color={C.violet}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, fontFamily: sans, marginBottom: 8 }}>
              ✓ Shipment Coordination — PO {POOL_PO.id}
            </div>
            <div style={{ fontSize: 13, color: C.text, fontFamily: sans, lineHeight: 1.7 }}>
              You are both confirmed for shipment <strong>{POOL_PO.id}</strong> ({POOL_PO.cargo}).
              <br /><br />
              <strong>{POOL_PO.vendor}</strong> — please coordinate pickup readiness at {POOL_PO.origin}.<br />
              <strong>{winner.real}</strong> — please confirm pickup scheduling at rate <strong style={{ fontFamily: mono, color: C.violet }}>{fmt(winner.rate)}</strong> and proceed to {POOL_PO.destination}.
              <br /><br />
              Please coordinate directly from this thread. Sha7ntec will track delivery status automatically.
            </div>
          </NotificationBanner>
        )}
        {sent && (
          <div style={{ marginTop: 14, padding: "12px 16px", background: C.greenDim, borderRadius: 6, border: `1px solid ${C.green}33`, fontSize: 12, color: C.text, fontFamily: sans, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: C.green, fontFamily: mono, fontWeight: 700 }}>✓</span>
            Vendor and freight forwarder are now connected directly. No further relay needed from the procurement team.
          </div>
        )}
      </Panel>

      {sent && (
        <Panel title="Multi-Channel Notification" sub="The same alert is pushed automatically to email, in-app, and WhatsApp — replacing scattered manual messages.">
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
            <WhatsAppNotif
              title={`📦 Shipment ${POOL_PO.id} — Awarded`}
              lines={[
                `${winner.real} won the tender at ${fmt(winner.rate)}.`,
                `Route: ${POOL_PO.origin} → ${POOL_PO.destination}`,
                `Action: Coordinate pickup directly. Tracking is now live.`,
              ]}
              time="14:32"
            />
            <div style={{ flex: 1, minWidth: 220, padding: "14px 16px", background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.navy, fontFamily: sans, marginBottom: 8 }}>Why this matters</div>
              <div style={{ fontSize: 12, color: C.textDim, fontFamily: sans, lineHeight: 1.7 }}>
                In most GCC logistics operations, this coordination happens across dozens of unstructured WhatsApp messages. Sha7ntec keeps the convenience of an instant WhatsApp alert — but every message is <strong style={{ color: C.text }}>logged, structured, and auditable</strong>, tied directly to the PO.
              </div>
            </div>
          </div>
        </Panel>
      )}

      {sent && <NextHint text="Freight Forwarder picks up, delivers, and uploads the Delivery Note" />}
    </div>
  );
}

// ============================================================
// STAGE 5 — DELIVERY (Freight Forwarder uploads DN + Invoice)
// ============================================================
function DeliveryStage() {
  const [delivered, setDelivered] = useState(false);
  const winner = [...BIDDERS].sort((a, b) => a.rate - b.rate)[0];

  return (
    <div className="fadein">
      <Header eyebrow="Stage 05" role="Freight Forwarder" title="Delivery Confirmation" sub="After delivering the material, the freight forwarder uploads the Delivery Note and Invoice together, then marks the shipment status as Delivered." />

      <Panel title={`Freight Forwarder Portal — ${winner.real}`} right={!delivered ? <ActionBtn onClick={() => setDelivered(true)} label="Upload Documents & Mark Delivered →" color={C.violet} /> : <Badge color={C.green} label="DELIVERED" />}>
        <Grid cols={2}>
          <Field label="Shipment" value={POOL_PO.id} mono />
          <Field label="Route" value={`${POOL_PO.origin} → ${POOL_PO.destination}`} />
        </Grid>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, color: C.textFaint, fontFamily: sans, letterSpacing: 0.4, marginBottom: 8, fontWeight: 700 }}>DELIVERY DOCUMENTS</div>
          <DocRow name="Delivery Note.pdf" size="78 KB" uploaded={delivered} />
          <DocRow name={`Freight Invoice — ${fmt(winner.rate)}.pdf`} size="64 KB" uploaded={delivered} />
        </div>
        {!delivered ? (
          <div style={{ marginTop: 8, padding: "12px 14px", borderRadius: 8, background: C.panelAlt, border: `1px solid ${C.border}`, fontSize: 12, color: C.textFaint, fontFamily: sans }}>
            Status: <strong style={{ color: C.amber }}>In Transit</strong> — awaiting delivery confirmation and invoice from forwarder.
          </div>
        ) : (
          <div className="fadein" style={{ marginTop: 8, padding: "12px 16px", background: C.greenDim, borderRadius: 6, border: `1px solid ${C.green}33`, fontSize: 12, color: C.text, fontFamily: sans, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: C.green, fontFamily: mono, fontWeight: 700 }}>✓</span>
            Delivery Note and Invoice uploaded. Status updated to <strong>Delivered</strong>. Store/Warehouse team is now notified to confirm physical receipt.
          </div>
        )}
      </Panel>

      {delivered && <NextHint text="Store/Warehouse User confirms physical receipt of the material" />}
    </div>
  );
}

// ============================================================
// STAGE 6 — GOODS RECEIPT + SAP SERVICE ENTRY (combined)
// ============================================================
function GoodsReceiptStage() {
  const [condition, setCondition] = useState(null);
  const [note, setNote] = useState("");
  const [missingQty, setMissingQty] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [posted, setPosted] = useState(false);
  const winner = [...BIDDERS].sort((a, b) => a.rate - b.rate)[0];
  const total = LANDED_COST_ITEMS.reduce((s, i) => s + i.value, 0);
  const totalCounted = useCountUp(posted ? total : 0, 1000);

  const CONDITIONS = [
    { key: "good",           label: "Material in Good Condition", icon: "✅", color: C.green,  desc: "All items received intact and as ordered." },
    { key: "courier_damage", label: "Courier / Package Damage",   icon: "📦", color: C.amber,  desc: "Outer packaging damaged in transit." },
    { key: "material_damage",label: "Material Damaged",           icon: "🔴", color: C.red,    desc: "Goods themselves are damaged or defective." },
    { key: "missing",        label: "Missing Items",              icon: "📋", color: C.violet, desc: "Quantity received is short of the packing list." },
  ];

  const selected = CONDITIONS.find(c => c.key === condition);
  const hasDiscrepancy = condition && condition !== "good";
  const canConfirm = condition && (condition !== "missing" || missingQty.trim());

  const receiptStatusLabel = !confirmed ? "Pending Inspection"
    : condition === "good" ? "Received — Good Condition"
    : condition === "courier_damage" ? "Received with Note — Package Damage"
    : condition === "material_damage" ? "Received with Discrepancy — Material Damage"
    : "Received Short — Missing Items";

  return (
    <div className="fadein">
      <Header eyebrow="Stage 06" role="Store / Warehouse" title="Goods Receipt & Service Entry" sub="The store keeper inspects the shipment, records its receiving condition, then Sha7ntec posts the Service Entry Sheet in SAP — flagging any discrepancy for Finance before payment." />

      {/* INSPECTION PANEL */}
      <Panel title={`Goods Receipt — ${POOL_PO.id}`} right={confirmed ? <Badge color={selected.color} label={condition === "good" ? "RECEIVED — GOOD" : "RECEIVED — FLAGGED"} /> : null}>
        <Grid cols={2}>
          <Field label="Cargo" value={POOL_PO.cargo} />
          <Field label="Delivery Note" value="Delivery Note.pdf — verified" mono color={C.green} />
        </Grid>

        {!confirmed ? (
          <>
            <div style={{ marginTop: 18, marginBottom: 10, fontSize: 11, fontWeight: 700, color: C.textFaint, letterSpacing: 0.5, fontFamily: sans }}>
              STEP 1 — SELECT RECEIVING CONDITION
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {CONDITIONS.map(c => {
                const active = condition === c.key;
                return (
                  <button key={c.key} onClick={() => setCondition(c.key)} style={{
                    display: "flex", alignItems: "flex-start", gap: 10, padding: "13px 14px", borderRadius: 8,
                    background: active ? c.color + "14" : C.panelAlt,
                    border: active ? `1.5px solid ${c.color}` : `1px solid ${C.border}`,
                    cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                  }}>
                    <span style={{ fontSize: 18, marginTop: 1 }}>{c.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: active ? c.color : C.navy, fontFamily: sans }}>{c.label}</div>
                      <div style={{ fontSize: 10.5, color: C.textDim, fontFamily: sans, marginTop: 2, lineHeight: 1.4 }}>{c.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Missing qty field */}
            {condition === "missing" && (
              <div className="fadein" style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textFaint, letterSpacing: 0.4, marginBottom: 5, fontFamily: sans }}>MISSING QUANTITY / ITEMS</div>
                <input value={missingQty} onChange={e => setMissingQty(e.target.value)} placeholder="e.g. 12 MT short / 3 beams missing"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 7, border: `1px solid ${C.violet}55`, background: C.panel, fontSize: 13, fontFamily: sans, color: C.text, outline: "none", boxSizing: "border-box" }} />
              </div>
            )}

            {/* Note field */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textFaint, letterSpacing: 0.4, marginBottom: 5, fontFamily: sans }}>
                STEP 2 — STORE KEEPER NOTE {hasDiscrepancy ? "(required for discrepancy)" : "(optional)"}
              </div>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                placeholder={hasDiscrepancy ? "Describe the damage / discrepancy for the end user and Finance…" : "Add any remarks about this receipt…"}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.panelAlt, fontSize: 12.5, fontFamily: sans, color: C.text, outline: "none", boxSizing: "border-box", resize: "vertical" }} />
            </div>

            {hasDiscrepancy && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: selected.color + "12", border: `1px solid ${selected.color}44`, borderRadius: 7, fontSize: 12, color: C.text, fontFamily: sans, lineHeight: 1.5 }}>
                <span style={{ color: selected.color, fontWeight: 700 }}>⚠ Discrepancy will be flagged.</span> This shipment will be logged as <strong>{selected.label}</strong> and routed to the end user and Finance for review before payment is released.
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <ActionBtn onClick={() => canConfirm && setConfirmed(true)} label="Confirm Receipt →" color={C.green} disabled={!canConfirm} />
              {!condition && <span style={{ fontSize: 11.5, color: C.textFaint, marginLeft: 12, fontFamily: sans }}>Select a receiving condition to continue.</span>}
            </div>
          </>
        ) : (
          <div className="fadein" style={{ marginTop: 14 }}>
            <div style={{ padding: "12px 16px", background: selected.color + "12", borderRadius: 8, border: `1px solid ${selected.color}44`, fontSize: 12.5, color: C.text, fontFamily: sans, display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span style={{ fontSize: 16 }}>{selected.icon}</span>
              <div>
                <div style={{ fontWeight: 700, color: selected.color }}>{selected.label}</div>
                {condition === "missing" && missingQty && <div style={{ marginTop: 3, color: C.text }}>Shortage: <strong>{missingQty}</strong></div>}
                {note && <div style={{ marginTop: 3, color: C.textDim, fontStyle: "italic" }}>“{note}”</div>}
                <div style={{ marginTop: 4, color: C.textDim, fontSize: 11.5 }}>Recorded by Store Keeper · Doha Port Warehouse</div>
              </div>
            </div>
          </div>
        )}
      </Panel>

      {confirmed && (
        <Panel title="SAP S/4HANA — Service Entry Sheet" right={!posted ? <ActionBtn onClick={() => setPosted(true)} label="Post Service Entry to SAP →" color={C.navy} /> : <Badge color={C.green} label="POSTED TO SAP" />}>
          <Grid cols={2}>
            <Field label="PO Reference" value={POOL_PO.id} mono />
            <Field label="Vendor (Freight)" value={winner.real} />
            <Field label="Service Entry Amount" value={fmt(winner.rate)} mono color={C.navy} />
            <Field label="Goods Receipt Status" value={receiptStatusLabel} color={selected.color} />
          </Grid>
          {posted && (
            <div className="fadein" style={{ marginTop: 16, padding: "12px 16px", background: hasDiscrepancy ? selected.color + "12" : C.greenDim, borderRadius: 6, border: `1px solid ${hasDiscrepancy ? selected.color + "44" : C.green + "33"}`, fontSize: 12, color: C.text, fontFamily: sans, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: selected.color, fontFamily: mono, fontWeight: 700 }}>{hasDiscrepancy ? "⚠" : "✓"}</span>
              {hasDiscrepancy
                ? `Service Entry posted with a flagged discrepancy (${selected.label}). Finance is notified to review before releasing payment.`
                : "Service Entry Sheet posted to SAP. Sha7ntec is now notifying Finance to process the freight forwarder's payment."}
            </div>
          )}
        </Panel>
      )}

      {posted && (
        <Panel title="Real-Time Landed Cost — Final" sub="Per shipment — Product + Freight + Duties">
          {LANDED_COST_ITEMS.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: i < LANDED_COST_ITEMS.length - 1 ? `1px solid ${C.border}` : "none" }}>
              <span style={{ fontSize: 13, color: C.textDim, fontFamily: sans }}>{item.label}</span>
              <span style={{ fontSize: 13, fontFamily: mono, color: item.color, fontWeight: 600 }}>{fmt(item.value)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0 4px", marginTop: 6, borderTop: `1px solid ${C.borderStrong}` }}>
            <span style={{ fontSize: 14, color: C.navy, fontFamily: sans, fontWeight: 700 }}>Total Landed Cost</span>
            <span style={{ fontSize: 18, fontFamily: mono, color: C.green, fontWeight: 700 }}>{fmt(totalCounted)}</span>
          </div>
        </Panel>
      )}

      {posted && <NextHint text={hasDiscrepancy ? "Finance reviews the flagged discrepancy before processing payment" : "System notifies Finance to process the freight forwarder's shipping payment"} />}
    </div>
  );
}

// ============================================================
// STAGE 7 — FINANCE PAYMENT NOTIFICATION
// ============================================================
function FinancePaymentStage() {
  const [seen, setSeen] = useState(false);
  const [approved, setApproved] = useState(false);
  const [posted, setPosted] = useState(false);
  const [posting, setPosting] = useState(false);
  const winner = [...BIDDERS].sort((a, b) => a.rate - b.rate)[0];

  const handlePost = () => {
    setPosting(true);
    setTimeout(() => { setPosting(false); setPosted(true); }, 1400);
  };

  const LANDED_TOTAL = 1840000 + winner.rate + 6200 + 92000 + 4100;

  return (
    <div className="fadein">
      <Header eyebrow="Stage 07 · Final" role="Finance" title="Finance Payment & ERP Closure" sub="Finance reviews the payment notification, approves it, then Sha7ntec posts the payment instruction back to SAP/Dynamics — closing the full financial loop." />

      {/* STEP 1 — Finance inbox notification */}
      <Panel title="Step 1 — Finance Inbox" right={!seen ? <ActionBtn onClick={() => setSeen(true)} label="Open Notification →" color={C.red} /> : <Badge color={C.green} label="REVIEWED" />}>
        {!seen ? (
          <div style={{ padding: "16px", borderRadius: 8, background: C.redDim, border: `1px solid ${C.red}33`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: C.red }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, fontFamily: sans }}>Process freight payment — {winner.real} — {POOL_PO.id}</div>
                <div style={{ fontSize: 11, color: C.textFaint, fontFamily: sans, marginTop: 2 }}>From Sha7ntec System · just now</div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: C.red, fontFamily: mono, fontWeight: 700 }}>ACTION NEEDED</div>
          </div>
        ) : (
          <NotificationBanner to="To: Finance Team" color={C.red}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, fontFamily: sans, marginBottom: 8 }}>
              ✓ Shipment {POOL_PO.id} ready for freight payment processing
            </div>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                "Delivery Note uploaded by " + winner.real,
                "Freight Invoice uploaded — " + fmt(winner.rate),
                "Goods Receipt confirmed by Store / Warehouse",
                "SAP Service Entry Sheet posted",
              ].map((t, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.text, fontFamily: sans }}>
                  <span style={{ color: C.green, fontFamily: mono, fontWeight: 700 }}>✓</span>{t}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, fontSize: 13, color: C.text, fontFamily: sans, lineHeight: 1.7 }}>
              Proceed with payment to <strong>{winner.real}</strong> for <strong style={{ fontFamily: mono, color: C.red }}>{fmt(winner.rate)}</strong>. Reference: PO {POOL_PO.id}.
            </div>
          </NotificationBanner>
        )}
      </Panel>

      {/* STEP 2 — Finance approves payment */}
      {seen && (
        <Panel title="Step 2 — Approve Payment" right={!approved ? <ActionBtn onClick={() => setApproved(true)} label="Approve & Initiate Payment →" color={C.red} /> : <Badge color={C.green} label="APPROVED" />}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              ["Payee", winner.real],
              ["PO Reference", POOL_PO.id, true],
              ["Payment Amount", fmt(winner.rate), true, C.red],
              ["Payment Method", "Bank Transfer — ERP AP Module"],
              ["Currency", "USD"],
              ["Approval Status", approved ? "Finance Approved ✓" : "Awaiting Finance Approval", false, approved ? C.green : C.amber],
            ].map(([label, value, isMono, color], i) => (
              <div key={i}>
                <div style={{ fontSize: 10.5, color: C.textFaint, fontWeight: 700, letterSpacing: 0.4, fontFamily: sans, marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13, color: color || C.text, fontFamily: isMono ? mono : sans, fontWeight: isMono ? 700 : 500 }}>{value}</div>
              </div>
            ))}
          </div>
          {approved && (
            <div style={{ marginTop: 14, padding: "11px 15px", background: C.greenDim, border: `1px solid ${C.green}33`, borderRadius: 7, fontSize: 12.5, color: C.text, fontFamily: sans }}>
              <span style={{ color: C.green, fontWeight: 700 }}>✓ </span>Payment approved by Finance. Sha7ntec is ready to post the payment instruction back to your ERP system.
            </div>
          )}
        </Panel>
      )}

      {/* STEP 3 — Post back to SAP / Dynamics */}
      {approved && (
        <Panel
          title="Step 3 — Post Payment to ERP"
          sub="Sha7ntec sends the payment instruction back to SAP S/4HANA or Microsoft Dynamics — closing the financial loop inside your ERP."
          right={!posted
            ? <ActionBtn onClick={handlePost} label={posting ? "Posting to ERP…" : "Post to SAP / Dynamics →"} color={C.navy} disabled={posting} />
            : <Badge color={C.green} label="POSTED TO ERP" />
          }
        >
          {/* ERP target selector visual */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            {[
              { name: "SAP S/4HANA", active: true, sub: "Connected · OData API" },
              { name: "MS Dynamics 365", active: false, sub: "Available" },
              { name: "Oracle Fusion", active: false, sub: "Available" },
            ].map((erp, i) => (
              <div key={i} style={{ flex: 1, padding: "12px 14px", borderRadius: 8, background: erp.active ? C.blueDim : C.panelAlt, border: `1.5px solid ${erp.active ? C.blue + "55" : C.border}` }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: erp.active ? C.navy : C.textFaint, fontFamily: sans }}>{erp.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: erp.active ? C.green : C.textFaint }} />
                  <span style={{ fontSize: 10.5, color: erp.active ? C.green : C.textFaint, fontFamily: sans, fontWeight: 600 }}>{erp.sub}</span>
                </div>
              </div>
            ))}
          </div>

          {/* ERP payload preview */}
          <div style={{ padding: "14px 16px", background: C.navy, borderRadius: 8, fontFamily: mono, fontSize: 11.5, color: "#AFC3D6", lineHeight: 2 }}>
            <div style={{ color: "#5BB8F5", marginBottom: 4, fontSize: 11, letterSpacing: 0.5 }}>// SAP API — Payment Instruction Payload</div>
            <div><span style={{ color: "#7ECFAA" }}>POST</span> /sap/opu/odata/sap/FSCM_BAPI_PAYMENT_SRV</div>
            <div style={{ marginTop: 6 }}>
              <span style={{ color: C.amber }}>{"{"}</span><br />
              &nbsp;&nbsp;<span style={{ color: "#7ECFAA" }}>"PO_NUMBER"</span>: <span style={{ color: "#F0C070" }}>"{POOL_PO.id}"</span>,<br />
              &nbsp;&nbsp;<span style={{ color: "#7ECFAA" }}>"VENDOR_ID"</span>: <span style={{ color: "#F0C070" }}>"{winner.real}"</span>,<br />
              &nbsp;&nbsp;<span style={{ color: "#7ECFAA" }}>"AMOUNT"</span>: <span style={{ color: "#F0C070" }}>{winner.rate}</span>,<br />
              &nbsp;&nbsp;<span style={{ color: "#7ECFAA" }}>"CURRENCY"</span>: <span style={{ color: "#F0C070" }}>"USD"</span>,<br />
              &nbsp;&nbsp;<span style={{ color: "#7ECFAA" }}>"PAYMENT_METHOD"</span>: <span style={{ color: "#F0C070" }}>"T"</span>,<br />
              &nbsp;&nbsp;<span style={{ color: "#7ECFAA" }}>"REFERENCE"</span>: <span style={{ color: "#F0C070" }}>"SHA7NTEC-{POOL_PO.id}"</span>,<br />
              &nbsp;&nbsp;<span style={{ color: "#7ECFAA" }}>"STATUS"</span>: <span style={{ color: "#F0C070" }}>{posted ? '"APPROVED"' : '"PENDING"'}</span><br />
              <span style={{ color: C.amber }}>{"}"}</span>
            </div>
          </div>

          {posting && (
            <div style={{ marginTop: 14, padding: "11px 15px", background: C.blueDim, border: `1px solid ${C.blue}33`, borderRadius: 7, fontSize: 12.5, color: C.text, fontFamily: sans, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 14, height: 14, border: `2px solid ${C.blue}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              Posting payment instruction to SAP S/4HANA via secure API…
            </div>
          )}

          {posted && (
            <div style={{ marginTop: 14, padding: "12px 16px", background: C.greenDim, border: `1px solid ${C.green}33`, borderRadius: 7, fontSize: 12.5, color: C.text, fontFamily: sans }}>
              <span style={{ color: C.green, fontWeight: 700 }}>✓ </span>
              Payment instruction posted to SAP S/4HANA. Accounts Payable will process <strong>{fmt(winner.rate)}</strong> to <strong>{winner.real}</strong> within the standard payment run. Reference: <span style={{ fontFamily: mono }}>SHA7NTEC-{POOL_PO.id}</span>
            </div>
          )}
        </Panel>
      )}

      {/* CLOSING — full loop complete */}
      {posted && (
        <div style={{ marginTop: 18, padding: "20px 24px", borderRadius: 12, background: `linear-gradient(135deg, ${C.blueDim}, ${C.greenDim})`, border: `1.5px solid ${C.borderStrong}` }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.navy, fontFamily: sans, marginBottom: 6 }}>🎉 Full Shipment Lifecycle Complete — A to Z</div>
          <div style={{ fontSize: 12.5, color: C.textDim, fontFamily: sans, lineHeight: 1.7, marginBottom: 16 }}>
            From vendor document upload to ERP payment posting — every handoff automated, every action logged, zero manual reconciliation.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {[
              { label: "Total PO Value", value: fmt(POOL_PO.value), color: C.navy },
              { label: "Freight Secured", value: fmt(winner.rate), color: C.blue },
              { label: "Savings vs. Highest Bid", value: fmt(51200 - winner.rate), color: C.green },
              { label: "Total Landed Cost", value: fmt(LANDED_TOTAL), color: C.green },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: "center", padding: "12px 8px", background: C.panel, borderRadius: 8, border: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: mono, fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10.5, color: C.textFaint, fontFamily: sans, marginTop: 4, fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// SHIPMENT STATUS BAR — top clickable status tabs
// ============================================================
const SHIPMENT_STATUSES = [
  { key: 0, label: "Shipping PO",         icon: "⏳", color: "#E0A23A", stages: [0, 1] },
  { key: 1, label: "Shipping Tender",     icon: "🔒", color: "#2E8FE0", stages: [2]    },
  { key: 2, label: "Shipping Awarded",    icon: "🏆", color: "#7B6FD0", stages: [3]    },
  { key: 3, label: "Shipping Delivery",   icon: "🚢", color: "#7B6FD0", stages: [4]    },
  { key: 4, label: "Shipping Receipt",    icon: "📦", color: "#1FAE6E", stages: [5]    },
  { key: 5, label: "Shipping Payment",    icon: "💳", color: "#E0604A", stages: [6]    },
];

function ShipmentStatusBar({ stage, setStage }) {
  const activeStatus = SHIPMENT_STATUSES.findIndex(s => s.stages.includes(stage));
  const isComplete = stage === 6;

  return (
    <div style={{
      background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: "10px 14px", marginBottom: 14,
      boxShadow: "0 1px 3px rgba(20,60,90,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {/* Shipment ID pill */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
          background: C.navy, borderRadius: 7, flexShrink: 0, marginRight: 4,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: C.white, fontFamily: mono, letterSpacing: 0.3 }}>
            PO-2026-04471
          </span>
        </div>

        {/* Status tabs */}
        {SHIPMENT_STATUSES.map((s, i) => {
          const isPast = i < activeStatus || isComplete;
          const isActive = i === activeStatus && !isComplete;
          const isFuture = i > activeStatus && !isComplete;
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              {/* Connector line */}
              {i > 0 && (
                <div style={{
                  width: 18, height: 2, borderRadius: 1,
                  background: isPast || isActive ? `linear-gradient(90deg, ${SHIPMENT_STATUSES[i-1].color}, ${s.color})` : C.border,
                  flexShrink: 0,
                }} />
              )}
              <button
                onClick={() => setStage(s.stages[0])}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 7, cursor: "pointer",
                  border: isActive ? `1.5px solid ${s.color}` : `1px solid ${isPast ? s.color + "55" : C.border}`,
                  background: isActive ? s.color + "18" : isPast ? s.color + "0D" : "transparent",
                  transition: "all 0.15s", flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 13 }}>{isPast || isComplete ? "✓" : s.icon}</span>
                <span style={{
                  fontSize: 11.5, fontWeight: isActive ? 700 : 600, fontFamily: sans,
                  color: isActive ? s.color : isPast ? s.color : C.textFaint,
                  whiteSpace: "nowrap",
                }}>
                  {s.label}
                </span>
              </button>
            </div>
          );
        })}

        {/* Complete badge */}
        {isComplete && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <div style={{ width: 18, height: 2, background: C.green, borderRadius: 1 }} />
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 7,
              background: C.greenDim2, border: `1.5px solid ${C.green}55`,
            }}>
              <span style={{ fontSize: 13 }}>🎉</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: C.green, fontFamily: sans }}>Complete</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// EXPORT BUTTONS (PDF via print, Excel via CSV download)
// ============================================================
function ExportButtons({ rows, filename, label }) {
  const exportCSV = () => {
    if (!rows || rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map(r => headers.map(h => {
        const v = String(r[h] ?? "").replace(/"/g, '""');
        return /[",\n]/.test(v) ? `"${v}"` : v;
      }).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => window.print();

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button onClick={exportCSV} style={{
        display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 7,
        background: C.greenDim2, border: `1px solid ${C.green}55`, color: C.green,
        fontSize: 12, fontWeight: 700, fontFamily: sans, cursor: "pointer",
      }}>
        <span>⬇</span> Export Excel
      </button>
      <button onClick={exportPDF} style={{
        display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 7,
        background: C.blueDim2, border: `1px solid ${C.blue}55`, color: C.blue,
        fontSize: 12, fontWeight: 700, fontFamily: sans, cursor: "pointer",
      }}>
        <span>🖨</span> Export PDF
      </button>
    </div>
  );
}

// ============================================================
// WHATSAPP NOTIFICATION MOCKUP
// ============================================================
function WhatsAppNotif({ title, lines, time }) {
  return (
    <div style={{ maxWidth: 340, background: "#E5DDD5", borderRadius: 12, padding: 12, fontFamily: sans, boxShadow: "0 2px 10px rgba(0,0,0,0.08)" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>💬</div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#075E54" }}>Sha7ntec Alerts</div>
          <div style={{ fontSize: 10, color: "#667781" }}>WhatsApp Business · Verified ✓</div>
        </div>
      </div>
      {/* bubble */}
      <div style={{ background: "#FFFFFF", borderRadius: "0 10px 10px 10px", padding: "10px 12px", boxShadow: "0 1px 1px rgba(0,0,0,0.1)" }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#075E54", marginBottom: 6 }}>{title}</div>
        {lines.map((l, i) => (
          <div key={i} style={{ fontSize: 12, color: "#303030", lineHeight: 1.6 }}>{l}</div>
        ))}
        <div style={{ fontSize: 9.5, color: "#8696A0", textAlign: "right", marginTop: 5 }}>{time} ✓✓</div>
      </div>
    </div>
  );
}

// ============================================================
// ANALYTICS DASHBOARD
// ============================================================
function AnalyticsDashboard() {
  const totalSavings = PIPELINE.reduce((s, p) => s + p.savings, 0);
  const totalValue = PIPELINE.reduce((s, p) => s + p.value, 0);
  const totalFreight = PIPELINE.reduce((s, p) => s + p.freight, 0);
  const activeShipments = PIPELINE.filter(p => !["Paid"].includes(p.status)).length;
  const avgSavingPct = totalFreight > 0 ? ((totalSavings / (totalFreight + totalSavings)) * 100) : 0;

  const kpis = [
    { label: "Total Freight Savings", value: fmt(totalSavings), sub: "across all shipments", color: C.green, icon: "💰" },
    { label: "PO Value Managed", value: fmt(totalValue), sub: `${PIPELINE.length} shipments`, color: C.navy, icon: "📦" },
    { label: "Avg. Savings per Tender", value: `${avgSavingPct.toFixed(1)}%`, sub: "vs. highest bid", color: C.blue, icon: "📉" },
    { label: "Avg. Tender Time", value: "3.8 hrs", sub: "from open to award", color: C.violet, icon: "⏱" },
  ];

  return (
    <div className="fadein">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.navy, fontFamily: sans }}>Analytics Overview</div>
          <div style={{ fontSize: 12.5, color: C.textDim, fontFamily: sans, marginTop: 3 }}>Live performance across all shipments managed through Sha7ntec.</div>
        </div>
        <ExportButtons rows={PIPELINE.map(p => ({ PO: p.id, Vendor: p.vendor, Value: p.value, Status: p.status, Forwarder: p.forwarder, Freight: p.freight, Savings: p.savings }))} filename="sha7ntec-analytics" />
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        {kpis.map((k, i) => (
          <div key={i} style={{ background: C.panel, border: `1px solid ${C.border}`, borderTop: `3px solid ${k.color}`, borderRadius: 10, padding: "16px 16px", boxShadow: "0 1px 3px rgba(20,60,90,0.04)" }}>
            <div style={{ fontSize: 18, marginBottom: 6 }}>{k.icon}</div>
            <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: C.text, fontFamily: sans, marginTop: 4 }}>{k.label}</div>
            <div style={{ fontSize: 10.5, color: C.textFaint, fontFamily: sans, marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        {/* Forwarder leaderboard */}
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18, boxShadow: "0 1px 3px rgba(20,60,90,0.04)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, fontFamily: sans, marginBottom: 14 }}>🏆 Freight Forwarder Leaderboard</div>
          <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 60px 60px 60px", gap: 8, padding: "0 4px 8px", borderBottom: `1px solid ${C.border}`, fontSize: 9.5, color: C.textFaint, fontFamily: sans, fontWeight: 700, letterSpacing: 0.3 }}>
            <span>#</span><span>FORWARDER</span><span style={{ textAlign: "right" }}>WON</span><span style={{ textAlign: "right" }}>AVG SAVE</span><span style={{ textAlign: "right" }}>ON-TIME</span>
          </div>
          {FORWARDER_LEADERBOARD.map((f, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "24px 1fr 60px 60px 60px", gap: 8, padding: "11px 4px", borderBottom: i < FORWARDER_LEADERBOARD.length - 1 ? `1px solid ${C.border}` : "none", alignItems: "center" }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: i === 0 ? C.amber : i === 1 ? "#B8C4CE" : i === 2 ? "#CD9B6A" : C.panelAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: i < 3 ? C.white : C.textDim, fontFamily: mono }}>{i + 1}</div>
              <span style={{ fontSize: 12, color: C.navy, fontFamily: sans, fontWeight: 600 }}>{f.name}</span>
              <span style={{ fontSize: 12, color: C.text, fontFamily: mono, textAlign: "right", fontWeight: 600 }}>{f.won}</span>
              <span style={{ fontSize: 12, color: C.green, fontFamily: mono, textAlign: "right", fontWeight: 700 }}>{f.avgSaving}%</span>
              <span style={{ fontSize: 12, color: C.blue, fontFamily: mono, textAlign: "right", fontWeight: 600 }}>{f.onTime}%</span>
            </div>
          ))}
        </div>

        {/* Savings bar visual */}
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18, boxShadow: "0 1px 3px rgba(20,60,90,0.04)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, fontFamily: sans, marginBottom: 14 }}>📊 Savings by Shipment</div>
          {PIPELINE.filter(p => p.savings > 0).slice(0, 6).map((p, i) => {
            const maxSaving = Math.max(...PIPELINE.map(x => x.savings));
            const pct = (p.savings / maxSaving) * 100;
            return (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10.5, color: C.textDim, fontFamily: mono }}>{p.id}</span>
                  <span style={{ fontSize: 11, color: C.green, fontFamily: mono, fontWeight: 700 }}>{fmt(p.savings)}</span>
                </div>
                <div style={{ height: 6, background: C.panelAlt, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${C.blue}, ${C.green})`, borderRadius: 3 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SHIPMENT PIPELINE (multi-shipment table)
// ============================================================
function ShipmentPipeline({ onOpenActive }) {
  return (
    <div className="fadein">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.navy, fontFamily: sans }}>Shipping PO</div>
          <div style={{ fontSize: 12.5, color: C.textDim, fontFamily: sans, marginTop: 3 }}>All active and completed shipments. Click the live shipment to open its full workflow.</div>
        </div>
        <ExportButtons rows={PIPELINE.map(p => ({ PO: p.id, Vendor: p.vendor, Cargo: p.cargo, Value: p.value, Lane: p.lane, Status: p.status, Forwarder: p.forwarder }))} filename="sha7ntec-pipeline" />
      </div>

      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(20,60,90,0.04)" }}>
        {/* header */}
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.4fr 1fr 0.9fr 1fr 0.9fr", gap: 10, padding: "12px 16px", background: C.panelAlt, borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textFaint, fontFamily: sans, fontWeight: 700, letterSpacing: 0.4 }}>
          <span>PO NUMBER</span><span>VENDOR / CARGO</span><span>LANE</span><span style={{ textAlign: "right" }}>VALUE</span><span>STATUS</span><span style={{ textAlign: "right" }}>SAVINGS</span>
        </div>
        {PIPELINE.map((p, i) => (
          <div
            key={i}
            onClick={p.active ? onOpenActive : undefined}
            style={{
              display: "grid", gridTemplateColumns: "1.1fr 1.4fr 1fr 0.9fr 1fr 0.9fr", gap: 10,
              padding: "13px 16px", borderBottom: i < PIPELINE.length - 1 ? `1px solid ${C.border}` : "none",
              alignItems: "center", cursor: p.active ? "pointer" : "default",
              background: p.active ? C.blueDim : "transparent",
            }}
          >
            <div>
              <div style={{ fontSize: 12.5, color: C.navy, fontFamily: mono, fontWeight: 700 }}>{p.id}</div>
              {p.active && <div style={{ fontSize: 9, color: C.blue, fontWeight: 700, fontFamily: sans, marginTop: 2 }}>● LIVE — CLICK TO OPEN</div>}
            </div>
            <div>
              <div style={{ fontSize: 12, color: C.text, fontFamily: sans, fontWeight: 600 }}>{p.vendor}</div>
              <div style={{ fontSize: 10.5, color: C.textFaint, fontFamily: sans, marginTop: 1 }}>{p.cargo}</div>
            </div>
            <span style={{ fontSize: 11, color: C.textDim, fontFamily: sans }}>{p.lane}</span>
            <span style={{ fontSize: 12, color: C.text, fontFamily: mono, textAlign: "right", fontWeight: 600 }}>{fmt(p.value)}</span>
            <div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 5, background: p.statusColor + "18", border: `1px solid ${p.statusColor}44`, fontSize: 10, fontWeight: 700, color: p.statusColor, fontFamily: sans }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: p.statusColor }} />{p.status}
              </span>
            </div>
            <span style={{ fontSize: 12, color: p.savings > 0 ? C.green : C.textFaint, fontFamily: mono, textAlign: "right", fontWeight: 700 }}>{p.savings > 0 ? fmt(p.savings) : "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// INSIGHTS BROWSER (advanced analytics — 5 metrics)
// ============================================================
function InsightsBrowser() {
  const totalSavings = SAVINGS_TREND.reduce((s, m) => s + m.value, 0);
  const maxSaving = Math.max(...SAVINGS_TREND.map(m => m.value));
  const bestCarrier = BEST_CARRIER_12MO[0];
  const maxCost = Math.max(...AVG_COST_BY_COUNTRY.map(c => c.avgCost));
  const currentOnTime = ON_TIME_TREND[ON_TIME_TREND.length - 1].pct;

  const panelStyle = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18, boxShadow: "0 1px 3px rgba(20,60,90,0.04)" };
  const titleStyle = { fontSize: 14, fontWeight: 700, color: C.navy, fontFamily: sans, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 };

  return (
    <div className="fadein">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.navy, fontFamily: sans }}>Insights &amp; Intelligence</div>
          <div style={{ fontSize: 12.5, color: C.textDim, fontFamily: sans, marginTop: 3 }}>Advanced analytics built from your shipment history — the data moat competitors can't replicate.</div>
        </div>
        <ExportButtons rows={BEST_CARRIER_12MO.map(c => ({ Carrier: c.name, Shipments: c.shipments, OnTime: c.onTime + "%", Spend: c.spend, Score: c.score }))} filename="sha7ntec-insights" />
      </div>

      {/* Top hero metric — total savings */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* إجمالي التوفير المحقق */}
        <div style={{ ...panelStyle, borderTop: `3px solid ${C.green}` }}>
          <div style={titleStyle}>💰 إجمالي التوفير المحقق <span style={{ fontSize: 11, color: C.textFaint, fontWeight: 500 }}>· Total Savings Achieved</span></div>
          <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 700, color: C.green, marginBottom: 12 }}>{fmt(totalSavings)}</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 90 }}>
            {SAVINGS_TREND.map((m, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                <div style={{ width: "100%", height: `${(m.value / maxSaving) * 72}px`, background: `linear-gradient(180deg, ${C.green}, ${C.blue})`, borderRadius: "4px 4px 0 0" }} />
                <span style={{ fontSize: 9, color: C.textFaint, fontFamily: sans }}>{m.month}</span>
              </div>
            ))}
          </div>
        </div>

        {/* commitment of delivery %*/}
        <div style={{ ...panelStyle, borderTop: `3px solid ${C.blue}` }}>
          <div style={titleStyle}>✅commitment of delivery % <span style={{ fontSize: 11, color: C.textFaint, fontWeight: 500 }}>· On-Time Delivery Rate</span></div>
          <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 700, color: C.blue, marginBottom: 12 }}>{currentOnTime}%</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 90 }}>
            {ON_TIME_TREND.map((m, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                <div style={{ width: "100%", height: `${(m.pct / 100) * 72}px`, background: m.pct >= 90 ? C.green : C.blue, borderRadius: "4px 4px 0 0", opacity: 0.85 }} />
                <span style={{ fontSize: 9, color: C.textFaint, fontFamily: sans }}>{m.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* best company in last 12 months */}
      <div style={{ ...panelStyle, marginBottom: 16 }}>
        <div style={titleStyle}>🏆best company in last 12 months <span style={{ fontSize: 11, color: C.textFaint, fontWeight: 500 }}>· Best Carrier — Last 12 Months</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 90px 90px 100px 70px", gap: 10, padding: "0 6px 8px", borderBottom: `1px solid ${C.border}`, fontSize: 9.5, color: C.textFaint, fontFamily: sans, fontWeight: 700, letterSpacing: 0.3 }}>
          <span>#</span><span>CARRIER</span><span style={{ textAlign: "right" }}>SHIPMENTS</span><span style={{ textAlign: "right" }}>ON-TIME</span><span style={{ textAlign: "right" }}>SPEND</span><span style={{ textAlign: "right" }}>SCORE</span>
        </div>
        {BEST_CARRIER_12MO.map((c, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "28px 1fr 90px 90px 100px 70px", gap: 10, padding: "11px 6px", borderBottom: i < BEST_CARRIER_12MO.length - 1 ? `1px solid ${C.border}` : "none", alignItems: "center" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: i === 0 ? C.amber : i === 1 ? "#B8C4CE" : i === 2 ? "#CD9B6A" : C.panelAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: i < 3 ? C.white : C.textDim, fontFamily: mono }}>{i + 1}</div>
            <span style={{ fontSize: 12.5, color: C.navy, fontFamily: sans, fontWeight: 600 }}>{c.name}</span>
            <span style={{ fontSize: 12, color: C.text, fontFamily: mono, textAlign: "right" }}>{c.shipments}</span>
            <span style={{ fontSize: 12, color: c.onTime >= 95 ? C.green : C.blue, fontFamily: mono, textAlign: "right", fontWeight: 700 }}>{c.onTime}%</span>
            <span style={{ fontSize: 12, color: C.textDim, fontFamily: mono, textAlign: "right" }}>{fmt(c.spend)}</span>
            <div style={{ textAlign: "right" }}>
              <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 5, background: c.score >= 90 ? C.greenDim2 : C.blueDim2, color: c.score >= 90 ? C.green : C.blue, fontSize: 11, fontWeight: 700, fontFamily: mono }}>{c.score}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* متوسط تكلفة الشحن حسب الدولة */}
        <div style={panelStyle}>
          <div style={titleStyle}>🌍 متوسط تكلفة الشحن حسب الدولة <span style={{ fontSize: 10, color: C.textFaint, fontWeight: 500 }}>· Avg Cost by Country</span></div>
          {AVG_COST_BY_COUNTRY.map((c, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: C.text, fontFamily: sans, fontWeight: 600 }}>{c.flag} {c.country} <span style={{ color: C.textFaint, fontWeight: 400 }}>· {c.shipments} shp</span></span>
                <span style={{ fontSize: 11.5, color: C.navy, fontFamily: mono, fontWeight: 700 }}>{fmt(c.avgCost)} <span style={{ color: c.trend.startsWith("-") ? C.green : c.trend.startsWith("+") ? C.red : C.textFaint, fontSize: 10 }}>{c.trend}</span></span>
              </div>
              <div style={{ height: 6, background: C.panelAlt, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(c.avgCost / maxCost) * 100}%`, background: `linear-gradient(90deg, ${C.blue}, ${C.violet})`, borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>

        {/* الموردون الأكثر تسبباً في التأخير */}
        <div style={panelStyle}>
          <div style={titleStyle}>⏱️ الموردون الأكثر تسبباً في التأخير <span style={{ fontSize: 10, color: C.textFaint, fontWeight: 500 }}>· Top Delay-Causing Suppliers</span></div>
          {TOP_DELAY_SUPPLIERS.map((s, i) => (
            <div key={i} style={{ marginBottom: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: C.text, fontFamily: sans, fontWeight: 600 }}>{s.name}</span>
                <span style={{ fontSize: 11, color: C.red, fontFamily: mono, fontWeight: 700 }}>{s.rate}% تأخير</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 6, background: C.panelAlt, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${s.rate}%`, background: `linear-gradient(90deg, ${C.amber}, ${C.red})`, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 10, color: C.textFaint, fontFamily: sans, whiteSpace: "nowrap" }}>{s.delays} تأخير · {s.avgDelayDays}d</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, padding: "12px 16px", background: C.blueDim, border: `1px solid ${C.blue}33`, borderRadius: 8, fontSize: 11.5, color: C.textDim, fontFamily: sans, lineHeight: 1.6 }}>
        <span style={{ color: C.blue, fontWeight: 700 }}>💡 ملاحظة استراتيجية: </span>
        كل هذه التحليلات تُبنى تلقائياً من بيانات الشحنات المتدفقة عبر Sha7ntec. كلما زاد استخدام العميل، أصبحت البيانات أكثر قيمة — وهذا هو الحاجز التنافسي (moat) الذي لا يستطيع المنافسون نسخه.
      </div>
    </div>
  );
}

// ============================================================
// APP ROOT
// ============================================================
export default function Sha7ntecMVP() {
  const [view, setView] = useState("dashboard");
  const [stage, setStage] = useState(0);
  const stages = [
    { label: "Vendor Document Upload",    role: "Vendor",            render: () => <VendorUploadStage /> },
    { label: "Shipment Ready Notification", role: "Procurement",     render: () => <ShipmentReadyStage /> },
    { label: "Tender · Blind Bidding",    role: "Procurement",       render: () => <TenderStage /> },
    { label: "Award & Connect",           role: "Procurement",       render: () => <AwardConnectStage /> },
    { label: "Delivery Confirmation",     role: "Freight Forwarder", render: () => <DeliveryStage /> },
    { label: "Goods Receipt & SAP Entry", role: "Store / Warehouse", render: () => <GoodsReceiptStage /> },
    { label: "Finance Payment Notification", role: "Finance",        render: () => <FinancePaymentStage /> },
  ];

  const openActiveWorkflow = () => { setView("workflow"); setStage(0); };

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, fontFamily: sans }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.borderStrong}; border-radius: 4px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .fadein { animation: fadeIn 0.35s ease; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media print { body * { visibility: visible; } }
      `}</style>

      <Sidebar view={view} setView={setView} stage={stage} setStage={setStage} stages={stages} />

      <div style={{ flex: 1, overflow: "auto", padding: "26px 32px" }}>
        <div style={{ maxWidth: view === "workflow" ? 880 : 1080, margin: "0 auto" }}>

          {view === "dashboard" && <AnalyticsDashboard />}

          {view === "insights" && <InsightsBrowser />}

          {view === "pipeline" && <ShipmentPipeline onOpenActive={openActiveWorkflow} />}

          {view === "workflow" && (
            <>
              <ShipmentStatusBar stage={stage} setStage={setStage} />
              <ProcessTrail stage={stage} total={stages.length} />
              {stages[stage].render()}

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
                <button onClick={() => setStage(s => Math.max(0, s - 1))} disabled={stage === 0} style={{ background: C.panel, border: `1px solid ${C.border}`, color: stage === 0 ? C.textFaint : C.textDim, borderRadius: 6, padding: "9px 16px", fontSize: 12, fontFamily: sans, fontWeight: 600, cursor: stage === 0 ? "default" : "pointer" }}>← Previous</button>
                <button onClick={() => setStage(s => Math.min(stages.length - 1, s + 1))} disabled={stage === stages.length - 1} style={{
                  background: stage === stages.length - 1 ? C.panel : `linear-gradient(135deg, ${C.blue}, ${C.green})`,
                  border: stage === stages.length - 1 ? `1px solid ${C.border}` : "none",
                  color: stage === stages.length - 1 ? C.textFaint : C.white,
                  borderRadius: 6, padding: "9px 16px", fontSize: 12, fontWeight: 700, fontFamily: sans,
                  cursor: stage === stages.length - 1 ? "default" : "pointer",
                  boxShadow: stage === stages.length - 1 ? "none" : "0 2px 8px rgba(46,143,224,0.25)",
                }}>Next Stage →</button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
