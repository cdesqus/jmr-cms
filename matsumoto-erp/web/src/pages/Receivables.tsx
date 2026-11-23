import React from "react";
import { api, pdfUrl } from "../lib/api";
import { useList, Search, useToast, idr, idrS, fmtD, daysTo, todayISO } from "../lib/ui";
import { useCan } from "../lib/auth";

// Customer side of Payables: what customers owe MTI, with aging by due date
export default function Receivables() {
  const can = useCan();
  const { data, q, setQ, loading, reload } = useList("/customer-invoices");
  const toast = useToast();
  const unpaid = data.filter((i: any) => i.status !== "PAID");
  const out = unpaid.reduce((a: number, i: any) => a + (i.totalIdr || 0), 0);
  const overdue = unpaid.filter((i: any) => i.dueDate && (daysTo(i.dueDate) || 0) < 0);
  const dueSoon = unpaid.filter((i: any) => i.dueDate && (daysTo(i.dueDate) || 0) >= 0 && (daysTo(i.dueDate) || 0) <= 30);
  const col = data.filter((i: any) => i.status === "PAID").reduce((a: number, i: any) => a + (i.totalIdr || 0), 0);
  const kpis = [
    { ic: "⏳", bg: "var(--amber-bg)", lbl: "Total outstanding", val: idrS(out), sub: unpaid.length + " invoices", cls: "down" },
    { ic: "!", bg: "var(--red-bg)", lbl: "Overdue", val: idrS(overdue.reduce((a: number, i: any) => a + (i.totalIdr || 0), 0)), sub: overdue.length + " invoices", cls: overdue.length ? "down" : "neu" },
    { ic: "📅", bg: "var(--blue-bg)", lbl: "Due in 30 days", val: idrS(dueSoon.reduce((a: number, i: any) => a + (i.totalIdr || 0), 0)), sub: dueSoon.length + " invoices", cls: "neu" },
    { ic: "✓", bg: "var(--green-bg)", lbl: "Collected", val: idrS(col), sub: data.length - unpaid.length + " invoices", cls: "up" },
  ];
  const markPaid = async (v: any) => {
    // the invoice update rewrites dueDate too, so send the current one back
    try { await api.put(`/customer-invoices/${v.id}`, { payDate: todayISO(), dueDate: v.dueDate }); toast(`${v.invNumber} marked paid`); reload(); }
    catch (e: any) { toast(e.message, "err"); }
  };
  return (
    <>
      <div className="kpis">
        {kpis.map((c, i) => <div className="kpi" key={i}><div className="k-ic" style={{ background: c.bg }}>{c.ic}</div><div className="k-lbl">{c.lbl}</div><div className="k-val">{c.val}</div><div className={"k-sub " + c.cls}>{c.sub}</div></div>)}
      </div>
      <div className="toolbar"><Search value={q} onChange={setQ} placeholder="Search invoice, PO or Surat Jalan…" /></div>
      <div className="tbl-wrap"><div className="scroll"><table>
        <thead><tr><th>Invoice</th><th>Customer</th><th>PO / Surat Jalan</th><th className="num">Total (incl PPN)</th><th>Due date</th><th className="num">Aging</th><th>Status</th><th className="num">Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={8}><div className="empty">Loading…</div></td></tr>
            : data.length === 0 ? <tr><td colSpan={8}><div className="empty">No invoices</div></td></tr>
              : data.map((v: any) => {
                const age = v.dueDate ? -(daysTo(v.dueDate) || 0) : null;
                const aging = v.status === "PAID" ? `paid ${fmtD(v.payDate)}` : age == null ? "—" : age > 0 ? `${age}d overdue` : `${Math.abs(age)}d left`;
                return (
                  <tr key={v.id}>
                    <td className="b mono">{v.invNumber}</td><td>{v.customer?.name}</td>
                    <td className="mono" style={{ fontSize: 10.5 }}>{v.poNumber || "—"} / {v.doNumber || "—"}</td>
                    <td className="num b">{idr(v.totalIdr)}</td><td>{fmtD(v.dueDate)}</td>
                    <td className="num" style={age && age > 0 && v.status !== "PAID" ? { color: "var(--red)", fontWeight: 600 } : undefined}>{aging}</td>
                    <td><span className={"st " + (v.status === "PAID" ? "g" : "a")}>{v.status}</span></td>
                    <td className="num"><div className="rowact">
                      {v.status !== "PAID" && can("recv", "edit") && <button className="iact" title="Mark paid" onClick={() => markPaid(v)}>✓</button>}
                      <a className="iact" href={pdfUrl(`/customer-invoices/${v.id}/pdf`)} target="_blank" title="Invoice PDF">⬇</a>
                    </div></td>
                  </tr>
                );
              })}
        </tbody>
      </table></div></div>
    </>
  );
}
