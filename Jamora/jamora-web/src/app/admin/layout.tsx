import { AdminShell } from "@/components/admin-shell";
import { getAdminIdentity } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const identity = await getAdminIdentity();
  return <AdminShell identity={identity}>{children}</AdminShell>;
}
