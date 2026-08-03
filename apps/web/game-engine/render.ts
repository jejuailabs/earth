// Canvas 렌더러 — 2.5D 스타일 (docs/04 §5 공동 리빌, 알파 마스크 방식)
// 레이어: 배경(승인 이미지 or 절차 생성) → 안개 → 영토 틴트+입체 경계 → 가중치 존(펄스)
//        → 궤적 글로우 → 플레이어(그림자+구체) → 비네트

import { GAME_CONFIG as C } from "./config";
import { NONE, type GameEngine, type PlayerState } from "./engine";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement; // 절차 생성 배경 (이미지 로드 전/실패 시 폴백)
  private bgImage: HTMLImageElement | null = null; // GPT Image 파이프라인 배경 (docs/08)
  private fogCanvas: HTMLCanvasElement;
  private fogCtx: CanvasRenderingContext2D;
  private fogData: ImageData;
  private terrCanvas: HTMLCanvasElement;
  private terrCtx: CanvasRenderingContext2D;
  private terrData: ImageData;
  private vignette: HTMLCanvasElement;
  private playerRGB: [number, number, number][];

  constructor(
    private canvas: HTMLCanvasElement,
    private engine: GameEngine,
    bgUrl?: string,
  ) {
    const N = engine.N;
    const px = C.cellPx;
    canvas.width = N * px;
    canvas.height = N * px;
    this.ctx = canvas.getContext("2d")!;

    this.bg = makeBackground(engine.stage.theme, N * px);
    if (bgUrl) {
      const img = new Image();
      img.onload = () => {
        this.bgImage = img;
      };
      img.src = bgUrl;
    }

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

    this.vignette = makeVignette(N * px);
    this.playerRGB = engine.players.map((p) => hexToRgb(p.color));
  }

  draw(nowMs = performance.now()) {
    const { ctx, engine } = this;
    const N = engine.N;
    const px = C.cellPx;
    const W = N * px;
    ctx.imageSmoothingEnabled = true;

    // 1. 배경
    if (this.bgImage) ctx.drawImage(this.bgImage, 0, 0, W, W);
    else ctx.drawImage(this.bg, 0, 0);

    // 2. 안개 (미리빌 셀) — 셀마다 미세한 명암 변화로 질감 부여
    const fog = this.fogData.data;
    const revealed = engine.revealed;
    for (let i = 0; i < N * N; i++) {
      const o = i * 4;
      if (revealed[i]) {
        fog[o + 3] = 0;
      } else {
        const n = (Math.imul(i, 2654435761) >>> 24) & 15; // 결정적 노이즈
        fog[o] = 6 + (n >> 2);
        fog[o + 1] = 9 + (n >> 2);
        fog[o + 2] = 22 + (n >> 1);
        fog[o + 3] = 244;
      }
    }
    this.fogCtx.putImageData(this.fogData, 0, 0);
    ctx.imageSmoothingEnabled = false;
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
        terr[o + 3] = 110;
      }
    }
    this.terrCtx.putImageData(this.terrData, 0, 0);
    ctx.drawImage(this.terrCanvas, 0, 0, W, W);
    ctx.imageSmoothingEnabled = true;

    // 3-1. 영토 입체 경계 — 상단/좌측 밝게, 하단/우측 어둡게 (돌출 플레이트 느낌)
    this.drawTerritoryEdges();

    // 4. 가중치 존 — 펄스 링 + 골드 글로우
    for (const z of engine.stage.valueZones) {
      const cx = (z.x + 0.5) * px;
      const cy = (z.y + 0.5) * px;
      const pulse = 1 + 0.06 * Math.sin(nowMs / 350);
      const r = z.radius * px * pulse;
      const grad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r);
      grad.addColorStop(0, "rgba(255, 200, 40, 0)");
      grad.addColorStop(1, "rgba(255, 200, 40, 0.16)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.strokeStyle = "rgba(255, 210, 60, 0.9)";
      ctx.shadowColor = "rgba(255, 200, 40, 0.8)";
      ctx.shadowBlur = 10;
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = -nowMs / 40; // 링 회전 애니메이션
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.font = `bold ${px * 2.2}px sans-serif`;
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 6;
      ctx.fillStyle = "rgba(255, 215, 80, 0.95)";
      ctx.fillText(`x${z.multiplier}`, cx, cy + px * 0.8);
      ctx.restore();
    }

    // 5. 궤적 — 글로우 폴리라인
    for (const p of engine.players) {
      if (!p.alive || p.trail.length === 0) continue;
      ctx.save();
      ctx.strokeStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = px * 1.2;
      ctx.lineWidth = px * 0.72;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      for (let k = 0; k < p.trail.length; k++) {
        const i = p.trail[k];
        const x = ((i % N) + 0.5) * px;
        const y = (((i / N) | 0) + 0.5) * px;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      // 머리(현재 위치)까지 이어 그리기
      ctx.lineTo((p.cx + p.dir.x * p.progress + 0.5) * px, (p.cy + p.dir.y * p.progress + 0.5) * px);
      ctx.stroke();
      ctx.restore();
    }

    // 6. 플레이어 — 그림자 + 광택 구체 + 네임플레이트
    for (const p of engine.players) {
      if (!p.alive) continue;
      this.drawPlayer(p, nowMs);
    }

    // 7. 비네트 (화면 가장자리 어둡게 — 깊이감)
    ctx.drawImage(this.vignette, 0, 0);
  }

  private drawTerritoryEdges() {
    const { ctx, engine } = this;
    const N = engine.N;
    const px = C.cellPx;
    const owner = engine.owner;

    ctx.lineWidth = 2;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const id = owner[y * N + x];
        if (id === NONE) continue;
        const [r, g, b] = this.playerRGB[id];
        const X = x * px;
        const Y = y * px;
        // 상단 경계 → 하이라이트
        if (y === 0 || owner[(y - 1) * N + x] !== id) {
          ctx.strokeStyle = `rgba(${Math.min(255, r + 90)}, ${Math.min(255, g + 90)}, ${Math.min(255, b + 90)}, 0.9)`;
          ctx.beginPath();
          ctx.moveTo(X, Y + 1);
          ctx.lineTo(X + px, Y + 1);
          ctx.stroke();
        }
        // 하단 경계 → 섀도
        if (y === N - 1 || owner[(y + 1) * N + x] !== id) {
          ctx.strokeStyle = `rgba(${r >> 2}, ${g >> 2}, ${b >> 2}, 0.85)`;
          ctx.beginPath();
          ctx.moveTo(X, Y + px - 1);
          ctx.lineTo(X + px, Y + px - 1);
          ctx.stroke();
        }
        // 좌측 경계
        if (x === 0 || owner[y * N + x - 1] !== id) {
          ctx.strokeStyle = `rgba(${Math.min(255, r + 60)}, ${Math.min(255, g + 60)}, ${Math.min(255, b + 60)}, 0.7)`;
          ctx.beginPath();
          ctx.moveTo(X + 1, Y);
          ctx.lineTo(X + 1, Y + px);
          ctx.stroke();
        }
        // 우측 경계
        if (x === N - 1 || owner[y * N + x + 1] !== id) {
          ctx.strokeStyle = `rgba(${r >> 2}, ${g >> 2}, ${b >> 2}, 0.7)`;
          ctx.beginPath();
          ctx.moveTo(X + px - 1, Y);
          ctx.lineTo(X + px - 1, Y + px);
          ctx.stroke();
        }
      }
    }
  }

  private drawPlayer(p: PlayerState, nowMs: number) {
    const { ctx } = this;
    const px = C.cellPx;
    const fx = (p.cx + p.dir.x * p.progress + 0.5) * px;
    const fy = (p.cy + p.dir.y * p.progress + 0.5) * px;
    const r = px * 1.05;
    const bob = Math.sin(nowMs / 250 + p.id) * px * 0.06; // 미세한 부유감

    // 바닥 그림자
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(fx, fy + r * 0.75, r * 0.85, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 구체 (radial gradient — 좌상단 광원)
    const grad = ctx.createRadialGradient(
      fx - r * 0.35,
      fy - r * 0.45 + bob,
      r * 0.15,
      fx,
      fy + bob,
      r,
    );
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.25, lighten(p.color, 60));
    grad.addColorStop(0.7, p.color);
    grad.addColorStop(1, darken(p.color, 70));
    ctx.save();
    ctx.shadowColor = p.color;
    ctx.shadowBlur = px * 0.9;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fx, fy + bob, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 외곽 링
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(fx, fy + bob, r, 0, Math.PI * 2);
    ctx.stroke();

    // 진행 방향 표시
    if (p.dir.x !== 0 || p.dir.y !== 0) {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      const ax = fx + p.dir.x * r * 0.55;
      const ay = fy + bob + p.dir.y * r * 0.55;
      ctx.arc(ax, ay, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 네임플레이트
    ctx.save();
    ctx.font = `600 ${px * 1.5}px sans-serif`;
    ctx.textAlign = "center";
    const label = p.name;
    const tw = ctx.measureText(label).width;
    const plateY = fy + bob - r - px * 1.9;
    ctx.fillStyle = "rgba(8, 10, 20, 0.65)";
    roundRect(ctx, fx - tw / 2 - px * 0.7, plateY - px * 1.2, tw + px * 1.4, px * 2, px * 0.8);
    ctx.fill();
    ctx.fillStyle = p.kind === "human" ? "#ffffff" : "rgba(230,230,240,0.92)";
    ctx.fillText(label, fx, plateY + px * 0.35);
    ctx.restore();
  }
}

// ── 헬퍼 ─────────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeVignette(size: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.45,
    size / 2,
    size / 2,
    size * 0.75,
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return cv;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lighten(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.min(255, r + amt)}, ${Math.min(255, g + amt)}, ${Math.min(255, b + amt)})`;
}

function darken(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.max(0, r - amt)}, ${Math.max(0, g - amt)}, ${Math.max(0, b - amt)})`;
}

