import { NextResponse } from "next/server";

interface ContactPayload {
  name?: string;
  email?: string;
  topic?: string;
  message?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: ContactPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const message = body.message?.trim() ?? "";

  if (!name || !email || !message) {
    return NextResponse.json(
      { error: "Name, email, and message are required." },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }
  if (message.length > 4000) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
  }

  // TODO (Phase 2): deliver via a transactional email provider (e.g. Resend /
  // Postmark) or persist to the CMS/CRM. For now we log server-side so the
  // submission is observable and the UX is fully wired end-to-end.
  console.info("[contact] new enquiry", {
    name,
    email,
    topic: body.topic ?? "General question",
    length: message.length,
  });

  return NextResponse.json({ ok: true });
}
