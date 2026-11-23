import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useList, useConfirm, Modal, Field, Search, useToast } from "../lib/ui";
import { useCan } from "../lib/auth";

export interface FieldDef {
  k: string;
  label: string;
  type?: "text" | "number" | "date" | "textarea" | "select";
  req?: boolean;
  hint?: string;
  full?: boolean;
  options?: { value: string; label: string }[];
  optionsFrom?: { path: string; value?: string; label?: string };
}
export interface ColDef {
  h: string;
  render: (r: any) => React.ReactNode;
  num?: boolean;
}
export interface CrudConfig {
  path: string;
  singular: string;
  title: string;
  searchPlaceholder: string;
  columns: ColDef[];
  fields: FieldDef[];
  note?: { i: string; t: React.ReactNode };
  toPayload?: (form: any) => any;
  module: string; // access entry in Settings → Roles & Access
}

export default function CrudPage({ cfg }: { cfg: CrudConfig }) {
  const can = useCan();
  const mod = cfg.module;
  const { data, q, setQ, loading, reload } = useList(cfg.path);
  const [editing, setEditing] = useState<any | null>(null); // row or {} for new
  const [opts, setOpts] = useState<Record<string, { value: string; label: string }[]>>({});
  const toast = useToast();
  const { ask, node } = useConfirm();

  useEffect(() => {
    const need = cfg.fields.filter((f) => f.optionsFrom);
    Promise.all(need.map((f) => api.get(f.optionsFrom!.path).then((rows) => [f.k, rows] as const))).then((pairs) => {
      const m: Record<string, { value: string; label: string }[]> = {};
      pairs.forEach(([k, rows]) => {
        const f = cfg.fields.find((x) => x.k === k)!;
        m[k] = (rows || []).map((r: any) => ({ value: r[f.optionsFrom!.value || "id"], label: r[f.optionsFrom!.label || "name"] }));
      });
      setOpts(m);
    });
  }, [cfg]);

  const save = async (form: any) => {
    const payload = cfg.toPayload ? cfg.toPayload(form) : form;
    try {
      if (form.id) await api.put(`${cfg.path}/${form.id}`, payload);
      else await api.post(cfg.path, payload);
      setEditing(null);
      toast(form.id ? `${cfg.singular} updated` : `${cfg.singular} added`);
      reload();
    } catch (e: any) {
      toast(e.message, "err");
    }
  };
  const remove = (row: any) =>
    ask(`Delete <b>${row.name || row.code || ""}</b>?`, async () => {
      try { await api.del(`${cfg.path}/${row.id}`); toast(`${cfg.singular} deleted`); reload(); }
      catch (e: any) { toast(e.message, "err"); }
    });

  return (
    <>
      {cfg.note && <div className="callout"><span className="ci">{cfg.note.i}</span><div>{cfg.note.t}</div></div>}
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder={cfg.searchPlaceholder} />
        {can(mod, "edit") && <button className="btn btn-pri" onClick={() => setEditing({})}>+ New {cfg.singular}</button>}
      </div>
      <div className="tbl-wrap"><div className="scroll"><table>
        <thead><tr>{cfg.columns.map((c, i) => <th key={i} className={c.num ? "num" : ""}>{c.h}</th>)}<th className="num">Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={cfg.columns.length + 1}><div className="empty">Loading…</div></td></tr>
            : data.length === 0 ? <tr><td colSpan={cfg.columns.length + 1}><div className="empty">No records{q ? " match" : " yet — click + New"}</div></td></tr>
              : data.map((r) => (
                <tr key={r.id}>
                  {cfg.columns.map((c, i) => <td key={i} className={c.num ? "num" : ""}>{c.render(r)}</td>)}
                  <td className="num"><div className="rowact">
                    {can(mod, "edit") && <button className="iact" title="Edit" onClick={() => setEditing(r)}>✎</button>}
                    {can(mod, "full") && <button className="iact del" title="Delete" onClick={() => remove(r)}>🗑</button>}
                  </div></td>
                </tr>
              ))}
        </tbody>
      </table></div></div>
      <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 10 }}>{data.length} {cfg.title.toLowerCase()}</div>

      {editing && <FormModal cfg={cfg} opts={opts} row={editing} onClose={() => setEditing(null)} onSave={save} />}
      {node}
    </>
  );
}

export function FormModal({ cfg, row, opts, onClose, onSave }: { cfg: CrudConfig; row: any; opts: Record<string, any[]>; onClose: () => void; onSave: (f: any) => void }) {
  const [form, setForm] = useState<any>({ ...row });
  const [err, setErr] = useState<Record<string, boolean>>({});
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = () => {
    const e: Record<string, boolean> = {};
    cfg.fields.forEach((f) => { if (f.req && !String(form[f.k] ?? "").trim()) e[f.k] = true; });
    setErr(e);
    if (Object.keys(e).length) return;
    onSave(form);
  };
  return (
    <Modal title={`${row.id ? "Edit" : "New"} ${cfg.singular}`} onClose={onClose}
      footer={<><button className="btn btn-sec" onClick={onClose}>Cancel</button><button className="btn btn-pri" onClick={submit}>Save</button></>}>
      <div className="fgrid">
        {cfg.fields.map((f) => (
          <div key={f.k} className={f.full ? "full" : ""} style={err[f.k] ? { outline: "none" } : undefined}>
            <Field label={f.label} req={f.req} hint={f.hint}>
              {f.type === "select" ? (
                <select value={form[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)} style={err[f.k] ? { borderColor: "var(--red)" } : undefined}>
                  <option value="">— select —</option>
                  {(f.options || opts[f.k] || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === "textarea" ? (
                <textarea value={form[f.k] ?? ""} onChange={(e) => set(f.k, e.target.value)} rows={3} />
              ) : (
                <input type={f.type || "text"} value={form[f.k] ?? ""} onChange={(e) => set(f.k, f.type === "number" ? e.target.value : e.target.value)} style={err[f.k] ? { borderColor: "var(--red)" } : undefined} />
              )}
            </Field>
          </div>
        ))}
      </div>
    </Modal>
  );
}
