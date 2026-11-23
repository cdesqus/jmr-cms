import React, { useEffect, useState } from "react";
import { api, pdfUrl } from "../lib/api";
import { useList, useConfirm, Modal, Field, Search, useToast, fmtD, idr, usd, money, todayISO, useRates } from "../lib/ui";
import { useCan } from "../lib/auth";

const CCYS = ["USD", "IDR", "JPY"];
const STATUS_CLS: Record<string, string> = { DRAFT: "gray", CONFIRMED: "b", DELIVERED: "g", CANCELLED: "r" };
export const soChip = (s: string) => <span className={"st " + (STATUS_CLS[s] || "gray")}>{s}</span>;

const lineKg = (l: any, sizes: any[]) => {
  const size = sizes.find((s) => s.id === l.packageSizeId)?.sizeKg;
  return (Number(l.packages) || 0) * (size || 1);
};
const soTotal = (so: any) => (so.lines || []).reduce((a: number, l: any) => a + l.qtyKg * l.unitPrice, 0);

export default function SalesOrders() {
  const can = useCan();
  const { data, q, setQ, loading, reload } = useList("/sales-orders");
  const [editing, setEditing] = useState<any | null>(null);
  const { ask, node } = useConfirm();
  const toast = useToast();
  const setStatus = async (so: any, status: string) => {
    try { await api.patch(`/sales-orders/${so.id}/status`, { status }); toast(`${so.soNumber} → ${status}`); reload(); } catch (e: any) { toast(e.message, "err"); }
  };
  const remove = (so: any) => ask(`Delete Sales Order <b>${so.soNumber}</b>?`, async () => {
    try { await api.del(`/sales-orders/${so.id}`); toast("Deleted"); reload(); } catch (e: any) { toast(e.message, "err"); }
  });

  return (
    <>
      <div className="callout"><span className="ci">📝</span><div><b>Sales Orders.</b> Pick the <b>package size</b> per line (qty = packages × size), record the order natively in <b>USD, IDR or JPY</b> with live IDR conversion, then <b>Confirm</b> it so it can be shipped on a Surat Jalan. The <b>Order Form</b> PDF carries the customer's history and recent sales activity.</div></div>
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Search SO, customer PO, customer…" />
        {can("so", "edit") && <button className="btn btn-pri" onClick={() => setEditing({})}>+ New Sales Order</button>}
      </div>
      <div className="tbl-wrap"><div className="scroll"><table>
        <thead><tr><th>SO Number</th><th>Date</th><th>Customer</th><th>Customer PO</th><th>Items</th><th className="num">Amount</th><th className="num">≈ IDR</th><th>Status</th><th>Delivery</th><th className="num">Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={10}><div className="empty">Loading…</div></td></tr>
            : data.length === 0 ? <tr><td colSpan={10}><div className="empty">No sales orders{q ? " match" : " — click + New"}</div></td></tr>
              : data.map((so: any) => {
                const amt = soTotal(so);
                return (
                  <tr key={so.id}>
                    <td className="b mono">{so.soNumber}</td><td>{fmtD(so.soDate)}</td><td>{so.customer?.name}</td>
                    <td className="mono">{so.customerPoNo || "—"}</td>
                    <td>{(so.lines || []).map((l: any) => `${l.product} ${l.qtyKg} kg`).join(", ")}</td>
                    <td className="num b">{money(amt, so.currency)} <span className="ccy">{so.currency}</span></td>
                    <td className="num" style={{ color: "var(--muted)" }}>{idr(amt * so.exchangeRate)}</td>
                    <td>{soChip(so.status)}</td>
                    <td>{so.deliveryOrders?.length ? <span className="st g">{so.deliveryOrders.map((d: any) => d.doNumber).join(", ")}</span> : <span className="ccy">—</span>}</td>
                    <td className="num"><div className="rowact">
                      {so.status === "DRAFT" && can("so", "edit") && <button className="iact" title="Confirm order" onClick={() => setStatus(so, "CONFIRMED")}>✓</button>}
                      {(so.status === "DRAFT" || so.status === "CONFIRMED") && can("so", "edit") && <button className="iact" title="Cancel order" onClick={() => setStatus(so, "CANCELLED")}>⊘</button>}
                      {so.status === "CANCELLED" && can("so", "edit") && <button className="iact" title="Reopen as draft" onClick={() => setStatus(so, "DRAFT")}>↺</button>}
                      <a className="iact" href={pdfUrl(`/sales-orders/${so.id}/pdf`)} target="_blank" title="Order Form PDF">⬇</a>
                      {so.status !== "DELIVERED" && can("so", "edit") && <button className="iact" title="Edit" onClick={() => setEditing(so)}>✎</button>}
                      {can("so", "full") && <button className="iact del" title="Delete" onClick={() => remove(so)}>🗑</button>}
                    </div></td>
                  </tr>
                );
              })}
        </tbody>
      </table></div></div>
      {editing && <SOModal row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {node}
    </>
  );
}

