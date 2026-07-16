import { NextResponse } from "next/server";
import { publicUrl } from "@/lib/public-url";
import { adminAccounts, sessionForRole } from "@/lib/admin-auth";

const ADMIN_COOKIE = "jamora_admin_session";

function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "/admin";
  return next.startsWith("/admin") && !next.startsWith("/admin/login")
    ? next
    : "/admin";
}

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));

  const account = adminAccounts().find((candidate) =>
    candidate.email.trim().toLowerCase() === email && candidate.password === password,
  );
  if (!account) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("error", "1");
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(publicUrl(request, `${loginUrl.pathname}${loginUrl.search}`), {
      status: 303,
    });
  }

  const redirectUrl = publicUrl(request, next);
  const response = NextResponse.redirect(redirectUrl, {
    status: 303,
  });
  response.cookies.set(ADMIN_COOKIE, sessionForRole(account.role), {
    httpOnly: true,
    sameSite: "lax",
    secure: redirectUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
