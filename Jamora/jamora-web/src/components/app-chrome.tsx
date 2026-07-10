"use client";

import { usePathname } from "next/navigation";
import { CartDrawer } from "@/components/cart-drawer";
import { CartProvider } from "@/components/cart-context";
import { CookieConsent } from "@/components/cookie-consent";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { VisitTracker } from "@/components/visit-tracker";

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");

  if (isAdmin) return <>{children}</>;

  return (
    <CartProvider>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <CartDrawer />
      <CookieConsent />
      <VisitTracker />
    </CartProvider>
  );
}
