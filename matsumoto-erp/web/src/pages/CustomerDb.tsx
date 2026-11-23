import React, { useEffect, useState } from "react";
import { api, pdfUrl } from "../lib/api";
import { useList, Modal, Search, useToast, fmtD, idr, idrS, money } from "../lib/ui";
import { useCan } from "../lib/auth";
import Activities from "../components/Activities";
import { FormModal } from "./CrudPage";
import { customersCfg } from "./masters";
import { STAGES, POSSIBILITY } from "./Pipeline";
import { SOModal } from "./SalesOrders";

const KIND: Record<string, { lbl: string; cls: string }> = { SO: { lbl: "Sales Order", cls: "purple" }, DO: { lbl: "Surat Jalan", cls: "b" }, INV: { lbl: "Invoice", cls: "g" } };

export default function CustomerDb() {
  const can = useCan();
  const { data, q, setQ, loading, reload } = useList("/crm/customers");
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<any | null>(null); // customer being added / edited
  const toast = useToast();
  // new customer: same form as Master Data → Customers, with the next code (C012…) filled in
  const addCustomer = async () => {
    const all: any[] = await api.get("/customers").catch(() => []);
    const n = Math.max(0, ...all.map((c) => Number(String(c.code).replace(/\D/g, "")) || 0)) + 1;
    setForm({ code: `C${String(n).padStart(3, "0")}` });
  };
  const saveCustomer = async (f: any) => {
    try {
      const { valuation, orders, lastOrder, openLeads, wonLeads, lastActivity, ...body } = f;
      const saved = f.id ? await api.put(`/customers/${f.id}`, body) : await api.post("/customers", body);
      toast(f.id ? "Customer updated" : `Customer ${saved.name} added`);
      setForm(null); reload();
      if (!f.id) setOpen(saved.id);
    } catch (e: any) { toast(e.message, "err"); }
  };
  const total = data.reduce((a: number, c: any) => a + c.valuation.invoiced, 0);
  const outstanding = data.reduce((a: number, c: any) => a + c.valuation.outstanding, 0);
  const kpis = [
    { ic: "◉", bg: "var(--blue-bg)", lbl: "Customers & prospects", val: data.length, sub: `${data.filter((c: any) => c.valuation.count).length} invoiced` },
    { ic: "Σ", bg: "var(--green-bg)", lbl: "Cumulative invoiced", val: idrS(total), sub: "incl. PPN, all time" },
    { ic: "⏳", bg: "var(--amber-bg)", lbl: "Outstanding", val: idrS(outstanding), sub: "unpaid invoices" },
    { ic: "◎", bg: "var(--purple-bg)", lbl: "Open opportunities", val: data.reduce((a: number, c: any) => a + c.openLeads, 0), sub: "in the pipeline" },
  ];
  return (
    <>
      <div className="kpis">
        {kpis.map((c, i) => <div className="kpi" key={i}><div className="k-ic" style={{ background: c.bg }}>{c.ic}</div><div className="k-lbl">{c.lbl}</div><div className="k-val">{c.val}</div><div className="k-sub neu">{c.sub}</div></div>)}
      </div>
      <div className="toolbar"><Search value={q} onChange={setQ} placeholder="Search customer, contact, segment…" />{can("cdb", "edit") && <button className="btn btn-pri" onClick={addCustomer}>+ New Customer</button>}</div>
      <div className="ccy" style={{ margin: "-6px 0 10px" }}>Click a customer for the full profile, history and activities.</div>
      <div className="tbl-wrap"><div className="scroll"><table>
        <thead><tr><th>Customer</th><th>Segment</th><th>Contact</th><th className="num">Cumulative invoiced</th><th className="num">Outstanding</th><th className="num">Invoices</th><th className="num">Orders</th><th>Last order</th><th className="num">Open opps</th><th>Last activity</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={10}><div className="empty">Loading…</div></td></tr>
            : data.length === 0 ? <tr><td colSpan={10}><div className="empty">No customers</div></td></tr>
              : data.map((c: any) => (
                <tr key={c.id} className="click" onClick={() => setOpen(c.id)}>
                  <td className="b">{c.name}<div className="ccy mono">{c.code}</div></td>
                  <td>{c.segment ? <span className="st b">{c.segment}</span> : "—"}</td>
                  <td>{c.pic || "—"}</td>
                  <td className="num b">{c.valuation.invoiced ? idr(c.valuation.invoiced) : <span className="ccy">prospect</span>}</td>
                  <td className="num" style={{ color: c.valuation.outstanding ? "var(--red)" : "var(--muted)" }}>{c.valuation.outstanding ? idr(c.valuation.outstanding) : "—"}</td>
                  <td className="num">{c.valuation.count || "—"}</td>
                  <td className="num">{c.orders || "—"}</td>
                  <td>{fmtD(c.lastOrder)}</td>
                  <td className="num">{c.openLeads ? <span className="st purple">{c.openLeads}</span> : "—"}</td>
                  <td>{fmtD(c.lastActivity)}</td>
                </tr>
              ))}
        </tbody>
      </table></div></div>
      {open && !form && <Profile id={open} onClose={() => setOpen(null)} onChange={reload} onEdit={setForm} />}
      {form && <FormModal cfg={customersCfg} opts={{}} row={form} onClose={() => setForm(null)} onSave={saveCustomer} />}
    </>
  );
}

