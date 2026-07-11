import { NextRequest, NextResponse } from "next/server";
import { publicUrl } from "@/lib/public-url";

const ADMIN_COOKIE = "jamora_admin_session";

function expectedSession() {
  return process.env.ADMIN_SESSION_TOKEN ?? "jamora-admin-dev-session";
}

function jsonUnauthorized() {
  return NextResponse.json(
    { error: "Admin login required." },
    { status: 401 },
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/admin/api");
  const isLoginPage = pathname === "/admin/login";
  const isAuthEndpoint =
    pathname === "/admin/api/login" || pathname === "/admin/api/logout";

  if ((!isAdminPage && !isAdminApi) || isLoginPage || isAuthEndpoint) {
    return NextResponse.next();
  }

  const session = request.cookies.get(ADMIN_COOKIE)?.value;
  if (session && session === expectedSession()) return NextResponse.next();

  if (isAdminApi) return jsonUnauthorized();

  const loginUrl = publicUrl(request, "/admin/login");
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
