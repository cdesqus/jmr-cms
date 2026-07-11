import { NextResponse } from "next/server";
import { publicUrl } from "@/lib/public-url";

const ADMIN_COOKIE = "jamora_admin_session";

function expectedEmail() {
  return process.env.ADMIN_EMAIL ?? "admin@jamora.local";
}

function expectedPassword() {
  return process.env.ADMIN_PASSWORD ?? "admin";
}

function sessionToken() {
  return process.env.ADMIN_SESSION_TOKEN ?? "jamora-admin-dev-session";
}

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

  if (
    email !== expectedEmail().trim().toLowerCase() ||
    password !== expectedPassword()
  ) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("error", "1");
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(publicUrl(request, `${loginUrl.pathname}${loginUrl.search}`), {
      status: 303,
    });
  }

  const response = NextResponse.redirect(publicUrl(request, next), {
    status: 303,
  });
  response.cookies.set(ADMIN_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
