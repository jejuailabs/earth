"use client";

import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";

export default function LanguageToggle() {
  const { i18n } = useTranslation();
  const change = (l: Locale) => {
    i18n.changeLanguage(l);
    localStorage.setItem("locale", l);
  };
  return (
    <div className="flex items-center gap-1 rounded-full bg-zinc-800 p-0.5 text-xs">
      {SUPPORTED_LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => change(l)}
          className={`rounded-full px-2.5 py-1 uppercase transition-colors ${
            i18n.language === l ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
