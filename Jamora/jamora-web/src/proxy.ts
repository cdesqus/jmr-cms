import { NextRequest, NextResponse } from "next/server";
import { publicUrl } from "@/lib/public-url";
import { canAccessAdminPath, identityForSession } from "@/lib/admin-auth";

const ADMIN_COOKIE = "jamora_admin_session";

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
  const identity = identityForSession(session);
  if (identity && canAccessAdminPath(identity.role, pathname)) return NextResponse.next();
  if (identity && isAdminApi) {
    return NextResponse.json({ error: "Your admin role cannot perform this action." }, { status: 403 });
  }
  if (identity) return NextResponse.redirect(publicUrl(request, "/admin"));

  if (isAdminApi) return jsonUnauthorized();

  const loginUrl = publicUrl(request, "/admin/login");
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
