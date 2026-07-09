"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "success" | "error";

const TOPICS = ["General question", "My order", "Ingredients & allergens", "Wholesale"];

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Something went wrong.");
      }
      setStatus("success");
      form.reset();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "success") {
    return (
      <div className="flex h-full flex-col justify-center rounded-xl border border-herb/40 bg-herb/5 p-8">
        <h2 className="font-display text-2xl text-ink">Message sent 🌿</h2>
        <p className="mt-2 text-bark">
          Thank you for reaching out. We&rsquo;ll reply within two business days.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-6 w-fit rounded-full border border-clay bg-white/60 px-5 py-2.5 text-sm font-semibold text-bark hover:border-terracotta hover:text-terracotta"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-clay/70 bg-white/40 p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" required>
          <input {...inputProps} name="name" required autoComplete="name" />
        </Field>
        <Field label="Email" required>
          <input {...inputProps} name="email" type="email" required autoComplete="email" />
        </Field>
      </div>

      <Field label="Topic" className="mt-5">
        <select {...inputProps} name="topic" defaultValue={TOPICS[0]}>
          {TOPICS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Message" required className="mt-5">
        <textarea
          {...inputProps}
          name="message"
          required
          rows={5}
          className={`${inputProps.className} resize-y`}
        />
      </Field>

      {status === "error" && (
        <p className="mt-4 rounded-lg bg-terracotta/10 px-3 py-2 text-sm text-terracotta-deep">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="mt-6 inline-flex items-center justify-center rounded-full bg-terracotta px-7 py-3 text-sm font-semibold text-cream transition-colors hover:bg-terracotta-deep disabled:opacity-70"
      >
        {status === "submitting" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}

const inputProps = {
  className:
    "w-full rounded-lg border border-clay bg-cream px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-stone focus:border-terracotta",
};

function Field({
  label,
  required,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-bark">
        {label}
        {required && <span className="text-terracotta"> *</span>}
      </span>
      {children}
    </label>
  );
}
