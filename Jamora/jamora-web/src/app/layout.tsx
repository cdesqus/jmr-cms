import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { AppChrome } from "@/components/app-chrome";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Jamora — Indonesian Jamu, Standardised for Europe",
    template: "%s · Jamora",
  },
  description:
    "Premium Indonesian herbal tonics — Energi, Digestie, Echlibru. 100% Made in Indonesia, standardised for Europe. Organic, vegan, EU-compliant.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
