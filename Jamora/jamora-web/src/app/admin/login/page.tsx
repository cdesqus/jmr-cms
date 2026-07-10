export const metadata = {
  title: "Admin Login",
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next?.startsWith("/admin") ? params.next : "/admin";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-5 text-slate-950">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
          Jamora Admin
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-slate-500">
          Masuk ke dashboard operasional toko.
        </p>
        {params.error ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            Email atau password admin salah.
          </div>
        ) : null}
        <form action="/api/admin/login" method="post" className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm font-semibold text-slate-700">
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              placeholder="admin@jamora.local"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-950 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              placeholder="Admin password"
            />
          </label>
          <button className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700">
            Login
          </button>
        </form>
      </section>
    </main>
  );
}
