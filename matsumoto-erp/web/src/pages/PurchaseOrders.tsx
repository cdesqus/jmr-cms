import React, { useEffect, useState } from "react";
import { api, pdfUrl } from "../lib/api";
import { useList, useConfirm, Modal, Field, Search, useToast, fmtD, money, idr, todayISO, useRates } from "../lib/ui";
import { useCan } from "../lib/auth";

const statusChip = (s: string) => {
  const map: Record<string, string> = { DRAFT: "gray", SENT: "b", PARTIAL: "a", RECEIVED: "g", CLOSED: "g" };
  return <span className={"st " + (map[s] || "gray")}>{s}</span>;
};

export default function PurchaseOrders() {
  const can = useCan();
  const { data, q, setQ, loading, reload } = useList("/purchase-orders");
  const [editing, setEditing] = useState<any | null>(null);
  const { ask, node } = useConfirm();
  const toast = useToast();

  const remove = (r: any) => ask(`Delete PO <b>${r.poNumber}</b>?`, async () => {
    try { await api.del(`/purchase-orders/${r.id}`); toast("PO deleted"); reload(); } catch (e: any) { toast(e.message, "err"); }
  });

  return (
    <>
      <div className="callout"><span className="ci">🛳</span><div><b>Purchase orders to Japan.</b> Each PO generates a PDF with a <b>QR code</b> — scan it at Goods Receipt to receive against this PO.</div></div>
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Search PO number…" />
        {can("po", "edit") && <button className="btn btn-pri" onClick={() => setEditing({})}>+ New Purchase Order</button>}
      </div>
      <div className="tbl-wrap"><div className="scroll"><table>
        <thead><tr><th>PO Number</th><th>Date</th><th>Supplier</th><th>Lines</th><th className="num">Total</th><th className="num">≈ IDR</th><th>Status</th><th className="num">Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={8}><div className="empty">Loading…</div></td></tr>
            : data.length === 0 ? <tr><td colSpan={8}><div className="empty">No purchase orders{q ? " match" : " — click + New"}</div></td></tr>
              : data.map((po: any) => {
                const total = (po.lines || []).reduce((a: number, l: any) => a + (l.qty || 0) * (l.unitPrice || 0), 0);
                return (
                  <tr key={po.id}>
                    <td className="b mono">{po.poNumber}</td>
                    <td>{fmtD(po.poDate)}</td>
                    <td>{po.supplier?.name}</td>
                    <td>{(po.lines || []).map((l: any) => l.description).join(", ")}</td>
                    <td className="num b">{money(total, po.currency)} <span className="ccy">{po.currency}</span></td>
                    <td className="num" style={{ color: "var(--muted)" }}>{idr(total * (po.exchangeRate || 0))}</td>
                    <td>{statusChip(po.status)}</td>
                    <td className="num"><div className="rowact">
                      <a className="iact" href={pdfUrl(`/purchase-orders/${po.id}/pdf`)} target="_blank" title="PDF + QR">⬇</a>
                      {can("po", "edit") && <button className="iact" title="Edit" onClick={() => setEditing(po)}>✎</button>}
                      {can("po", "full") && <button className="iact del" title="Delete" onClick={() => remove(po)}>🗑</button>}
                    </div></td>
                  </tr>
                );
              })}
        </tbody>
      </table></div></div>
      {editing && <POModal row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {node}
    </>
  );
}

