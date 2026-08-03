// three.js 기반 3D 렌더러 — 게임 로직(engine.ts)은 그대로, 렌더러만 교체.
// 기법: 영토 = InstancedMesh(1만 셀을 드로우콜 1번에), 리빌 = 바닥 CanvasTexture 동적 갱신,
//       궤적/존 = 언릿 머티리얼 + 반해상도 UnrealBloomPass 글로우, 틸트 카메라 + 플레이어 패럴럭스.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { NONE, type GameEngine } from "./engine";

const VIEW_W = 1280;
const VIEW_H = 800;
const GROUND_TEX = 1024; // 바닥 텍스처 해상도
const TERRITORY_H = 0.75; // 영토 블록 높이
const TRAIL_H = 0.4;

export class Renderer3D {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private groundCanvas: HTMLCanvasElement;
  private groundCtx: CanvasRenderingContext2D;
  private groundTex: THREE.CanvasTexture;
  private bgSource: HTMLCanvasElement; // 절차 배경 (이미지 로드 전 폴백)
  private bgImage: HTMLImageElement | null = null;

  private territory: THREE.InstancedMesh;
  private trails: THREE.InstancedMesh;
  private playerGroups: THREE.Group[] = [];
  private playerBodies: THREE.Mesh[] = [];
  private zoneRings: THREE.Mesh[] = [];
  private lastTerritoryVersion = -1;

  private camTarget = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private disposed = false;
  private dummy = new THREE.Object3D();
  private colorTmp = new THREE.Color();
  private playerColors: THREE.Color[];

