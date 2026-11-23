import React from "react";
import { CrudConfig } from "./CrudPage";
import { usd, fmtD, daysTo } from "../lib/ui";

const chip = (txt: any, cls = "gray") => <span className={"st " + cls}>{txt}</span>;

export const customersCfg: CrudConfig = {
  path: "/customers", singular: "Customer", title: "customers", module: "m-cust",
  searchPlaceholder: "Search customers…",
  note: { i: "◉", t: <><b>Customers</b> you sell to. Finish Goods link here; each customer's terms (TOP) drive invoice due dates.</> },
  columns: [
    { h: "Code", render: (r) => <span className="mono">{r.code}</span> },
    { h: "Customer", render: (r) => <b>{r.name}</b> },
    { h: "NPWP", render: (r) => <span className="mono">{r.npwp || "—"}</span> },
    { h: "Segment", render: (r) => (r.segment ? chip(r.segment, "b") : "—") },
    { h: "Contact", render: (r) => r.pic || "—" },
    { h: "Terms", render: (r) => r.top || "—" },
    { h: "Address", render: (r) => <span style={{ color: "var(--muted)" }}>{r.address || "—"}</span> },
  ],
  fields: [
    { k: "code", label: "Code", req: true }, { k: "name", label: "Customer name", req: true },
    { k: "segment", label: "Segment", type: "select", options: ["OEM", "Brand owner", "Pharma", "Distributor"].map((v) => ({ value: v, label: v })) },
    { k: "npwp", label: "NPWP" },
    { k: "pic", label: "Contact person" }, { k: "phone", label: "Phone" },
    { k: "email", label: "Email" }, { k: "top", label: "Terms of payment", hint: "e.g. month-end + 60" },
    { k: "address", label: "Address", type: "textarea", full: true },
  ],
};

export const packageSizesCfg: CrudConfig = {
  path: "/package-sizes", singular: "Package Size", title: "package sizes", module: "m-pack",
  searchPlaceholder: "Search package sizes…",
  note: { i: "▣", t: <><b>Package sizes</b> offered on Sales Orders. Qty = number of packages × size, so 4 × Fibre drum 25 kg = 100 kg.</> },
  columns: [
    { h: "Code", render: (r) => chip(r.code, "b") },
    { h: "Package", render: (r) => <b>{r.name}</b> },
    { h: "Size", num: true, render: (r) => `${r.sizeKg} kg` },
  ],
  fields: [
    { k: "code", label: "Code", req: true, hint: "e.g. DRUM-25" }, { k: "name", label: "Description", req: true, hint: "e.g. Fibre drum 25 kg" },
    { k: "sizeKg", label: "Size (kg)", type: "number", req: true },
  ],
  toPayload: (f) => ({ ...f, sizeKg: Number(f.sizeKg) || 0 }),
};

export const incotermsCfg: CrudConfig = {
  path: "/incoterms", singular: "Incoterm", title: "incoterms", module: "m-inco",
  searchPlaceholder: "Search incoterms…",
  note: { i: "⚓", t: <><b>Incoterms</b> offered on Purchase Orders to suppliers — FAS, FOB, CFR, CIF and more.</> },
  columns: [
    { h: "Code", render: (r) => chip(r.code, "b") },
    { h: "Description", render: (r) => r.name },
  ],
  fields: [{ k: "code", label: "Code", req: true, hint: "e.g. CIF" }, { k: "name", label: "Description", req: true, hint: "e.g. Cost, Insurance and Freight" }],
  toPayload: (f) => ({ ...f, code: String(f.code).toUpperCase() }),
};

export const exchangeRatesCfg: CrudConfig = {
  path: "/exchange-rates", singular: "Exchange Rate", title: "exchange rates", module: "m-fx",
  searchPlaceholder: "Search currency…",
  note: { i: "¥", t: <><b>Exchange rates</b> — IDR value of 1 USD / 1 JPY. Sales Orders, POs and supplier invoices default to these and convert live; each document keeps the rate it was saved with.</> },
  columns: [
    { h: "Currency", render: (r) => chip(r.code, "b") },
    { h: "IDR per unit", num: true, render: (r) => <b>Rp {Number(r.rateIdr).toLocaleString("en-US")}</b> },
    { h: "Updated", render: (r) => fmtD(r.updatedAt) },
  ],
  fields: [
    { k: "code", label: "Currency code", req: true, hint: "USD or JPY" },
    { k: "rateIdr", label: "IDR per 1 unit", type: "number", req: true, hint: "e.g. 16813 for USD, 112.4 for JPY" },
  ],
  toPayload: (f) => ({ ...f, code: String(f.code).toUpperCase(), rateIdr: Number(f.rateIdr) || 0 }),
};

export const suppliersCfg: CrudConfig = {
  path: "/suppliers", singular: "Supplier", title: "suppliers", module: "m-sup",
  searchPlaceholder: "Search suppliers…",
  note: { i: "◎", t: <><b>Suppliers & makers</b> you buy from. Raw Materials link here. The parent (Matsumoto Tokyo) invoices in USD/JPY.</> },
  columns: [
    { h: "Code", render: (r) => <span className="mono">{r.code}</span> },
    { h: "Supplier / Maker", render: (r) => <b>{r.name}</b> },
    { h: "Role", render: (r) => chip(r.role || "—") },
    { h: "PIC", render: (r) => r.pic || "—" },
    { h: "Email", render: (r) => <span style={{ color: "var(--muted)" }}>{r.email || "—"}</span> },
    { h: "Terms", render: (r) => r.top || "—" },
  ],
  fields: [
    { k: "code", label: "Code", req: true }, { k: "name", label: "Supplier name", req: true },
    { k: "role", label: "Role", type: "select", options: [{ value: "Parent / supplier", label: "Parent / supplier" }, { value: "Maker", label: "Maker" }, { value: "Supplier", label: "Supplier" }] },
    { k: "pic", label: "PIC" }, { k: "email", label: "Email" }, { k: "top", label: "Terms", full: true },
  ],
};

export const vendorsCfg: CrudConfig = {
  path: "/vendors", singular: "Vendor", title: "vendors", module: "m-ven",
  searchPlaceholder: "Search vendors…",
  note: { i: "◍", t: <><b>Vendors</b> — forwarders and trucking used for import and domestic delivery.</> },
  columns: [
    { h: "Code", render: (r) => <span className="mono">{r.code}</span> },
    { h: "Vendor", render: (r) => <b>{r.name}</b> },
    { h: "Type", render: (r) => chip(r.type || "—") },
    { h: "Method", render: (r) => r.method || "—" },
  ],
  fields: [
    { k: "code", label: "Code", req: true }, { k: "name", label: "Vendor name", req: true },
    { k: "type", label: "Type", type: "select", options: [{ value: "Forwarder / warehouse", label: "Forwarder / warehouse" }, { value: "Forwarder", label: "Forwarder" }, { value: "Trucking", label: "Trucking" }] },
    { k: "method", label: "Shipping method" },
  ],
};

export const unitsCfg: CrudConfig = {
  path: "/units", singular: "Unit", title: "units", module: "m-unit",
  searchPlaceholder: "Search units…",
  note: { i: "▪", t: <><b>Units of measure</b> used across products and stock — KGS, DRUM, CTN and more.</> },
  columns: [
    { h: "Code", render: (r) => chip(r.code, "b") },
    { h: "Description", render: (r) => r.name },
  ],
  fields: [{ k: "code", label: "Unit code", req: true, hint: "e.g. KGS" }, { k: "name", label: "Description" }],
};

export const rawMaterialsCfg: CrudConfig = {
  path: "/raw-materials", singular: "Raw Material", title: "raw materials", module: "m-rm",
  searchPlaceholder: "Search raw materials…",
  note: { i: "◇", t: <><b>Raw Materials</b> are imported items held in stock, linked to a <b>Supplier</b>, with HS code and LARTAS for customs.</> },
  columns: [
    { h: "Code", render: (r) => <span className="mono">{r.code}</span> },
    { h: "Name", render: (r) => <b>{r.name}</b> },
    { h: "Supplier", render: (r) => chip(r.supplier?.name || "—", "g") },
    { h: "Maker", render: (r) => r.maker || "—" },
    { h: "HS code", render: (r) => <span className="mono">{r.hsCode || "—"}</span> },
    { h: "LARTAS", render: (r) => (r.lartas && r.lartas !== "-" ? chip(r.lartas, "o") : chip("none")) },
    { h: "Unit", render: (r) => r.unit?.code || "—" },
  ],
  fields: [
    { k: "code", label: "Code", req: true }, { k: "name", label: "Name", req: true, hint: "must match inventory product name" },
    { k: "supplierId", label: "Supplier (link)", type: "select", req: true, optionsFrom: { path: "/suppliers" } },
    { k: "maker", label: "Maker" }, { k: "hsCode", label: "HS code" }, { k: "lartas", label: "LARTAS", hint: "e.g. SKI BPOM or -" },
    { k: "unitId", label: "Unit", type: "select", optionsFrom: { path: "/units", label: "code" } },
  ],
};

export const finishGoodsCfg: CrudConfig = {
  path: "/finish-goods", singular: "Finish Good", title: "finish goods", module: "m-fg",
  searchPlaceholder: "Search finish goods…",
  note: { i: "◆", t: <><b>Finish Goods</b> are sellable items, each linked to a <b>Customer</b> and to the <b>Raw Material</b> it draws stock from, with a USD price.</> },
  columns: [
    { h: "Code", render: (r) => <span className="mono">{r.code}</span> },
    { h: "Name", render: (r) => <b>{r.name}</b> },
    { h: "Customer", render: (r) => chip(r.customer?.name || "—", "g") },
    { h: "Source (RM)", render: (r) => chip(r.rawMaterial?.name || "—", "purple") },
    { h: "Price", render: (r) => usd(r.priceUsd), num: true },
  ],
  fields: [
    { k: "code", label: "Code", req: true }, { k: "name", label: "Name", req: true },
    { k: "customerId", label: "Customer (link)", type: "select", req: true, optionsFrom: { path: "/customers" } },
    { k: "rawMaterialId", label: "Raw Material (stock source)", type: "select", req: true, optionsFrom: { path: "/raw-materials" } },
    { k: "unitId", label: "Unit", type: "select", optionsFrom: { path: "/units", label: "code" } },
    { k: "priceUsd", label: "Selling price USD", type: "number" },
  ],
  toPayload: (f) => ({ ...f, priceUsd: Number(f.priceUsd) || 0 }),
};

export const inventoryCfg: CrudConfig = {
  path: "/inventory", singular: "Lot", title: "lots", module: "inv",
  searchPlaceholder: "Search product, lot, PO…",
  note: { i: "⏳", t: <><b>Lot & expiry aware.</b> Stock moves automatically on Goods Receipt (in) and Delivery (out), picked first-expiry-first-out. Adjust manually here too.</> },
  columns: [
    { h: "Product", render: (r) => <b>{r.product}</b> },
    { h: "Lot", render: (r) => <span className="mono">{r.lot || "—"}</span> },
    { h: "PO", render: (r) => <span className="mono" style={{ fontSize: 10.5 }}>{r.poNumber || "—"}</span> },
    { h: "Mfg", render: (r) => fmtD(r.mfgDate) },
    { h: "Expiry", render: (r) => fmtD(r.expDate) },
    { h: "Shelf life", num: true, render: (r) => { const d = daysTo(r.expDate); if (d == null) return chip("—"); if (d < 0) return chip("expired", "r"); if (d < 90) return chip(d + "d", "r"); if (d < 180) return chip(d + "d", "a"); return chip(Math.round(d / 30) + " mo", "g"); } },
    { h: "In stock", num: true, render: (r) => r.qtyStock > 0 ? <b>{r.qtyStock} {r.unitCode || ""}</b> : chip("0") },
    { h: "Location", render: (r) => r.location || "—" },
  ],
  fields: [
    { k: "rawMaterialId", label: "Product (Raw Material)", type: "select", req: true, optionsFrom: { path: "/raw-materials" }, full: true },
    { k: "lot", label: "Lot no", req: true },
    { k: "poNumber", label: "PO / ref", type: "select", optionsFrom: { path: "/purchase-orders", value: "poNumber", label: "poNumber" } },
    { k: "mfgDate", label: "Mfg date", type: "date" }, { k: "expDate", label: "Expiry date", type: "date" },
    { k: "qtyStock", label: "Qty in stock", type: "number", req: true },
    { k: "unitCode", label: "Unit", type: "select", optionsFrom: { path: "/units", value: "code", label: "code" } },
    { k: "location", label: "Location" },
  ],
  toPayload: (f) => ({ ...f, qtyStock: Number(f.qtyStock) || 0 }),
};
