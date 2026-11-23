import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { idr, fmtD, daysTo } from "../lib/ui";

/* ---------- colors (validated: categorical blue/orange; ordinal blue ramp for aging) ---------- */
const SERIES = { sales: "#2a78d6", purchases: "#eb6834" };
const AGING_RAMP = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"];

/* ---------- compact Rupiah: Rp 12,3 jt · Rp 1,2 M ---------- */
const rpS = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `Rp ${(n / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  if (a >= 1e6) return `Rp ${(n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (a >= 1e3) return `Rp ${(n / 1e3).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`;
  return `Rp ${Math.round(n)}`;
};

/* ---------- date range presets (local calendar days) ---------- */
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addD = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
type Grain = "day" | "week" | "month";
const PRESETS: { k: string; lbl: string; grain: Grain; range: () => [Date, Date] }[] = [
  { k: "week", lbl: "This week", grain: "day", range: () => { const t = new Date(); return [addD(t, -((t.getDay() + 6) % 7)), t]; } },
  { k: "month", lbl: "This month", grain: "day", range: () => { const t = new Date(); return [new Date(t.getFullYear(), t.getMonth(), 1), t]; } },
  { k: "30d", lbl: "Last 30 days", grain: "day", range: () => { const t = new Date(); return [addD(t, -29), t]; } },
  { k: "90d", lbl: "Last 90 days", grain: "week", range: () => { const t = new Date(); return [addD(t, -89), t]; } },
  { k: "year", lbl: "This year", grain: "month", range: () => { const t = new Date(); return [new Date(t.getFullYear(), 0, 1), t]; } },
  { k: "12m", lbl: "Last 12 months", grain: "month", range: () => { const t = new Date(); return [new Date(t.getFullYear(), t.getMonth() - 11, 1), t]; } },
];
const GRAINS: { k: Grain; lbl: string }[] = [{ k: "day", lbl: "Daily" }, { k: "week", lbl: "Weekly" }, { k: "month", lbl: "Monthly" }];

// per-browser memory of the last filter
const loadF = () => { try { return JSON.parse(localStorage.getItem("mti_dash") || "null"); } catch { return null; } };
const saveF = (f: any) => { try { localStorage.setItem("mti_dash", JSON.stringify(f)); } catch {} };

export default function Dashboard() {
  const [f, setF] = useState<{ preset: string; from: string; to: string; grain: Grain }>(() => {
    const saved = loadF();
    if (saved?.preset && saved.preset !== "custom") {
      const p = PRESETS.find((x) => x.k === saved.preset);
      if (p) { const [a, b] = p.range(); return { preset: p.k, from: iso(a), to: iso(b), grain: saved.grain || p.grain }; }
    }
    if (saved?.preset === "custom") return saved;
    const p = PRESETS[5]; const [a, b] = p.range();
    return { preset: p.k, from: iso(a), to: iso(b), grain: p.grain };
  });
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    saveF(f);
    if (!f.from || !f.to || f.from > f.to) return;
    setLoading(true);
    api.get(`/dashboard?from=${f.from}&to=${f.to}&grain=${f.grain}`)
      .then((x) => { setD(x); setErr(""); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [f]);

  const pickPreset = (k: string) => {
    const p = PRESETS.find((x) => x.k === k)!;
    const [a, b] = p.range();
    setF({ preset: k, from: iso(a), to: iso(b), grain: p.grain });
  };

  return (
    <>
      {/* one filter row, above everything it scopes */}
      <div className="dash-filters">
        <div className="seg">
          {PRESETS.map((p) => <button key={p.k} className={f.preset === p.k ? "on" : ""} onClick={() => pickPreset(p.k)}>{p.lbl}</button>)}
          <button className={f.preset === "custom" ? "on" : ""} onClick={() => setF({ ...f, preset: "custom" })}>Custom</button>
        </div>
        {f.preset === "custom" && (
          <div className="range">
            <input type="date" value={f.from} max={f.to} onChange={(e) => setF({ ...f, from: e.target.value })} />
            <span>→</span>
            <input type="date" value={f.to} min={f.from} onChange={(e) => setF({ ...f, to: e.target.value })} />
          </div>
        )}
        <div className="seg">
          {GRAINS.map((g) => <button key={g.k} className={f.grain === g.k ? "on" : ""} onClick={() => setF({ ...f, grain: g.k })}>{g.lbl}</button>)}
        </div>
        {d && <span className="ccy">{fmtD(d.range.from)} – {fmtD(d.range.to)} · compared with {fmtD(d.range.prevFrom)} – {fmtD(d.range.prevTo)}</span>}
      </div>
      {err && <div className="login-err" style={{ marginBottom: 12 }}>{err}</div>}
      {!d ? <div className="loading">Loading dashboard…</div> : <Body d={d} loading={loading} />}
    </>
  );
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function Delta({ cur, prev, goodUp = true }: { cur: number; prev: number; goodUp?: boolean }) {
  if (!prev && !cur) return <span className="k-sub neu">no activity</span>;
  if (!prev) return <span className="k-sub neu">new this period</span>;
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const up = pct >= 0;
  const cls = Math.abs(pct) < 0.5 ? "neu" : up === goodUp ? "up" : "down";
  return <span className={"k-sub " + cls}>{up ? "▲" : "▼"} {Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}% <span className="neu" style={{ fontWeight: 500 }}>vs previous</span></span>;
}

function Body({ d, loading }: { d: any; loading: boolean }) {
  const k = d.kpi, s = d.snapshot;
  const tiles = [
    { lbl: "Sales invoiced (incl PPN)", val: rpS(k.sales.cur), extra: plural(k.sales.count, "invoice"), delta: <Delta cur={k.sales.cur} prev={k.sales.prev} /> },
    { lbl: "Margin (nett)", val: rpS(k.margin.cur), extra: k.sales.cur ? `${Math.round((k.margin.cur / k.sales.cur) * 100)}% of sales` : "", delta: <Delta cur={k.margin.cur} prev={k.margin.prev} /> },
    { lbl: "New sales orders", val: rpS(k.orders.cur), extra: plural(k.orders.count, "order"), delta: <Delta cur={k.orders.cur} prev={k.orders.prev} /> },
    { lbl: "Cash collected", val: rpS(k.collected.cur), extra: "invoices paid in period", delta: <Delta cur={k.collected.cur} prev={k.collected.prev} /> },
    { lbl: "Purchases (supplier invoices)", val: rpS(k.purchases.cur), extra: plural(k.purchases.count, "invoice"), delta: <Delta cur={k.purchases.cur} prev={k.purchases.prev} goodUp={false} /> },
    { lbl: "Receivable today", val: rpS(s.receivable), extra: s.receivableOverdue ? `${rpS(s.receivableOverdue)} overdue` : "nothing overdue", delta: <span className="k-sub neu">payable {rpS(s.payable)}</span> },
  ];
  return (
    <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity .15s" }}>
      <div className="kpis k6">
        {tiles.map((t, i) => (
          <div className="kpi" key={i}><div className="k-lbl" style={{ marginTop: 0 }}>{t.lbl}</div><div className="k-val">{t.val}</div>{t.delta}<div className="k-x">{t.extra}</div></div>
        ))}
      </div>

      <div className="panel" style={{ marginBottom: 15 }}>
        <TrendChart data={d.trend} grain={d.range.grain} />
      </div>

      <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="panel">
          <h3>Top customers</h3><div className="psub">Invoiced in period, incl PPN</div>
          <BarList rows={d.topCustomers.map((c: any) => ({ label: c.name, value: c.value, note: `${c.count} inv.` }))} fmt={rpS} />
        </div>
        <div className="panel">
          <h3>Top products</h3><div className="psub">Invoiced in period, excl PPN · kg shipped</div>
          <BarList rows={d.topProducts.map((p: any) => ({ label: p.name, value: p.value, note: `${p.kg.toLocaleString()} kg` }))} fmt={rpS} />
        </div>
      </div>

      <div className="grid2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="panel">
          <h3>Receivable & payable aging</h3><div className="psub">Unpaid invoices today, by days past due</div>
          <Aging title="Receivable (customers owe MTI)" rows={d.aging.ar} />
          <Aging title="Payable (MTI owes suppliers)" rows={d.aging.ap} />
          <div className="legend">{d.aging.ar.map((b: any, i: number) => <span key={i}><i style={{ background: AGING_RAMP[i] }} />{b.label}</span>)}</div>
        </div>
        <div className="panel">
          <h3>Sales pipeline</h3><div className="psub">Opportunities by stage today · {s.openLeads} open</div>
          <BarList rows={d.pipeline.map((p: any, i: number) => ({ label: `${i + 1}. ${STAGE_LBL[p.stage]}`, value: p.count }))} fmt={(n) => String(n)} />
          <div className="lt-sm">Sales orders in period</div>
          <div className="chips-row">{d.soStatus.map((x: any) => <span key={x.status} className={"st " + SO_CLS[x.status]}>{x.status} · {x.count}</span>)}</div>
        </div>
      </div>

      <div className="panel">
        <h3>Expiry watch</h3><div className="psub">Lots in stock nearest their expiry · {s.lots} lots, {s.stockKg.toLocaleString()} units on hand · {s.nearExpiry} within 6 months</div>
        <div className="exp-grid">
          {d.expiryWatch.length ? d.expiryWatch.map((l: any, i: number) => {
            const dd = daysTo(l.exp);
            const chip = dd != null && dd < 0 ? <span className="st r">⚠ expired</span> : dd != null && dd < 180 ? <span className="st a">◷ {dd}d left</span> : <span className="st g">✓ {Math.round((dd || 0) / 30)} mo</span>;
            return <div className="rank-i" key={i}><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 600 }}>{l.product}</div><div style={{ fontSize: 10.5, color: "var(--faint)" }}>Lot {l.lot} · {l.qty} {l.unit} · exp {fmtD(l.exp)}</div></div>{chip}</div>;
          }) : <div className="empty">No stock</div>}
        </div>
      </div>
    </div>
  );
}
const STAGE_LBL: Record<string, string> = { INTRODUCE: "Introduce", SAMPLING: "Sampling", EVALUATION: "Evaluation", FINALISE: "Finalise", WON: "Won", DEAD: "Dead" };
const SO_CLS: Record<string, string> = { DRAFT: "gray", CONFIRMED: "b", DELIVERED: "g", CANCELLED: "r" };

/* ---------- trend: sales vs purchases, one IDR axis, crosshair tooltip, table view ---------- */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
};

