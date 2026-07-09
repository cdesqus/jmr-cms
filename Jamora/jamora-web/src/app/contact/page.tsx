import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import { SocialLinks } from "@/components/social-links";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Questions about ingredients, orders, or EU wholesale? Get in touch with the Jamora team.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <header className="max-w-2xl">
        <p className="eyebrow text-terracotta">Contact</p>
        <h1 className="mt-3 font-display text-4xl text-ink sm:text-5xl">
          We&rsquo;d love to hear from you.
        </h1>
        <p className="mt-4 text-bark">
          Questions about a botanical, an order, or EU wholesale? Send us a note
          and a real person will reply within two business days.
        </p>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <ContactForm />

        <aside className="h-fit rounded-xl border border-clay/70 bg-sand/30 p-6">
          <h2 className="font-display text-xl text-ink">Reach us directly</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="font-semibold text-ink">Customer care</dt>
              <dd className="text-bark">
                <a href="mailto:care@jamora.eu" className="hover:text-terracotta">
                  care@jamora.eu
                </a>
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Wholesale &amp; retail</dt>
              <dd className="text-bark">
                <a href="mailto:trade@jamora.eu" className="hover:text-terracotta">
                  trade@jamora.eu
                </a>
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">EU fulfilment</dt>
              <dd className="text-bark">
                Bucharest, Romania
                <br />
                Mon–Fri · 09:00–17:00 EET
              </dd>
            </div>
          </dl>

          <div className="mt-6 border-t border-clay/60 pt-5">
            <h3 className="eyebrow text-stone">Follow us</h3>
            <SocialLinks className="mt-3" />
          </div>
        </aside>
      </div>
    </div>
  );
}
