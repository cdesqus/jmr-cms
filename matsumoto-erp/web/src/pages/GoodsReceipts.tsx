import React, { useState } from "react";
import { api, pdfUrl } from "../lib/api";
import { useList, useConfirm, Search, useToast, fmtD } from "../lib/ui";
import { useCan } from "../lib/auth";
import ReceiveModal from "./Receive";

export default function GoodsReceipts() {
  const can = useCan();
  const { data, q, setQ, loading, reload } = useList("/goods-receipts");
  const [receiving, setReceiving] = useState(false);
  const { ask, node } = useConfirm();
  const toast = useToast();
  const remove = (r: any) => ask(`Delete <b>${r.grNumber}</b>? This reverses the stock it added.`, async () => {
    try { await api.del(`/goods-receipts/${r.id}`); toast("GR deleted — stock reversed"); reload(); } catch (e: any) { toast(e.message, "err"); }
  });
  return (
    <>
      <div className="callout"><span className="ci">📦</span><div><b>Goods Receipts.</b> Created when goods arrive — use <b>Receive</b> to scan the PO's QR or enter the PO / DN number. Each GR is the reference for matching the <b>supplier's invoice</b> (PO ↔ GR ↔ Supplier Invoice).</div></div>
      <div className="toolbar"><Search value={q} onChange={setQ} placeholder="Search GR number, PO number or DN…" />{can("gr", "edit") && <button className="btn btn-pri" onClick={() => setReceiving(true)}>⇣ Receive (Scan QR / DN)</button>}</div>
      <div className="tbl-wrap"><div className="scroll"><table>
        <thead><tr><th>GR Number</th><th>Date</th><th>Against PO</th><th>Supplier DN</th><th>Supplier</th><th>Items</th><th>Supplier Inv.</th><th className="num">Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={8}><div className="empty">Loading…</div></td></tr>
            : data.length === 0 ? <tr><td colSpan={8}><div className="empty">No goods receipts yet — click Receive to post one</div></td></tr>
              : data.map((gr: any) => (
                <tr key={gr.id}>
                  <td className="b mono">{gr.grNumber}</td>
                  <td>{fmtD(gr.grDate)}</td>
                  <td className="mono">{gr.po?.poNumber || "—"}</td>
                  <td className="mono">{gr.dnNumber || "—"}</td>
                  <td>{gr.supplier?.name}</td>
                  <td>{(gr.lines || []).map((l: any) => l.rawMaterial?.name || "item").join(", ")}</td>
                  <td>{gr.supplierInvoice ? <span className="st g">{gr.supplierInvoice.siNumber}</span> : <span className="st a">pending</span>}</td>
                  <td className="num"><div className="rowact">
                    <a className="iact" href={pdfUrl(`/goods-receipts/${gr.id}/pdf`)} target="_blank" title="PDF">⬇</a>
                    {can("gr", "full") && <button className="iact del" title="Delete" onClick={() => remove(gr)}>🗑</button>}
                  </div></td>
                </tr>
              ))}
        </tbody>
      </table></div></div>
      {receiving && <ReceiveModal onClose={() => setReceiving(false)} onSaved={reload} />}
      {node}
    </>
  );
}
