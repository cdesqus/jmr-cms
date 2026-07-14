import { NextResponse } from "next/server";
import { publicUrl } from "@/lib/public-url";

export async function POST(request: Request) {
  const redirectUrl = publicUrl(request, "/admin/login");
  const response = NextResponse.redirect(redirectUrl, {
    status: 303,
  });
  response.cookies.set("jamora_admin_session", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: redirectUrl.protocol === "https:",
    path: "/",
    maxAge: 0,
  });
  return response;
}
