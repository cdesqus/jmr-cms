"use client";

import { useEffect, useState } from "react";
import { LOCALE_COOKIE, asLocale, type Locale } from "@/lib/i18n";

function setLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

export function LanguageSwitcher({ className = "" }: { className?: string }) {
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
    <div
      className={`flex rounded-full border border-clay/70 bg-white/75 p-px text-[9px] font-black text-bark shadow-sm backdrop-blur ${className}`}
      aria-label="Language selector"
    >
      {(["en", "ro"] as Locale[]).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => choose(item)}
          className={[
            "rounded-full px-1.5 py-0 uppercase leading-4 transition-colors",
            locale === item ? "bg-terracotta text-cream" : "text-bark/65 hover:text-terracotta",
          ].join(" ")}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
