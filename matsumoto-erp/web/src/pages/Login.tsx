import React, { useState } from "react";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { signIn, branding } = useAuth();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try { await signIn(u, p); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const bg = branding.loginBg ? { backgroundImage: `url(${branding.loginBg})` } : undefined;
  return (
    <div className={"login" + (branding.loginBg ? " has-bg" : "")} style={bg}>
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          {branding.logo ? <img src={branding.logo} alt="" className="login-logo" /> : <div className="mark big">M</div>}
          <div className="login-name">{branding.companyName}</div>
          <div className="login-sub">Sign in to continue</div>
        </div>
        <label>Username<input autoFocus value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" /></label>
        <label>Password<input type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" /></label>
        {err && <div className="login-err">{err}</div>}
        <button className="btn btn-pri" disabled={busy || !u || !p}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
