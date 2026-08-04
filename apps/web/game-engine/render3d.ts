// three.js 기반 3D 렌더러 — 게임 로직(engine.ts)은 그대로, 렌더러만 교체.
// 기법: 영토 = InstancedMesh(1만 셀을 드로우콜 1번에), 리빌 = 바닥 CanvasTexture 동적 갱신,
//       궤적/존 = 언릿 머티리얼 + 반해상도 UnrealBloomPass 글로우, 틸트 카메라 + 플레이어 패럴럭스.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { NONE, type GameEngine } from "./engine";

const GROUND_TEX = 1024; // 바닥 텍스처 해상도
const TERRITORY_H = 0.75; // 영토 블록 높이
const TRAIL_H = 0.4;
// 카메라 궤도 각도 — 줌 거리와 무관하게 각도 유지 (우클릭 드래그로 조절)
const CAM_PITCH_DEFAULT = Math.atan2(0.78, 0.63); // 기존 기본 시점과 동일(≈51°)
const CAM_PITCH_MIN = 0.22; // 거의 지면 높이에서 올려다보는 각
const CAM_PITCH_MAX = 1.45; // 거의 수직 부감
const ZOOM_MIN = 16;
const ZOOM_MAX = 130;
const ZOOM_DEFAULT = 36;
const OVERVIEW_DIST = 125; // 사망/관전 시 전장 조망 거리

export class Renderer3D {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private groundCanvas: HTMLCanvasElement;
  private groundCtx: CanvasRenderingContext2D;
  private groundTex: THREE.CanvasTexture;
  private texW: number; // 바닥 텍스처 해상도 (격자 비율에 맞춤)
  private texH: number;
  private bgSource: HTMLCanvasElement; // 절차 배경 (이미지 로드 전 폴백)
  private bgImage: HTMLImageElement | null = null;

  private territory: THREE.InstancedMesh; // 영토 경계 벽 (불투명 입체)
  private territoryFill: THREE.InstancedMesh; // 영토 내부 (반투명 타일 — 리빌된 배경이 비침)
  private trails: THREE.InstancedMesh;
  private playerGroups: THREE.Group[] = [];
  private playerBodies: THREE.Mesh[] = [];
  private zoneRings: THREE.Mesh[] = [];
  private lastTerritoryVersion = -1;

  private camTarget = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private camYaw = 0;
  private camPitch = CAM_PITCH_DEFAULT;
  private camOffset = new THREE.Vector3();
  private zoomDist = ZOOM_DEFAULT;
  private lowSpec = false;
  private disposed = false;
  private dummy = new THREE.Object3D();
  private colorTmp = new THREE.Color();
  private playerColors: THREE.Color[];

