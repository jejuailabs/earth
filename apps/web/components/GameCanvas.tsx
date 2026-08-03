"use client";

// 솔로 봇전 게임 화면 — 엔진 구동(고정 틱) + Canvas 렌더 + HUD

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  onRestart,
}: {
  stage: StageConfig;
  mode: ControlMode;
  onRestart: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { user, userDoc } = useAuth();
  // 게임 루프 클로저에서 최신 로그인 상태를 참조하기 위한 ref
  const authRef = useRef({ user, userDoc });
  authRef.current = { user, userDoc };
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
    const renderer = new Renderer(canvas, engine);
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
  }, [stage, mode]);

  const cond = stage.clearCondition;
  const goal =
    cond.type === "areaPercent" ? `${cond.value}% 점령` : `${cond.value}초 생존`;

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {/* 상단 HUD */}
      <div className="flex flex-wrap items-center justify-between gap-3 w-full max-w-[640px] rounded-lg bg-zinc-800/80 px-4 py-2 text-sm text-zinc-100">
        <span className="font-semibold">{stage.name}</span>
        <span>⏱ {hud.timeLeftSec}s</span>
        <span>
          🗺 {hud.areaPct.toFixed(1)}%{" "}
          <span className="text-zinc-400">/ 목표 {goal}</span>
        </span>
        <span>⭐ {hud.score}</span>
        <span>⚔ {hud.kills}</span>
      </div>

      {/* 게임 캔버스 */}
      <div className="relative w-full max-w-[640px]">
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 [image-rendering:pixelated]"
        />

        {/* 부활 대기 오버레이 */}
        {hud.respawnInSec !== null && !hud.result && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
            <div className="text-center text-white">
              <p className="text-2xl font-bold">탈락!</p>
              <p className="mt-1 text-lg">
                부활까지 <span className="font-mono">{hud.respawnInSec}</span>초
              </p>
              <p className="mt-1 text-sm text-zinc-300">영토의 50%가 몰수됩니다</p>
            </div>
          </div>
        )}

        {/* 결과 오버레이 */}
        {hud.result && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/70">
            <div className="text-center text-white">
              <p className="text-3xl font-bold">
                {hud.result.outcome === "clear" ? "스테이지 클리어!" : "실패..."}
              </p>
              {hud.result.outcome === "clear" && (
                <p className="mt-2 text-3xl tracking-widest text-yellow-400">
                  {"★".repeat(hud.result.stars)}
                  <span className="text-zinc-600">{"★".repeat(3 - hud.result.stars)}</span>
                </p>
              )}
              <div className="mt-3 space-y-0.5 text-sm text-zinc-300">
                <p>점령률 {hud.result.areaPercent.toFixed(1)}%</p>
                <p>
                  점수 {hud.result.score} · 킬 {hud.result.kills} · 데스 {hud.result.deaths}
                </p>
                {hud.gains ? (
                  <p className="pt-1 text-emerald-400">
                    +{hud.gains.exp} EXP · +{hud.gains.points}P
                    {hud.gains.leveledUpTo && (
                      <span className="ml-2 font-bold text-yellow-400">
                        레벨 업! Lv.{hud.gains.leveledUpTo}
                      </span>
                    )}
                  </p>
                ) : (
                  !user && <p className="pt-1 text-zinc-500">로그인하면 기록이 저장됩니다</p>
                )}
              </div>
              <div className="mt-5 flex justify-center gap-3">
                <button
                  onClick={onRestart}
                  className="rounded-lg bg-blue-600 px-5 py-2 font-semibold hover:bg-blue-500"
                >
                  다시하기
                </button>
                <Link
                  href="/"
                  className="rounded-lg bg-zinc-700 px-5 py-2 font-semibold hover:bg-zinc-600"
                >
                  메뉴로
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 조작 안내 */}
      <p className="text-xs text-zinc-400">
        방향키 / WASD 이동
        {mode === "manual" ? " · Space 정지/재개 (manual 모드)" : " · 자동 전진 (classic 모드)"}
        {" · 자기 영역 밖에서 궤적이 잘리면 탈락"}
      </p>
    </div>
  );
}
