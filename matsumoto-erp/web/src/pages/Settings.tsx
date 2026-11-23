import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth, Level } from "../lib/auth";
import { Modal, Field, useToast, useConfirm, fmtD } from "../lib/ui";

const MAX_MB = 2;
// read an uploaded image as a data URL (stored in the database, so no file server is needed)
const readImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type)) return reject(new Error("Use a PNG, JPG, WEBP or SVG image"));
    if (file.size > MAX_MB * 1024 * 1024) return reject(new Error(`Image must be under ${MAX_MB} MB`));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read that file"));
    r.readAsDataURL(file);
  });

/* ---------------- Branding ---------------- */
export function BrandingSettings() {
  const { branding, setBranding, can } = useAuth();
  const [f, setF] = useState(branding);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const editable = can("settings", "edit");
  const pick = (key: "logo" | "loginBg") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try { const url = await readImage(file); setF((x) => ({ ...x, [key]: url })); } catch (err: any) { toast(err.message, "err"); }
  };
  const save = async () => {
    setBusy(true);
    try { const b = await api.put("/settings/branding", f); setBranding(b); setF(b); toast("Branding saved"); }
    catch (e: any) { toast(e.message, "err"); }
    finally { setBusy(false); }
  };
  const changed = JSON.stringify(f) !== JSON.stringify(branding);
  return (
    <>
      <div className="callout"><span className="ci">🎨</span><div><b>Branding.</b> The logo shows in the sidebar, on the login page and on every PDF (PNG or JPG for PDFs). The background image fills the login page.</div></div>
      <div className="brand-grid">
        <div className="panel">
          <h3>Company name</h3><div className="psub">Shown under the logo and on the login page</div>
          <input className="inp" value={f.companyName} disabled={!editable} onChange={(e) => setF({ ...f, companyName: e.target.value })} />
          <h3 style={{ marginTop: 18 }}>Logo</h3><div className="psub">Square or wide, transparent PNG works best · max {MAX_MB} MB</div>
          <div className="up-row">
            <div className="logo-prev">{f.logo ? <img src={f.logo} alt="" /> : <div className="mark big">M</div>}</div>
            {editable && <div className="up-btns">
              <label className="btn btn-sec btn-sm">Upload logo<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={pick("logo")} /></label>
              {f.logo && <button className="btn btn-sec btn-sm" onClick={() => setF({ ...f, logo: null })}>Remove</button>}
            </div>}
          </div>
        </div>
        <div className="panel">
          <h3>Login background</h3><div className="psub">Large landscape photo (e.g. 1920 × 1080) · max {MAX_MB} MB</div>
          <div className="bg-prev" style={f.loginBg ? { backgroundImage: `url(${f.loginBg})` } : undefined}>
            <div className="bg-card">{f.logo ? <img src={f.logo} alt="" /> : <div className="mark">M</div>}<span>{f.companyName}</span></div>
          </div>
          {editable && <div className="up-btns" style={{ marginTop: 10 }}>
            <label className="btn btn-sec btn-sm">Upload background<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick("loginBg")} /></label>
            {f.loginBg && <button className="btn btn-sec btn-sm" onClick={() => setF({ ...f, loginBg: null })}>Use default</button>}
          </div>}
        </div>
      </div>
      {editable && <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
        {changed && <button className="btn btn-sec" onClick={() => setF(branding)}>Discard</button>}
        <button className="btn btn-pri" disabled={!changed || busy} onClick={save}>{busy ? "Saving…" : "Save branding"}</button>
      </div>}
    </>
  );
}

