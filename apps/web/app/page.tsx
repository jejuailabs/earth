"use client";

// 메인 메뉴 — 스테이지 선택 + 조작모드 선택 + 로그인

import { useState } from "react";
import Link from "next/link";
import { STAGES } from "@/lib/stages";
import { useAuth } from "@/components/AuthProvider";
import type { ControlMode } from "@/game-engine/types";

export default function Home() {
  const [mode, setMode] = useState<ControlMode>("classic");
  const { user, userDoc, loading, signIn, signOutUser } = useAuth();

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-950 px-4 py-10 text-zinc-100">
      {/* 상단 프로필/로그인 바 */}
      <div className="mb-6 flex w-full max-w-3xl items-center justify-end gap-3 text-sm">
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
              Lv.{userDoc?.level ?? 1}
            </span>
            <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-yellow-400">
              {userDoc?.points ?? 0}P
            </span>
            <button onClick={signOutUser} className="text-zinc-400 hover:text-zinc-200">
              로그아웃
            </button>
          </>
        ) : (
          <button
            onClick={() => signIn().catch((e) => alert(`로그인 실패: ${e.message}`))}
            className="rounded-lg bg-white px-4 py-2 font-semibold text-zinc-900 hover:bg-zinc-200"
          >
            Google로 로그인
          </button>
        )}
      </div>

      <h1 className="text-4xl font-bold tracking-tight">
        🌍 Game Earth
      </h1>
      <p className="mt-2 text-zinc-400">
        영토를 점령해 숨겨진 세계를 함께 드러내는 땅따먹기
      </p>

      {/* 조작 모드 (docs/04 §2 — manual은 추후 상점 해금, MVP에선 자유 선택) */}
      <div className="mt-8 flex items-center gap-2 rounded-full bg-zinc-800 p-1 text-sm">
        {(
          [
            ["classic", "자동전진 (classic)"],
            ["manual", "수동조작 (manual)"],
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
        {STAGES.map((s) => (
          <Link
            key={s.stageId}
            href={`/play?stage=${s.stageId}&mode=${mode}`}
            className="group rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-blue-600"
          >
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold group-hover:text-blue-400">
                {s.order}. {s.name}
              </span>
              <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                봇 Lv.{s.botTier} ×{s.botCount}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-400">{s.description}</p>
            <p className="mt-3 text-xs text-zinc-500">
              {s.clearCondition.type === "areaPercent"
                ? `목표: ${s.clearCondition.value}% 점령 · 제한 ${s.timeLimitSec}초`
                : `목표: ${s.clearCondition.value}초 생존`}
              {" · "}
              {s.theme === "earth" ? "🌍 지구" : "🌌 우주"}
            </p>
          </Link>
        ))}
      </div>

      <p className="mt-10 text-xs text-zinc-600">
        솔로 봇전 MVP — 로그인/멀티플레이/상점은 다음 단계에서 연결됩니다
      </p>
    </div>
  );
}
