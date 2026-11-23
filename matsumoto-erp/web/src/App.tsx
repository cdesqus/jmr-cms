import React, { useEffect, useState } from "react";
import { ToastProvider, Modal, Field, useToast } from "./lib/ui";
import { api } from "./lib/api";
import { AuthProvider, useAuth } from "./lib/auth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import PurchaseOrders from "./pages/PurchaseOrders";
import GoodsReceipts from "./pages/GoodsReceipts";
import SupplierInvoices from "./pages/SupplierInvoices";
import Deliveries from "./pages/Deliveries";
import CustomerInvoices from "./pages/CustomerInvoices";
import Receivables from "./pages/Receivables";
import Payables from "./pages/Payables";
import Pipeline from "./pages/Pipeline";
import CustomerDb from "./pages/CustomerDb";
import SalesOrders from "./pages/SalesOrders";
import CrudPage from "./pages/CrudPage";
import { BrandingSettings, UsersSettings, RolesSettings } from "./pages/Settings";
import { customersCfg, suppliersCfg, vendorsCfg, unitsCfg, rawMaterialsCfg, finishGoodsCfg, inventoryCfg, packageSizesCfg, incotermsCfg, exchangeRatesCfg } from "./pages/masters";

// r = route, m = the access module (Settings → Roles) that decides whether the item shows
type Item = { r: string; ic: string; lbl: string; m: string; title: string; sub: string; page: () => React.ReactNode };
type Group = { g: string; ic: string; items: Item[] };
const NAV: Group[] = [
  { g: "Overview", ic: "◧", items: [
    { r: "dash", m: "dash", ic: "◧", lbl: "Dashboard", title: "Dashboard", sub: "Real-time view across the document chain", page: () => <Dashboard /> },
  ] },
  { g: "CRM", ic: "◎", items: [
    { r: "cdb", m: "cdb", ic: "☰", lbl: "Customer Database", title: "Customer Database", sub: "Profiles, recent orders and cumulative invoice value", page: () => <CustomerDb /> },
    { r: "crm", m: "crm", ic: "◎", lbl: "Lead Pipeline", title: "Lead Pipeline", sub: "Opportunities by stage — drag to update", page: () => <Pipeline /> },
  ] },
  { g: "Sales Transaction", ic: "📝", items: [
    { r: "so", m: "so", ic: "📝", lbl: "Sales Orders", title: "Sales Orders", sub: "Package sizes · USD / IDR / JPY · order form", page: () => <SalesOrders /> },
    { r: "do", m: "do", ic: "⇡", lbl: "Delivery (Surat Jalan)", title: "Delivery · Surat Jalan", sub: "Deliver to customers — FEFO stock out", page: () => <Deliveries /> },
    { r: "ci", m: "ci", ic: "▤", lbl: "Customer Invoices", title: "Customer Invoices", sub: "Auto-references PO + Surat Jalan", page: () => <CustomerInvoices /> },
    { r: "recv", m: "recv", ic: "◷", lbl: "Receivables", title: "Receivables", sub: "Outstanding invoices and aging", page: () => <Receivables /> },
  ] },
  { g: "Purchase", ic: "🛒", items: [
    { r: "po", m: "po", ic: "🛒", lbl: "Purchase Orders", title: "Purchase Orders", sub: "PO to Japan — PDF with QR code", page: () => <PurchaseOrders /> },
    { r: "gr", m: "gr", ic: "📦", lbl: "Goods Receipts", title: "Goods Receipts", sub: "Receive by QR scan or PO / DN — reference for supplier matching", page: () => <GoodsReceipts /> },
    { r: "si", m: "si", ic: "🧾", lbl: "Supplier Invoices", title: "Supplier Invoices", sub: "Three-way match: PO ↔ GR ↔ Invoice", page: () => <SupplierInvoices /> },
    { r: "pay", m: "pay", ic: "◶", lbl: "Payables", title: "Payables", sub: "Supplier invoices owed and aging", page: () => <Payables /> },
  ] },
  { g: "Stock", ic: "▦", items: [
    { r: "inv", m: "inv", ic: "▦", lbl: "Inventory", title: "Inventory", sub: "Lot-level stock with shelf-life control", page: () => <CrudPage cfg={inventoryCfg} /> },
  ] },
  { g: "Master Data", ic: "◆", items: [
    { r: "m-cust", m: "m-cust", ic: "◉", lbl: "Customers", title: "Customers", sub: "Who you sell to", page: () => <CrudPage cfg={customersCfg} /> },
    { r: "m-sup", m: "m-sup", ic: "◎", lbl: "Suppliers", title: "Suppliers", sub: "Who you buy from", page: () => <CrudPage cfg={suppliersCfg} /> },
    { r: "m-ven", m: "m-ven", ic: "◍", lbl: "Vendors", title: "Vendors", sub: "Forwarders & trucking", page: () => <CrudPage cfg={vendorsCfg} /> },
    { r: "m-fg", m: "m-fg", ic: "◆", lbl: "Finish Goods", title: "Finish Goods", sub: "Sellable items — linked to a customer", page: () => <CrudPage cfg={finishGoodsCfg} /> },
    { r: "m-rm", m: "m-rm", ic: "◇", lbl: "Raw Materials", title: "Raw Materials", sub: "Imported items — linked to a supplier", page: () => <CrudPage cfg={rawMaterialsCfg} /> },
    { r: "m-unit", m: "m-unit", ic: "▪", lbl: "Units", title: "Units", sub: "Units of measure", page: () => <CrudPage cfg={unitsCfg} /> },
    { r: "m-pack", m: "m-pack", ic: "▣", lbl: "Package Sizes", title: "Package Sizes", sub: "Packaging offered on Sales Orders", page: () => <CrudPage cfg={packageSizesCfg} /> },
    { r: "m-inco", m: "m-inco", ic: "⚓", lbl: "Incoterms", title: "Incoterms", sub: "Delivery terms for Purchase Orders", page: () => <CrudPage cfg={incotermsCfg} /> },
    { r: "m-fx", m: "m-fx", ic: "¥", lbl: "Exchange Rates", title: "Exchange Rates", sub: "IDR per USD / JPY — used by every conversion", page: () => <CrudPage cfg={exchangeRatesCfg} /> },
  ] },
  { g: "Settings", ic: "⚙", items: [
    { r: "s-brand", m: "settings", ic: "🎨", lbl: "Branding", title: "Branding", sub: "Company name, logo and login background", page: () => <BrandingSettings /> },
    { r: "s-users", m: "settings", ic: "👤", lbl: "Users", title: "Users", sub: "Who can sign in", page: () => <UsersSettings /> },
    { r: "s-roles", m: "settings", ic: "🔐", lbl: "Roles & Access", title: "Roles & Access", sub: "What each role can see and change (RBAC)", page: () => <RolesSettings /> },
  ] },
];

