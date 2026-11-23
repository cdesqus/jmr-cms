import React, { useEffect, useState } from "react";
import { api, pdfUrl } from "../lib/api";
import { useList, useConfirm, Modal, Field, Search, useToast, fmtD, todayISO } from "../lib/ui";
import { useCan } from "../lib/auth";

export default function Deliveries() {
  const can = useCan();
  const { data, q, setQ, loading, reload } = useList("/deliveries");
  const [open, setOpen] = useState(false);
  const { ask, node } = useConfirm();
  const toast = useToast();
  const remove = (r: any) => ask(`Delete <b>${r.doNumber}</b>? Stock is returned to inventory.`, async () => {
    try { await api.del(`/deliveries/${r.id}`); toast("Deleted — stock returned"); reload(); } catch (e: any) { toast(e.message, "err"); }
  });
  return (
    <>
      <div className="callout"><span className="ci">⇡</span><div><b>Delivery to customer (Surat Jalan).</b> Pick finish goods and qty; stock is taken <b>first-expiry-first-out</b>. The DO number then flows onto the customer invoice.</div></div>
      <div className="toolbar"><Search value={q} onChange={setQ} placeholder="Search DO or customer PO…" />{can("do", "edit") && <button className="btn btn-pri" onClick={() => setOpen(true)}>+ New Delivery Order</button>}</div>
      <div className="tbl-wrap"><div className="scroll"><table>
        <thead><tr><th>DO Number</th><th>Date</th><th>Customer</th><th>Customer PO</th><th>Sales Order</th><th>Items</th><th>Status</th><th>Invoice</th><th className="num">Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={9}><div className="empty">Loading…</div></td></tr>
            : data.length === 0 ? <tr><td colSpan={9}><div className="empty">No deliveries yet</div></td></tr>
              : data.map((d: any) => (
                <tr key={d.id}>
                  <td className="b mono">{d.doNumber}</td><td>{fmtD(d.doDate)}</td><td>{d.customer?.name}</td>
                  <td className="mono">{d.customerPoNo || "—"}</td>
                  <td className="mono">{d.salesOrder?.soNumber || "—"}</td>
                  <td>{(d.lines || []).map((l: any) => l.product).join(", ")}</td>
                  <td><span className={"st " + (d.status === "INVOICED" ? "g" : "b")}>{d.status}</span></td>
                  <td>{d.customerInvoice ? <span className="st g">{d.customerInvoice.invNumber}</span> : <span className="st a">pending</span>}</td>
                  <td className="num"><div className="rowact">
                    <a className="iact" href={pdfUrl(`/deliveries/${d.id}/pdf`)} target="_blank" title="Surat Jalan PDF">⬇</a>
                    {can("do", "full") && <button className="iact del" onClick={() => remove(d)}>🗑</button>}
                  </div></td>
                </tr>
              ))}
        </tbody>
      </table></div></div>
      {open && <DOModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); }} />}
      {node}
    </>
  );
}

function DOModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [fgs, setFgs] = useState<any[]>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [sos, setSos] = useState<any[]>([]);
  const [h, setH] = useState<any>({ salesOrderId: "", customerId: "", customerPoNo: "", doDate: todayISO() });
  const [lines, setLines] = useState<any[]>([{ finishGoodId: "", qty: "" }]);
  const toast = useToast();
  useEffect(() => {
    api.get("/sales-orders?status=CONFIRMED").then(setSos);
    api.get("/customers").then(setCustomers);
    api.get("/finish-goods").then(setFgs);
    api.get("/inventory").then((lots: any[]) => {
      const m: Record<string, number> = {};
      lots.forEach((l) => { m[l.product] = (m[l.product] || 0) + (l.qtyStock || 0); });
      setStock(m);
    });
  }, []);
  const setLine = (i: number, k: string, v: any) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  // Only the selected customer's finish goods can go on its Surat Jalan
  const custFgs = fgs.filter((f) => f.customerId === h.customerId);
  const pickCustomer = (customerId: string) => {
    setH({ ...h, customerId });
    setLines((ls) => ls.map((l) => (fgs.find((f) => f.id === l.finishGoodId)?.customerId === customerId ? l : { ...l, finishGoodId: "" })));
  };
  // Shipping a confirmed Sales Order: customer, PO no. and lines come from the order
  const fromSo = !!h.salesOrderId;
  const pickSo = (id: string) => {
    const so = sos.find((s) => s.id === id);
    if (!so) { setH({ ...h, salesOrderId: "" }); setLines([{ finishGoodId: "", qty: "" }]); return; }
    setH({ ...h, salesOrderId: id, customerId: so.customerId, customerPoNo: so.customerPoNo || "" });
    setLines(so.lines.map((l: any) => ({ finishGoodId: l.finishGoodId || "", product: l.product, qty: l.qtyKg })));
  };
  const stockFor = (fgId: string) => { const fg = fgs.find((f) => f.id === fgId); return fg?.rawMaterial ? (stock[fg.rawMaterial.name] || 0) : 0; };
  const save = async () => {
    if (fromSo) {
      try { await api.post("/deliveries", { salesOrderId: h.salesOrderId, doDate: h.doDate }); toast("Delivery posted from Sales Order — stock deducted FEFO"); onSaved(); }
      catch (e: any) { toast(e.message, "err"); }
      return;
    }
    if (!h.customerId) return toast("Pick a customer", "err");
    const clean = lines.filter((l) => l.finishGoodId && Number(l.qty) > 0).map((l) => ({ finishGoodId: l.finishGoodId, qty: Number(l.qty) }));
    if (!clean.length) return toast("Add at least one line", "err");
    try { await api.post("/deliveries", { ...h, lines: clean }); toast("Delivery posted — stock deducted FEFO"); onSaved(); }
    catch (e: any) { toast(e.message, "err"); }
  };
  return (
    <Modal title="New Delivery Order (Surat Jalan)" onClose={onClose} wide
      footer={<><button className="btn btn-sec" onClick={onClose}>Cancel</button><button className="btn btn-pri" onClick={save}>Post Delivery</button></>}>
      <div className="fgrid">
        <div className="full"><Field label="From Sales Order" hint={sos.length ? "confirmed orders waiting for delivery — or leave blank to enter lines by hand" : "no confirmed Sales Orders waiting — enter lines by hand"}>
          <select value={h.salesOrderId} onChange={(e) => pickSo(e.target.value)}>
            <option value="">— none (manual delivery) —</option>
            {sos.map((s) => <option key={s.id} value={s.id}>{s.soNumber} · {s.customer?.name} · {s.lines.map((l: any) => `${l.product} ${l.qtyKg} kg`).join(", ")}</option>)}
          </select>
        </Field></div>
        <Field label="Customer" req><select value={h.customerId} disabled={fromSo} onChange={(e) => pickCustomer(e.target.value)}><option value="">— select —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Customer PO number" hint="flows onto the invoice"><input value={h.customerPoNo} disabled={fromSo} onChange={(e) => setH({ ...h, customerPoNo: e.target.value })} /></Field>
        <Field label="DO date"><input type="date" value={h.doDate} onChange={(e) => setH({ ...h, doDate: e.target.value })} /></Field>
      </div>
      <div className="lines-h"><div className="lt">Lines — deducted from stock (FEFO)</div>{!fromSo && <button className="btn btn-sec btn-sm" onClick={() => setLines([...lines, { finishGoodId: "", qty: "" }])}>+ Add line</button>}</div>
      <table className="ltable">
        <thead><tr><th style={{ width: "60%" }}>Finish Good</th><th>Qty</th><th></th></tr></thead>
        <tbody>
          {lines.map((l, i) => {
            const avail = l.finishGoodId ? stockFor(l.finishGoodId) : null;
            const after = avail != null ? avail - (Number(l.qty) || 0) : null;
            return (
              <tr key={i}>
                <td>
                  {fromSo && !l.finishGoodId ? <div className="calc">{l.product}</div> : <select value={l.finishGoodId} onChange={(e) => setLine(i, "finishGoodId", e.target.value)} disabled={!h.customerId || fromSo}>
                    <option value="">{!h.customerId ? "— select a customer first —" : custFgs.length ? "— finish good —" : "— no finish goods for this customer —"}</option>
                    {custFgs.map((f) => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}
                  </select>}
                  {avail != null && <div className="stockhint" style={{ color: after! < 0 ? "var(--red)" : "var(--green-dk)" }}>stock: {avail}{l.qty ? ` · after: ${after}` : ""}</div>}
                </td>
                <td><input type="number" value={l.qty} disabled={fromSo} onChange={(e) => setLine(i, "qty", e.target.value)} style={{ width: 80 }} /></td>
                <td>{!fromSo && <button className="lrm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
}
