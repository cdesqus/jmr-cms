const BASE = "/api";
const TOKEN_KEY = "mti_token";

// Session token from sign-in, kept in this browser
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t: string | null) => {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch {}
};

async function req(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith("/auth/login")) {
    // session gone: back to the login page
    setToken(null);
    window.dispatchEvent(new Event("mti:signed-out"));
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  get: (p: string) => req(p),
  post: (p: string, body: any) => req(p, { method: "POST", body: JSON.stringify(body) }),
  put: (p: string, body: any) => req(p, { method: "PUT", body: JSON.stringify(body) }),
  patch: (p: string, body: any) => req(p, { method: "PATCH", body: JSON.stringify(body) }),
  del: (p: string) => req(p, { method: "DELETE" }),
};

// PDFs open in a new tab, which can't send the Authorization header — pass the token in the URL
export const pdfUrl = (p: string) => {
  const t = getToken();
  return BASE + p + (t ? `${p.includes("?") ? "&" : "?"}token=${t}` : "");
};