function POModal({ row, onClose, onSaved }: { row: any; onClose: () => void; onSaved: () => void }) {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [rms, setRms] = useState<any[]>([]);
  const [incoterms, setIncoterms] = useState<any[]>([]);
  const rates = useRates();
  const [h, setH] = useState<any>({ supplierId: row.supplierId || "", poDate: row.poDate?.slice(0, 10) || todayISO(), currency: row.currency || "USD", exchangeRate: row.exchangeRate || "", incoterm: row.incoterm || "CIF", paymentTerms: row.paymentTerms || "Month-end, TT NET 60" });
  const [lines, setLines] = useState<any[]>(row.lines?.length ? row.lines.map((l: any) => ({ ...l })) : [{ description: "", qty: "", unitPrice: "" }]);
  const toast = useToast();
  useEffect(() => { api.get("/suppliers").then(setSuppliers); api.get("/raw-materials").then(setRms); api.get("/incoterms").then(setIncoterms); }, []);

  const setLine = (i: number, k: string, v: any) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const pickRm = (i: number, rmId: string) => {
    const rm = rms.find((x) => x.id === rmId);
    setLines((ls) => ls.map((l, j) => j === i ? { ...l, rawMaterialId: rmId, description: rm?.name || l.description, maker: rm?.maker, hsCode: rm?.hsCode, lartas: rm?.lartas } : l));
  };
  // purchases are recorded in their own currency; the rate defaults to the Exchange Rates master
  const rate = Number(h.exchangeRate) || rates[h.currency] || 0;
  const total = lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);
  // every amount is also shown in USD and IDR (USD through IDR for a JPY PO)
  const toUsd = (amt: number) => (h.currency === "USD" ? amt : rates.USD ? (amt * rate) / rates.USD : 0);
  const save = async () => {
    if (!h.supplierId) return toast("Pick a supplier", "err");
    const clean = lines.filter((l) => l.description && Number(l.qty) > 0).map((l) => ({ ...l, qty: Number(l.qty), unitPrice: Number(l.unitPrice) || 0 }));
    if (!clean.length) return toast("Add at least one line", "err");
    try {
      const body = { ...h, exchangeRate: rate || undefined, lines: clean };
      if (row.id) await api.put(`/purchase-orders/${row.id}`, body); else await api.post("/purchase-orders", body);
      toast(row.id ? "PO updated" : "PO created"); onSaved();
    } catch (e: any) { toast(e.message, "err"); }
  };

  return (
    <Modal title={row.id ? `Edit ${row.poNumber}` : "New Purchase Order"} onClose={onClose} wide
      footer={<><button className="btn btn-sec" onClick={onClose}>Cancel</button><button className="btn btn-pri" onClick={save}>Save PO</button></>}>
      <div className="fgrid">
        <Field label="Supplier" req><select value={h.supplierId} onChange={(e) => setH({ ...h, supplierId: e.target.value })}><option value="">— select —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="PO date"><input type="date" value={h.poDate} onChange={(e) => setH({ ...h, poDate: e.target.value })} /></Field>
        <Field label="Incoterm">
          <select value={h.incoterm} onChange={(e) => setH({ ...h, incoterm: e.target.value })}>
            <option value="">— select —</option>
            {incoterms.map((t) => <option key={t.id} value={t.code}>{t.code} · {t.name}</option>)}
            {h.incoterm && !incoterms.some((t) => t.code === h.incoterm) && <option value={h.incoterm}>{h.incoterm}</option>}
          </select>
        </Field>
        <Field label="Currency"><select value={h.currency} onChange={(e) => setH({ ...h, currency: e.target.value, exchangeRate: "" })}><option>USD</option><option>JPY</option></select></Field>
        <Field label={`Rate (IDR per ${h.currency})`} hint={!h.exchangeRate && rates[h.currency] ? "today's rate from Exchange Rates" : undefined}><input type="number" value={h.exchangeRate} placeholder={String(rates[h.currency] || "")} onChange={(e) => setH({ ...h, exchangeRate: e.target.value })} /></Field>
        <div className="full"><Field label="Payment terms"><input value={h.paymentTerms} onChange={(e) => setH({ ...h, paymentTerms: e.target.value })} /></Field></div>
      </div>
      <div className="lines-h"><div className="lt">Line items</div><button className="btn btn-sec btn-sm" onClick={() => setLines([...lines, { description: "", qty: "", unitPrice: "" }])}>+ Add line</button></div>
      <table className="ltable">
        <thead><tr><th style={{ width: "32%" }}>Raw Material</th><th>HS</th><th>LARTAS</th><th>Qty</th><th>Price {h.currency}</th><th className="num">Amount {h.currency}</th>{h.currency !== "USD" && <th className="num">≈ USD</th>}<th className="num">≈ IDR</th><th></th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td><select value={l.rawMaterialId || ""} onChange={(e) => pickRm(i, e.target.value)}><option value="">— item —</option>{rms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></td>
              <td><input value={l.hsCode || ""} onChange={(e) => setLine(i, "hsCode", e.target.value)} style={{ width: 70 }} /></td>
              <td><input value={l.lartas || ""} onChange={(e) => setLine(i, "lartas", e.target.value)} style={{ width: 70 }} /></td>
              <td><input type="number" value={l.qty} onChange={(e) => setLine(i, "qty", e.target.value)} style={{ width: 56 }} /></td>
              <td><input type="number" value={l.unitPrice} onChange={(e) => setLine(i, "unitPrice", e.target.value)} style={{ width: 80 }} /></td>
              {(() => {
                const amt = (Number(l.qty) || 0) * (Number(l.unitPrice) || 0);
                return <>
                  <td className="calc num">{money(amt, h.currency)}</td>
                  {h.currency !== "USD" && <td className="calc num">{money(toUsd(amt), "USD")}</td>}
                  <td className="calc num">{idr(amt * rate)}</td>
                </>;
              })()}
              <td><button className="lrm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ textAlign: "right", marginTop: 10, fontSize: 12.5 }}>
        Total <b>{money(total, h.currency)}</b>
        {h.currency !== "USD" && <> · <b>{money(toUsd(total), "USD")}</b></>}
        {" "}· <b>{idr(total * rate)}</b> <span className="ccy">@ Rp {rate.toLocaleString()} / {h.currency}</span>
      </div>
    </Modal>
  );
}
