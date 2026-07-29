"use client";

import { usePathname } from "next/navigation";
import { CartDrawer } from "@/components/cart-drawer";
import { CartProvider } from "@/components/cart-context";
import { AffiliateTracker } from "@/components/affiliate-tracker";
import { CookieConsent } from "@/components/cookie-consent";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { VisitTracker } from "@/components/visit-tracker";

export function AppChrome({
  children,
  membershipEnabled = false,
  affiliatesEnabled = false,
}: {
  children: React.ReactNode;
  membershipEnabled?: boolean;
  affiliatesEnabled?: boolean;
}) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");
  const isPrintUtility = pathname?.startsWith("/delivery-label");

  if (isAdmin || isPrintUtility) return <>{children}</>;

  return (
    <CartProvider>
      <SiteHeader membershipEnabled={membershipEnabled} />
      <AffiliateTracker enabled={affiliatesEnabled} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <CartDrawer />
      <CookieConsent />
      <VisitTracker />
    </CartProvider>
  );
}
