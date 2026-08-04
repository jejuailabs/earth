// i18next 초기화 (docs/07) — App Router 클라이언트 연동
// SSR 결정성을 위해 초기 언어는 ko 고정, 마운트 후 I18nProvider가 저장값/브라우저 언어로 전환.
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import koCommon from "@/locales/ko/common.json";
import koGame from "@/locales/ko/game.json";
import koAdmin from "@/locales/ko/admin.json";
import koCreate from "@/locales/ko/create.json";
import enCommon from "@/locales/en/common.json";
import enGame from "@/locales/en/game.json";
import enAdmin from "@/locales/en/admin.json";
import enCreate from "@/locales/en/create.json";

export const SUPPORTED_LOCALES = ["ko", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ko";

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      ko: { common: koCommon, game: koGame, admin: koAdmin, create: koCreate },
      en: { common: enCommon, game: enGame, admin: enAdmin, create: enCreate },
    },
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: "common",
    interpolation: { escapeValue: false },
  });
}

export function currentLocale(): Locale {
  return i18n.language === "en" ? "en" : "ko";
}

export default i18n;
