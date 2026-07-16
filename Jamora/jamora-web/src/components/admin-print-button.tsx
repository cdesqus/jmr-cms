"use client";

export function AdminPrintButton({ label }: { label: string }) {
  return <button type="button" onClick={() => window.print()} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white">{label}</button>;
}
