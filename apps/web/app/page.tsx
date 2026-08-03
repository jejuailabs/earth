"use client";

// 메인 메뉴 — 스테이지 선택(Firestore, 폴백: 내장) + 조작모드 + 로그인 + 언어 전환

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { pickText, STAGE_DEFS } from "@/lib/stages";
import { fetchActiveStageDefs } from "@/lib/stagesRemote";
import { useAuth } from "@/components/AuthProvider";
import LanguageToggle from "@/components/LanguageToggle";
import type { ControlMode, StageDef } from "@/game-engine/types";

export default function Home() {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<ControlMode>("classic");
  const [stages, setStages] = useState<StageDef[]>(STAGE_DEFS);
  const { user, userDoc, loading, signIn, signOutUser } = useAuth();

  useEffect(() => {
    fetchActiveStageDefs().then(setStages);
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-950 px-4 py-10 text-zinc-100">
      {/* 상단 바: 언어 + 프로필/로그인 */}
      <div className="mb-6 flex w-full max-w-3xl items-center justify-between gap-3 text-sm">
        <LanguageToggle />
        <div className="flex items-center gap-3">
          {loading ? (
            <span className="text-zinc-500">…</span>
          ) : user ? (
            <>
              {userDoc?.photoURL && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={userDoc.photoURL}
                  alt=""
                  className="h-8 w-8 rounded-full border border-zinc-700"
                />
              )}
              <span className="font-medium">{userDoc?.displayName ?? user.displayName}</span>
              <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                {t("level", { level: userDoc?.level ?? 1 })}
              </span>
              <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-yellow-400">
                {t("points", { points: userDoc?.points ?? 0 })}
              </span>
              {userDoc?.role === "admin" && (
                <Link
                  href="/admin"
                  className="rounded bg-purple-700 px-2 py-0.5 text-xs font-semibold hover:bg-purple-600"
                >
                  {t("adminPanel")}
                </Link>
              )}
              <button onClick={signOutUser} className="text-zinc-400 hover:text-zinc-200">
                {t("logout")}
              </button>
            </>
          ) : (
            <button
              onClick={() =>
                signIn().catch((e) => alert(t("loginFailed", { message: e.message })))
              }
              className="rounded-lg bg-white px-4 py-2 font-semibold text-zinc-900 hover:bg-zinc-200"
            >
              {t("login")}
            </button>
          )}
        </div>
      </div>

      <h1 className="text-4xl font-bold tracking-tight">🌍 {t("appTitle")}</h1>
      <p className="mt-2 text-zinc-400">{t("tagline")}</p>

      {/* 조작 모드 (docs/04 §2 — manual은 추후 상점 해금, MVP에선 자유 선택) */}
      <div className="mt-8 flex items-center gap-2 rounded-full bg-zinc-800 p-1 text-sm">
        {(
          [
            ["classic", t("modeClassic")],
            ["manual", t("modeManual")],
          ] as [ControlMode, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 transition-colors ${
              mode === m ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 스테이지 목록 */}
      <div className="mt-8 grid w-full max-w-3xl gap-4 sm:grid-cols-2">
        {stages.map((s) => (
          <Link
            key={s.stageId}
            href={`/play?stage=${s.stageId}&mode=${mode}`}
            className="group rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-blue-600"
          >
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold group-hover:text-blue-400">
                {s.order}. {pickText(s.name, i18n.language)}
              </span>
              <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                {t("botBadge", { tier: s.botTier, count: s.botCount })}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-400">{pickText(s.description, i18n.language)}</p>
            <p className="mt-3 text-xs text-zinc-500">
              {s.clearCondition.type === "areaPercent"
                ? t("goalArea", { value: s.clearCondition.value, time: s.timeLimitSec })
                : t("goalSurvive", { value: s.clearCondition.value })}
              {" · "}
              {s.theme === "earth" ? t("themeEarth") : t("themeSpace")}
            </p>
          </Link>
        ))}
      </div>

      <p className="mt-10 text-xs text-zinc-600">{t("mvpNotice")}</p>
    </div>
  );
}
