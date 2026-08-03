"use client";

// 이미지 검수 (docs/06 §2-3) — GPT Image 파이프라인(docs/08, 9단계) 연동 시 구현
import { useTranslation } from "react-i18next";

export default function AdminImages() {
  const { t } = useTranslation("admin");
  return <p className="text-zinc-500">{t("images.wip")}</p>;
}