export function SOModal({ row, onClose, onSaved }: { row: any; onClose: () => void; onSaved: () => void }) {
  const rates = useRates();
  const [customers, setCustomers] = useState<any[]>([]);
  const [fgs, setFgs] = useState<any[]>([]);
  const [sizes, setSizes] = useState<any[]>([]);
  const [history, setHistory] = useState<any | null>(null);
  const [h, setH] = useState<any>({
    customerId: row.customerId || "", customerPoNo: row.customerPoNo || "", leadId: row.leadId || "",
    soDate: (row.soDate || todayISO()).slice(0, 10), currency: row.currency || "USD", exchangeRate: row.id ? row.exchangeRate : "",
    paymentTerms: row.paymentTerms || "", deliveryDate: row.deliveryDate?.slice(0, 10) || "", salesPic: row.salesPic || "", notes: row.notes || "",
  });
  const [lines, setLines] = useState<any[]>(row.lines?.length
    ? row.lines.map((l: any) => ({ finishGoodId: l.finishGoodId || "", product: l.product, packageSizeId: l.packageSizeId || "", packages: l.packages, unitPrice: l.unitPrice }))
    : [{ finishGoodId: "", product: "", packageSizeId: "", packages: "", unitPrice: "" }]);
  const toast = useToast();
  useEffect(() => {
    api.get("/customers").then(setCustomers);
    api.get("/finish-goods").then(setFgs);
    api.get("/package-sizes").then(setSizes);
  }, []);
  // customer transaction history alongside the entry form
  useEffect(() => {
    if (!h.customerId) return setHistory(null);
    api.get(`/crm/customers/${h.customerId}`).then(setHistory).catch(() => setHistory(null));
  }, [h.customerId]);

  const rate = h.currency === "IDR" ? 1 : Number(h.exchangeRate) || rates[h.currency] || 0;
  const usdRate = h.currency === "USD" ? rate : rates.USD || 0;
  const toCcy = (usdAmount: number) => (h.currency === "USD" ? usdAmount : rate ? Math.round(((usdAmount * usdRate) / rate) * 100) / 100 : 0);
  const custFgs = fgs.filter((f) => f.customerId === h.customerId);
  const setLine = (i: number, k: string, v: any) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const pickFg = (i: number, id: string) => {
    const fg = fgs.find((f) => f.id === id);
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, finishGoodId: id, product: fg?.rawMaterial?.name || fg?.name || l.product, unitPrice: fg ? toCcy(fg.priceUsd) : l.unitPrice } : l)));
  };
  const pickCustomer = (id: string) => {
    const c = customers.find((x) => x.id === id);
    setH({ ...h, customerId: id, paymentTerms: h.paymentTerms || c?.top || "" });
  };

  const subtotal = lines.reduce((a, l) => a + lineKg(l, sizes) * (Number(l.unitPrice) || 0), 0);
  const subIdr = Math.round(subtotal * rate);
  const ppn = Math.round(subIdr * 0.11);

  const save = async () => {
    if (!h.customerId) return toast("Pick a customer", "err");
    const clean = lines.filter((l) => l.product && Number(l.packages) > 0);
    if (!clean.length) return toast("Add at least one line", "err");
    try {
      const body = { ...h, exchangeRate: rate || undefined, usdRate: usdRate || undefined, lines: clean };
      if (row.id) await api.put(`/sales-orders/${row.id}`, body); else await api.post("/sales-orders", body);
      toast(row.id ? "Sales Order updated" : "Sales Order created"); onSaved();
    } catch (e: any) { toast(e.message, "err"); }
  };

  return (
    <Modal title={row.id ? `Edit ${row.soNumber}` : "New Sales Order"} onClose={onClose} wide
      footer={<><button className="btn btn-sec" onClick={onClose}>Cancel</button><button className="btn btn-pri" onClick={save}>Save Sales Order</button></>}>
      <div className="fgrid g3">
        <div className="full2"><Field label="Customer" req><select value={h.customerId} onChange={(e) => pickCustomer(e.target.value)}><option value="">— select —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field></div>
        <Field label="Customer PO no."><input value={h.customerPoNo} onChange={(e) => setH({ ...h, customerPoNo: e.target.value })} /></Field>
        <Field label="SO date"><input type="date" value={h.soDate} onChange={(e) => setH({ ...h, soDate: e.target.value })} /></Field>
        <Field label="Currency">
          <select value={h.currency} onChange={(e) => setH({ ...h, currency: e.target.value, exchangeRate: "" })}>{CCYS.map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
        <Field label={h.currency === "IDR" ? "Rate" : `Rate (IDR per ${h.currency})`} hint={h.currency !== "IDR" && !h.exchangeRate ? "today's rate from Exchange Rates" : undefined}>
          <input type="number" disabled={h.currency === "IDR"} value={h.currency === "IDR" ? 1 : h.exchangeRate} placeholder={String(rates[h.currency] || "")} onChange={(e) => setH({ ...h, exchangeRate: e.target.value })} />
        </Field>
        <Field label="Payment terms"><input value={h.paymentTerms} onChange={(e) => setH({ ...h, paymentTerms: e.target.value })} /></Field>
        <Field label="Delivery date"><input type="date" value={h.deliveryDate} onChange={(e) => setH({ ...h, deliveryDate: e.target.value })} /></Field>
        <Field label="Sales PIC"><input value={h.salesPic} onChange={(e) => setH({ ...h, salesPic: e.target.value })} /></Field>
      </div>

      <div className="lines-h"><div className="lt">Lines — price per kg in {h.currency}</div><button className="btn btn-sec btn-sm" onClick={() => setLines([...lines, { finishGoodId: "", product: "", packageSizeId: "", packages: "", unitPrice: "" }])}>+ Add line</button></div>
      <table className="ltable">
        <thead><tr><th style={{ width: "28%" }}>Finish Good</th><th>Package size</th><th>Packages</th><th>Qty kg</th><th>Price/kg {h.currency}</th><th className="num">Amount</th><th className="num">≈ IDR</th><th></th></tr></thead>
        <tbody>
          {lines.map((l, i) => {
            const kg = lineKg(l, sizes);
            const amt = kg * (Number(l.unitPrice) || 0);
            return (
              <tr key={i}>
                <td>
                  <select value={l.finishGoodId} disabled={!h.customerId} onChange={(e) => pickFg(i, e.target.value)}>
                    <option value="">{h.customerId ? (custFgs.length ? "— finish good —" : "— none for this customer —") : "— select a customer first —"}</option>
                    {custFgs.map((f) => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}
                  </select>
                  {!l.finishGoodId && <input style={{ marginTop: 4 }} value={l.product} onChange={(e) => setLine(i, "product", e.target.value)} placeholder="or type a product" />}
                </td>
                <td><select value={l.packageSizeId} onChange={(e) => setLine(i, "packageSizeId", e.target.value)}><option value="">bulk (kg)</option>{sizes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
                <td><input type="number" value={l.packages} onChange={(e) => setLine(i, "packages", e.target.value)} style={{ width: 64 }} placeholder={l.packageSizeId ? "pkgs" : "kg"} /></td>
                <td className="calc">{kg || "—"}</td>
                <td><input type="number" value={l.unitPrice} onChange={(e) => setLine(i, "unitPrice", e.target.value)} style={{ width: 90 }} /></td>
                <td className="calc num">{money(amt, h.currency)}</td>
                <td className="calc num">{idr(amt * rate)}</td>
                <td><button className="lrm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="so-bottom">
        <div className="so-hist">
          {history ? (
            <>
              <div className="lt">Customer history · {history.name}</div>
              <div className="so-kv"><span>Cumulative invoiced</span><b>{idr(history.valuation.invoiced)}</b></div>
              <div className="so-kv"><span>Outstanding</span><b style={{ color: history.valuation.outstanding ? "var(--red)" : undefined }}>{idr(history.valuation.outstanding)}</b></div>
              {history.log.slice(0, 4).map((x: any, i: number) => (
                <div key={i} className="so-log"><span className="mono">{x.ref}</span> {fmtD(x.date)} · {x.status}{x.amount != null ? ` · ${money(x.amount, x.currency)}` : ""}</div>
              ))}
              {history.activities?.[0] && <div className="so-log">Last activity: {fmtD(history.activities[0].date)} {history.activities[0].type} — {history.activities[0].note}</div>}
            </>
          ) : <div className="ccy">Pick a customer to see their transaction history.</div>}
        </div>
        <div className="so-tot">
          <div className="so-kv"><span>Subtotal {h.currency}</span><b>{money(subtotal, h.currency)}</b></div>
          {h.currency !== "USD" && <div className="so-kv"><span>USD equivalent</span><b>{usd(usdRate ? Math.round((subIdr / usdRate) * 100) / 100 : 0)}</b></div>}
          <div className="so-kv"><span>Subtotal IDR {h.currency !== "IDR" && <span className="ccy">@ {rate.toLocaleString()}</span>}</span><b>{idr(subIdr)}</b></div>
          <div className="so-kv"><span>PPN 11%</span><b>{idr(ppn)}</b></div>
          <div className="so-kv big"><span>Total IDR</span><b>{idr(subIdr + ppn)}</b></div>
        </div>
      </div>
      <div style={{ marginTop: 12 }}><Field label="Notes"><input value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} /></Field></div>
    </Modal>
  );
}