function Profile({ id, onClose, onChange, onEdit }: { id: string; onClose: () => void; onChange: () => void; onEdit: (c: any) => void }) {
  const can = useCan();
  const [c, setC] = useState<any>(null);
  const [tab, setTab] = useState<"orders" | "log" | "opps" | "acts" | "products">("orders");
  const [so, setSo] = useState(false);
  const load = () => api.get(`/crm/customers/${id}`).then(setC);
  useEffect(() => { load(); }, [id]);
  if (!c) return <Modal title="Customer" onClose={onClose} wide><div className="loading">Loading…</div></Modal>;
  const v = c.valuation;
  const pdfPath = (x: any) => (x.kind === "INV" ? "customer-invoices" : x.kind === "DO" ? "deliveries" : "sales-orders");

  return (
    <Modal title={c.name} onClose={onClose} wide
      footer={<>
        {can("cdb", "edit") && <button className="btn btn-sec" style={{ marginRight: "auto" }} onClick={() => onEdit({ id: c.id, code: c.code, name: c.name, segment: c.segment, npwp: c.npwp, pic: c.pic, phone: c.phone, email: c.email, top: c.top, address: c.address })}>✎ Edit details</button>}
        <button className="btn btn-sec" onClick={onClose}>Close</button>
        {can("so", "edit") && <button className="btn btn-pri" onClick={() => setSo(true)}>+ Sales Order</button>}
      </>}>
      <div className="prof">
        <div><span>Code</span><b className="mono">{c.code}</b></div>
        <div><span>Segment</span><b>{c.segment || "—"}</b></div>
        <div><span>Contact</span><b>{c.pic || "—"}</b></div>
        <div><span>Phone / email</span><b>{[c.phone, c.email].filter(Boolean).join(" · ") || "—"}</b></div>
        <div><span>NPWP</span><b className="mono">{c.npwp || "—"}</b></div>
        <div><span>Terms</span><b>{c.top || "—"}</b></div>
        <div className="wide"><span>Address</span><b>{c.address || "—"}</b></div>
      </div>
      <div className="kpis mini">
        <div className="kpi"><div className="k-lbl">Cumulative invoiced</div><div className="k-val">{idr(v.invoiced)}</div><div className="k-sub neu">{v.count} invoices, incl PPN</div></div>
        <div className="kpi"><div className="k-lbl">Paid</div><div className="k-val up">{idr(v.paid)}</div></div>
        <div className="kpi"><div className="k-lbl">Outstanding</div><div className={"k-val " + (v.outstanding ? "down" : "")}>{idr(v.outstanding)}</div></div>
        <div className="kpi"><div className="k-lbl">Average invoice</div><div className="k-val">{v.count ? idr(v.invoiced / v.count) : "—"}</div></div>
      </div>
      <div className="tabs">
        {([["orders", `Recent orders (${c.recentOrders.length})`], ["log", `Transactions (${c.log.length})`], ["opps", `Opportunities (${c.leads.length})`], ["acts", `Activities (${c.activities.length})`], ["products", `Products (${c.finishGoods.length})`]] as const).map(([k, l]) =>
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "orders" && (c.recentOrders.length === 0 ? <div className="empty">No sales orders yet — click + Sales Order</div> : (
        <div className="ro-list">
          {c.recentOrders.map((o: any) => {
            const amt = o.lines.reduce((a: number, l: any) => a + l.qtyKg * l.unitPrice, 0);
            return (
              <div className="ro" key={o.id}>
                <div className="ro-h">
                  <span className="mono b">{o.soNumber}</span>
                  <span>{fmtD(o.soDate)}</span>
                  <span className={"st " + ({ DRAFT: "gray", CONFIRMED: "b", DELIVERED: "g", CANCELLED: "r" } as any)[o.status]}>{o.status}</span>
                  {o.customerPoNo && <span className="ccy">PO {o.customerPoNo}</span>}
                  {o.deliveryOrders.length > 0 && <span className="ccy">SJ {o.deliveryOrders.map((d: any) => d.doNumber).join(", ")}</span>}
                  <span className="ro-amt"><b>{money(amt, o.currency)}</b> <span className="ccy">≈ {idr(amt * o.exchangeRate)}</span></span>
                  <a className="iact" target="_blank" title="Order form PDF" href={pdfUrl(`/sales-orders/${o.id}/pdf`)}>⬇</a>
                </div>
                <table className="ltable log">
                  <thead><tr><th>Product</th><th>Package</th><th className="num">Qty kg</th><th className="num">Price/kg</th><th className="num">Amount</th></tr></thead>
                  <tbody>{o.lines.map((l: any) => (
                    <tr key={l.id}>
                      <td className="b">{l.product}</td>
                      <td>{l.packageSize ? `${l.packages} × ${l.packageSize.name}` : "bulk"}</td>
                      <td className="num">{l.qtyKg}</td>
                      <td className="num">{money(l.unitPrice, o.currency)}</td>
                      <td className="num">{money(l.qtyKg * l.unitPrice, o.currency)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            );
          })}
        </div>
      ))}
      {tab === "log" && (c.log.length === 0 ? <div className="empty">No transactions yet</div> : (
        <table className="ltable log">
          <thead><tr><th>Date</th><th>Document</th><th>Ref</th><th>Detail</th><th>Status</th><th className="num">Amount</th><th></th></tr></thead>
          <tbody>{c.log.map((x: any, i: number) => (
            <tr key={i}>
              <td>{fmtD(x.date)}</td><td><span className={"st " + KIND[x.kind].cls}>{KIND[x.kind].lbl}</span></td>
              <td className="mono">{x.ref}</td><td className="ccy">{x.detail}</td><td>{x.status}</td>
              <td className="num">{x.amount != null ? money(x.amount, x.currency) : "—"}</td>
              <td><a className="iact" target="_blank" title="PDF" href={pdfUrl(`/${pdfPath(x)}/${x.id}/pdf`)}>⬇</a></td>
            </tr>
          ))}</tbody>
        </table>
      ))}
      {tab === "opps" && (c.leads.length === 0 ? <div className="empty">No opportunities — add one in Lead Pipeline</div> : (
        <table className="ltable log">
          <thead><tr><th>No</th><th>Product</th><th>Maker</th><th>Project</th><th>Possibility</th><th>Stage</th><th>Updated</th></tr></thead>
          <tbody>{c.leads.map((l: any) => (
            <tr key={l.id}>
              <td className="mono">#{l.leadNo}</td><td className="b">{l.product}</td><td>{l.supplier || "—"}</td><td>{l.project || "—"}</td>
              <td>{l.possibility ? <span className={"st " + POSSIBILITY[l.possibility].cls}>{POSSIBILITY[l.possibility].lbl}</span> : "—"}</td>
              <td>{(() => { const s = STAGES.find((x) => x.k === l.stage)!; return <span className={"st " + (l.stage === "WON" ? "g" : l.stage === "DEAD" ? "r" : "b")}>{s.n}. {s.lbl}</span>; })()}</td>
              <td>{fmtD(l.updatedAt)}</td>
            </tr>
          ))}</tbody>
        </table>
      ))}
      {tab === "acts" && <Activities customerId={c.id} onChange={() => { load(); onChange(); }} />}
      {tab === "products" && (c.finishGoods.length === 0 ? <div className="empty">No finish goods linked to this customer</div> : (
        <table className="ltable log">
          <thead><tr><th>Code</th><th>Finish good</th><th>Stock source</th><th className="num">Price USD/kg</th></tr></thead>
          <tbody>{c.finishGoods.map((f: any) => <tr key={f.id}><td className="mono">{f.code}</td><td className="b">{f.name}</td><td>{f.rawMaterial?.name || "—"}</td><td className="num">{money(f.priceUsd, "USD")}</td></tr>)}</tbody>
        </table>
      ))}
      {so && <SOModal row={{ customerId: c.id }} onClose={() => setSo(false)} onSaved={() => { setSo(false); load(); onChange(); }} />}
    </Modal>
  );
}