function TrendChart({ data, grain }: { data: any[]; grain: string }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const series = [{ k: "sales", lbl: "Sales invoiced", color: SERIES.sales }, { k: "purchases", lbl: "Purchases", color: SERIES.purchases }];
  const H = 250, padL = 64, padR = grain === "month" ? 96 : 16, padT = 14, padB = 28;
  const iw = W - padL - padR, ih = H - padT - padB;
  const max = niceMax(Math.max(0, ...data.flatMap((r) => series.map((s) => r[s.k]))));
  const n = data.length;
  // monthly = a line (change over time); daily / weekly = paired columns, since single days are often empty
  const bars = grain !== "month";
  const slot = iw / Math.max(1, n);
  const x = (i: number) => (bars ? padL + (i + 0.5) * slot : padL + (n <= 1 ? iw / 2 : (i * iw) / (n - 1)));
  const y = (v: number) => padT + ih - (v / max) * ih;
  const bw = Math.max(2, Math.min(16, (slot - 6) / 2)); // two columns + 2px gap per period
  const col = (cx: number, v: number) => {
    const h = Math.max(0, padT + ih - y(v)), r = Math.min(4, bw / 2, h);
    const x0 = cx, y0 = padT + ih - h, w = bw;
    return `M${x0},${y0 + h}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + w - r}Q${x0 + w},${y0} ${x0 + w},${y0 + r}V${y0 + h}Z`;
  };
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 64))));
  const totals = series.map((s) => data.reduce((a, r) => a + r[s.k], 0));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = bars ? Math.floor((px - padL) / slot) : n <= 1 ? 0 : Math.round(((px - padL) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const last = n - 1;
  // line end labels: kept inside the plot and at least 14px apart
  const ends = series.map((s) => ({ ...s, y: y(data[last]?.[s.k] || 0) })).sort((a, b) => a.y - b.y);
  const floor = padT + ih - 4;
  if (ends.length === 2) {
    ends[1].y = Math.min(ends[1].y, floor);
    ends[0].y = Math.min(ends[0].y, ends[1].y - 14);
  }

  return (
    <div ref={ref} className="trend">
      <div className="trend-h">
        <div><h3>Sales vs purchases</h3><div className="psub">IDR per {grain === "day" ? "day" : grain === "week" ? "week (Mon–Sun)" : "month"} · customer invoices incl PPN vs supplier invoices</div></div>
        <div className="legend">
          {series.map((s, i) => <span key={s.k}><i className="ln" style={{ background: s.color }} />{s.lbl} <b>{rpS(totals[i])}</b></span>)}
          <button className="linkbtn" onClick={() => setTable(!table)}>{table ? "Show chart" : "Show table"}</button>
        </div>
      </div>
      {table ? (
        <div className="scroll" style={{ maxHeight: 260 }}><table className="ltable log">
          <thead><tr><th>Period</th>{series.map((s) => <th key={s.k} className="num">{s.lbl}</th>)}<th className="num">New sales orders</th></tr></thead>
          <tbody>{data.map((r) => <tr key={r.key}><td>{r.label}</td>{series.map((s) => <td key={s.k} className="num">{idr(r[s.k])}</td>)}<td className="num">{idr(r.orders)}</td></tr>)}</tbody>
        </table></div>
      ) : (
        <div style={{ position: "relative" }}>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="Sales and purchases over time">
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={padL} x2={padL + iw} y1={y(t)} y2={y(t)} stroke="#eef2f6" />
                <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" className="ax">{rpS(t)}</text>
              </g>
            ))}
            {/* every Nth label, plus the last one; drop a regular label that would crowd the last */}
            {data.map((r, i) => (i === last || (i % every === 0 && last - i >= every)) && <text key={r.key} x={x(i)} y={H - 8} textAnchor="middle" className="ax">{r.label}{r.partial ? "*" : ""}</text>)}
            {hover != null && (bars
              ? <rect x={padL + hover * slot} y={padT} width={slot} height={ih} fill="#f1f5f9" />
              : <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} stroke="#94a3b8" strokeWidth={1} />)}
            {bars && data.map((r, i) => series.map((s, j) => r[s.k] > 0 && (
              <path key={`${r.key}-${s.k}`} d={col(x(i) - bw - 1 + j * (bw + 2), r[s.k])} fill={s.color} opacity={r.partial ? 0.55 : 1} />
            )))}
            {!bars && series.map((s) => (
              <g key={s.k}>
                {/* segments touching a cut-off period (e.g. this month so far) are dashed */}
                {data.slice(1).map((r, j) => (
                  <line key={j} x1={x(j)} y1={y(data[j][s.k])} x2={x(j + 1)} y2={y(r[s.k])} stroke={s.color} strokeWidth={2} strokeLinecap="round"
                    strokeDasharray={r.partial || data[j].partial ? "4 4" : undefined} />
                ))}
                {(n <= 16 ? data.map((_, i) => i) : hover != null ? [hover] : []).map((i) => (
                  <circle key={i} cx={x(i)} cy={y(data[i][s.k])} r={hover === i ? 5 : 3.5} fill={s.color} stroke="#fff" strokeWidth={2} />
                ))}
              </g>
            ))}
            {!bars && n > 0 && ends.map((e) => <text key={e.k} x={padL + iw + 8} y={e.y + 4} className="end-lbl">{e.lbl.split(" ")[0]}</text>)}
          </svg>
          {hover != null && data[hover] && (
            <div className="tip" style={{ left: `${(x(hover) / W) * 100}%`, transform: x(hover) > W * 0.65 ? "translate(calc(-100% - 12px), 0)" : "translate(12px, 0)" }}>
              <div className="tip-h">{data[hover].label}{data[hover].partial ? " (partial period)" : ""}</div>
              {series.map((s) => <div key={s.k} className="tip-r"><i className="ln" style={{ background: s.color }} /><b>{idr(data[hover][s.k])}</b><span>{s.lbl}</span></div>)}
              <div className="tip-r"><i className="ln" style={{ background: "transparent" }} /><b>{idr(data[hover].orders)}</b><span>new sales orders</span></div>
            </div>
          )}
        </div>
      )}
      {data.some((r) => r.partial) && <div className="ccy" style={{ marginTop: 4 }}>* partial period — only the days inside the selected range are counted ({grain === "month" ? "dashed line" : "lighter columns"})</div>}
    </div>
  );
}