// per-browser UI preferences
const pref = {
  get: (k: string, d: any) => { try { const v = localStorage.getItem("mti_ui_" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k: string, v: any) => { try { localStorage.setItem("mti_ui_" + k, JSON.stringify(v)); } catch {} },
};

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider fallback={<div className="loading">Loading…</div>}>
        {(me) => (me ? <Shell /> : <Login />)}
      </AuthProvider>
    </ToastProvider>
  );
}

function Shell() {
  const { me, can, branding, signOut } = useAuth();
  // only the menus this role may view; empty groups disappear
  const nav = NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(i.m, "view")) })).filter((g) => g.items.length);
  const all = nav.flatMap((g) => g.items);
  const [route, setRouteState] = useState<string>(() => {
    const saved = pref.get("route", "dash");
    return all.some((i) => i.r === saved) ? saved : all[0]?.r || "";
  });
  const setRoute = (r: string) => { setRouteState(r); pref.set("route", r); };
  const [collapsed, setCollapsed] = useState<boolean>(() => pref.get("collapsed", false));
  const [closedGroups, setClosedGroups] = useState<string[]>(() => pref.get("closedGroups", []));
  const [menu, setMenu] = useState(false);
  const [pw, setPw] = useState(false);
  const toggleSide = () => { setCollapsed(!collapsed); pref.set("collapsed", !collapsed); };
  const toggleGroup = (g: string) => {
    const next = closedGroups.includes(g) ? closedGroups.filter((x) => x !== g) : [...closedGroups, g];
    setClosedGroups(next); pref.set("closedGroups", next);
  };

  // top-bar rates from the Exchange Rates master, refreshed on every page change
  const [rates, setRates] = useState<any[]>([]);
  useEffect(() => { api.get("/exchange-rates").then(setRates).catch(() => {}); }, [route]);

  const current = all.find((i) => i.r === route) || all[0];
  if (!current) {
    return <div className="login"><div className="login-card"><b>No menus are enabled for your role.</b><p className="ccy">Ask an administrator to give the role access in Settings → Roles &amp; Access.</p><button className="btn btn-sec" onClick={signOut}>Sign out</button></div></div>;
  }
  const groupOf = (r: string) => nav.find((g) => g.items.some((i) => i.r === r))?.g;

  return (
    <div className={"app" + (collapsed ? " collapsed" : "")}>
      <aside className="side">
        <div className="brand">
          {branding.logo ? <img className="brand-logo" src={branding.logo} alt="" /> : <div className="mark">M</div>}
          <div className="brand-txt"><div className="nm">{branding.companyName}</div><div className="sub">Trading Indonesia</div></div>
        </div>
        <nav>
          {collapsed
            // closed sidebar: an icon rail, one icon per menu, name on hover
            ? nav.map((g) => (
              <div key={g.g} className="nav-grp">
                {g.items.map((n) => (
                  <div key={n.r} className={"nav-i" + (route === n.r ? " on" : "")} title={`${g.g} › ${n.lbl}`} onClick={() => setRoute(n.r)}><span className="ic">{n.ic}</span></div>
                ))}
              </div>
            ))
            // open sidebar: each group drills down / folds up; the current page's group stays visible
            : nav.map((g) => {
              const open = !closedGroups.includes(g.g);
              return (
                <div key={g.g} className="nav-grp">
                  <div className={"nav-s" + (groupOf(route) === g.g ? " cur" : "")} onClick={() => toggleGroup(g.g)}>
                    <span className="lbl">{g.g}</span><span className="cnt-s">{g.items.length}</span><span className="chev">{open ? "▾" : "▸"}</span>
                  </div>
                  {open && g.items.map((n) => (
                    <div key={n.r} className={"nav-i" + (route === n.r ? " on" : "")} onClick={() => setRoute(n.r)}><span className="ic">{n.ic}</span><span className="lbl">{n.lbl}</span></div>
                  ))}
                </div>
              );
            })}
        </nav>
        {!collapsed && <div className="nav-tools"><button className="linkbtn" onClick={() => { setClosedGroups([]); pref.set("closedGroups", []); }}>Expand all</button> · <button className="linkbtn" onClick={() => { const allG = nav.map((g) => g.g); setClosedGroups(allG); pref.set("closedGroups", allG); }}>Collapse all</button></div>}
        <div className="side-foot"><span className="lbl">v2.2 · Express + Prisma + Postgres</span></div>
      </aside>
      <div className="main">
        <div className="top">
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <button className="side-tg" onClick={toggleSide} title={collapsed ? "Open sidebar" : "Close sidebar"}>{collapsed ? "☰" : "⟨"}</button>
            <div className="ttl"><span className="crumb">{groupOf(route)} ›</span> {current.title}<small>{current.sub}</small></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="rates">
              {rates.map((r) => <div className="rate" key={r.id} title={`IDR per 1 ${r.code}`} onClick={() => can("m-fx", "view") && setRoute("m-fx")}><b>{r.code}</b>{Number(r.rateIdr).toLocaleString("en-US")}</div>)}
            </div>
            <div className="user" onClick={() => setMenu(!menu)}>
              <div className="avatar">{me!.user.name.slice(0, 1).toUpperCase()}</div>
              <div className="u-txt"><b>{me!.user.name}</b><span>{me!.user.role.name}</span></div>
              {menu && (
                <div className="u-menu" onClick={(e) => e.stopPropagation()}>
                  <div className="ccy" style={{ padding: "6px 12px" }}>Signed in as <b>{me!.user.username}</b></div>
                  <button onClick={() => { setMenu(false); setPw(true); }}>Change password</button>
                  <button onClick={signOut}>Sign out</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="content" onClick={() => menu && setMenu(false)}>{current.page()}</div>
      </div>
      {pw && <PasswordModal onClose={() => setPw(false)} />}
    </div>
  );
}

function PasswordModal({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ current: "", next: "", again: "" });
  const toast = useToast();
  const save = async () => {
    if (f.next !== f.again) return toast("The new passwords don't match", "err");
    try { await api.post("/auth/password", { current: f.current, next: f.next }); toast("Password changed"); onClose(); }
    catch (e: any) { toast(e.message, "err"); }
  };
  return (
    <Modal title="Change password" onClose={onClose}
      footer={<><button className="btn btn-sec" onClick={onClose}>Cancel</button><button className="btn btn-pri" onClick={save}>Change password</button></>}>
      <div className="fgrid">
        <div className="full"><Field label="Current password"><input type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></Field></div>
        <Field label="New password" hint="at least 8 characters"><input type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></Field>
        <Field label="Repeat new password"><input type="password" autoComplete="new-password" value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
