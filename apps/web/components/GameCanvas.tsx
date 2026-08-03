"use client";

// 솔로 봇전 게임 화면 — 풀스크린 3D 캔버스 + 플로팅 글래스 HUD
// 엔진 구동(고정 틱)은 그대로, 캔버스가 뷰포트를 꽉 채우고 UI는 오버레이로 뜬다.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { GameEngine } from "@/game-engine/engine";
import { Renderer } from "@/game-engine/render";
import { Renderer3D } from "@/game-engine/render3d";
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
  result: GameResult | null;
  gains: MatchGains | null;
}

// 미니맵: 영토(플레이어 색) + 리빌 흔적 + 존 + 플레이어 위치(나 = 흰 링 펄스)
function drawMinimap(
  engine: GameEngine,
  canvas: HTMLCanvasElement | null,
  cellCanvas: HTMLCanvasElement,
  cellCtx: CanvasRenderingContext2D,
  data: ImageData,
  playerRGB: readonly (readonly [number, number, number])[],
  nowMs: number,
) {
  if (!canvas) return;
  const N = engine.N;
  const d = data.data;
  for (let i = 0; i < N * N; i++) {
    const o = i * 4;
    const id = engine.owner[i];
    if (id >= 0) {
      const [r, g, b] = playerRGB[id];
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = 235;
    } else if (engine.revealed[i]) {
      d[o] = 150;
      d[o + 1] = 175;
      d[o + 2] = 230;
      d[o + 3] = 34;
    } else {
      d[o + 3] = 0;
    }
  }
  cellCtx.putImageData(data, 0, 0);

  const ctx = canvas.getContext("2d")!;
  const S = canvas.width;
  const px = S / N;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = "rgba(8,12,24,0.85)";
  ctx.fillRect(0, 0, S, S);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cellCanvas, 0, 0, S, S);
  ctx.imageSmoothingEnabled = true;

  // 가중치 존
  for (const z of engine.stage.valueZones) {
    ctx.strokeStyle = "rgba(255,205,60,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc((z.x + 0.5) * px, (z.y + 0.5) * px, z.radius * px, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 플레이어 점
  for (const p of engine.players) {
    if (!p.alive) continue;
    const x = (p.cx + 0.5) * px;
    const y = (p.cy + 0.5) * px;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x, y, p.kind === "human" ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
    if (p.kind === "human") {
      const pulse = 5.5 + Math.sin(nowMs / 300) * 1.5;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
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
  const minimapRef = useRef<HTMLCanvasElement>(null);
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
    result: null,
    gains: null,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new GameEngine(stage, mode);
    // 3D 렌더러 우선, WebGL 불가 환경에서는 2D 캔버스 폴백
    let renderer: Renderer3D | Renderer;
    let onResize: (() => void) | null = null;
    let onWheel: ((e: WheelEvent) => void) | null = null;
    try {
      renderer = new Renderer3D(canvas, engine, bgUrl);
      const r3d = renderer;
      onResize = () => r3d.resize(canvas.clientWidth, canvas.clientHeight);
      onResize();
      window.addEventListener("resize", onResize);
      onWheel = (e) => {
        e.preventDefault();
        r3d.zoomBy(e.deltaY);
      };
      window.addEventListener("wheel", onWheel, { passive: false });
    } catch (e) {
      console.warn("WebGL 렌더러 초기화 실패 — 2D 폴백:", e);
      canvas.style.objectFit = "contain"; // 2D는 정사각형 유지
      renderer = new Renderer(canvas, engine, bgUrl);
    }

    // 미니맵 준비 (1px = 1셀 오프스크린 → 확대)
    const miniCell = document.createElement("canvas");
    miniCell.width = engine.N;
    miniCell.height = engine.N;
    const miniCellCtx = miniCell.getContext("2d")!;
    const miniData = miniCellCtx.createImageData(engine.N, engine.N);
    const playerRGB = engine.players.map((p) => {
      const n = parseInt(p.color.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
    });

    const stepMs = 1000 / C.tickRate;
    let last = performance.now();
    let acc = 0;
    let hudAcc = 0;
    let raf = 0;
    let recorded = false;

    const loop = (now: number) => {
      const dt = Math.min(now - last, 250); // 탭 백그라운드 복귀 시 폭주 방지
      last = now;
      acc += dt;
      while (acc >= stepMs) {
        engine.tick(stepMs);
        acc -= stepMs;
      }
      renderer.draw(now);

      hudAcc += dt;
      if (hudAcc >= 120 || engine.result) {
        hudAcc = 0;
        drawMinimap(engine, minimapRef.current, miniCell, miniCellCtx, miniData, playerRGB, now);
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
        renderer.draw(now);
        // 매치 결과 기록 (docs/03 §4) — 로그인 시에만
        const { user: u, userDoc: ud } = authRef.current;
        if (u && ud) {
          recordMatch(u.uid, ud, stage, mode, engine, engine.result)
            .then((gains) => setHud((prev) => ({ ...prev, gains })))
            .catch((e) => console.error("매치 기록 실패:", e));
        }
      }
    };
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
      if (onResize) window.removeEventListener("resize", onResize);
      if (onWheel) window.removeEventListener("wheel", onWheel);
      if (renderer instanceof Renderer3D) renderer.dispose(); // WebGL 컨텍스트 누수 방지
    };
  }, [stage, mode, bgUrl]);

  const cond = stage.clearCondition;
  const goal =
    cond.type === "areaPercent"
      ? t("goalAreaShort", { value: cond.value })
      : t("goalSurviveShort", { value: cond.value });
  const progress =
    cond.type === "areaPercent" ? Math.min(100, (hud.areaPct / cond.value) * 100) : null;
  const timeStr = `${Math.floor(hud.timeLeftSec / 60)}:${String(hud.timeLeftSec % 60).padStart(2, "0")}`;

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {/* 풀스크린 캔버스 */}
      <canvas ref={canvasRef} className="block h-full w-full" />

      {/* ── 플로팅 HUD ── */}
      {/* 좌상단: 스테이지 + 목표 진행 */}
      <div className="pointer-events-none absolute left-4 top-4 min-w-64 rounded-2xl border border-white/10 bg-black/45 px-5 py-3 shadow-xl backdrop-blur-md">
        <p className="text-lg font-bold text-white drop-shadow">{stage.name}</p>
        <p className="mt-0.5 text-sm text-zinc-300">
          🗺 <b className="tabular-nums text-white">{hud.areaPct.toFixed(1)}%</b>{" "}
          <span className="text-zinc-400">/ {t("goalPrefix", { goal })}</span>
        </p>
        {progress !== null && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 shadow-[0_0_8px_rgba(56,189,248,0.8)] transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* 상단 중앙: 타이머 */}
      <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-2xl border border-white/10 bg-black/45 px-7 py-2.5 shadow-xl backdrop-blur-md">
        <p
          className={`font-mono text-3xl font-bold tabular-nums drop-shadow ${
            hud.timeLeftSec <= 15 ? "animate-pulse text-red-400" : "text-white"
          }`}
        >
          {timeStr}
        </p>
      </div>

      {/* 우상단: 점수/킬 */}
      <div className="pointer-events-none absolute right-4 top-4 flex gap-3">
        <div className="rounded-2xl border border-white/10 bg-black/45 px-5 py-2.5 text-center shadow-xl backdrop-blur-md">
          <p className="text-[10px] uppercase tracking-widest text-zinc-400">SCORE</p>
          <p className="font-mono text-xl font-bold tabular-nums text-yellow-300">{hud.score}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/45 px-5 py-2.5 text-center shadow-xl backdrop-blur-md">
          <p className="text-[10px] uppercase tracking-widest text-zinc-400">KILL</p>
          <p className="font-mono text-xl font-bold tabular-nums text-red-300">{hud.kills}</p>
        </div>
      </div>

      {/* 우하단: 미니맵 */}
      <div className="pointer-events-none absolute bottom-4 right-4 rounded-2xl border border-white/15 bg-black/55 p-2 shadow-xl backdrop-blur-md">
        <canvas ref={minimapRef} width={200} height={200} className="block h-44 w-44 rounded-xl" />
      </div>

      {/* 하단: 조작 안내 */}
      <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/40 px-5 py-1.5 text-xs text-zinc-300 backdrop-blur-md">
        {mode === "manual" ? t("controlsManual") : t("controlsClassic")} · {t("controlsZoom")} ·{" "}
        {t("controlsTrail")}
      </p>

      {/* 부활 대기 오버레이 */}
      {hud.respawnInSec !== null && !hud.result && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-[3px]">
          <div className="text-center text-white">
            <p className="text-6xl font-black drop-shadow-[0_0_25px_rgba(239,68,68,0.7)]">
              {t("eliminated")}
            </p>
            <p className="mt-4 text-3xl font-semibold tabular-nums">
              {t("respawnIn", { sec: hud.respawnInSec })}
            </p>
            <p className="mt-2 text-zinc-300">{t("respawnPenalty")}</p>
          </div>
        </div>
      )}

      {/* 결과 오버레이 */}
      {hud.result && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-3xl border border-white/10 bg-zinc-900/80 px-16 py-12 text-center text-white shadow-2xl">
            <p
              className={`text-6xl font-black tracking-tight ${
                hud.result.outcome === "clear"
                  ? "drop-shadow-[0_0_30px_rgba(74,222,128,0.5)]"
                  : "drop-shadow-[0_0_30px_rgba(239,68,68,0.5)]"
              }`}
            >
              {hud.result.outcome === "clear" ? t("clear") : t("fail")}
            </p>
            {hud.result.outcome === "clear" && (
              <p className="mt-4 text-6xl tracking-[0.35em] text-yellow-400 drop-shadow-[0_0_16px_rgba(250,204,21,0.7)]">
                {"★".repeat(hud.result.stars)}
                <span className="text-zinc-700">{"★".repeat(3 - hud.result.stars)}</span>
              </p>
            )}
            <div className="mt-5 space-y-1 text-zinc-300">
              <p>{t("areaPct", { pct: hud.result.areaPercent.toFixed(1) })}</p>
              <p>
                {t("statsLine", {
                  score: hud.result.score,
                  kills: hud.result.kills,
                  deaths: hud.result.deaths,
                })}
              </p>
              {hud.gains ? (
                <p className="pt-1 text-lg font-semibold text-emerald-400">
                  {t("gains", { exp: hud.gains.exp, points: hud.gains.points })}
                  {hud.gains.leveledUpTo && (
                    <span className="ml-2 font-bold text-yellow-400">
                      {t("levelUp", { level: hud.gains.leveledUpTo })}
                    </span>
                  )}
                </p>
              ) : (
                !user && <p className="pt-1 text-sm text-zinc-500">{t("loginToSave")}</p>
              )}
            </div>
            <div className="mt-8 flex justify-center gap-4">
              <button
                onClick={onRestart}
                className="rounded-xl bg-blue-600 px-9 py-3 text-xl font-bold shadow-lg shadow-blue-900/50 transition-transform hover:scale-105 hover:bg-blue-500"
              >
                {t("retry")}
              </button>
              <Link
                href="/"
                className="rounded-xl bg-zinc-700 px-9 py-3 text-xl font-bold transition-transform hover:scale-105 hover:bg-zinc-600"
              >
                {t("toMenu")}
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
