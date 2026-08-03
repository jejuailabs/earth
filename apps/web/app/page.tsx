"use client";

// 메인 메뉴 — 3D 행성 배경 위의 게임 스타일 랜딩 + 스테이지 카드

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { pickText, STAGE_DEFS } from "@/lib/stages";
import { fetchActiveStageDefs } from "@/lib/stagesRemote";
import { useAuth } from "@/components/AuthProvider";
import LanguageToggle from "@/components/LanguageToggle";
import MenuBackground from "@/components/MenuBackground";
import type { ControlMode, StageDef } from "@/game-engine/types";

const THEME_STYLE = {
  earth: {
    chip: "🌍",
    grad: "from-emerald-500/25 via-sky-600/20 to-blue-800/25",
    ring: "hover:border-emerald-400/70 hover:shadow-emerald-500/25",
  },
  space: {
    chip: "🌌",
    grad: "from-violet-500/25 via-fuchsia-600/15 to-indigo-800/25",
    ring: "hover:border-violet-400/70 hover:shadow-violet-500/25",
  },
} as const;

export default function Home() {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<ControlMode>("classic");
  const [stages, setStages] = useState<StageDef[]>(STAGE_DEFS);
  const { user, userDoc, loading, signIn, signOutUser } = useAuth();

  useEffect(() => {
    fetchActiveStageDefs().then(setStages);
  }, []);

  return (
    <div className="relative flex flex-1 flex-col items-center overflow-x-hidden bg-gradient-to-b from-[#050810] via-[#080d1c] to-[#04060c] px-4 pb-16 text-zinc-100">
      <MenuBackground />

      {/* 상단 바: 언어 + 프로필/로그인 */}
      <div className="z-10 flex w-full max-w-5xl items-center justify-between gap-3 py-5 text-sm">
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
                  className="h-9 w-9 rounded-full border-2 border-blue-400/60 shadow-[0_0_12px_rgba(59,130,246,0.5)]"
                />
              )}
              <span className="font-semibold">{userDoc?.displayName ?? user.displayName}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs backdrop-blur">
                {t("level", { level: userDoc?.level ?? 1 })}
              </span>
              <span className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-2.5 py-0.5 text-xs text-yellow-300 backdrop-blur">
                {t("points", { points: userDoc?.points ?? 0 })}
              </span>
              {userDoc?.role === "admin" && (
                <Link
                  href="/admin"
                  className="rounded-full bg-purple-700/80 px-3 py-1 text-xs font-semibold backdrop-blur hover:bg-purple-600"
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
              className="rounded-full bg-white px-5 py-2 font-bold text-zinc-900 shadow-[0_0_20px_rgba(255,255,255,0.25)] transition-transform hover:scale-105"
            >
              {t("login")}
            </button>
          )}
        </div>
      </div>

      {/* 히어로 */}
      <div className="z-10 mt-10 text-center sm:mt-16">
        <h1 className="bg-gradient-to-br from-white via-sky-200 to-blue-500 bg-clip-text text-6xl font-black tracking-tighter text-transparent drop-shadow-[0_0_35px_rgba(56,189,248,0.35)] sm:text-7xl">
          GAME EARTH
        </h1>
        <p className="mt-4 text-lg text-zinc-300/90 drop-shadow">{t("tagline")}</p>
      </div>

      {/* 조작 모드 토글 */}
      <div className="z-10 mt-10 flex items-center gap-1 rounded-full border border-white/10 bg-black/40 p-1 text-sm shadow-lg backdrop-blur-md">
        {(
          [
            ["classic", t("modeClassic")],
            ["manual", t("modeManual")],
          ] as [ControlMode, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full px-5 py-2 font-semibold transition-all ${
              mode === m
                ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-[0_0_16px_rgba(37,99,235,0.6)]"
                : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 스테이지 카드 */}
      <div className="z-10 mt-12 grid w-full max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {stages.map((s) => {
          const th = THEME_STYLE[s.theme];
          return (
            <Link
              key={s.stageId}
              href={`/play?stage=${s.stageId}&mode=${mode}`}
              className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${th.grad} p-6 shadow-xl backdrop-blur-md transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl ${th.ring}`}
            >
              {/* 대형 순번 워터마크 */}
              <span className="pointer-events-none absolute -right-3 -top-7 select-none text-[7rem] font-black leading-none text-white/[0.06] transition-colors group-hover:text-white/[0.12]">
                {String(s.order).padStart(2, "0")}
              </span>

              <div className="relative">
                <div className="flex items-center justify-between">
                  <span className="text-3xl drop-shadow">{th.chip}</span>
                  <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] font-semibold text-zinc-300">
                    {t("botBadge", { tier: s.botTier, count: s.botCount })}
                  </span>
                </div>
                <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-white drop-shadow group-hover:text-sky-200">
                  {pickText(s.name, i18n.language)}
                </h2>
                <p className="mt-2 min-h-10 text-sm leading-relaxed text-zinc-300/90">
                  {pickText(s.description, i18n.language)}
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-zinc-400">
                    {s.clearCondition.type === "areaPercent"
                      ? t("goalArea", { value: s.clearCondition.value, time: s.timeLimitSec })
                      : t("goalSurvive", { value: s.clearCondition.value })}
                  </span>
                  <span className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-1.5 text-sm font-bold text-white opacity-0 shadow-[0_0_14px_rgba(37,99,235,0.7)] transition-opacity duration-300 group-hover:opacity-100">
                    ▶ PLAY
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="z-10 mt-14 text-xs text-zinc-500">{t("mvpNotice")}</p>
    </div>
  );
}
