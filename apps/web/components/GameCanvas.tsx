"use client";

// 솔로 봇전 게임 화면 — 엔진 구동(고정 틱) + Canvas 렌더 + HUD

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { GameEngine } from "@/game-engine/engine";
import { Renderer } from "@/game-engine/render";
import { GAME_CONFIG as C } from "@/game-engine/config";
import { useAuth } from "@/components/AuthProvider";
import { recordMatch, type MatchGains } from "@/lib/matches";
import type { ControlMode, GameResult, StageConfig, Vec } from "@/game-engine/types";

interface Hud {
  timeLeftSec: number;
  areaPct: number;
  score: number;
  kills: number;
  deaths: number;
  respawnInSec: number | null;
  paused: boolean;
  result: GameResult | null;
  gains: MatchGains | null;
}

const KEY_DIRS: Record<string, Vec> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyW: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
};

export default function GameCanvas({
  stage,
  mode,
  bgUrl,
  onRestart,
}: {
  stage: StageConfig;
  mode: ControlMode;
  bgUrl?: string;
  onRestart: () => void;
}) {
  const { t } = useTranslation("game");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { user, userDoc } = useAuth();
  // 게임 루프 클로저에서 최신 로그인 상태를 참조하기 위한 ref
  const authRef = useRef({ user, userDoc });
  useEffect(() => {
    authRef.current = { user, userDoc };
  }, [user, userDoc]);
  const [hud, setHud] = useState<Hud>({
    timeLeftSec: 0,
    areaPct: 0,
    score: 0,
    kills: 0,
    deaths: 0,
    respawnInSec: null,
    paused: false,
    result: null,
    gains: null,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new GameEngine(stage, mode);
    const renderer = new Renderer(canvas, engine, bgUrl);
    const stepMs = 1000 / C.tickRate;
    let last = performance.now();
    let acc = 0;
    let hudAcc = 0;
    let raf = 0;

    const loop = (now: number) => {
      const dt = Math.min(now - last, 250); // 탭 백그라운드 복귀 시 폭주 방지
      last = now;
      acc += dt;
      while (acc >= stepMs) {
        engine.tick(stepMs);
        acc -= stepMs;
      }
      renderer.draw();

      hudAcc += dt;
      if (hudAcc >= 120 || engine.result) {
        hudAcc = 0;
        const h = engine.human;
        setHud((prev) => ({
          ...prev,
          timeLeftSec: Math.max(0, Math.ceil(engine.timeLimitSec - engine.timeMs / 1000)),
          areaPct: engine.humanAreaPercent(),
          score: Math.round(h.score),
          kills: h.kills,
          deaths: h.deaths,
          respawnInSec: h.alive ? null : Math.ceil((h.respawnAt - engine.timeMs) / 1000),
          result: engine.result,
        }));
      }
      if (!engine.result) {
        raf = requestAnimationFrame(loop);
      } else if (!recorded) {
        recorded = true;
        renderer.draw();
        // 매치 결과 기록 (docs/03 §4) — 로그인 시에만
        const { user: u, userDoc: ud } = authRef.current;
        if (u && ud) {
          recordMatch(u.uid, ud, stage, mode, engine, engine.result)
            .then((gains) => setHud((prev) => ({ ...prev, gains })))
            .catch((e) => console.error("매치 기록 실패:", e));
        }
      }
    };
    let recorded = false;
    raf = requestAnimationFrame(loop);

    const onKey = (e: KeyboardEvent) => {
      const d = KEY_DIRS[e.code];
      if (d) {
        e.preventDefault();
        engine.setHumanDir(d);
      } else if (e.code === "Space") {
        e.preventDefault();
        engine.toggleHumanMoving();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, [stage, mode, bgUrl]);

  const cond = stage.clearCondition;
  const goal =
    cond.type === "areaPercent"
      ? t("goalAreaShort", { value: cond.value })
      : t("goalSurviveShort", { value: cond.value });

  // 목표 대비 진행률 (areaPercent 스테이지)
  const progress =
    cond.type === "areaPercent" ? Math.min(100, (hud.areaPct / cond.value) * 100) : null;

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {/* 상단 HUD */}
      <div className="w-full max-w-[1024px] rounded-2xl border border-zinc-800 bg-gradient-to-r from-zinc-900/95 via-zinc-800/90 to-zinc-900/95 px-6 py-3 shadow-lg shadow-black/40 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-zinc-100">
          <span className="text-lg font-bold tracking-tight">{stage.name}</span>
          <span className="font-mono text-xl tabular-nums">
            ⏱ {Math.floor(hud.timeLeftSec / 60)}:{String(hud.timeLeftSec % 60).padStart(2, "0")}
          </span>
          <span className="text-base">
            🗺 <b className="tabular-nums">{hud.areaPct.toFixed(1)}%</b>{" "}
            <span className="text-sm text-zinc-400">/ {t("goalPrefix", { goal })}</span>
          </span>
          <span className="text-base">
            ⭐ <b className="tabular-nums">{hud.score}</b>
          </span>
          <span className="text-base">
            ⚔ <b className="tabular-nums">{hud.kills}</b>
          </span>
        </div>
        {progress !== null && (
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-950/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* 게임 캔버스 */}
      <div className="relative w-full max-w-[1024px]">
        <canvas
          ref={canvasRef}
          className="w-full rounded-2xl border border-zinc-700/70 bg-zinc-950 shadow-2xl shadow-black/60"
        />

        {/* 부활 대기 오버레이 */}
        {hud.respawnInSec !== null && !hud.result && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/55 backdrop-blur-[2px]">
            <div className="text-center text-white">
              <p className="text-4xl font-black drop-shadow-lg">{t("eliminated")}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {t("respawnIn", { sec: hud.respawnInSec })}
              </p>
              <p className="mt-2 text-sm text-zinc-300">{t("respawnPenalty")}</p>
            </div>
          </div>
        )}

        {/* 결과 오버레이 */}
        {hud.result && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/75 backdrop-blur-sm">
            <div className="rounded-3xl border border-zinc-700/60 bg-zinc-900/80 px-12 py-10 text-center text-white shadow-2xl">
              <p className="text-5xl font-black tracking-tight drop-shadow-lg">
                {hud.result.outcome === "clear" ? t("clear") : t("fail")}
              </p>
              {hud.result.outcome === "clear" && (
                <p className="mt-3 text-5xl tracking-[0.3em] text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.6)]">
                  {"★".repeat(hud.result.stars)}
                  <span className="text-zinc-700">{"★".repeat(3 - hud.result.stars)}</span>
                </p>
              )}
              <div className="mt-3 space-y-0.5 text-sm text-zinc-300">
                <p>{t("areaPct", { pct: hud.result.areaPercent.toFixed(1) })}</p>
                <p>
                  {t("statsLine", {
                    score: hud.result.score,
                    kills: hud.result.kills,
                    deaths: hud.result.deaths,
                  })}
                </p>
                {hud.gains ? (
                  <p className="pt-1 text-emerald-400">
                    {t("gains", { exp: hud.gains.exp, points: hud.gains.points })}
                    {hud.gains.leveledUpTo && (
                      <span className="ml-2 font-bold text-yellow-400">
                        {t("levelUp", { level: hud.gains.leveledUpTo })}
                      </span>
                    )}
                  </p>
                ) : (
                  !user && <p className="pt-1 text-zinc-500">{t("loginToSave")}</p>
                )}
              </div>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  onClick={onRestart}
                  className="rounded-xl bg-blue-600 px-7 py-2.5 text-lg font-bold shadow-lg shadow-blue-900/50 transition-transform hover:scale-105 hover:bg-blue-500"
                >
                  {t("retry")}
                </button>
                <Link
                  href="/"
                  className="rounded-xl bg-zinc-700 px-7 py-2.5 text-lg font-bold transition-transform hover:scale-105 hover:bg-zinc-600"
                >
                  {t("toMenu")}
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 조작 안내 */}
      <p className="text-xs text-zinc-400">
        {mode === "manual" ? t("controlsManual") : t("controlsClassic")} · {t("controlsTrail")}
      </p>
    </div>
  );
}
