"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PurchaseOrder } from "@/lib/admin-api";
import { createCartonPayload, parseCartonPayload } from "@/lib/receiving.cjs";

type ScanMode = "scanner" | "camera" | "manual";
type ReceiptLine = {
  productDocumentId: string;
  batchNumber: string;
  receivedQuantity: number;
  damagedQuantity: number;
  scannedPayloads: string[];
};

export function AdminPoReceivingModal({ order, onClose, onComplete }: { order: PurchaseOrder; onClose: () => void; onComplete: () => void }) {
  const [mode, setMode] = useState<ScanMode>("scanner");
  const [lines, setLines] = useState<ReceiptLine[]>(() => order.items.map((item) => ({ productDocumentId: item.productDocumentId, batchNumber: item.batchNumber, receivedQuantity: 0, damagedQuantity: 0, scannedPayloads: [] })));
  const [scanValue, setScanValue] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [saving, setSaving] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraSeenRef = useRef(new Set<string>());

  const totalThisReceipt = useMemo(() => lines.reduce((sum, line) => sum + line.receivedQuantity, 0), [lines]);
  const totalDamaged = useMemo(() => lines.reduce((sum, line) => sum + line.damagedQuantity, 0), [lines]);

  const addPayload = useCallback((rawValue: string) => {
    const payload = parseCartonPayload(rawValue);
    if (!payload) { setError("Invalid carton QR. Scan a Jamora carton receiving label."); return; }
    if (payload.poNumber !== order.poNumber) { setError(`This carton belongs to ${payload.poNumber}, not ${order.poNumber}.`); return; }
    const itemIndex = order.items.findIndex((item) => item.productDocumentId === payload.productDocumentId && item.batchNumber.toUpperCase() === payload.batchNumber);
    if (itemIndex < 0) { setError("This carton does not match any product and batch on the PO."); return; }
    const item = order.items[itemIndex];
    if ((item.scannedCartonIds ?? []).includes(payload.cartonId)) { setError(`Carton ${payload.carton} was received previously.`); return; }

    setLines((current) => {
      const duplicate = current.some((line) => line.scannedPayloads.some((value) => parseCartonPayload(value)?.cartonId === payload.cartonId));
      if (duplicate) { setError(`Carton ${payload.carton} is already in this receipt.`); return current; }
      const outstanding = Math.max(0, item.quantity - (item.receivedQuantity ?? 0));
      if (current[itemIndex].receivedQuantity + current[itemIndex].damagedQuantity + payload.quantity > outstanding) {
        setError(`Carton ${payload.carton} exceeds the ${outstanding} outstanding units for ${item.productName}.`);
        return current;
      }
      setError("");
      return current.map((line, index) => index === itemIndex ? { ...line, receivedQuantity: line.receivedQuantity + payload.quantity, scannedPayloads: [...line.scannedPayloads, rawValue.trim()] } : line);
    });
  }, [order]);

  useEffect(() => {
    if (mode !== "scanner") return;
    const timer = window.setTimeout(() => scanInputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [mode, lines]);

  useEffect(() => {
    if (mode !== "camera" || !videoRef.current) return;
    const video = videoRef.current;
    let stopped = false;
    let controls: { stop: () => void } | undefined;
    cameraSeenRef.current.clear();
    setCameraError("");
    import("@zxing/browser").then(async ({ BrowserQRCodeReader }) => {
      try {
        const reader = new BrowserQRCodeReader();
        controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
          if (stopped || !result) return;
          const value = result.getText();
          if (cameraSeenRef.current.has(value)) return;
          cameraSeenRef.current.add(value);
          addPayload(value);
        });
      } catch {
        if (!stopped) setCameraError("Camera is unavailable. Allow camera access or use Scanner / Manual.");
      }
    });
    return () => {
      stopped = true;
      controls?.stop();
      const stream = video.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [mode, addPayload]);

  function updateLine(index: number, field: "receivedQuantity" | "damagedQuantity", value: number) {
    const item = order.items[index];
    const outstanding = Math.max(0, item.quantity - (item.receivedQuantity ?? 0));
    setLines((current) => current.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      const otherQuantity = field === "receivedQuantity" ? line.damagedQuantity : line.receivedQuantity;
      return { ...line, [field]: Math.max(0, Math.min(outstanding - otherQuantity, Math.round(value || 0))) };
    }));
  }

  function simulateNextCarton() {
    const itemIndex = order.items.findIndex((item, index) => {
      const outstanding = Math.max(0, item.quantity - (item.receivedQuantity ?? 0));
      return lines[index].receivedQuantity + lines[index].damagedQuantity < outstanding;
    });
    if (itemIndex < 0) { setError("All outstanding units are already included in this receipt."); return; }
    const item = order.items[itemIndex];
    const remaining = item.quantity - (item.receivedQuantity ?? 0) - lines[itemIndex].receivedQuantity - lines[itemIndex].damagedQuantity;
    const carton = (item.scannedCartonIds?.length ?? 0) + lines[itemIndex].scannedPayloads.length + 1;
    addPayload(createCartonPayload({
      poNumber: order.poNumber,
      productDocumentId: item.productDocumentId,
      batchNumber: item.batchNumber,
      carton,
      quantity: Math.min(Math.max(1, item.unitsPerCarton ?? 24), remaining),
    }));
  }

  async function submit() {
    if (totalThisReceipt === 0 && totalDamaged === 0) { setError("Scan a carton or enter a received quantity first."); return; }
    if (totalDamaged > 0 && !notes.trim()) { setError("Add a discrepancy note for damaged stock."); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/admin/api/operations/purchase-orders/${order.documentId}/receipts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ receivedBy, notes, lines: lines.filter((line) => line.receivedQuantity > 0 || line.damagedQuantity > 0) }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = Array.isArray(json.errors) ? ` ${json.errors.map((item: { message: string }) => item.message).join(" ")}` : "";
        throw new Error(`${json.error ?? "Could not receive stock."}${details}`);
      }
      onComplete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not receive stock.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="receive-title" className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
      <header className="flex shrink-0 items-start justify-between border-b border-slate-200 px-5 py-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">Goods receipt</p><h2 id="receive-title" className="mt-1 text-2xl font-bold">Receive {order.poNumber}</h2><p className="mt-1 text-sm text-slate-500">{order.supplierName}</p></div>
        <button type="button" onClick={onClose} disabled={saving} title="Close" aria-label="Close receiving" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-xl text-slate-500">x</button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          {(["scanner", "camera", "manual"] as ScanMode[]).map((value) => <button key={value} type="button" onClick={() => { setMode(value); setError(""); }} className={`rounded-md px-4 py-2 text-sm font-bold capitalize ${mode === value ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}>{value === "scanner" ? "USB scanner" : value}</button>)}
        </div>

        {mode === "scanner" ? <form className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4" onSubmit={(event) => { event.preventDefault(); addPayload(scanValue); setScanValue(""); }}><label className="text-sm font-bold text-slate-800">Scan carton QR<input ref={scanInputRef} value={scanValue} onChange={(event) => setScanValue(event.target.value)} placeholder="Scanner input stays focused" className="mt-2 w-full rounded-lg border border-blue-200 bg-white px-4 py-3 font-mono outline-none focus:border-blue-500" /></label><div className="mt-3 flex justify-end"><button type="button" onClick={simulateNextCarton} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700">Simulate carton scan</button></div></form> : null}
        {mode === "camera" ? <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-950"><video ref={videoRef} className="mx-auto aspect-video max-h-[320px] w-full object-cover" muted playsInline />{cameraError ? <p className="bg-red-50 p-3 text-sm font-semibold text-red-700">{cameraError}</p> : null}</div> : null}

        <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
          <div className="hidden grid-cols-[minmax(180px,1.5fr)_repeat(5,minmax(80px,0.7fr))] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-[0.08em] text-slate-500 lg:grid"><span>Product / batch</span><span>Ordered</span><span>Previously</span><span>This receipt</span><span>Damaged</span><span>Outstanding</span></div>
          <div className="divide-y divide-slate-100">{order.items.map((item, index) => {
            const prior = item.receivedQuantity ?? 0;
            const outstanding = Math.max(0, item.quantity - prior);
            const after = Math.max(0, outstanding - lines[index].receivedQuantity);
            return <div key={`${item.productDocumentId}-${item.batchNumber}`} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(180px,1.5fr)_repeat(5,minmax(80px,0.7fr))] lg:items-center">
              <div><p className="font-bold text-slate-950">{item.productName}</p><p className="font-mono text-xs text-slate-500">{item.batchNumber} - {item.sku || "No SKU"}</p>{lines[index].scannedPayloads.length > 0 ? <p className="mt-1 text-xs font-semibold text-blue-600">{lines[index].scannedPayloads.length} carton(s) scanned</p> : null}</div>
              <Value label="Ordered" value={item.quantity} />
              <Value label="Previously" value={prior} />
              <QuantityInput label="This receipt" value={lines[index].receivedQuantity} max={Math.max(0, outstanding - lines[index].damagedQuantity)} readOnly={mode !== "manual"} onChange={(value) => updateLine(index, "receivedQuantity", value)} />
              <QuantityInput label="Damaged" value={lines[index].damagedQuantity} max={Math.max(0, outstanding - lines[index].receivedQuantity)} onChange={(value) => updateLine(index, "damagedQuantity", value)} />
              <Value label="Outstanding" value={after} strong={after > 0} />
            </div>;
          })}</div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-bold text-slate-700">Received by<input value={receivedBy} onChange={(event) => setReceivedBy(event.target.value)} placeholder="Warehouse staff name" className={inputClass} /></label>
          <label className="text-sm font-bold text-slate-700">Discrepancy note<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Shortage, damage, or receiving note" rows={2} className={inputClass} /></label>
        </div>
        {error ? <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4"><div className="text-sm text-slate-600"><strong className="text-slate-950">{totalThisReceipt}</strong> accepted{totalDamaged > 0 ? ` - ${totalDamaged} damaged` : ""}</div><div className="flex gap-2"><button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Cancel</button><button type="button" onClick={submit} disabled={saving || (totalThisReceipt === 0 && totalDamaged === 0)} className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{saving ? "Receiving..." : "Confirm receipt"}</button></div></footer>
    </section>
  </div>;
}

function Value({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) { return <div className="flex items-center justify-between lg:block"><span className="text-xs font-semibold uppercase text-slate-400 lg:hidden">{label}</span><span className={`text-sm ${strong ? "font-bold text-amber-700" : "font-semibold text-slate-700"}`}>{value}</span></div>; }
function QuantityInput({ label, value, max, readOnly = false, onChange }: { label: string; value: number; max: number; readOnly?: boolean; onChange: (value: number) => void }) { return <label className="flex items-center justify-between gap-3 text-xs font-semibold uppercase text-slate-400 lg:block lg:text-[0]"><span className="lg:hidden">{label}</span><input type="number" min={0} max={max} value={value} readOnly={readOnly} onChange={(event) => onChange(Number(event.target.value))} className={`w-24 rounded-md border px-2 py-2 text-sm font-bold lg:w-full ${readOnly ? "border-slate-100 bg-slate-50 text-slate-700" : "border-slate-200 bg-white text-slate-950"}`} /></label>; }
const inputClass = "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
