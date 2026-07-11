"use client";

export function AdminLogoutButton() {
  return (
    <form action="/admin/api/logout" method="post">
      <button className="w-full rounded-lg border border-slate-200 px-3 py-2 text-center text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700">
        Logout
      </button>
    </form>
  );
}
