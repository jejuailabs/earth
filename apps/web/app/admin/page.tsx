"use client";

// 어드민 대시보드 — 요약 통계 (docs/06 §3)

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminFetch } from "@/lib/adminApi";

interface Summary {
  users: number;
  matches: number;
  stages: number;
  pendingImages: number;
}

export default function AdminDashboard() {
  const { t } = useTranslation("admin");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<Summary>("/api/admin/summary").then(setSummary).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-400">{t("error", { message: error })}</p>;

  const cards = [
    ["users", summary?.users],
    ["matches", summary?.matches],
    ["stages", summary?.stages],
    ["pendingImages", summary?.pendingImages],
  ] as const;

  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      {cards.map(([key, value]) => (
        <div key={key} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <p className="text-sm text-zinc-400">{t(`dashboard.${key}`)}</p>
          <p className="mt-1 text-3xl font-bold">{value ?? "…"}</p>
        </div>
      ))}
    </div>
  );
}
