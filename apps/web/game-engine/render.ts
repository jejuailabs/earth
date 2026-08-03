// Canvas 렌더러 (docs/04 §5 공동 리빌 — 알파 마스크 방식)
// 레이어: 배경이미지 → 안개(미리빌 셀) → 영토 틴트 → 가중치 존 → 궤적 → 플레이어

import { GAME_CONFIG as C } from "./config";
import { NONE, type GameEngine } from "./engine";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement; // 숨겨진 배경이미지 (추후 GPT Image 에셋으로 교체)
  private fogCanvas: HTMLCanvasElement; // 1px = 1셀
  private fogCtx: CanvasRenderingContext2D;
  private fogData: ImageData;
  private terrCanvas: HTMLCanvasElement;
  private terrCtx: CanvasRenderingContext2D;
  private terrData: ImageData;
  private playerRGB: [number, number, number][];

  constructor(
    private canvas: HTMLCanvasElement,
    private engine: GameEngine,
  ) {
    const N = engine.N;
    const px = C.cellPx;
    canvas.width = N * px;
    canvas.height = N * px;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;

    this.bg = makeBackground(engine.stage.theme, N * px);

    this.fogCanvas = document.createElement("canvas");
    this.fogCanvas.width = N;
    this.fogCanvas.height = N;
    this.fogCtx = this.fogCanvas.getContext("2d")!;
    this.fogData = this.fogCtx.createImageData(N, N);

    this.terrCanvas = document.createElement("canvas");
    this.terrCanvas.width = N;
    this.terrCanvas.height = N;
    this.terrCtx = this.terrCanvas.getContext("2d")!;
    this.terrData = this.terrCtx.createImageData(N, N);

    this.playerRGB = engine.players.map((p) => hexToRgb(p.color));
  }

  draw() {
    const { ctx, engine } = this;
    const N = engine.N;
    const px = C.cellPx;
    const W = N * px;

    // 1. 배경이미지 (전체 그리기 — 미리빌 영역은 안개가 덮음)
    ctx.drawImage(this.bg, 0, 0);

    // 2. 안개 (미리빌 셀) — 1px/셀 오프스크린을 확대
    const fog = this.fogData.data;
    const revealed = engine.revealed;
    for (let i = 0; i < N * N; i++) {
      const o = i * 4;
      if (revealed[i]) {
        fog[o + 3] = 0;
      } else {
        fog[o] = 8;
        fog[o + 1] = 12;
        fog[o + 2] = 26;
        fog[o + 3] = 240;
      }
    }
    this.fogCtx.putImageData(this.fogData, 0, 0);
    ctx.drawImage(this.fogCanvas, 0, 0, W, W);

    // 3. 영토 틴트
    const terr = this.terrData.data;
    const owner = engine.owner;
    for (let i = 0; i < N * N; i++) {
      const o = i * 4;
      const id = owner[i];
      if (id === NONE) {
        terr[o + 3] = 0;
      } else {
        const [r, g, b] = this.playerRGB[id];
        terr[o] = r;
        terr[o + 1] = g;
        terr[o + 2] = b;
        terr[o + 3] = 130;
      }
    }
    this.terrCtx.putImageData(this.terrData, 0, 0);
    ctx.drawImage(this.terrCanvas, 0, 0, W, W);

    // 4. 가중치 존 마커
    for (const z of engine.stage.valueZones) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 215, 0, 0.75)";
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc((z.x + 0.5) * px, (z.y + 0.5) * px, z.radius * px, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255, 215, 0, 0.9)";
      ctx.font = `bold ${px * 2}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`x${z.multiplier}`, (z.x + 0.5) * px, (z.y + 0.5) * px + px * 0.7);
      ctx.restore();
    }

    // 5. 궤적
    for (const p of engine.players) {
      if (!p.alive || p.trail.length === 0) continue;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.85;
      for (const i of p.trail) {
        const x = i % N;
        const y = (i / N) | 0;
        ctx.fillRect(x * px, y * px, px, px);
      }
      ctx.globalAlpha = 1;
    }

    // 6. 플레이어 (셀 간 이동 보간)
    for (const p of engine.players) {
      if (!p.alive) continue;
      const fx = (p.cx + p.dir.x * p.progress + 0.5) * px;
      const fy = (p.cy + p.dir.y * p.progress + 0.5) * px;
      const r = px * 0.9;
      ctx.beginPath();
      ctx.arc(fx, fy, r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();

      ctx.font = `bold ${px * 1.8}px sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.strokeText(p.name, fx, fy - r - 3);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(p.name, fx, fy - r - 3);
    }
  }
}

// ── 절차적 배경이미지 ─────────────────────────────────────
// GPT Image 파이프라인(docs/08) 연동 전까지 쓰는 플레이스홀더.
// 실제 연동 시 Firebase Storage 이미지 로드로 교체.

function makeBackground(theme: "earth" | "space", size: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext("2d")!;
  const rand = mulberry32(theme === "earth" ? 12345 : 99999);

  if (theme === "earth") {
    // 바다
    const sea = ctx.createLinearGradient(0, 0, size, size);
    sea.addColorStop(0, "#1e5f8a");
    sea.addColorStop(0.5, "#2678ab");
    sea.addColorStop(1, "#173f66");
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, size, size);
    // 대륙 (블롭)
    for (let c = 0; c < 9; c++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const baseR = size * (0.06 + rand() * 0.1);
      ctx.fillStyle = c % 3 === 0 ? "#5a8f4e" : c % 3 === 1 ? "#6ba05a" : "#8fae66";
      blob(ctx, cx, cy, baseR, rand);
      // 산맥/사막 디테일
      ctx.fillStyle = "rgba(120, 100, 60, 0.5)";
      blob(ctx, cx + baseR * 0.3, cy - baseR * 0.2, baseR * 0.4, rand);
    }
    // 빙하 (상/하단)
    ctx.fillStyle = "rgba(235, 245, 255, 0.9)";
    blob(ctx, size * 0.5, -size * 0.02, size * 0.13, rand);
    blob(ctx, size * 0.5, size * 1.02, size * 0.13, rand);
    // 구름
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (let c = 0; c < 12; c++) {
      blob(ctx, rand() * size, rand() * size, size * (0.02 + rand() * 0.04), rand);
    }
  } else {
    // 우주
    ctx.fillStyle = "#0b0e1f";
    ctx.fillRect(0, 0, size, size);
    // 성운
    for (let c = 0; c < 4; c++) {
      const gx = rand() * size;
      const gy = rand() * size;
      const gr = size * (0.15 + rand() * 0.25);
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      const hue = 220 + rand() * 120;
      g.addColorStop(0, `hsla(${hue}, 70%, 45%, 0.5)`);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    // 별
    for (let s = 0; s < 400; s++) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.7})`;
      const r = rand() < 0.9 ? 1 : 2;
      ctx.fillRect(rand() * size, rand() * size, r, r);
    }
    // 행성
    const px2 = size * 0.7;
    const py2 = size * 0.3;
    const pr = size * 0.09;
    const pg = ctx.createRadialGradient(px2 - pr * 0.3, py2 - pr * 0.3, pr * 0.1, px2, py2, pr);
    pg.addColorStop(0, "#e8a952");
    pg.addColorStop(1, "#7a4a1e");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(px2, py2, pr, 0, Math.PI * 2);
    ctx.fill();
  }
  return cv;
}

function blob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  rand: () => number,
) {
  ctx.beginPath();
  const points = 10;
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    const rr = r * (0.6 + rand() * 0.8);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
