"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

type Mode = "login" | "register" | "forgot-password" | "reset-password";

const modeContent = {
  login: {
    title: "Welcome back",
    intro: "Sign in to manage your Jamora account.",
    submit: "Sign in",
  },
  register: {
    title: "Create your account",
    intro: "Register to access your Jamora account.",
    submit: "Create account",
  },
  "forgot-password": {
    title: "Reset your password",
    intro: "We will send recovery instructions if an account matches that email.",
    submit: "Send reset instructions",
  },
  "reset-password": {
    title: "Choose a new password",
    intro: "Use at least 10 characters.",
    submit: "Save new password",
  },
} as const;

export function CustomerAuthForm({
  mode,
  token,
}: {
  mode: Mode;
  token?: string;
}) {
  const router = useRouter();
  const content = modeContent[mode];
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setIsError(false);

    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    const passwordConfirmation = String(data.get("passwordConfirmation") ?? "");

    if (
      (mode === "register" || mode === "reset-password") &&
      password !== passwordConfirmation
    ) {
      setPending(false);
      setIsError(true);
      setMessage("Passwords do not match.");
      form.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(
        (input) => {
          input.value = "";
        },
      );
      return;
    }

    const payload: Record<string, string> = {};
    if (mode === "register") payload.name = String(data.get("name") ?? "");
    if (mode !== "reset-password") {
      payload.email = String(data.get("email") ?? "");
    }
    if (mode === "login" || mode === "register" || mode === "reset-password") {
      payload.password = password;
    }
    if (mode === "reset-password") payload.token = token ?? "";

    try {
      const response = await fetch(`/api/jamora/customer/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Unable to continue.");

      if (mode === "login") {
        router.replace("/account");
        router.refresh();
        return;
      }
      setMessage(
        mode === "register"
          ? "Account created. Check your email to verify it before signing in."
          : mode === "forgot-password"
            ? "If an account matches that email, reset instructions are on the way."
            : "Password updated. You can now sign in.",
      );
      if (mode === "reset-password") form.reset();
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Unable to continue.");
    } finally {
      form
        .querySelectorAll<HTMLInputElement>('input[type="password"]')
        .forEach((input) => {
          input.value = "";
        });
      setPending(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-md rounded-xl border border-clay bg-white/70 p-6 shadow-sm sm:p-8">
      <p className="eyebrow text-terracotta">Customer account</p>
      <h1 className="mt-3 font-display text-3xl font-semibold text-ink">
        {content.title}
      </h1>
      <p className="mt-2 text-sm leading-6 text-bark">{content.intro}</p>

      <form className="mt-7 space-y-5" onSubmit={submit}>
        {mode === "register" && (
          <Field label="Name" name="name" autoComplete="name" />
        )}
        {mode !== "reset-password" && (
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
          />
        )}
        {(mode === "login" ||
          mode === "register" ||
          mode === "reset-password") && (
          <Field
            label={mode === "reset-password" ? "New password" : "Password"}
            name="password"
            type="password"
            minLength={mode === "login" ? undefined : 10}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
          />
        )}
        {(mode === "register" || mode === "reset-password") && (
          <Field
            label="Confirm password"
            name="passwordConfirmation"
            type="password"
            minLength={10}
            autoComplete="new-password"
          />
        )}

        <div
          aria-live="polite"
          className={`min-h-6 text-sm ${isError ? "text-red-700" : "text-herb-deep"}`}
        >
          {message}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-terracotta px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-terracotta-deep disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Please wait…" : content.submit}
        </button>
      </form>

      <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm text-bark">
        {mode !== "login" && <Link href="/account/login">Sign in</Link>}
        {mode !== "register" && <Link href="/account/register">Register</Link>}
        {mode === "login" && (
          <Link href="/account/forgot-password">Forgot password?</Link>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  minLength,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete: string;
  minLength?: number;
}) {
  return (
    <label className="block text-sm font-medium text-bark">
      {label}
      <input
        className="mt-2 w-full rounded-lg border border-clay bg-white px-4 py-3 text-ink outline-none transition focus:border-terracotta focus:ring-2 focus:ring-terracotta/20"
        name={name}
        type={type}
        autoComplete={autoComplete}
        minLength={minLength}
        required
      />
    </label>
  );
}

export function CustomerLogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function logout() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/jamora/customer/logout", {
        method: "POST",
      });
      if (!response.ok) throw new Error("Unable to sign out.");
      router.replace("/account/login");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign out.");
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={logout}
        disabled={pending}
        className="rounded-full border border-terracotta px-5 py-2.5 text-sm font-semibold text-terracotta hover:bg-terracotta hover:text-white disabled:opacity-60"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      <p aria-live="polite" className="mt-2 min-h-5 text-sm text-red-700">
        {message}
      </p>
    </div>
  );
}

export function VerifyCustomerEmail({ token }: { token: string }) {
  const started = useRef(false);
  const [message, setMessage] = useState(
    token ? "Verifying your email…" : "This verification link is missing its token.",
  );
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    void fetch("/api/jamora/customer/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!response.ok) throw new Error(body.error || "Unable to verify email.");
        setVerified(true);
        setMessage("Your email is verified. You can now sign in.");
      })
      .catch((error: unknown) => {
        setMessage(
          error instanceof Error ? error.message : "Unable to verify email.",
        );
      });
  }, [token]);

  return (
    <section className="mx-auto max-w-md rounded-xl border border-clay bg-white/70 p-8">
      <p className="eyebrow text-terracotta">Customer account</p>
      <h1 className="mt-3 font-display text-3xl font-semibold">Verify email</h1>
      <p aria-live="polite" className="mt-4 leading-7 text-bark">
        {message}
      </p>
      {verified && (
        <Link
          className="mt-6 inline-block font-semibold text-terracotta"
          href="/account/login"
        >
          Sign in
        </Link>
      )}
    </section>
  );
}