  constructor(
    private canvas: HTMLCanvasElement,
    private engine: GameEngine,
    bgUrl?: string,
  ) {
    const N = engine.N;
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(VIEW_W, VIEW_H, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    const isSpace = engine.stage.theme === "space";
    const bgColor = new THREE.Color(isSpace ? 0x05070f : 0x0a1424);
    this.scene.background = bgColor;
    this.scene.fog = new THREE.Fog(bgColor, 140, 260);

    // ── 카메라: 틸트 뷰 + 플레이어 방향 패럴럭스 ──
    this.camera = new THREE.PerspectiveCamera(45, VIEW_W / VIEW_H, 1, 500);
    this.camTarget.set(N / 2, 0, N / 2);
    this.camPos.set(N / 2, 82, N / 2 + 86);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);

    // ── 조명 ──
    this.scene.add(new THREE.HemisphereLight(0xbdd4ff, 0x1a2438, 0.75));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
    sun.position.set(N * 0.2, 90, N * 0.15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -N * 0.75;
    sun.shadow.camera.right = N * 0.75;
    sun.shadow.camera.top = N * 0.75;
    sun.shadow.camera.bottom = -N * 0.75;
    sun.shadow.camera.far = 250;
    sun.shadow.bias = -0.0004;
    sun.target.position.set(N / 2, 0, N / 2);
    this.scene.add(sun, sun.target);

    // ── 바닥 (배경이미지 + 안개 리빌) ──
    this.bgSource = makeProceduralBg(engine.stage.theme, GROUND_TEX);
    this.groundCanvas = document.createElement("canvas");
    this.groundCanvas.width = GROUND_TEX;
    this.groundCanvas.height = GROUND_TEX;
    this.groundCtx = this.groundCanvas.getContext("2d")!;
    this.resetGroundComposite();
    this.groundTex = new THREE.CanvasTexture(this.groundCanvas);
    this.groundTex.colorSpace = THREE.SRGBColorSpace;
    this.groundTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(N, N),
      new THREE.MeshStandardMaterial({ map: this.groundTex, roughness: 0.92, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(N / 2, 0, N / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);

    if (bgUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        this.bgImage = img;
        this.resetGroundComposite(); // 이미 리빌된 셀을 새 배경으로 다시 그림
        this.groundTex.needsUpdate = true;
      };
      img.src = bgUrl;
    }

    // ── 맵 테두리 림 ──
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x2a3550,
      roughness: 0.4,
      metalness: 0.7,
    });
    const rimH = 1.6;
    const rimT = 1.2;
    for (const [x, z, w, d] of [
      [N / 2, -rimT / 2, N + rimT * 2, rimT],
      [N / 2, N + rimT / 2, N + rimT * 2, rimT],
      [-rimT / 2, N / 2, rimT, N],
      [N + rimT / 2, N / 2, rimT, N],
    ] as const) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, rimH, d), rimMat);
      rim.position.set(x, rimH / 2 - 0.1, z);
      rim.castShadow = true;
      rim.receiveShadow = true;
      this.scene.add(rim);
    }

    // ── 영토 블록 (InstancedMesh — 셀 전체를 드로우콜 1번에) ──
    const cellGeo = new THREE.BoxGeometry(0.96, TERRITORY_H, 0.96);
    const cellMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.08 });
    this.territory = new THREE.InstancedMesh(cellGeo, cellMat, N * N);
    this.territory.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.territory.castShadow = true;
    this.territory.receiveShadow = true;
    this.territory.count = 0;
    this.scene.add(this.territory);

    // ── 궤적 (언릿 + 블룸 글로우) ──
    const trailGeo = new THREE.BoxGeometry(0.72, TRAIL_H, 0.72);
    const trailMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.trails = new THREE.InstancedMesh(trailGeo, trailMat, 4000);
    this.trails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.trails.count = 0;
    this.scene.add(this.trails);

    // ── 플레이어 ──
    this.playerColors = engine.players.map((p) => new THREE.Color(p.color));
    for (const p of engine.players) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(1.15, 32, 24),
        new THREE.MeshPhysicalMaterial({
          color: p.color,
          roughness: 0.22,
          metalness: 0.1,
          clearcoat: 0.8,
          clearcoatRoughness: 0.2,
          emissive: new THREE.Color(p.color).multiplyScalar(0.22),
        }),
      );
      body.castShadow = true;
      g.add(body);

      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(1.5, 0.09, 10, 40),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(p.color).multiplyScalar(1.6),
          toneMapped: false,
          transparent: true,
          opacity: 0.9,
        }),
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = -0.6;
      g.add(halo);

      const plate = makeNameSprite(p.name, p.kind === "human");
      plate.position.y = 3.1;
      g.add(plate);

      if (p.kind === "human") {
        const glow = new THREE.PointLight(p.color, 40, 22, 2);
        glow.position.y = 2;
        g.add(glow);
      }
      this.scene.add(g);
      this.playerGroups.push(g);
      this.playerBodies.push(body);
    }

    // ── 가중치 존 링 ──
    for (const z of engine.stage.valueZones) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(z.radius, 0.22, 12, 64),
        new THREE.MeshBasicMaterial({
          color: 0xffc832,
          toneMapped: false,
          transparent: true,
          opacity: 0.85,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(z.x + 0.5, 0.35, z.y + 0.5);
      this.scene.add(ring);
      this.zoneRings.push(ring);

      const label = makeZoneSprite(`x${z.multiplier}`);
      label.position.set(z.x + 0.5, 2.2, z.y + 0.5);
      this.scene.add(label);
    }

    // ── 우주 테마: 별 파티클 ──
    if (isSpace) {
      const starGeo = new THREE.BufferGeometry();
      const pos = new Float32Array(1200 * 3);
      for (let s = 0; s < 1200; s++) {
        const r = 180 + Math.random() * 120;
        const a = Math.random() * Math.PI * 2;
        const h = Math.random() * 160 - 20;
        pos[s * 3] = N / 2 + Math.cos(a) * r;
        pos[s * 3 + 1] = h;
        pos[s * 3 + 2] = N / 2 + Math.sin(a) * r;
      }
      starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const stars = new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, sizeAttenuation: true }),
      );
      this.scene.add(stars);
    }

    // ── 포스트프로세싱: 반해상도 블룸 (성능 최적화) ──
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new UnrealBloomPass(new THREE.Vector2(VIEW_W / 2, VIEW_H / 2), 0.55, 0.5, 0.82),
    );
    this.composer.addPass(new OutputPass());
  }

  // ── 매 프레임 ──────────────────────────────────────────

  draw(nowMs = performance.now()) {
    if (this.disposed) return;
    const engine = this.engine;
    const N = engine.N;

    // 1. 리빌 큐 → 바닥 텍스처 갱신 (공동 리빌, docs/04 §5)
    if (engine.revealQueue.length > 0) {
      const scale = GROUND_TEX / N;
      for (const i of engine.revealQueue) {
        const x = i % N;
        const y = (i / N) | 0;
        this.drawGroundCell(x, y, scale);
      }
      engine.revealQueue.length = 0;
      this.groundTex.needsUpdate = true;
    }

    // 2. 영토 재빌드 (소유권 변경 시에만)
    if (engine.territoryVersion !== this.lastTerritoryVersion) {
      this.lastTerritoryVersion = engine.territoryVersion;
      this.rebuildTerritory();
    }

    // 3. 궤적 (매 프레임 — 짧아서 저렴)
    this.rebuildTrails();

    // 4. 플레이어
    for (const p of engine.players) {
      const g = this.playerGroups[p.id];
      g.visible = p.alive;
      if (!p.alive) continue;
      const fx = p.cx + p.dir.x * p.progress + 0.5;
      const fz = p.cy + p.dir.y * p.progress + 0.5;
      const bob = Math.sin(nowMs / 260 + p.id * 1.7) * 0.12;
      g.position.set(fx, TERRITORY_H + 1.0 + bob, fz);
      this.playerBodies[p.id].rotation.y = nowMs / 900 + p.id;
    }

    // 5. 존 링 펄스
    for (let i = 0; i < this.zoneRings.length; i++) {
      const s = 1 + 0.05 * Math.sin(nowMs / 320 + i);
      this.zoneRings[i].scale.set(s, s, 1);
      this.zoneRings[i].rotation.z = nowMs / 2400;
    }

    // 6. 카메라: 전장 조망 + 플레이어 쪽으로 완만한 패럴럭스
    const h = engine.human;
    const px = h.cx + h.dir.x * h.progress + 0.5;
    const pz = h.cy + h.dir.y * h.progress + 0.5;
    const sway = Math.sin(nowMs / 5200) * 2.2;
    this.camTarget.lerp(
      new THREE.Vector3(N / 2 + (px - N / 2) * 0.3, 0, N / 2 + (pz - N / 2) * 0.3),
      0.045,
    );
    this.camPos.lerp(
      new THREE.Vector3(
        N / 2 + (px - N / 2) * 0.22 + sway,
        82,
        N / 2 + 86 + (pz - N / 2) * 0.18,
      ),
      0.045,
    );
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);

    this.composer.render();
  }

  // ── 내부 헬퍼 ─────────────────────────────────────────

  private drawGroundCell(x: number, y: number, scale: number) {
    const ctx = this.groundCtx;
    const sx = Math.floor(x * scale);
    const sy = Math.floor(y * scale);
    const sw = Math.ceil(scale) + 1;
    if (this.bgImage) {
      const imgScale = this.bgImage.width / this.engine.N;
      ctx.drawImage(
        this.bgImage,
        x * imgScale,
        y * imgScale,
        imgScale,
        imgScale,
        sx,
        sy,
        sw,
        sw,
      );
    } else {
      ctx.drawImage(this.bgSource, sx, sy, sw, sw, sx, sy, sw, sw);
    }
  }

  private resetGroundComposite() {
    const ctx = this.groundCtx;
    ctx.fillStyle = this.engine.stage.theme === "space" ? "#070a18" : "#0b1526";
    ctx.fillRect(0, 0, GROUND_TEX, GROUND_TEX);
    // 미세 노이즈 질감
    for (let i = 0; i < 2500; i++) {
      const a = Math.random() * 0.05;
      ctx.fillStyle = `rgba(120,150,220,${a})`;
      ctx.fillRect(Math.random() * GROUND_TEX, Math.random() * GROUND_TEX, 3, 3);
    }
    // 이미 리빌된 셀 복원
    const N = this.engine.N;
    const scale = GROUND_TEX / N;
    for (let i = 0; i < N * N; i++) {
      if (this.engine.revealed[i]) this.drawGroundCell(i % N, (i / N) | 0, scale);
    }
  }

  private rebuildTerritory() {
    const engine = this.engine;
    const N = engine.N;
    const owner = engine.owner;
    let count = 0;
    for (let i = 0; i < N * N; i++) {
      const id = owner[i];
      if (id === NONE) continue;
      const x = i % N;
      const y = (i / N) | 0;
      this.dummy.position.set(x + 0.5, TERRITORY_H / 2, y + 0.5);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.territory.setMatrixAt(count, this.dummy.matrix);
      this.territory.setColorAt(count, this.playerColors[id]);
      count++;
    }
    this.territory.count = count;
    this.territory.instanceMatrix.needsUpdate = true;
    if (this.territory.instanceColor) this.territory.instanceColor.needsUpdate = true;
  }

  private rebuildTrails() {
    const engine = this.engine;
    const N = engine.N;
    let count = 0;
    for (const p of engine.players) {
      if (!p.alive || p.trail.length === 0) continue;
      this.colorTmp.set(p.color).multiplyScalar(1.7); // 블룸 임계 초과 → 글로우
      for (const i of p.trail) {
        if (count >= 4000) break;
        this.dummy.position.set((i % N) + 0.5, TRAIL_H / 2 + 0.02, ((i / N) | 0) + 0.5);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        this.trails.setMatrixAt(count, this.dummy.matrix);
        this.trails.setColorAt(count, this.colorTmp);
        count++;
      }
    }
    this.trails.count = count;
    this.trails.instanceMatrix.needsUpdate = true;
    if (this.trails.instanceColor) this.trails.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.disposed = true;
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry?.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          for (const v of Object.values(m)) {
            if (v instanceof THREE.Texture) v.dispose();
          }
          m.dispose();
        }
      }
      if (obj instanceof THREE.Sprite) {
        obj.material.map?.dispose();
        obj.material.dispose();
      }
    });
    this.groundTex.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}

