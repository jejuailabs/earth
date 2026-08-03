"use client";

// 어드민 셸 — 프론트 라우트 가드 (docs/06 §1)
// 서버단 검증은 각 /api/admin/* 라우트의 verifyAdmin이 담당 (이중 처리)

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/AuthProvider";

const NAV = [
  { href: "/admin", key: "dashboard" },
  { href: "/admin/users", key: "users" },
  { href: "/admin/stages", key: "stages" },
  { href: "/admin/images", key: "images" },
  { href: "/admin/shop", key: "shop" },
  { href: "/admin/logs", key: "logs" },
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation("admin");
  const { userDoc, loading } = useAuth();
  const pathname = usePathname();

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-950 text-zinc-500">…</div>
    );
  }
  if (userDoc?.role !== "admin") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-950 text-zinc-300">
        <p>{t("accessDenied")}</p>
        <Link href="/" className="text-blue-400 hover:underline">
          {t("backToApp")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 bg-zinc-950 text-zinc-100">
      <aside className="flex w-52 shrink-0 flex-col gap-1 border-r border-zinc-800 p-4">
        <h1 className="mb-4 text-lg font-bold">🛠 {t("title")}</h1>
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`rounded-lg px-3 py-2 text-sm transition-colors ${
              pathname === n.href
                ? "bg-zinc-800 font-semibold text-white"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            }`}
          >
            {t(`nav.${n.key}`)}
          </Link>
        ))}
        <div className="mt-auto pt-4">
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
            ← {t("backToApp")}
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto p-6">{children}</main>
    </div>
  );
}
