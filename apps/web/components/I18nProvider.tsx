"use client";

import { useEffect, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import i18n, { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";

export default function I18nProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // 저장된 선택 > 브라우저 언어 > 기본값 (docs/07 §1)
    const saved = localStorage.getItem("locale");
    const target: Locale =
      saved && (SUPPORTED_LOCALES as readonly string[]).includes(saved)
        ? (saved as Locale)
        : navigator.language.toLowerCase().startsWith("ko")
          ? "ko"
          : "en";
    if (target !== i18n.language) i18n.changeLanguage(target);
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