/* ---------- horizontal bars: one hue, value labels in ink, hover lifts the row ---------- */
function BarList({ rows, fmt }: { rows: { label: string; value: number; note?: string }[]; fmt: (n: number) => string }) {
  if (!rows.length || rows.every((r) => !r.value)) return <div className="empty" style={{ padding: 24 }}>Nothing in this period</div>;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <div className="bars">
      {rows.map((r, i) => (
        <div className="bar-row" key={i} title={`${r.label}: ${fmt(r.value)}${r.note ? " · " + r.note : ""}`}>
          <div className="bar-lbl">{r.label}</div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${max ? Math.max(r.value ? 1.5 : 0, (r.value / max) * 100) : 0}%` }} /></div>
          <div className="bar-val">{fmt(r.value)}{r.note && <span>{r.note}</span>}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- aging: one stacked bar per ledger, ordinal ramp, 2px gaps ---------- */
function Aging({ title, rows }: { title: string; rows: { label: string; value: number; count: number }[] }) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  return (
    <div className="aging">
      <div className="aging-h"><span>{title}</span><b>{idr(total)}</b></div>
      {total ? (
        <div className="stack">
          {rows.map((r, i) => r.value > 0 && (
            <div key={i} className="seg-b" style={{ flexGrow: r.value, background: AGING_RAMP[i] }} title={`${r.label}: ${idr(r.value)} · ${r.count} invoice${r.count === 1 ? "" : "s"}`} />
          ))}
        </div>
      ) : <div className="ccy">Nothing unpaid</div>}
      {total > 0 && <div className="aging-v">{rows.map((r, i) => r.value > 0 && <span key={i}><i style={{ background: AGING_RAMP[i] }} />{r.label}: <b>{rpS(r.value)}</b></span>)}</div>}
    </div>
  );
}
