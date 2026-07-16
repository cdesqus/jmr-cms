export type AdminRole = "owner" | "warehouse" | "content" | "support";

export interface AdminIdentity {
  email: string;
  role: AdminRole;
  label: string;
}

const baseSession = () => process.env.ADMIN_SESSION_TOKEN ?? "jamora-admin-dev-session";

export function adminAccounts() {
  return [
    { email: process.env.ADMIN_EMAIL ?? "admin@jamora.local", password: process.env.ADMIN_PASSWORD ?? "admin", role: "owner" as const, label: "Store owner" },
    { email: process.env.ADMIN_WAREHOUSE_EMAIL ?? "", password: process.env.ADMIN_WAREHOUSE_PASSWORD ?? "", role: "warehouse" as const, label: "Warehouse" },
    { email: process.env.ADMIN_CONTENT_EMAIL ?? "", password: process.env.ADMIN_CONTENT_PASSWORD ?? "", role: "content" as const, label: "Content editor" },
    { email: process.env.ADMIN_SUPPORT_EMAIL ?? "", password: process.env.ADMIN_SUPPORT_PASSWORD ?? "", role: "support" as const, label: "Customer support" },
  ].filter((account) => account.email && account.password);
}

export function sessionForRole(role: AdminRole) {
  return role === "owner" ? baseSession() : `${baseSession()}:${role}`;
}

export function identityForSession(value?: string): AdminIdentity | null {
  if (!value) return null;
  const account = adminAccounts().find((candidate) => sessionForRole(candidate.role) === value);
  return account ? { email: account.email, role: account.role, label: account.label } : null;
}

export function canAccessAdminPath(role: AdminRole, pathname: string) {
  if (role === "owner" || pathname === "/admin" || pathname.startsWith("/admin/login") || pathname.startsWith("/admin/api/logout")) return true;
  if (role === "warehouse") {
    return ["/admin/orders", "/admin/inventory", "/admin/suppliers", "/admin/purchase-orders", "/admin/api/orders", "/admin/api/inventory-batches", "/admin/api/operations/suppliers", "/admin/api/operations/purchase-orders", "/admin/api/operations/inventory-batches"].some((prefix) => pathname.startsWith(prefix));
  }
  if (role === "content") {
    return ["/admin/products", "/admin/promotions", "/admin/content", "/admin/api/products", "/admin/api/promotions", "/admin/api/content", "/admin/api/upload"].some((prefix) => pathname.startsWith(prefix));
  }
  return ["/admin/orders", "/admin/customers", "/admin/returns", "/admin/api/orders", "/admin/api/returns"].some((prefix) => pathname.startsWith(prefix));
}
