import React, { useState, useRef } from "react";
import { api, pdfUrl } from "../lib/api";
import { Modal, Field, useToast, todayISO } from "../lib/ui";

// Opened from the Goods Receipts screen: find the PO (QR scan / PO no / DN), then post the GR.
export default function ReceiveModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [key, setKey] = useState("");
  const [po, setPo] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [dn, setDn] = useState("");
  const [by, setBy] = useState("");
  const [grDate, setGrDate] = useState(todayISO());
  const [scanOpen, setScanOpen] = useState(false);
  const [done, setDone] = useState<any>(null);
  const toast = useToast();

  const lookup = async (k?: string) => {
    const query = (k ?? key).trim();
    if (!query) return toast("Enter a PO number, DN, or scan the QR", "err");
    try {
      const found = await api.get(`/purchase-orders/lookup/${encodeURIComponent(query)}`);
      setPo(found);
      setLines((found.lines || []).map((l: any) => ({
        poLineId: l.id, rawMaterialId: l.rawMaterialId, product: l.description,
        lot: "", mfgDate: "", expDate: "", qty: l.qty, unitCode: l.rawMaterial?.unit?.code || "", location: "YUSEN",
      })));
      setDone(null);
      toast(`PO ${found.poNumber} loaded`);
    } catch (e: any) { toast(e.message || "PO not found", "err"); setPo(null); }
  };

  const setLine = (i: number, k: string, v: any) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const receive = async () => {
    const clean = lines.filter((l) => Number(l.qty) > 0);
    if (!clean.length) return toast("Nothing to receive", "err");
    try {
      const gr = await api.post("/goods-receipts", { poId: po.id, dnNumber: dn, receivedBy: by, grDate, lines: clean });
      setDone(gr); setPo(null); setLines([]); setDn(""); setKey("");
      toast(`Goods Receipt ${gr.grNumber} created — stock updated`);
      onSaved();
    } catch (e: any) { toast(e.message, "err"); }
  };

  return (
    <Modal title="Receive goods — scan QR or enter PO / DN" onClose={onClose} wide>
      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>1 · Find the Purchase Order</h3><div className="psub">by QR scan, PO number, or DN</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input style={{ flex: 1, minWidth: 220, padding: "9px 11px", border: "1px solid var(--line)", borderRadius: 8 }}
            value={key} onChange={(e) => setKey(e.target.value)} placeholder="Scan QR or enter PO number…" onKeyDown={(e) => e.key === "Enter" && lookup()} />
          <button className="btn btn-sec" onClick={() => setScanOpen(!scanOpen)}>{scanOpen ? "Stop scan" : "▣ Scan QR"}</button>
          <button className="btn btn-pri" onClick={() => lookup()}>Find PO</button>
        </div>
        {scanOpen && <Scanner onClose={() => setScanOpen(false)} onScan={(v) => { setScanOpen(false); setKey(v); lookup(v); }} />}
      </div>

      {done && (
        <div className="panel" style={{ marginBottom: 16, borderColor: "#a7f3d0", background: "var(--green-bg)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div><b style={{ color: "var(--green-dk)" }}>✓ Goods Receipt {done.grNumber} posted.</b> <span style={{ color: "var(--muted)" }}>Stock has been increased.</span></div>
            <a className="btn btn-sec btn-sm" href={pdfUrl(`/goods-receipts/${done.id}/pdf`)} target="_blank">⬇ Goods Receipt PDF</a>
          </div>
        </div>
      )}

      {po && (
        <div className="tbl-wrap">
          <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div><h3 style={{ margin: 0, fontSize: 14 }}>2 · Receive against {po.poNumber}</h3><div className="psub" style={{ marginBottom: 0 }}>Supplier: {po.supplier?.name}</div></div>
              <a className="btn btn-sec btn-sm" href={pdfUrl(`/purchase-orders/${po.id}/pdf`)} target="_blank">View PO PDF</a>
            </div>
            <div className="fgrid" style={{ marginTop: 14 }}>
              <Field label="Supplier DN number"><input value={dn} onChange={(e) => setDn(e.target.value)} placeholder="e.g. NEC45227033" /></Field>
              <Field label="GR date"><input type="date" value={grDate} onChange={(e) => setGrDate(e.target.value)} /></Field>
              <Field label="Received by"><input value={by} onChange={(e) => setBy(e.target.value)} /></Field>
            </div>
          </div>
          <div className="scroll"><table className="ltable" style={{ padding: 16 }}>
            <thead><tr><th style={{ padding: "8px 14px" }}>Product</th><th>Lot</th><th>Mfg</th><th>Exp</th><th>Qty</th><th>Unit</th><th>Location</th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td style={{ padding: "6px 14px", fontWeight: 600, color: "var(--ink)" }}>{l.product}</td>
                  <td><input value={l.lot} onChange={(e) => setLine(i, "lot", e.target.value)} placeholder="lot" /></td>
                  <td><input type="date" value={l.mfgDate} onChange={(e) => setLine(i, "mfgDate", e.target.value)} /></td>
                  <td><input type="date" value={l.expDate} onChange={(e) => setLine(i, "expDate", e.target.value)} /></td>
                  <td><input type="number" value={l.qty} onChange={(e) => setLine(i, "qty", e.target.value)} style={{ width: 64 }} /></td>
                  <td><input value={l.unitCode} onChange={(e) => setLine(i, "unitCode", e.target.value)} style={{ width: 60 }} /></td>
                  <td><input value={l.location} onChange={(e) => setLine(i, "location", e.target.value)} style={{ width: 90 }} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <div style={{ padding: "14px 18px", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn-pri" onClick={receive}>⇣ Post Goods Receipt</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Camera scanner shown inline inside the receive modal
function Scanner({ onClose, onScan }: { onClose: () => void; onScan: (v: string) => void }) {
  const ref = useRef<any>(null);
  const toast = useToast();
  React.useEffect(() => {
    let scanner: any;
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        scanner = new Html5Qrcode("qr-reader");
        ref.current = scanner;
        await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 220 },
          (text: string) => { try { const p = JSON.parse(text); onScan(p.no || p.token || text); } catch { onScan(text); } },
          () => {});
      } catch (e: any) { toast("Camera unavailable — type the PO number instead", "err"); onClose(); }
    })();
    return () => { try { ref.current?.stop(); } catch {} };
  }, []);
  return (
    <div style={{ marginTop: 12 }}>
      <div id="qr-reader" />
      <div style={{ textAlign: "center", fontSize: 12, color: "var(--muted)", marginTop: 10 }}>Point the camera at the QR on the Purchase Order.</div>
    </div>
  );
}