  constructor(
    private canvas: HTMLCanvasElement,
    private engine: GameEngine,
    bgUrl?: string,
  ) {
    const W = engine.W;
    const H = engine.H;
    const initW = canvas.clientWidth || 1280;
    const initH = canvas.clientHeight || 800;

    // 모바일/저사양 판정 — 픽셀비·그림자·블룸 해상도를 낮춰 프레임을 확보한다
    const coarsePointer =
      typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    const lowSpec = coarsePointer || (navigator.hardwareConcurrency ?? 8) <= 4;
    this.lowSpec = lowSpec;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !lowSpec, // MSAA는 모바일 GPU에 부담이 커서 끈다
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowSpec ? 1.3 : 1.75));
    this.renderer.setSize(initW, initH, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = lowSpec ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    const isSpace = engine.stage.theme === "space";
    const bgColor = new THREE.Color(isSpace ? 0x05070f : 0x0a1424);
    this.scene.background = bgColor;
    this.scene.fog = new THREE.Fog(bgColor, 150, 420);

    // ── 카메라: 플레이어 추적 + 휠 줌 (광활한 월드 속의 나) ──
    this.camera = new THREE.PerspectiveCamera(50, initW / initH, 0.5, 600);
    this.camTarget.set(W / 2, 0, H / 2);
    this.updateCamOffset();
    this.camPos.copy(this.camTarget).addScaledVector(this.camOffset, this.zoomDist);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);

    // ── 조명 ──
    this.scene.add(new THREE.HemisphereLight(0xbdd4ff, 0x1a2438, 0.75));
    const span = Math.max(W, H);
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
    sun.position.set(W * 0.2, 90, H * 0.15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(lowSpec ? 1024 : 2048, lowSpec ? 1024 : 2048);
    sun.shadow.camera.left = -span * 0.75;
    sun.shadow.camera.right = span * 0.75;
    sun.shadow.camera.top = span * 0.75;
    sun.shadow.camera.bottom = -span * 0.75;
    sun.shadow.camera.far = 250;
    sun.shadow.bias = -0.0004;
    sun.target.position.set(W / 2, 0, H / 2);
    this.scene.add(sun, sun.target);

    // ── 바닥 (배경이미지 + 안개 리빌) ── 격자 비율에 맞춘 텍스처
    this.texW = W >= H ? GROUND_TEX : Math.max(64, Math.round((GROUND_TEX * W) / H));
    this.texH = H >= W ? GROUND_TEX : Math.max(64, Math.round((GROUND_TEX * H) / W));
    this.bgSource = makeProceduralBg(engine.stage.theme, this.texW, this.texH);
    this.groundCanvas = document.createElement("canvas");
    this.groundCanvas.width = this.texW;
    this.groundCanvas.height = this.texH;
    this.groundCtx = this.groundCanvas.getContext("2d")!;
    this.resetGroundComposite();
    this.groundTex = new THREE.CanvasTexture(this.groundCanvas);
    this.groundTex.colorSpace = THREE.SRGBColorSpace;
    this.groundTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshStandardMaterial({ map: this.groundTex, roughness: 0.92, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(W / 2, 0, H / 2);
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
      [W / 2, -rimT / 2, W + rimT * 2, rimT],
      [W / 2, H + rimT / 2, W + rimT * 2, rimT],
      [-rimT / 2, H / 2, rimT, H],
      [W + rimT / 2, H / 2, rimT, H],
    ] as const) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, rimH, d), rimMat);
      rim.position.set(x, rimH / 2 - 0.1, z);
      rim.castShadow = true;
      rim.receiveShadow = true;
      this.scene.add(rim);
    }

    // ── 영토 (InstancedMesh — 셀 전체를 드로우콜 1~2번에) ──
    // 경계 셀: 불투명 입체 벽 / 내부 셀: 반투명 타일 → 점령한 만큼 배경이미지가 훤히 드러남
    const wallGeo = new THREE.BoxGeometry(0.98, TERRITORY_H, 0.98);
    const wallMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.08 });
    this.territory = new THREE.InstancedMesh(wallGeo, wallMat, W * H);
    this.territory.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.territory.castShadow = true;
    this.territory.receiveShadow = true;
    this.territory.count = 0;
    // InstancedMesh의 boundingSphere는 최초 1회만 계산되고 캐시된다. 인스턴스가 매 프레임
    // 바뀌는 메시는 그 캐시가 곧바로 낡아 잘못 컬링되므로(특히 count=0으로 시작하면 영구 컬링)
    // 맵 전체를 덮는 이 메시들은 컬링을 끈다. 어차피 각각 드로우콜 1회다.
    this.territory.frustumCulled = false;
    this.scene.add(this.territory);

    const fillGeo = new THREE.BoxGeometry(1.0, 0.1, 1.0);
    const fillMat = new THREE.MeshStandardMaterial({
      roughness: 0.7,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.territoryFill = new THREE.InstancedMesh(fillGeo, fillMat, W * H);
    this.territoryFill.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.territoryFill.receiveShadow = true;
    this.territoryFill.count = 0;
    this.territoryFill.frustumCulled = false;
    this.scene.add(this.territoryFill);

    // ── 궤적 (언릿 + 블룸 글로우) ──
    const trailGeo = new THREE.BoxGeometry(0.72, TRAIL_H, 0.72);
    const trailMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.trails = new THREE.InstancedMesh(trailGeo, trailMat, 4000);
    this.trails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.trails.count = 0;
    this.trails.frustumCulled = false; // count=0으로 시작 → 컬링 켜면 영구히 안 보임
    this.scene.add(this.trails);

    // ── 플레이어 ──
    this.playerColors = engine.players.map((p) => new THREE.Color(p.color));
    for (const p of engine.players) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(p.kind === "human" ? 1.35 : 1.15, 32, 24),
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
      plate.position.y = 3.3;
      plate.scale.set(7, 1.75, 1);
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
      const starCount = lowSpec ? 500 : 1200;
      const starGeo = new THREE.BufferGeometry();
      const pos = new Float32Array(starCount * 3);
      for (let s = 0; s < starCount; s++) {
        const r = 180 + Math.random() * 120;
        const a = Math.random() * Math.PI * 2;
        const h = Math.random() * 160 - 20;
        pos[s * 3] = W / 2 + Math.cos(a) * r;
        pos[s * 3 + 1] = h;
        pos[s * 3 + 2] = H / 2 + Math.sin(a) * r;
      }
      starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const stars = new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, sizeAttenuation: true }),
      );
      this.scene.add(stars);
    }

    // ── 포스트프로세싱: 축소 해상도 블룸 (모바일은 1/3로 더 낮춤) ──
    const div = this.bloomDiv();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(initW / div, initH / div),
      0.55,
      0.5,
      0.82,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // 세로 화면은 가로 시야가 좁으므로 기본 줌을 살짝 뒤로 뺀다
    if (initH > initW) this.zoomDist = ZOOM_DEFAULT * 1.35;
  }

  // 마우스 휠 줌 (배율 방식 — 가까울수록 미세하게, 멀수록 크게)
  zoomBy(deltaY: number) {
    this.zoomDist = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoomDist * (1 + deltaY * 0.0011)));
  }

  // 우클릭 드래그로 시점 회전. 방향 규약은 three.js OrbitControls와 동일하게 맞췄다
  // (오른쪽으로 끌면 월드를 오른쪽으로 돌리고, 아래로 끌면 더 위에서 내려다본다).
  orbitBy(dxPx: number, dyPx: number) {
    this.camYaw -= dxPx * 0.006;
    this.camPitch = Math.min(
      CAM_PITCH_MAX,
      Math.max(CAM_PITCH_MIN, this.camPitch + dyPx * 0.005),
    );
  }

  resetOrbit() {
    this.camYaw = 0;
    this.camPitch = CAM_PITCH_DEFAULT;
  }

  // 화면 기준 '위쪽'이 월드의 어느 축인지 — 입력을 시점에 맞춰 회전시키는 데 쓴다.
  // 0=기본(-z), 1=90°, 2=180°, 3=270°
  yawQuadrant() {
    return (((Math.round(this.camYaw / (Math.PI / 2)) % 4) + 4) % 4);
  }

  private updateCamOffset() {
    const cp = Math.cos(this.camPitch);
    this.camOffset.set(Math.sin(this.camYaw) * cp, Math.sin(this.camPitch), Math.cos(this.camYaw) * cp);
  }

  private bloomDiv() {
    return this.lowSpec ? 3 : 2;
  }

  // 뷰포트 크기 변경 대응 (풀스크린 모드)
  resize(width: number, height: number) {
    if (this.disposed || width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    // composer.setSize가 블룸을 전체 해상도로 되돌리므로 축소 해상도를 다시 지정
    const div = this.bloomDiv();
    this.bloom.setSize(width / div, height / div);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // ── 매 프레임 ──────────────────────────────────────────

  draw(nowMs = performance.now()) {
    if (this.disposed) return;
    const engine = this.engine;
    const W = engine.W;
    const H = engine.H;

    // 1. 리빌 큐 → 바닥 텍스처 갱신 (공동 리빌, docs/04 §5)
    if (engine.revealQueue.length > 0) {
      for (const i of engine.revealQueue) {
        this.drawGroundCell(i % W, (i / W) | 0);
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

    // 6. 카메라: 플레이어 추적 (진행 방향 룩어헤드) / 사망 시 전장 조망
    const h = engine.human;
    const px = h.cx + h.dir.x * h.progress + 0.5;
    const pz = h.cy + h.dir.y * h.progress + 0.5;
    const dist = h.alive ? this.zoomDist : OVERVIEW_DIST;
    const lookAhead = Math.min(6, dist * 0.12);
    const desiredTarget = h.alive
      ? new THREE.Vector3(px + h.dir.x * lookAhead, 0, pz + h.dir.y * lookAhead)
      : new THREE.Vector3(W / 2, 0, H / 2);
    this.camTarget.lerp(desiredTarget, 0.07);
    this.updateCamOffset();
    const desiredPos = desiredTarget
      .clone()
      .addScaledVector(this.camOffset, dist)
      .add(new THREE.Vector3(Math.sin(nowMs / 5200) * dist * 0.015, 0, 0));
    this.camPos.lerp(desiredPos, 0.07);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);

    this.composer.render();
  }

  // ── 내부 헬퍼 ─────────────────────────────────────────

  // 셀 하나를 배경 원본에서 잘라 바닥 텍스처에 밝게 찍는다 (= 리빌)
  private drawGroundCell(x: number, y: number) {
    const ctx = this.groundCtx;
    const cw = this.texW / this.engine.W;
    const ch = this.texH / this.engine.H;
    const sx = Math.floor(x * cw);
    const sy = Math.floor(y * ch);
    const sw = Math.ceil(cw) + 1;
    const sh = Math.ceil(ch) + 1;
    if (this.bgImage) {
      // 배경이미지는 격자 전체에 늘려 매핑 (이미지 비율로 격자를 만들었으므로 왜곡 없음)
      const ix = this.bgImage.width / this.engine.W;
      const iy = this.bgImage.height / this.engine.H;
      ctx.drawImage(this.bgImage, x * ix, y * iy, ix, iy, sx, sy, sw, sh);
    } else {
      ctx.drawImage(this.bgSource, sx, sy, sw, sh, sx, sy, sw, sh);
    }
  }

  private resetGroundComposite() {
    const ctx = this.groundCtx;
    const { texW, texH } = this;
    // 광활함 연출: 미리빌 지역도 배경이 희미하게 보인다 (리빌 = 원색으로 밝아짐)
    ctx.drawImage(this.bgImage ?? this.bgSource, 0, 0, texW, texH);
    ctx.fillStyle = this.engine.stage.theme === "space" ? "rgba(4,6,16,0.88)" : "rgba(4,9,20,0.88)";
    ctx.fillRect(0, 0, texW, texH);
    // 희미한 그리드 — 공간 스케일 감각 (리빌된 셀은 덮어써서 그리드가 사라짐)
    const W = this.engine.W;
    const H = this.engine.H;
    const cw = texW / W;
    const ch = texH / H;
    ctx.strokeStyle = "rgba(140,170,230,0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k <= W; k += 2) {
      ctx.moveTo(k * cw, 0);
      ctx.lineTo(k * cw, texH);
    }
    for (let k = 0; k <= H; k += 2) {
      ctx.moveTo(0, k * ch);
      ctx.lineTo(texW, k * ch);
    }
    ctx.stroke();
    // 이미 리빌된 셀 복원
    for (let i = 0; i < W * H; i++) {
      if (this.engine.revealed[i]) this.drawGroundCell(i % W, (i / W) | 0);
    }
  }

  private rebuildTerritory() {
    const engine = this.engine;
    const W = engine.W;
    const H = engine.H;
    const owner = engine.owner;
    let walls = 0;
    let fills = 0;
    for (let i = 0; i < W * H; i++) {
      const id = owner[i];
      if (id === NONE) continue;
      const x = i % W;
      const y = (i / W) | 0;
      // 4방 이웃 중 다른 소유자가 있으면 경계 셀 → 입체 벽
      const isBorder =
        x === 0 ||
        x === W - 1 ||
        y === 0 ||
        y === H - 1 ||
        owner[i - 1] !== id ||
        owner[i + 1] !== id ||
        owner[i - W] !== id ||
        owner[i + W] !== id;
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(1, 1, 1);
      if (isBorder) {
        this.dummy.position.set(x + 0.5, TERRITORY_H / 2, y + 0.5);
        this.dummy.updateMatrix();
        this.territory.setMatrixAt(walls, this.dummy.matrix);
        this.territory.setColorAt(walls, this.playerColors[id]);
        walls++;
      } else {
        this.dummy.position.set(x + 0.5, 0.06, y + 0.5);
        this.dummy.updateMatrix();
        this.territoryFill.setMatrixAt(fills, this.dummy.matrix);
        this.territoryFill.setColorAt(fills, this.playerColors[id]);
        fills++;
      }
    }
    this.territory.count = walls;
    this.territory.instanceMatrix.needsUpdate = true;
    if (this.territory.instanceColor) this.territory.instanceColor.needsUpdate = true;
    this.territoryFill.count = fills;
    this.territoryFill.instanceMatrix.needsUpdate = true;
    if (this.territoryFill.instanceColor) this.territoryFill.instanceColor.needsUpdate = true;
  }

  private rebuildTrails() {
    const engine = this.engine;
    const W = engine.W;
    let count = 0;
    for (const p of engine.players) {
      if (!p.alive || p.trail.length === 0) continue;
      this.colorTmp.set(p.color).multiplyScalar(1.7); // 블룸 임계 초과 → 글로우
      for (const i of p.trail) {
        if (count >= 4000) break;
        this.dummy.position.set((i % W) + 0.5, TRAIL_H / 2 + 0.02, ((i / W) | 0) + 0.5);
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

// 절차적 배경 — 승인 이미지 없을 때 폴백. 격자 비율에 맞춰 직사각형으로도 생성된다.
function makeProceduralBg(theme: "earth" | "space", w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d")!;
  const rand = mulberry32(theme === "earth" ? 12345 : 99999);
  const s = Math.max(w, h); // 지형 크기 기준

  if (theme === "earth") {
    const sea = ctx.createRadialGradient(w * 0.4, h * 0.35, s * 0.1, w * 0.5, h * 0.5, s * 0.85);
    sea.addColorStop(0, "#2f86c2");
    sea.addColorStop(0.5, "#1e5f96");
    sea.addColorStop(1, "#0d3358");
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, w, h);
    for (let c = 0; c < 9; c++) {
      const cx = rand() * w;
      const cy = rand() * h;
      const baseR = s * (0.06 + rand() * 0.1);
      ctx.fillStyle = "rgba(0,20,40,0.35)";
      blob(ctx, cx + s * 0.008, cy + s * 0.012, baseR, rand);
      const landRand = mulberry32(c * 777 + 1);
      ctx.fillStyle = c % 3 === 0 ? "#5a8f4e" : c % 3 === 1 ? "#6ba05a" : "#94ad62";
      blob(ctx, cx, cy, baseR, landRand);
      ctx.fillStyle = "rgba(190, 170, 110, 0.45)";
      blob(ctx, cx + baseR * 0.25, cy - baseR * 0.22, baseR * 0.42, rand);
    }
    ctx.fillStyle = "rgba(238, 246, 255, 0.92)";
    blob(ctx, w * 0.5, -h * 0.02, s * 0.14, rand);
    blob(ctx, w * 0.5, h * 1.02, s * 0.14, rand);
    for (let c = 0; c < 14; c++) {
      ctx.fillStyle = `rgba(255,255,255,${0.1 + rand() * 0.12})`;
      blob(ctx, rand() * w, rand() * h, s * (0.02 + rand() * 0.045), rand);
    }
  } else {
    ctx.fillStyle = "#0a0e20";
    ctx.fillRect(0, 0, w, h);
    for (let c = 0; c < 5; c++) {
      const gx = rand() * w;
      const gy = rand() * h;
      const gr = s * (0.15 + rand() * 0.3);
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      const hue = 210 + rand() * 140;
      g.addColorStop(0, `hsla(${hue}, 75%, 48%, 0.45)`);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    const stars = Math.round((900 * (w * h)) / (1024 * 1024));
    for (let i = 0; i < stars; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.75})`;
      const rr = rand() < 0.92 ? 1.5 : 3;
      ctx.fillRect(rand() * w, rand() * h, rr, rr);
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
