import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";

export type Level = "none" | "view" | "edit" | "full";
const RANK: Record<string, number> = { none: 0, view: 1, edit: 2, full: 3 };
export interface Me {
  user: { id: string; username: string; name: string; email: string | null; role: { id: string; name: string; system: boolean; permissions: Record<string, Level> } };
  modules: { key: string; label: string; group: string }[];
  levels: Level[];
}
export interface Branding { companyName: string; logo: string | null; loginBg: string | null }

interface Ctx {
  me: Me | null;
  branding: Branding;
  setBranding: (b: Branding) => void;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  can: (mod: string, level?: Level) => boolean;
}
const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);

// can("so", "edit") → may this user create/change Sales Orders?
export const useCan = () => useAuth().can;

export function AuthProvider({ children, fallback }: { children: (me: Me | null) => React.ReactNode; fallback: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [branding, setBranding] = useState<Branding>({ companyName: "Matsumoto ERP", logo: null, loginBg: null });

  const loadMe = useCallback(async () => {
    if (!getToken()) { setMe(null); return; }
    try { setMe(await api.get("/auth/me")); } catch { setMe(null); }
  }, []);
  useEffect(() => {
    Promise.all([loadMe(), api.get("/public/branding").then(setBranding).catch(() => {})]).finally(() => setReady(true));
    const out = () => setMe(null);
    window.addEventListener("mti:signed-out", out);
    return () => window.removeEventListener("mti:signed-out", out);
  }, [loadMe]);

  const signIn = async (username: string, password: string) => {
    const { token } = await api.post("/auth/login", { username, password });
    setToken(token);
    await loadMe();
  };
  const signOut = async () => {
    try { await api.post("/auth/logout", {}); } catch {}
    setToken(null);
    setMe(null);
  };
  const can = (mod: string, level: Level = "view") => RANK[me?.user.role.permissions[mod] || "none"] >= RANK[level];

  return (
    <AuthCtx.Provider value={{ me, branding, setBranding, signIn, signOut, can }}>
      {ready ? children(me) : fallback}
    </AuthCtx.Provider>
  );
}
