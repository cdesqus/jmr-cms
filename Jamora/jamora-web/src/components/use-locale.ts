"use client";

import { useEffect, useState } from "react";
import { LOCALE_COOKIE, asLocale, type Locale } from "@/lib/i18n";

export function getBrowserLocale(): Locale {
  const cookieLocale = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${LOCALE_COOKIE}=`))
    ?.split("=")[1];

  return asLocale(
    cookieLocale ?? (navigator.language.toLowerCase().startsWith("ro") ? "ro" : "en"),
  );
}

export function useLocale() {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    setLocale(getBrowserLocale());
  }, []);

  return locale;
}