// ── 절차적 배경 (승인 이미지 없을 때의 폴백) ─────────────

function makeBackground(theme: "earth" | "space", size: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext("2d")!;
  const rand = mulberry32(theme === "earth" ? 12345 : 99999);

  if (theme === "earth") {
    // 심해→연안 그라데이션
    const sea = ctx.createRadialGradient(
      size * 0.4,
      size * 0.35,
      size * 0.1,
      size * 0.5,
      size * 0.5,
      size * 0.85,
    );
    sea.addColorStop(0, "#2f86c2");
    sea.addColorStop(0.5, "#1e5f96");
    sea.addColorStop(1, "#0d3358");
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, size, size);
    // 물결 하이라이트
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 2;
    for (let w = 0; w < 30; w++) {
      ctx.beginPath();
      const yy = rand() * size;
      ctx.moveTo(rand() * size, yy);
      ctx.quadraticCurveTo(rand() * size, yy + 20, rand() * size, yy);
      ctx.stroke();
    }
    // 대륙: 그림자 → 본체 → 하이라이트 3중 블롭 (입체감)
    for (let c = 0; c < 9; c++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const baseR = size * (0.06 + rand() * 0.1);
      ctx.fillStyle = "rgba(0,20,40,0.35)";
      blob(ctx, cx + size * 0.008, cy + size * 0.012, baseR, rand);
      const landRand = mulberry32(c * 777 + 1);
      ctx.fillStyle = c % 3 === 0 ? "#5a8f4e" : c % 3 === 1 ? "#6ba05a" : "#94ad62";
      blob(ctx, cx, cy, baseR, landRand);
      ctx.fillStyle = "rgba(190, 170, 110, 0.45)";
      blob(ctx, cx + baseR * 0.25, cy - baseR * 0.22, baseR * 0.42, rand);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      blob(ctx, cx - baseR * 0.3, cy - baseR * 0.3, baseR * 0.3, rand);
    }
    // 빙하
    ctx.fillStyle = "rgba(238, 246, 255, 0.92)";
    blob(ctx, size * 0.5, -size * 0.02, size * 0.14, rand);
    blob(ctx, size * 0.5, size * 1.02, size * 0.14, rand);
    // 구름
    for (let c = 0; c < 14; c++) {
      ctx.fillStyle = `rgba(255,255,255,${0.1 + rand() * 0.12})`;
      blob(ctx, rand() * size, rand() * size, size * (0.02 + rand() * 0.045), rand);
    }
  } else {
    ctx.fillStyle = "#080b1c";
    ctx.fillRect(0, 0, size, size);
    for (let c = 0; c < 5; c++) {
      const gx = rand() * size;
      const gy = rand() * size;
      const gr = size * (0.15 + rand() * 0.3);
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      const hue = 210 + rand() * 140;
      g.addColorStop(0, `hsla(${hue}, 75%, 48%, 0.45)`);
      g.addColorStop(0.6, `hsla(${hue}, 70%, 35%, 0.18)`);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    for (let s = 0; s < 700; s++) {
      const a = 0.25 + rand() * 0.75;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      const rr = rand() < 0.92 ? 1 : 2;
      ctx.fillRect(rand() * size, rand() * size, rr, rr);
    }
    // 행성 + 고리
    const px2 = size * 0.72;
    const py2 = size * 0.26;
    const pr = size * 0.1;
    ctx.save();
    ctx.shadowColor = "rgba(232, 169, 82, 0.6)";
    ctx.shadowBlur = 40;
    const pg = ctx.createRadialGradient(px2 - pr * 0.35, py2 - pr * 0.35, pr * 0.1, px2, py2, pr);
    pg.addColorStop(0, "#f5c87e");
    pg.addColorStop(0.6, "#d99a4e");
    pg.addColorStop(1, "#6e4218");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(px2, py2, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = "rgba(240, 220, 180, 0.5)";
    ctx.lineWidth = size * 0.008;
    ctx.beginPath();
    ctx.ellipse(px2, py2, pr * 1.7, pr * 0.45, -0.35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
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
  const points = 12;
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