// ── 스프라이트/배경 헬퍼 ─────────────────────────────────

function makeNameSprite(name: string, isHuman: boolean): THREE.Sprite {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 128;
  const ctx = cv.getContext("2d")!;
  ctx.font = "700 56px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tw = Math.min(480, ctx.measureText(name).width + 60);
  ctx.fillStyle = "rgba(6, 8, 18, 0.7)";
  roundRectPath(ctx, 256 - tw / 2, 22, tw, 84, 24);
  ctx.fill();
  ctx.strokeStyle = isHuman ? "rgba(120,190,255,0.9)" : "rgba(255,255,255,0.25)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(name, 256, 66);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }),
  );
  sprite.scale.set(10, 2.5, 1);
  return sprite;
}

function makeZoneSprite(text: string): THREE.Sprite {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 128;
  const ctx = cv.getContext("2d")!;
  ctx.font = "900 84px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255,190,30,0.9)";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#ffd94e";
  ctx.fillText(text, 128, 64);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }),
  );
  sprite.scale.set(6, 3, 1);
  return sprite;
}

function roundRectPath(
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

// 절차적 배경 — 승인 이미지 없을 때 폴백 (render.ts의 것과 동일 컨셉, 텍스처 해상도용)
function makeProceduralBg(theme: "earth" | "space", size: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext("2d")!;
  const rand = mulberry32(theme === "earth" ? 12345 : 99999);

  if (theme === "earth") {
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
    }
    ctx.fillStyle = "rgba(238, 246, 255, 0.92)";
    blob(ctx, size * 0.5, -size * 0.02, size * 0.14, rand);
    blob(ctx, size * 0.5, size * 1.02, size * 0.14, rand);
    for (let c = 0; c < 14; c++) {
      ctx.fillStyle = `rgba(255,255,255,${0.1 + rand() * 0.12})`;
      blob(ctx, rand() * size, rand() * size, size * (0.02 + rand() * 0.045), rand);
    }
  } else {
    ctx.fillStyle = "#0a0e20";
    ctx.fillRect(0, 0, size, size);
    for (let c = 0; c < 5; c++) {
      const gx = rand() * size;
      const gy = rand() * size;
      const gr = size * (0.15 + rand() * 0.3);
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      const hue = 210 + rand() * 140;
      g.addColorStop(0, `hsla(${hue}, 75%, 48%, 0.45)`);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    for (let s = 0; s < 900; s++) {
      ctx.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.75})`;
      const rr = rand() < 0.92 ? 1.5 : 3;
      ctx.fillRect(rand() * size, rand() * size, rr, rr);
    }
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
    if (i === 0) ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    else ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
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
