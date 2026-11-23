import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useList, useConfirm, Modal, Field, Search, useToast, fmtD, idr, money, todayISO, useRates } from "../lib/ui";
import { useCan } from "../lib/auth";

export default function SupplierInvoices() {
  const can = useCan();
  const { data, q, setQ, loading, reload } = useList("/supplier-invoices");
  const [open, setOpen] = useState(false);
  const { ask, node } = useConfirm();
  const toast = useToast();
  const remove = (r: any) => ask(`Delete supplier invoice <b>${r.siNumber}</b>?`, async () => {
    try { await api.del(`/supplier-invoices/${r.id}`); toast("Deleted"); reload(); } catch (e: any) { toast(e.message, "err"); }
  });
  return (
    <>
      <div className="callout"><span className="ci">🧾</span><div><b>Supplier invoices</b> are matched against a <b>Goods Receipt</b> — three-way match PO ↔ GR ↔ Invoice before payment.</div></div>
      <div className="toolbar"><Search value={q} onChange={setQ} placeholder="Search SI number, GR ref or PO ref…" />{can("si", "edit") && <button className="btn btn-pri" onClick={() => setOpen(true)}>+ Match Supplier Invoice</button>}</div>
      <div className="tbl-wrap"><div className="scroll"><table>
        <thead><tr><th>SI Number</th><th>Date</th><th>Supplier</th><th>GR Ref</th><th>PO Ref</th><th className="num">Amount</th><th className="num">Total IDR</th><th>Status</th><th className="num">Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={9}><div className="empty">Loading…</div></td></tr>
            : data.length === 0 ? <tr><td colSpan={9}><div className="empty">No supplier invoices yet</div></td></tr>
              : data.map((si: any) => (
                <tr key={si.id}>
                  <td className="b mono">{si.siNumber}</td><td>{fmtD(si.invDate)}</td><td>{si.supplier?.name}</td>
                  <td className="mono">{si.goodsReceipt?.grNumber || "—"}</td>
                  <td className="mono">{si.goodsReceipt?.po?.poNumber || "—"}</td>
                  <td className="num">{money(si.amount, si.currency)} <span className="ccy">{si.currency}</span></td><td className="num b">{idr(si.totalIdr)}</td>
                  <td><span className={"st " + (si.status === "PAID" ? "g" : "b")}>{si.status}</span></td>
                  <td className="num"><div className="rowact">{can("si", "full") && <button className="iact del" onClick={() => remove(si)}>🗑</button>}</div></td>
                </tr>
              ))}
        </tbody>
      </table></div></div>
      {open && <SIModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); }} />}
      {node}
    </>
  );
}

function SIModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [grs, setGrs] = useState<any[]>([]);
  const [f, setF] = useState<any>({ goodsReceiptId: "", siNumber: "", invDate: todayISO(), currency: "USD", amount: "", exchangeRate: "", dueDate: "" });
  const rates = useRates();
  const toast = useToast();
  useEffect(() => { api.get("/supplier-invoices/open-receipts").then(setGrs); }, []);
  // billed in the PO's currency by default
  const pickGr = (id: string) => {
    const ccy = grs.find((g) => g.id === id)?.po?.currency || "USD";
    setF({ ...f, goodsReceiptId: id, currency: ccy, exchangeRate: rates[ccy] || "" });
  };
  const rate = Number(f.exchangeRate) || rates[f.currency] || 0;
  const save = async () => {
    if (!f.goodsReceiptId) return toast("Pick a Goods Receipt", "err");
    try { await api.post("/supplier-invoices", { ...f, amount: Number(f.amount) || 0, exchangeRate: rate || undefined }); toast("Supplier invoice matched"); onSaved(); }
    catch (e: any) { toast(e.message, "err"); }
  };
  return (
    <Modal title="Match Supplier Invoice to a Goods Receipt" onClose={onClose}
      footer={<><button className="btn btn-sec" onClick={onClose}>Cancel</button><button className="btn btn-pri" onClick={save}>Save</button></>}>
      <div className="fgrid">
        <div className="full"><Field label="Goods Receipt (PO ↔ GR)" req>
          <select value={f.goodsReceiptId} onChange={(e) => pickGr(e.target.value)}>
            <option value="">— select a received GR —</option>
            {grs.map((g) => <option key={g.id} value={g.id}>{g.grNumber} · PO {g.po?.poNumber} ({g.po?.currency}) · {g.supplier?.name}</option>)}
          </select>
        </Field></div>
        <Field label="Supplier invoice no."><input value={f.siNumber} onChange={(e) => setF({ ...f, siNumber: e.target.value })} placeholder="auto if blank" /></Field>
        <Field label="Invoice date"><input type="date" value={f.invDate} onChange={(e) => setF({ ...f, invDate: e.target.value })} /></Field>
        <Field label="Currency"><select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value, exchangeRate: rates[e.target.value] || "" })}><option>USD</option><option>JPY</option></select></Field>
        <Field label={`Amount ${f.currency}`} req hint={Number(f.amount) ? `≈ ${idr(Number(f.amount) * rate)}` : undefined}><input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label={`Rate (IDR per ${f.currency})`}><input type="number" value={f.exchangeRate} onChange={(e) => setF({ ...f, exchangeRate: e.target.value })} /></Field>
        <Field label="Due date"><input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
