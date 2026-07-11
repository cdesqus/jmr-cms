"use client";

import { useEffect, useState } from "react";
import { LOCALE_COOKIE, asLocale, type Locale } from "@/lib/i18n";

function setLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

export function LanguageSwitcher() {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    const cookieLocale = document.cookie
      .split("; ")
      .find((item) => item.startsWith(`${LOCALE_COOKIE}=`))
      ?.split("=")[1];
    const detected = cookieLocale ?? (navigator.language.toLowerCase().startsWith("ro") ? "ro" : "en");
    const safe = asLocale(detected);
    setLocale(safe);
    if (!cookieLocale) setLocaleCookie(safe);
  }, []);

  function choose(next: Locale) {
    setLocale(next);
    setLocaleCookie(next);
    window.location.reload();
  }

  return (
    <div className="flex rounded-full border border-clay bg-white/60 p-0.5 text-xs font-bold text-bark">
      {(["en", "ro"] as Locale[]).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => choose(item)}
          className={[
            "rounded-full px-2.5 py-1 uppercase",
            locale === item ? "bg-terracotta text-cream" : "hover:text-terracotta",
          ].join(" ")}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