/* ---------------- Users ---------------- */
export function UsersSettings() {
  const { me, can } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const { ask, node } = useConfirm();
  const toast = useToast();
  const load = () => { api.get("/users").then(setRows); api.get("/roles").then(setRoles); };
  useEffect(load, []);
  const toggle = async (u: any) => {
    try { await api.put(`/users/${u.id}`, { active: !u.active }); toast(u.active ? `${u.name} deactivated` : `${u.name} activated`); load(); } catch (e: any) { toast(e.message, "err"); }
  };
  const remove = (u: any) => ask(`Delete user <b>${u.username}</b>?`, async () => {
    try { await api.del(`/users/${u.id}`); toast("User deleted"); load(); } catch (e: any) { toast(e.message, "err"); }
  });
  return (
    <>
      <div className="callout"><span className="ci">👤</span><div><b>Users</b> sign in with a username and password. What each user can see and change comes from their <b>role</b> (Settings → Roles &amp; Access).</div></div>
      <div className="toolbar"><span className="ccy">{rows.length} users · {rows.filter((u) => u.active).length} active</span>{can("settings", "edit") && <button className="btn btn-pri" onClick={() => setEditing({ active: true })}>+ New User</button>}</div>
      <div className="tbl-wrap"><div className="scroll"><table>
        <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th className="num">Actions</th></tr></thead>
        <tbody>{rows.map((u) => (
          <tr key={u.id}>
            <td className="b">{u.name}{u.id === me?.user.id && <span className="ccy"> (you)</span>}</td>
            <td className="mono">{u.username}</td><td>{u.email || "—"}</td>
            <td><span className={"st " + (u.role.system ? "purple" : "b")}>{u.role.name}</span></td>
            <td><span className={"st " + (u.active ? "g" : "gray")}>{u.active ? "Active" : "Inactive"}</span></td>
            <td>{u.lastLogin ? fmtD(u.lastLogin) : "never"}</td>
            <td className="num"><div className="rowact">
              {can("settings", "edit") && <button className="iact" title="Edit / reset password" onClick={() => setEditing(u)}>✎</button>}
              {can("settings", "edit") && u.id !== me?.user.id && <button className="iact" title={u.active ? "Deactivate" : "Activate"} onClick={() => toggle(u)}>{u.active ? "⏸" : "▶"}</button>}
              {can("settings", "full") && u.id !== me?.user.id && <button className="iact del" title="Delete" onClick={() => remove(u)}>🗑</button>}
            </div></td>
          </tr>
        ))}</tbody>
      </table></div></div>
      {editing && <UserModal row={editing} roles={roles} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {node}
    </>
  );
}

function UserModal({ row, roles, onClose, onSaved }: { row: any; roles: any[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>({ username: row.username || "", name: row.name || "", email: row.email || "", roleId: row.roleId || "", password: "" });
  const toast = useToast();
  const save = async () => {
    try {
      const body = { ...f, password: f.password || undefined };
      if (row.id) await api.put(`/users/${row.id}`, body); else await api.post("/users", body);
      toast(row.id ? "User updated" : `User ${f.username} created`); onSaved();
    } catch (e: any) { toast(e.message, "err"); }
  };
  return (
    <Modal title={row.id ? `Edit ${row.username}` : "New user"} onClose={onClose}
      footer={<><button className="btn btn-sec" onClick={onClose}>Cancel</button><button className="btn btn-pri" onClick={save}>Save</button></>}>
      <div className="fgrid">
        <Field label="Username" req hint={row.id ? "can't be changed" : "letters, numbers, . _ -"}><input value={f.username} disabled={!!row.id} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
        <Field label="Full name" req><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email"><input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Role" req><select value={f.roleId} onChange={(e) => setF({ ...f, roleId: e.target.value })}><option value="">— select —</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
        <div className="full"><Field label={row.id ? "New password" : "Password"} req={!row.id} hint={row.id ? "leave blank to keep the current password · at least 8 characters" : "at least 8 characters"}>
          <input type="password" value={f.password} autoComplete="new-password" onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field></div>
      </div>
    </Modal>
  );
}

/* ---------------- Roles & Access ---------------- */
const LEVEL_INFO: Record<Level, { lbl: string; hint: string }> = {
  none: { lbl: "None", hint: "menu hidden" },
  view: { lbl: "View", hint: "see lists, open PDFs" },
  edit: { lbl: "Edit", hint: "create and change" },
  full: { lbl: "Full", hint: "also delete" },
};

export function RolesSettings() {
  const { me, can } = useAuth();
  const [roles, setRoles] = useState<any[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<any | null>(null);
  const { ask, node } = useConfirm();
  const toast = useToast();
  const modules = me?.modules || [];
  const levels = (me?.levels || ["none", "view", "edit", "full"]) as Level[];
  const editable = can("settings", "edit");

  const load = (keep?: string) => api.get("/roles").then((rs: any[]) => {
    setRoles(rs);
    const pickId = keep || sel || rs[0]?.id;
    const r = rs.find((x) => x.id === pickId) || rs[0];
    setSel(r?.id || null);
    setDraft(r ? { ...r, permissions: { ...r.permissions } } : null);
  });
  useEffect(() => { load(); }, []);
  const choose = (r: any) => { setSel(r.id); setDraft({ ...r, permissions: { ...r.permissions } }); };
  const setLevel = (mod: string, l: Level) => setDraft((d: any) => ({ ...d, permissions: { ...d.permissions, [mod]: l } }));
  const setAll = (l: Level) => setDraft((d: any) => ({ ...d, permissions: Object.fromEntries(modules.map((m) => [m.key, l])) }));

  const save = async () => {
    try {
      const saved = draft.id ? await api.put(`/roles/${draft.id}`, draft) : await api.post("/roles", draft);
      toast(`Role ${saved.name} saved`); load(saved.id);
    } catch (e: any) { toast(e.message, "err"); }
  };
  const remove = () => ask(`Delete role <b>${draft.name}</b>?`, async () => {
    try { await api.del(`/roles/${draft.id}`); toast("Role deleted"); setSel(null); load(); } catch (e: any) { toast(e.message, "err"); }
  });
  const newRole = () => { setSel(null); setDraft({ name: "", description: "", permissions: Object.fromEntries(modules.map((m) => [m.key, m.key === "dash" ? "view" : "none"])) }); };
  const locked = !editable || draft?.system;
  const groups = [...new Set(modules.map((m) => m.group))];

  return (
    <>
      <div className="callout"><span className="ci">🔐</span><div><b>Roles &amp; Access.</b> For each menu pick <b>None</b> (hidden), <b>View</b>, <b>Edit</b> (create &amp; change) or <b>Full</b> (also delete). The server enforces it on every request. Changes apply the next time a user's page loads.</div></div>
      <div className="roles">
        <div className="role-list">
          {roles.map((r) => (
            <button key={r.id} className={"role-i" + (sel === r.id ? " on" : "")} onClick={() => choose(r)}>
              <b>{r.name}</b><span className="ccy">{r._count.users} user{r._count.users === 1 ? "" : "s"}{r.system ? " · locked" : ""}</span>
            </button>
          ))}
          {editable && <button className="btn btn-sec btn-sm" style={{ marginTop: 8 }} onClick={newRole}>+ New role</button>}
        </div>
        {draft && (
          <div className="panel role-ed">
            <div className="fgrid">
              <Field label="Role name" req><input value={draft.name} disabled={locked} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
              <Field label="Description"><input value={draft.description || ""} disabled={!editable} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
            </div>
            {draft.system && <div className="act-hint">Administrator always has full access so the system can't be locked out.</div>}
            <table className="perm-t">
              <thead><tr><th>Menu</th>{levels.map((l) => <th key={l} title={LEVEL_INFO[l].hint}>{LEVEL_INFO[l].lbl}<div className="ccy">{LEVEL_INFO[l].hint}</div></th>)}</tr></thead>
              <tbody>
                {!locked && <tr className="perm-all"><td>Set all to…</td>{levels.map((l) => <td key={l}><button className="linkbtn" onClick={() => setAll(l)}>all {LEVEL_INFO[l].lbl}</button></td>)}</tr>}
                {groups.map((g) => (
                  <React.Fragment key={g}>
                    <tr className="perm-g"><td colSpan={levels.length + 1}>{g}</td></tr>
                    {modules.filter((m) => m.group === g).map((m) => (
                      <tr key={m.key}>
                        <td>{m.label}</td>
                        {levels.map((l) => (
                          <td key={l}><input type="radio" name={`p-${m.key}`} checked={(draft.permissions[m.key] || "none") === l} disabled={locked} onChange={() => setLevel(m.key, l)} /></td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            {editable && <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              {draft.id && !draft.system && can("settings", "full") && <button className="btn btn-sec" style={{ color: "var(--red)" }} onClick={remove}>Delete role</button>}
              <button className="btn btn-pri" style={{ marginLeft: "auto" }} disabled={!draft.name} onClick={save}>{draft.id ? "Save role" : "Create role"}</button>
            </div>}
          </div>
        )}
      </div>
      {node}
    </>
  );
}
