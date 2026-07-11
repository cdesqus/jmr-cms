import { NextResponse } from "next/server";
import { publicUrl } from "@/lib/public-url";

export async function POST(request: Request) {
  const response = NextResponse.redirect(publicUrl(request, "/admin/login"), {
    status: 303,
  });
  response.cookies.set("jamora_admin_session", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
