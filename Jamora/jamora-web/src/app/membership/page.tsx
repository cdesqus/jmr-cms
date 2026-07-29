
type Plan = { documentId: string; name: string; durationMonths: number; priceRonMinor: number; packageCredits: number; eligibleProductSlugs: string[] };

async function getPlans(): Promise<Plan[]> {
  const mock: Plan[] = [
    { documentId: "mock-3-month", name: "Ritual Starter", durationMonths: 3, priceRonMinor: 14900, packageCredits: 3, eligibleProductSlugs: ["ritual-package"] },
    { documentId: "mock-6-month", name: "Ritual Regular", durationMonths: 6, priceRonMinor: 27900, packageCredits: 6, eligibleProductSlugs: ["ritual-package"] },
    { documentId: "mock-12-month", name: "Ritual Year", durationMonths: 12, priceRonMinor: 49900, packageCredits: 12, eligibleProductSlugs: ["ritual-package"] },
  ];
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/jamora/membership/public-plans`, { cache: "no-store" });
    if (!response.ok) return mock;
    const plans = ((await response.json()) as { plans?: Plan[] }).plans ?? [];
    return plans.length ? plans : mock;
  } catch { return mock; }
}

export default async function MembershipPage() {
  const plans = await getPlans();
  return <main className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
    <p className="eyebrow text-terracotta">Prepaid membership</p>
    <h1 className="mt-3 max-w-3xl font-display text-5xl font-semibold">Choose a membership that fits your ritual.</h1>
    <p className="mt-5 max-w-2xl text-lg text-stone">Prepay for your chosen period, receive package credits, and redeem them whenever you need during the active membership.</p>
    <div className="mt-10 grid gap-6 md:grid-cols-3">
      {plans.map((plan) => <article key={plan.documentId} className="flex flex-col rounded-2xl border border-clay bg-white p-7 shadow-sm">
        <p className="eyebrow text-terracotta">{plan.durationMonths} months</p>
        <h2 className="mt-3 font-display text-2xl font-semibold">{plan.name}</h2>
        <p className="mt-5 text-3xl font-semibold text-bark">{new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON" }).format(plan.priceRonMinor / 100)}</p>
        <p className="mt-2 text-sm text-stone">{plan.packageCredits} package credits included</p>
        <ul className="mt-6 space-y-3 text-sm text-stone"><li>✓ Redeem eligible packages during the active period</li><li>✓ Membership balance tracked in your account</li><li>✓ Shipping paid at each redemption checkout</li></ul>
        <a href={`/account/register?membershipPlan=${encodeURIComponent(plan.documentId)}`} className="mt-8 rounded-full bg-bark px-5 py-3 text-center text-sm font-semibold text-white">Join this membership</a>
      </article>)}
    </div>
    <section className="mt-14 rounded-2xl bg-sand p-7 text-sm text-stone"><h2 className="font-semibold text-bark">Terms & benefits</h2><p className="mt-3">Credits are valid only during the selected membership period and for eligible packages. Membership payment is made upfront. Credits cannot be exchanged for cash, and shipping remains customer-paid at redemption checkout.</p></section>
  </main>;
}
