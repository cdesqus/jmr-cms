import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast, fmtD, todayISO, daysTo } from "../lib/ui";

export const ACTIVITY_TYPES = ["Visit", "Call", "Email", "Sample", "Meeting", "Follow-up"];
const ICON: Record<string, string> = { Visit: "🚗", Call: "☎", Email: "✉", Sample: "🧪", Meeting: "👥", "Follow-up": "↻" };

// Internal sales activity log for a customer or a lead, with a quick "log activity" form.
export default function Activities({ customerId, leadId, onChange }: { customerId?: string; leadId?: string; onChange?: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [f, setF] = useState({ date: todayISO(), type: "Follow-up", note: "", pic: "", nextFollowUp: "" });
  const toast = useToast();
  const qs = leadId ? `leadId=${leadId}` : `customerId=${customerId}`;
  const load = () => api.get(`/crm/activities?${qs}`).then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, [qs]);

  const add = async () => {
    try {
      await api.post("/crm/activities", { ...f, customerId, leadId });
      setF({ ...f, note: "", nextFollowUp: "" });
      toast("Activity logged");
      load(); onChange?.();
    } catch (e: any) { toast(e.message, "err"); }
  };
  const remove = async (id: string) => {
    try { await api.del(`/crm/activities/${id}`); load(); onChange?.(); } catch (e: any) { toast(e.message, "err"); }
  };

  return (
    <div>
      <div className="act-form">
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{ACTIVITY_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        <input value={f.pic} onChange={(e) => setF({ ...f, pic: e.target.value })} placeholder="PIC" style={{ width: 90 }} />
        <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="What happened?" style={{ flex: 1, minWidth: 160 }} onKeyDown={(e) => e.key === "Enter" && add()} />
        <input type="date" value={f.nextFollowUp} onChange={(e) => setF({ ...f, nextFollowUp: e.target.value })} title="Next follow-up" />
        <button className="btn btn-pri btn-sm" onClick={add}>Log</button>
      </div>
      <div className="act-hint">Last date field = next follow-up (optional)</div>
      {rows.length === 0 ? <div className="empty" style={{ padding: 20 }}>No activities yet</div> : (
        <div className="act-list">
          {rows.map((a) => {
            const due = a.nextFollowUp ? daysTo(a.nextFollowUp) : null;
            return (
              <div className="act" key={a.id}>
                <div className="act-ic">{ICON[a.type] || "•"}</div>
                <div className="act-b">
                  <div className="act-h"><b>{a.type}</b> · {fmtD(a.date)}{a.pic ? ` · ${a.pic}` : ""}{!leadId && a.lead ? <span className="ccy"> · #{a.lead.leadNo} {a.lead.product}</span> : null}</div>
                  <div className="act-n">{a.note}</div>
                  {due != null && <div className={"act-due " + (due < 0 ? "late" : "")}>{due < 0 ? `follow-up ${-due}d overdue` : `follow up ${fmtD(a.nextFollowUp)}`}</div>}
                </div>
                <button className="lrm" title="Delete" onClick={() => remove(a.id)}>×</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
