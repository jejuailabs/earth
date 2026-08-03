"use client";

// 상점 아이템 관리 (docs/06 §2-4) — 상점 시스템(10단계) 구현 시 함께 추가
import { useTranslation } from "react-i18next";

export default function AdminShop() {
  const { t } = useTranslation("admin");
  return <p className="text-zinc-500">{t("shop.wip")}</p>;
}
