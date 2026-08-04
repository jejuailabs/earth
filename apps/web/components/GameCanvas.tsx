"use client";

// 솔로 봇전 게임 화면 — 풀스크린 3D 캔버스 + 플로팅 글래스 HUD
// 데스크톱: 키보드 + 휠 줌 / 모바일: 가상 조이스틱 + 핀치 줌 (TouchControls)

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { GameEngine } from "@/game-engine/engine";
import { Renderer } from "@/game-engine/render";
import { Renderer3D } from "@/game-engine/render3d";
import { GAME_CONFIG as C } from "@/game-engine/config";
import { useAuth } from "@/components/AuthProvider";
import TouchControls from "@/components/TouchControls";
import RoomLeaderboard from "@/components/RoomLeaderboard";
import { authedFetch } from "@/lib/apiClient";
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
  const W = engine.W;
  const H = engine.H;
  const d = data.data;
  for (let i = 0; i < W * H; i++) {
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

  // 격자 비율을 유지한 채 미니맵 사각형 안에 맞춘다 (레터박스)
  const ctx = canvas.getContext("2d")!;
  const S = canvas.width;
  const px = S / Math.max(W, H);
  const dw = W * px;
  const dh = H * px;
  const ox = (S - dw) / 2;
  const oy = (S - dh) / 2;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = "rgba(8,12,24,0.85)";
  ctx.fillRect(ox, oy, dw, dh);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cellCanvas, ox, oy, dw, dh);
  ctx.imageSmoothingEnabled = true;

  // 가중치 존
  for (const z of engine.stage.valueZones) {
    ctx.strokeStyle = "rgba(255,205,60,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ox + (z.x + 0.5) * px, oy + (z.y + 0.5) * px, z.radius * px, 0, Math.PI * 2);
    ctx.stroke();
  }
  // 플레이어 점
  for (const p of engine.players) {
    if (!p.alive) continue;
    const x = ox + (p.cx + 0.5) * px;
    const y = oy + (p.cy + 0.5) * px;
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

// 시점을 회전해도 조작이 화면 기준으로 유지되도록, 입력 방향을 카메라 yaw에
// 가장 가까운 90° 단위로 돌려준다. (x,y) → (y,-x)를 quadrant 횟수만큼 적용.
function screenToWorldDir(d: Vec, renderer: Renderer3D | Renderer | null): Vec {
  if (!(renderer instanceof Renderer3D)) return d;
  let v = d;
  for (let k = renderer.yawQuadrant(); k > 0; k--) v = { x: v.y, y: -v.x };
  return v;
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
  roomId,
  onRestart,
}: {
  stage: StageConfig;
  mode: ControlMode;
  bgUrl?: string;
  roomId?: string;
  onRestart: () => void;
}) {
  const { t } = useTranslation("game");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  // 터치 조작이 접근할 엔진/렌더러 (루프 밖에서도 조작 가능하도록 ref로 보관)
  const engineRef = useRef<GameEngine | null>(null);
  const rendererRef = useRef<Renderer3D | Renderer | null>(null);
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
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 6000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new GameEngine(stage, mode);
    engineRef.current = engine;
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
      window.addEventListener("orientationchange", onResize);
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
    rendererRef.current = renderer;

    // 미니맵 준비 (1px = 1셀 오프스크린 → 확대)
    const miniCell = document.createElement("canvas");
    miniCell.width = engine.W;
    miniCell.height = engine.H;
    const miniCellCtx = miniCell.getContext("2d")!;
    const miniData = miniCellCtx.createImageData(engine.W, engine.H);
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
        const result = engine.result;
        if (u && ud) {
          recordMatch(u.uid, ud, stage, mode, engine, result)
            .then((gains) => setHud((prev) => ({ ...prev, gains })))
            .catch((e) => console.error("매치 기록 실패:", e));
          // 커스텀 방이면 방 랭킹에도 제출 (최고 기록만 유지)
          if (roomId && roomId !== "temp") {
            authedFetch("/api/rooms/scores", {
              method: "POST",
              body: JSON.stringify({
                roomId,
                score: result.score,
                areaPercent: result.areaPercent,
                kills: result.kills,
                cleared: result.outcome === "clear",
              }),
            }).catch((e) => console.error("방 기록 제출 실패:", e));
          }
        }
      }
    };
    raf = requestAnimationFrame(loop);

    const onKey = (e: KeyboardEvent) => {
      const d = KEY_DIRS[e.code];
      if (d) {
        e.preventDefault();
        engine.setHumanDir(screenToWorldDir(d, rendererRef.current));
      } else if (e.code === "Space") {
        e.preventDefault();
        engine.toggleHumanMoving();
      } else if (e.code === "KeyR") {
        const r = rendererRef.current;
        if (r instanceof Renderer3D) r.resetOrbit();
      }
    };
    window.addEventListener("keydown", onKey);

    // 우클릭 드래그로 시점 회전
    let orbiting = false;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) orbiting = true;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!orbiting) return;
      const r = rendererRef.current;
      if (r instanceof Renderer3D) r.orbitBy(e.movementX, e.movementY);
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) orbiting = false;
    };
    const onCtxMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("contextmenu", onCtxMenu);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("contextmenu", onCtxMenu);
      if (onResize) {
        window.removeEventListener("resize", onResize);
        window.removeEventListener("orientationchange", onResize);
      }
      if (onWheel) window.removeEventListener("wheel", onWheel);
      if (renderer instanceof Renderer3D) renderer.dispose(); // WebGL 컨텍스트 누수 방지
      engineRef.current = null;
      rendererRef.current = null;
    };
  }, [stage, mode, bgUrl, roomId]);

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

      {/* 터치 조작 (모바일) — HUD보다 아래 레이어 */}
      {!hud.result && (
        <TouchControls
          mode={mode}
          onDir={(v) => engineRef.current?.setHumanDir(screenToWorldDir(v, rendererRef.current))}
          onMoving={(m) => engineRef.current?.setHumanMoving(m)}
          onPinch={(d) => {
            const r = rendererRef.current;
            if (r instanceof Renderer3D) r.zoomBy(d);
          }}
        />
      )}

      {/* ── 플로팅 HUD (노치/홈바 안전영역 안쪽에 배치) ── */}
      <div
        className="pointer-events-none absolute inset-0 z-20"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        {/* 스테이지 + 목표 진행 — 모바일은 상단 2행째(뒤로가기·타이머·점수 아래) */}
        <div className="absolute left-2 top-14 max-w-[62vw] rounded-xl border border-white/10 bg-black/45 px-3 py-1.5 shadow-xl backdrop-blur-md sm:left-4 sm:top-4 sm:max-w-none sm:min-w-64 sm:rounded-2xl sm:px-5 sm:py-3">
          <p className="truncate text-sm font-bold text-white drop-shadow sm:text-lg">
            {stage.name}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-300 sm:text-sm">
            🗺 <b className="tabular-nums text-white">{hud.areaPct.toFixed(1)}%</b>{" "}
            <span className="hidden text-zinc-400 sm:inline">/ {t("goalPrefix", { goal })}</span>
            <span className="text-zinc-400 sm:hidden">/ {cond.value}%</span>
          </p>
          {progress !== null && (
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10 sm:mt-2 sm:h-1.5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 shadow-[0_0_8px_rgba(56,189,248,0.8)] transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {/* 상단 중앙: 타이머 */}
        <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-xl border border-white/10 bg-black/45 px-4 py-1 shadow-xl backdrop-blur-md sm:top-4 sm:rounded-2xl sm:px-7 sm:py-2.5">
          <p
            className={`font-mono text-xl font-bold tabular-nums drop-shadow sm:text-3xl ${
              hud.timeLeftSec <= 15 ? "animate-pulse text-red-400" : "text-white"
            }`}
          >
            {timeStr}
          </p>
        </div>

        {/* 우상단: 점수/킬 */}
        <div className="absolute right-2 top-2 flex gap-1.5 sm:right-4 sm:top-4 sm:gap-3">
          <div className="rounded-xl border border-white/10 bg-black/45 px-3 py-1 text-center shadow-xl backdrop-blur-md sm:rounded-2xl sm:px-5 sm:py-2.5">
            <p className="text-[9px] uppercase tracking-widest text-zinc-400 sm:text-[10px]">
              SCORE
            </p>
            <p className="font-mono text-sm font-bold tabular-nums text-yellow-300 sm:text-xl">
              {hud.score}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/45 px-3 py-1 text-center shadow-xl backdrop-blur-md sm:rounded-2xl sm:px-5 sm:py-2.5">
            <p className="text-[9px] uppercase tracking-widest text-zinc-400 sm:text-[10px]">KILL</p>
            <p className="font-mono text-sm font-bold tabular-nums text-red-300 sm:text-xl">
              {hud.kills}
            </p>
          </div>
        </div>

        {/* 우하단: 미니맵 */}
        <div className="absolute bottom-2 right-2 rounded-xl border border-white/15 bg-black/55 p-1 shadow-xl backdrop-blur-md sm:bottom-4 sm:right-4 sm:rounded-2xl sm:p-2">
          <canvas
            ref={minimapRef}
            width={200}
            height={200}
            className="block h-24 w-24 rounded-lg sm:h-44 sm:w-44 sm:rounded-xl"
          />
        </div>

        {/* 하단: 조작 안내 (모바일은 처음 몇 초만) */}
        <p className="absolute bottom-3 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-full bg-black/40 px-5 py-1.5 text-xs text-zinc-300 backdrop-blur-md sm:block">
          {mode === "manual" ? t("controlsManual") : t("controlsClassic")} · {t("controlsZoom")} ·{" "}
          {t("controlsOrbit")} · {t("controlsTrail")}
        </p>
        {showHint && (
          /* 미니맵(우하단 96px)을 피해 좌측에 배치 */
          <p className="absolute bottom-3 left-2 right-28 rounded-2xl bg-black/60 px-3 py-2 text-center text-[11px] leading-tight text-zinc-200 backdrop-blur-md sm:hidden">
            {mode === "manual" ? t("touchHintManual") : t("touchHint")}
          </p>
        )}
      </div>

      {/* 부활 대기 오버레이 */}
      {hud.respawnInSec !== null && !hud.result && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 px-6 backdrop-blur-[3px]">
          <div className="text-center text-white">
            <p className="text-4xl font-black drop-shadow-[0_0_25px_rgba(239,68,68,0.7)] sm:text-6xl">
              {t("eliminated")}
            </p>
            <p className="mt-3 text-2xl font-semibold tabular-nums sm:mt-4 sm:text-3xl">
              {t("respawnIn", { sec: hud.respawnInSec })}
            </p>
            <p className="mt-2 text-sm text-zinc-300 sm:text-base">{t("respawnPenalty")}</p>
          </div>
        </div>
      )}

      {/* 결과 오버레이 */}
      {hud.result && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900/80 px-6 py-8 text-center text-white shadow-2xl sm:max-w-lg sm:px-16 sm:py-12">
            <p
              className={`text-4xl font-black tracking-tight sm:text-6xl ${
                hud.result.outcome === "clear"
                  ? "drop-shadow-[0_0_30px_rgba(74,222,128,0.5)]"
                  : "drop-shadow-[0_0_30px_rgba(239,68,68,0.5)]"
              }`}
            >
              {hud.result.outcome === "clear" ? t("clear") : t("fail")}
            </p>
            {hud.result.outcome === "clear" && (
              <p className="mt-3 text-4xl tracking-[0.3em] text-yellow-400 drop-shadow-[0_0_16px_rgba(250,204,21,0.7)] sm:mt-4 sm:text-6xl sm:tracking-[0.35em]">
                {"★".repeat(hud.result.stars)}
                <span className="text-zinc-700">{"★".repeat(3 - hud.result.stars)}</span>
              </p>
            )}
            <div className="mt-4 space-y-1 text-sm text-zinc-300 sm:mt-5 sm:text-base">
              <p>{t("areaPct", { pct: hud.result.areaPercent.toFixed(1) })}</p>
              <p>
                {t("statsLine", {
                  score: hud.result.score,
                  kills: hud.result.kills,
                  deaths: hud.result.deaths,
                })}
              </p>
              {hud.gains ? (
                <p className="pt-1 text-base font-semibold text-emerald-400 sm:text-lg">
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
            {roomId && <RoomLeaderboard roomId={roomId} />}
            <div className="mt-6 flex justify-center gap-3 sm:mt-8 sm:gap-4">
              <button
                onClick={onRestart}
                className="rounded-xl bg-blue-600 px-6 py-3 text-lg font-bold shadow-lg shadow-blue-900/50 transition-transform hover:scale-105 hover:bg-blue-500 sm:px-9 sm:text-xl"
              >
                {t("retry")}
              </button>
              <Link
                href="/"
                className="rounded-xl bg-zinc-700 px-6 py-3 text-lg font-bold transition-transform hover:scale-105 hover:bg-zinc-600 sm:px-9 sm:text-xl"
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
