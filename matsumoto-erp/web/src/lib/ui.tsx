import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { api } from "./api";

/* ---------- format helpers ---------- */
export const idr = (n: number | null | undefined) => (n == null ? "—" : "Rp " + Math.round(n).toLocaleString("en-US"));
export const idrS = (n: number | null | undefined) => (n == null ? "—" : "Rp " + Math.round(n / 1000).toLocaleString("en-US") + "k");
export const usd = (n: number | null | undefined) => (n == null || n === ("" as any) ? "—" : "$" + Number(n).toLocaleString("en-US"));
export const today = new Date();
export const daysTo = (d: string | Date | null | undefined) => (d ? Math.round((new Date(d).getTime() - today.getTime()) / 864e5) : null);
export const fmtD = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const x = new Date(d);
  return isNaN(x.getTime()) ? "—" : x.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
};
export const todayISO = () => new Date().toISOString().slice(0, 10);

/* ---------- currencies ---------- */
// amount in its own currency: $1,234.50 · ¥120,000 · Rp 1,234,500
export const money = (n: number | null | undefined, ccy: string) => {
  if (n == null || isNaN(Number(n))) return "—";
  if (ccy === "IDR") return idr(n);
  if (ccy === "JPY") return "¥" + Math.round(n).toLocaleString("en-US");
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
// IDR per unit from the Exchange Rates master, e.g. { USD: 16813, JPY: 112.4, IDR: 1 }
export function useRates() {
  const [rates, setRates] = useState<Record<string, number>>({ IDR: 1 });
  useEffect(() => {
    api.get("/exchange-rates").then((rows: any[]) => setRates({ IDR: 1, ...Object.fromEntries((rows || []).map((r) => [r.code, r.rateIdr])) })).catch(() => {});
  }, []);
  return rates;
}

/* ---------- toast ---------- */
type ToastFn = (msg: string, type?: "ok" | "err") => void;
const ToastCtx = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [t, setT] = useState<{ msg: string; type: string } | null>(null);
  const show = useCallback<ToastFn>((msg, type = "ok") => {
    setT({ msg, type });
    setTimeout(() => setT(null), 2800);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && <div className={"toast " + (t.type === "err" ? "err" : "")}>{t.msg}</div>}
    </ToastCtx.Provider>
  );
}

/* ---------- list hook ---------- */
export function useList<T = any>(path: string) {
  const [data, setData] = useState<T[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    api.get(`${path}${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then((d) => setData(d || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [path, q]);
  useEffect(() => {
    const id = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(id);
  }, [load, q]);
  return { data, q, setQ, loading, reload: load };
}

/* ---------- modal ---------- */
export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"modal" + (wide ? " wide" : "")}>
        <div className="m-head"><h3>{title}</h3><button className="mx" onClick={onClose}>×</button></div>
        <div className="m-body">{children}</div>
        {footer && <div className="m-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- confirm ---------- */
export function useConfirm() {
  const [state, setState] = useState<{ msg: string; cb: () => void } | null>(null);
  const ask = (msg: string, cb: () => void) => setState({ msg, cb });
  const node = state ? (
    <Modal title="Please confirm" onClose={() => setState(null)}
      footer={<>
        <button className="btn btn-sec" onClick={() => setState(null)}>Cancel</button>
        <button className="btn btn-pri" style={{ background: "var(--red)" }} onClick={() => { state.cb(); setState(null); }}>Delete</button>
      </>}>
      <div dangerouslySetInnerHTML={{ __html: state.msg }} />
    </Modal>
  ) : null;
  return { ask, node };
}

/* ---------- small field ---------- */
export function Field({ label, req, hint, children }: { label: string; req?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="fld">
      <label>{label}{req && <span className="req"> *</span>}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="search">
      <span className="si">⌕</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
