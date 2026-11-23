import React, { useEffect, useState } from "react";
import { api, pdfUrl } from "../lib/api";
import { useList, useConfirm, Modal, Field, Search, useToast, fmtD, idr, todayISO } from "../lib/ui";
import { useCan } from "../lib/auth";

export default function CustomerInvoices() {
  const can = useCan();
  const { data, q, setQ, loading, reload } = useList("/customer-invoices");
  const [open, setOpen] = useState(false);
  const { ask, node } = useConfirm();
  const toast = useToast();
  const remove = (r: any) => ask(`Delete invoice <b>${r.invNumber}</b>?`, async () => {
    try { await api.del(`/customer-invoices/${r.id}`); toast("Deleted"); reload(); } catch (e: any) { toast(e.message, "err"); }
  });
  const markPaid = async (r: any) => { try { await api.put(`/customer-invoices/${r.id}`, { payDate: todayISO(), dueDate: r.dueDate }); toast("Marked paid"); reload(); } catch (e: any) { toast(e.message, "err"); } };
  return (
    <>
      <div className="callout"><span className="ci">💱</span><div><b>Customer invoices</b> are raised from a <b>Delivery Order</b> — the <b>PO number</b> and <b>Surat Jalan (DO) number</b> are pulled in automatically. PPN 11% is applied.</div></div>
      <div className="toolbar"><Search value={q} onChange={setQ} placeholder="Search invoice, PO, DO…" />{can("ci", "edit") && <button className="btn btn-pri" onClick={() => setOpen(true)}>+ New Invoice from Delivery</button>}</div>
      <div className="tbl-wrap"><div className="scroll"><table>
        <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>PO No.</th><th>Surat Jalan</th><th className="num">Subtotal</th><th className="num">Total +PPN</th><th>Status</th><th className="num">Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={9}><div className="empty">Loading…</div></td></tr>
            : data.length === 0 ? <tr><td colSpan={9}><div className="empty">No invoices yet — deliver first, then invoice</div></td></tr>
              : data.map((v: any) => (
                <tr key={v.id}>
                  <td className="b mono">{v.invNumber}</td><td>{fmtD(v.invDate)}</td><td>{v.customer?.name}</td>
                  <td className="mono">{v.poNumber || "—"}</td><td className="mono">{v.doNumber || "—"}</td>
                  <td className="num">{idr(v.sellIdr)}</td><td className="num b">{idr(v.totalIdr)}</td>
                  <td><span className={"st " + (v.status === "PAID" ? "g" : "a")}>{v.status}</span></td>
                  <td className="num"><div className="rowact">
                    <a className="iact" href={pdfUrl(`/customer-invoices/${v.id}/pdf`)} target="_blank" title="Invoice PDF">⬇</a>
                    {v.status !== "PAID" && can("ci", "edit") && <button className="iact" title="Mark paid" onClick={() => markPaid(v)}>✓</button>}
                    {can("ci", "full") && <button className="iact del" onClick={() => remove(v)}>🗑</button>}
                  </div></td>
                </tr>
              ))}
        </tbody>
      </table></div></div>
      {open && <InvModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); }} />}
      {node}
    </>
  );
}

function InvModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [dos, setDos] = useState<any[]>([]);
  const [f, setF] = useState<any>({ deliveryOrderId: "", invNumber: "", invDate: todayISO(), exchangeRate: 16813, dueDate: "" });
  const toast = useToast();
  useEffect(() => { api.get("/customer-invoices/open-deliveries").then(setDos); }, []);
  const sel = dos.find((d) => d.id === f.deliveryOrderId);
  const save = async () => {
    if (!f.deliveryOrderId) return toast("Pick a delivery order", "err");
    try { await api.post("/customer-invoices", { ...f, exchangeRate: Number(f.exchangeRate) || 16813 }); toast("Invoice created"); onSaved(); }
    catch (e: any) { toast(e.message, "err"); }
  };
  return (
    <Modal title="New Customer Invoice" onClose={onClose}
      footer={<><button className="btn btn-sec" onClick={onClose}>Cancel</button><button className="btn btn-pri" onClick={save}>Create Invoice</button></>}>
      <div className="fgrid">
        <div className="full"><Field label="Delivery Order (Surat Jalan)" req>
          <select value={f.deliveryOrderId} onChange={(e) => setF({ ...f, deliveryOrderId: e.target.value })}>
            <option value="">— select a delivered DO —</option>
            {dos.map((d) => <option key={d.id} value={d.id}>{d.doNumber} · {d.customer?.name} · PO {d.customerPoNo || "—"}</option>)}
          </select>
        </Field></div>
        {sel && <div className="full callout" style={{ marginBottom: 0 }}><span className="ci">🔗</span><div>Will reference <b>PO {sel.customerPoNo || "—"}</b> and <b>Surat Jalan {sel.doNumber}</b> for {sel.customer?.name}.</div></div>}
        <Field label="Invoice no."><input value={f.invNumber} onChange={(e) => setF({ ...f, invNumber: e.target.value })} placeholder="auto if blank" /></Field>
        <Field label="Invoice date"><input type="date" value={f.invDate} onChange={(e) => setF({ ...f, invDate: e.target.value })} /></Field>
        <Field label="Exchange rate"><input type="number" value={f.exchangeRate} onChange={(e) => setF({ ...f, exchangeRate: e.target.value })} /></Field>
        <Field label="Due date"><input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
