import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useList, useConfirm, Modal, Field, Search, useToast, fmtD, daysTo, todayISO } from "../lib/ui";
import { useCan } from "../lib/auth";
import Activities from "../components/Activities";
import { SOModal } from "./SalesOrders";

// Stages and possibility scale as used in the CRM workbook
export const STAGES = [
  { k: "INTRODUCE", n: 1, lbl: "Introduce" },
  { k: "SAMPLING", n: 2, lbl: "Sampling" },
  { k: "EVALUATION", n: 3, lbl: "Evaluation material" },
  { k: "FINALISE", n: 4, lbl: "Finalise formulation" },
  { k: "WON", n: 5, lbl: "Won" },
  { k: "DEAD", n: 6, lbl: "Dead" },
];
const OPEN = ["INTRODUCE", "SAMPLING", "EVALUATION", "FINALISE"];
export const POSSIBILITY: Record<number, { lbl: string; cls: string }> = {
  1: { lbl: "1 · >50%", cls: "g" }, 2: { lbl: "2 · ~50%", cls: "b" }, 3: { lbl: "3 · 20–50%", cls: "a" }, 4: { lbl: "4 · 0–20%", cls: "gray" },
};
const STALE_DAYS = 90; // workbook: yellow = needs follow-up

export default function Pipeline() {
  const can = useCan();
  const { data, q, setQ, loading, reload } = useList("/leads");
  const [leads, setLeads] = useState<any[]>([]);
  const [pic, setPic] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const toast = useToast();
  useEffect(() => setLeads(data), [data]);

  // Full screen: the board covers the app and the browser goes full screen too (Esc leaves both).
  // Modals and toasts sit above the board, so cards can still be opened and edited.
  const enterFull = () => {
    setFull(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const exitFull = () => {
    setFull(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  useEffect(() => {
    if (!full) return;
    const onChange = () => { if (!document.fullscreenElement) setFull(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !editing) setFull(false); };
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("fullscreenchange", onChange); window.removeEventListener("keydown", onKey); };
  }, [full, editing]);
  // leaving the page also leaves browser full screen
  useEffect(() => () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }, []);

  const pics = useMemo(() => [...new Set(leads.map((l) => l.pic).filter(Boolean))], [leads]);
  const shown = leads.filter((l) => !pic || l.pic === pic);
  const open = shown.filter((l) => OPEN.includes(l.stage));
  const won = shown.filter((l) => l.stage === "WON").length;
  const dead = shown.filter((l) => l.stage === "DEAD").length;
  const stale = open.filter((l) => (-(daysTo(l.updatedAt) || 0)) > STALE_DAYS).length;
  const volume = open.reduce((a, l) => a + (l.volumeKgYr || 0), 0);
  const kpis = [
    { ic: "◎", bg: "var(--blue-bg)", lbl: "Open opportunities", val: open.length, sub: `${shown.length} in total` },
    { ic: "⚖", bg: "var(--purple-bg)", lbl: "Potential volume (open)", val: volume ? `${volume.toLocaleString()} kg/yr` : "—", sub: "from POTENTIAL VOLUME" },
    { ic: "✓", bg: "var(--green-bg)", lbl: "Win rate", val: won + dead ? `${Math.round((won / (won + dead)) * 100)}%` : "—", sub: `${won} won · ${dead} dead` },
    { ic: "⏳", bg: "var(--amber-bg)", lbl: "Need follow-up", val: stale, sub: `open, no update > ${STALE_DAYS} days` },
  ];

  const move = async (id: string, stage: string) => {
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage } : l)));
    try { await api.patch(`/leads/${id}/stage`, { stage }); toast(`#${lead.leadNo} → ${STAGES.find((s) => s.k === stage)!.lbl}`); reload(); }
    catch (e: any) { toast(e.message, "err"); reload(); }
  };

  return (
    <>
      {!full && <div className="kpis">
        {kpis.map((c, i) => <div className="kpi" key={i}><div className="k-ic" style={{ background: c.bg }}>{c.ic}</div><div className="k-lbl">{c.lbl}</div><div className="k-val">{c.val}</div><div className="k-sub neu">{c.sub}</div></div>)}
      </div>}
      <div className={full ? "pipe-full" : undefined}>
      {full && <div className="pipe-full-h"><b>Lead Pipeline</b><span className="ccy">{open.length} open · {kpis[2].val} win rate · {stale} need follow-up</span></div>}
      <div className="toolbar">
        <div style={{ display: "flex", gap: 8, flex: 1, flexWrap: "wrap" }}>
          <Search value={q} onChange={setQ} placeholder="Search customer, product, maker, project…" />
          <select className="flt" value={pic} onChange={(e) => setPic(e.target.value)}><option value="">All PICs</option>{pics.map((p) => <option key={p}>{p}</option>)}</select>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-sec" onClick={full ? exitFull : enterFull} title={full ? "Exit full screen (Esc)" : "Full screen"}>{full ? "✕ Exit full screen" : "⛶ Full screen"}</button>
          {can("crm", "edit") && <button className="btn btn-pri" onClick={() => setEditing({ stage: "INTRODUCE", startDate: todayISO() })}>+ New opportunity</button>}
        </div>
      </div>
      {loading && !leads.length ? <div className="loading">Loading…</div> : (
        <div className="board">
          {STAGES.map((s) => {
            const cards = shown.filter((l) => l.stage === s.k);
            return (
              <div key={s.k} className={"col" + (over === s.k ? " over" : "") + (s.k === "DEAD" ? " dead" : "") + (s.k === "WON" ? " won" : "")}
                onDragOver={(e) => { e.preventDefault(); setOver(s.k); }} onDragLeave={() => setOver(null)}
                onDrop={() => { setOver(null); if (dragId) move(dragId, s.k); setDragId(null); }}>
                <div className="col-h"><span className="col-n">{s.n}</span>{s.lbl}<span className="cnt">{cards.length}</span></div>
                {cards.map((l) => {
                  const idle = -(daysTo(l.updatedAt) || 0);
                  const next = l.activities?.find((a: any) => a.nextFollowUp)?.nextFollowUp;
                  return (
                    <div key={l.id} className={"card" + (OPEN.includes(l.stage) && idle > STALE_DAYS ? " stale" : "")} draggable={can("crm", "edit")}
                      onDragStart={() => setDragId(l.id)} onDragEnd={() => setDragId(null)} onClick={() => setEditing(l)}>
                      <div className="card-top"><span className="mono">#{l.leadNo}</span>{l.rank && <span className="st purple">Rank {l.rank}</span>}{l.source && <span className="st o">{l.source}</span>}</div>
                      <div className="card-c">{l.customer?.name}</div>
                      <div className="card-p"><b>{l.product}</b>{l.supplier ? ` · ${l.supplier}` : ""}</div>
                      {l.project && <div className="card-m">Project: {l.project}</div>}
                      <div className="card-f">
                        {l.possibility ? <span className={"st " + POSSIBILITY[l.possibility]?.cls}>{POSSIBILITY[l.possibility]?.lbl}</span> : <span />}
                        <span className="ccy">{l.pic || ""} · {idle <= 0 ? "today" : `${idle}d ago`}</span>
                      </div>
                      {next && <div className={"act-due" + ((daysTo(next) || 0) < 0 ? " late" : "")}>follow up {fmtD(next)}</div>}
                    </div>
                  );
                })}
                {!cards.length && <div className="col-empty">drop here</div>}
              </div>
            );
          })}
        </div>
      )}
      <div className="legend-row"><span className="lg stale-k" /> no update for {STALE_DAYS}+ days — follow up · drag cards between stages to update them</div>
      </div>
      {editing && <LeadModal row={editing} onClose={() => setEditing(null)} onSaved={() => { reload(); }} onDone={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function LeadModal({ row, onClose, onSaved, onDone }: { row: any; onClose: () => void; onSaved: () => void; onDone: () => void }) {
  const can = useCan();
  const [customers, setCustomers] = useState<any[]>([]);
  const [rms, setRms] = useState<any[]>([]);
  const [newCust, setNewCust] = useState(false);
  const [so, setSo] = useState(false);
  const [f, setF] = useState<any>({ ...row, startDate: (row.startDate || todayISO()).slice(0, 10) });
  const { ask, node } = useConfirm();
  const toast = useToast();
  useEffect(() => { api.get("/customers").then(setCustomers); api.get("/raw-materials").then(setRms); }, []);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const pickRm = (id: string) => {
    const rm = rms.find((r) => r.id === id);
    setF((x: any) => ({ ...x, rawMaterialId: id, product: rm?.name || x.product, supplier: rm?.maker || x.supplier }));
  };

  const save = async (close = true) => {
    if (!f.product) return toast("Product is required", "err");
    try {
      const body = { ...f, customerId: newCust ? "" : f.customerId };
      const saved = f.id ? await api.put(`/leads/${f.id}`, body) : await api.post("/leads", body);
      toast(f.id ? `#${saved.leadNo} updated` : `Opportunity #${saved.leadNo} added`);
      if (close) onDone(); else { setF({ ...saved, startDate: saved.startDate.slice(0, 10) }); setNewCust(false); onSaved(); }
    } catch (e: any) { toast(e.message, "err"); }
  };
  const remove = () => ask(`Delete opportunity <b>#${f.leadNo}</b> and its activities?`, async () => {
    try { await api.del(`/leads/${f.id}`); toast("Deleted"); onDone(); } catch (e: any) { toast(e.message, "err"); }
  });

  return (
    <Modal title={f.id ? `Opportunity #${f.leadNo}` : "New opportunity"} onClose={onClose} wide
      footer={<>
        {f.id && can("crm", "full") && <button className="btn btn-sec" style={{ marginRight: "auto", color: "var(--red)" }} onClick={remove}>Delete</button>}
        {f.id && f.stage === "WON" && can("so", "edit") && <button className="btn btn-sec" onClick={() => setSo(true)}>+ Sales Order</button>}
        <button className="btn btn-sec" onClick={onClose}>Close</button>
        {can("crm", "edit") && <button className="btn btn-pri" onClick={() => save()}>Save</button>}
      </>}>
      <div className="fgrid g3">
        <div className="full2">
          <Field label="Customer" req hint={newCust ? "a new prospect is added to the customer database" : undefined}>
            {newCust
              ? <input value={f.newCustomer || ""} onChange={(e) => set("newCustomer", e.target.value)} placeholder="New prospect name" />
              : <select value={f.customerId || ""} onChange={(e) => set("customerId", e.target.value)}><option value="">— select —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          </Field>
          <button className="linkbtn" onClick={() => setNewCust(!newCust)}>{newCust ? "← pick an existing customer" : "+ new prospect"}</button>
        </div>
        <Field label="Contact at customer"><input value={f.contact || ""} onChange={(e) => set("contact", e.target.value)} /></Field>
        <Field label="Stage">
          <select value={f.stage} onChange={(e) => set("stage", e.target.value)}>{STAGES.map((s) => <option key={s.k} value={s.k}>{s.n}. {s.lbl}</option>)}</select>
        </Field>
        <Field label="Product (from Raw Materials)">
          <select value={f.rawMaterialId || ""} onChange={(e) => pickRm(e.target.value)}><option value="">— other / not imported yet —</option>{rms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        </Field>
        <Field label="Product name" req><input value={f.product || ""} onChange={(e) => set("product", e.target.value)} /></Field>
        <Field label="Supplier / maker"><input value={f.supplier || ""} onChange={(e) => set("supplier", e.target.value)} /></Field>
        <Field label="Project at customer" hint="e.g. Serum, Blush on"><input value={f.project || ""} onChange={(e) => set("project", e.target.value)} /></Field>
        <Field label="Business possibility">
          <select value={f.possibility || ""} onChange={(e) => set("possibility", e.target.value)}><option value="">—</option>{[1, 2, 3, 4].map((p) => <option key={p} value={p}>{POSSIBILITY[p].lbl}</option>)}</select>
        </Field>
        <Field label="Potential volume (kg/year)"><input type="number" value={f.volumeKgYr ?? ""} onChange={(e) => set("volumeKgYr", e.target.value)} /></Field>
        <Field label="MTI PIC"><input value={f.pic || ""} onChange={(e) => set("pic", e.target.value)} /></Field>
        <Field label="Rank"><select value={f.rank || ""} onChange={(e) => set("rank", e.target.value)}><option value="">—</option>{["A", "B", "C"].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Type"><select value={f.type || ""} onChange={(e) => set("type", e.target.value)}><option value="">—</option>{["OEM", "Brand owner", "Pharma", "Distributor"].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Start date"><input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
        <Field label="Source" hint="INCA, exhibition, referral…"><input value={f.source || ""} onChange={(e) => set("source", e.target.value)} /></Field>
        <div className="full"><Field label="Remark (reason of lost, support needed)"><textarea rows={2} value={f.remark || ""} onChange={(e) => set("remark", e.target.value)} /></Field></div>
      </div>
      {f.id ? (
        <>
          {f.salesOrders?.length > 0 && <div className="act-hint" style={{ marginTop: 12 }}>Sales Orders: {f.salesOrders.map((s: any) => `${s.soNumber} (${s.status})`).join(", ")}</div>}
          <div className="lines-h"><div className="lt">Sales activities</div><span className="ccy">last updated {fmtD(f.updatedAt)}</span></div>
          <Activities leadId={f.id} customerId={f.customerId} onChange={onSaved} />
        </>
      ) : (
        <div className="act-hint" style={{ marginTop: 12 }}>Save first, then log visits, samples and follow-ups here. <button className="linkbtn" onClick={() => save(false)}>Save &amp; continue</button></div>
      )}
      {so && <SOModal row={{ customerId: f.customerId, leadId: f.id, notes: `From opportunity #${f.leadNo} — ${f.product}` }} onClose={() => setSo(false)} onSaved={() => { setSo(false); toast("Sales Order created"); onDone(); }} />}
      {node}
    </Modal>
  );
}
