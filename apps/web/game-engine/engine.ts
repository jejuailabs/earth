// 솔로 봇전용 게임 엔진 (docs/04-game-mechanics.md)
// 멀티플레이 시 동일 로직이 실시간 서버(apps/realtime-server)로 이식됩니다 —
// 클라이언트 전용 API(DOM 등)에 의존하지 않도록 유지할 것.

import { GAME_CONFIG as C } from "./config";
import { DIRS, type ControlMode, type GameResult, type StageConfig, type Vec } from "./types";
import { decideBotDir, makeBotBrain, type BotBrain } from "./bots";

export { DIRS };

export const NONE = -1;

export interface PlayerState {
  id: number; // players 배열 인덱스. 0 = 인간 플레이어
  kind: "human" | "bot";
  botTier: 0 | 1 | 2 | 3; // 0 = 인간
  name: string;
  color: string;
  alive: boolean;
  respawnAt: number; // ms (timeMs 기준)
  respawnCell: number; // 부활 위치 후보 셀 인덱스 (-1이면 신규 스폰)
  cx: number; // 현재 셀 좌표
  cy: number;
  dir: Vec; // 진행 방향 (0,0 = 정지)
  nextDir: Vec | null; // 셀 경계에서 적용될 예약 방향
  moving: boolean; // manual 모드 정지 지원
  progress: number; // 현재 셀 → 다음 셀 이동 진행도 0~1
  trail: number[]; // 영역 밖 궤적 셀 인덱스 (이동 순서대로)
  areaCells: number;
  // 영토 바운딩박스 — 점령 탐색을 이 범위로 한정한다 (비어 있으면 bMinX > bMaxX)
  bMinX: number;
  bMinY: number;
  bMaxX: number;
  bMaxY: number;
  kills: number;
  deaths: number;
  score: number;
  ai: BotBrain | null;
}

const BOT_COLORS = ["#ef4444", "#f97316", "#a855f7", "#14b8a6", "#eab308", "#ec4899"];
const BOT_NAMES = ["레드", "오렌지", "퍼플", "틸", "옐로", "핑크"];
const HUMAN_COLOR = "#3b82f6";

export class GameEngine {
  readonly N: number;
  readonly stage: StageConfig;
  readonly controlMode: ControlMode;

  owner: Int16Array; // 셀 소유자 (플레이어 id, NONE = 미점유)
  trailOwner: Int16Array;
  revealed: Uint8Array; // 공동 리빌 누적 마스크 (docs/04 §5 — 잃어도 리빌은 유지)
  zoneMult: Float32Array; // 셀별 점수 배율 (가중치 존 반영)

  players: PlayerState[] = [];
  timeMs = 0;
  result: GameResult | null = null;

  // 렌더러가 소비하는 새로 리빌된 셀 큐
  revealQueue: number[] = [];
  revealedCount = 0;
  // 소유권 변경 시 증가 — 렌더러가 영토 메시 재빌드 시점을 감지
  territoryVersion = 0;

  private visited: Int32Array; // 세대 스탬프 (0으로 되돌릴 필요 없음)
  private visitGen = 0;
  private bfsQueue: Int32Array;
  private bfsSeedDir: Uint8Array; // 경로탐색용: 각 셀에 도달한 '첫 걸음' 방향
  private rng: () => number;

  constructor(stage: StageConfig, controlMode: ControlMode, seed = Math.random() * 0xffffffff) {
    this.stage = stage;
    this.controlMode = controlMode;
    this.N = stage.mapSize;
    const total = this.N * this.N;
    this.owner = new Int16Array(total).fill(NONE);
    this.trailOwner = new Int16Array(total).fill(NONE);
    this.revealed = new Uint8Array(total);
    this.zoneMult = new Float32Array(total).fill(1);
    this.visited = new Int32Array(total);
    this.bfsSeedDir = new Uint8Array(total);
    this.bfsQueue = new Int32Array(total);
    this.rng = mulberry32(seed >>> 0);

    this.buildZoneMultipliers();
    this.spawnHuman();
    this.spawnBots();
  }

  idx(x: number, y: number) {
    return y * this.N + x;
  }

  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.N && y < this.N;
  }

  get human() {
    return this.players[0];
  }

  get timeLimitSec() {
    return this.stage.clearCondition.type === "surviveTime"
      ? this.stage.clearCondition.value
      : this.stage.timeLimitSec;
  }

  // ── 입력 ──────────────────────────────────────────────

  setHumanDir(d: Vec) {
    const p = this.human;
    if (!p.alive) return;
    // 이동 중 정반대 방향 입력은 무시 (자기 궤적으로 즉사하는 실수 방지)
    if (p.moving && (p.dir.x !== 0 || p.dir.y !== 0) && d.x === -p.dir.x && d.y === -p.dir.y) return;
    p.nextDir = d;
    if (p.dir.x === 0 && p.dir.y === 0) {
      p.dir = d; // 정지 상태에서는 즉시 출발
      p.moving = true;
    }
  }

  toggleHumanMoving() {
    this.setHumanMoving(!this.human.moving);
  }

  // 터치 조작: 누르고 있는 동안만 전진 (manual 모드)
  setHumanMoving(moving: boolean) {
    if (this.controlMode !== "manual") return;
    const p = this.human;
    if (!p.alive) return;
    p.moving = moving;
  }

  // ── 틱 ────────────────────────────────────────────────

  tick(dtMs: number) {
    if (this.result) return;
    this.timeMs += dtMs;

    for (const p of this.players) {
      if (!p.alive && this.timeMs >= p.respawnAt) this.respawn(p);
    }
    for (const p of this.players) {
      if (p.alive) this.advance(p, dtMs);
    }
    this.checkResult();
  }

  private advance(p: PlayerState, dtMs: number) {
    if (!p.moving || (p.dir.x === 0 && p.dir.y === 0)) return;
    const speed = p.kind === "human" ? C.playerSpeed : C.botSpeed;
    p.progress += (speed * dtMs) / 1000;

    let guard = 0;
    while (p.progress >= 1 && p.alive && guard++ < 4) {
      p.progress -= 1;
      const nx = p.cx + p.dir.x;
      const ny = p.cy + p.dir.y;
      this.enterCell(p, nx, ny);
      if (!p.alive) return;
      // 셀 경계 도달 — 예약 방향 적용 / 봇 AI 결정
      if (p.kind === "bot") {
        p.nextDir = decideBotDir(this, p);
      }
      if (p.nextDir) {
        const nd = p.nextDir;
        const opposite = nd.x === -p.dir.x && nd.y === -p.dir.y && (p.dir.x !== 0 || p.dir.y !== 0);
        if (!opposite) p.dir = nd;
        p.nextDir = null;
      }
      // 다음 셀이 맵 밖이면 즉시 처리 위해 루프 유지 조건만 확인
      if (p.dir.x === 0 && p.dir.y === 0) {
        p.progress = 0;
        break;
      }
    }
  }

  private enterCell(p: PlayerState, nx: number, ny: number) {
    // 1. 맵 경계 = 탈락
    if (!this.inBounds(nx, ny)) {
      this.kill(p, null);
      return;
    }
    p.cx = nx;
    p.cy = ny;
    const i = this.idx(nx, ny);

    // 2. 궤적 충돌 — 궤적 소유자가 탈락 (docs/04 §3, 자기 궤적 포함)
    const t = this.trailOwner[i];
    if (t !== NONE) {
      const victim = this.players[t];
      this.kill(victim, victim === p ? null : p);
      if (!p.alive) return;
    }

    // 3. 자기 영역 복귀 → 점령 처리
    if (this.owner[i] === p.id) {
      if (p.trail.length > 0) this.capture(p);
      return;
    }

    // 4. 영역 밖 → 궤적 생성
    this.trailOwner[i] = p.id;
    p.trail.push(i);
  }

  // 자기 영토로 돌아가는 최단 경로의 '첫 걸음'을 찾는다 (자기 궤적은 밟으면 죽으므로 통과 불가).
  // 그리디 이동은 자기 궤적에 막히면 제자리를 맴돌아 궤적만 길어지다 죽으므로, 귀환은 이 탐색을 쓴다.
  // 경로가 없거나 탐색 상한을 넘으면 null.
  stepTowardOwnTerritory(p: PlayerState, maxCells = 3000): Vec | null {
    const N = this.N;
    const stamp = ++this.visitGen;
    const visited = this.visited;
    const queue = this.bfsQueue;
    const seedDir = this.bfsSeedDir;
    let head = 0;
    let tail = 0;

    for (let k = 0; k < DIRS.length; k++) {
      const d = DIRS[k];
      // 정반대 방향은 즉시 자기 궤적을 밟는 자살수
      if ((p.dir.x !== 0 || p.dir.y !== 0) && d.x === -p.dir.x && d.y === -p.dir.y) continue;
      const nx = p.cx + d.x;
      const ny = p.cy + d.y;
      if (!this.inBounds(nx, ny)) continue;
      const i = this.idx(nx, ny);
      if (this.trailOwner[i] === p.id) continue;
      if (this.owner[i] === p.id) return d; // 바로 옆이 내 땅
      if (visited[i] === stamp) continue;
      visited[i] = stamp;
      seedDir[i] = k;
      queue[tail++] = i;
    }

    let expanded = 0;
    while (head < tail && expanded++ < maxCells) {
      const i = queue[head++];
      const x = i % N;
      const y = (i / N) | 0;
      const k = seedDir[i];
      for (const d of DIRS) {
        const nx = x + d.x;
        const ny = y + d.y;
        if (!this.inBounds(nx, ny)) continue;
        const j = this.idx(nx, ny);
        if (visited[j] === stamp) continue;
        if (this.trailOwner[j] === p.id) continue;
        if (this.owner[j] === p.id) return DIRS[k]; // 도착 — 그 경로의 첫 걸음을 반환
        visited[j] = stamp;
        seedDir[j] = k;
        queue[tail++] = j;
      }
    }
    return null;
  }

  // ── 점령 (폐곡선 flood-fill, docs/04 §1) ──────────────

  private capture(p: PlayerState) {
    for (const i of p.trail) {
      this.trailOwner[i] = NONE;
      this.setOwner(i, p.id); // p의 영토 바운딩박스도 여기서 함께 확장된다
    }
    p.trail = [];

    // 폐곡선(궤적 + 자기 영토 경계)의 내부는 반드시 "궤적 ∪ p 영토"를 감싸는
    // 사각형 안에 있다. 그 바깥은 곡선 바깥이 확정이므로 맵 전체를 훑을 필요가 없다.
    // 맵이 커져도 비용이 플레이어 영토 크기에만 비례하도록 하는 핵심 최적화.
    const N = this.N;
    const x0 = Math.max(0, p.bMinX - 1);
    const y0 = Math.max(0, p.bMinY - 1);
    const x1 = Math.min(N - 1, p.bMaxX + 1);
    const y1 = Math.min(N - 1, p.bMaxY + 1);
    if (x1 < x0 || y1 < y0) return; // 영토 없음

    // visited를 매번 0으로 채우지 않도록 세대 스탬프를 쓴다 (O(N²) 제거)
    const stamp = ++this.visitGen;
    const visited = this.visited;
    const queue = this.bfsQueue;
    let head = 0;
    let tail = 0;

    const push = (i: number) => {
      if (visited[i] !== stamp && this.owner[i] !== p.id) {
        visited[i] = stamp;
        queue[tail++] = i;
      }
    };
    // 사각형 테두리 = "바깥"의 씨앗
    for (let x = x0; x <= x1; x++) {
      push(this.idx(x, y0));
      push(this.idx(x, y1));
    }
    for (let y = y0; y <= y1; y++) {
      push(this.idx(x0, y));
      push(this.idx(x1, y));
    }
    while (head < tail) {
      const i = queue[head++];
      const x = i % N;
      const y = (i / N) | 0;
      if (x > x0) push(i - 1);
      if (x < x1) push(i + 1);
      if (y > y0) push(i - N);
      if (y < y1) push(i + N);
    }
    // 사각형 안에서 바깥과 이어지지 않은 (p 소유가 아닌) 셀 = 폐곡선 내부
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = this.idx(x, y);
        if (visited[i] !== stamp && this.owner[i] !== p.id) this.setOwner(i, p.id);
      }
    }
  }

  private setOwner(i: number, newId: number) {
    const old = this.owner[i];
    if (old === newId) return;
    this.territoryVersion++;
    if (old !== NONE) this.players[old].areaCells--;
    this.owner[i] = newId;
    if (newId !== NONE) {
      const p = this.players[newId];
      p.areaCells++;
      // 영토 바운딩박스 증분 갱신 (점령 탐색 범위 한정용). 셀을 잃어도 줄이지 않고
      // 넓은 쪽으로 남겨둔다 — 탐색 범위가 조금 넉넉해질 뿐 결과는 같다.
      const bx = i % this.N;
      const by = (i / this.N) | 0;
      if (bx < p.bMinX) p.bMinX = bx;
      if (bx > p.bMaxX) p.bMaxX = bx;
      if (by < p.bMinY) p.bMinY = by;
      if (by > p.bMaxY) p.bMaxY = by;
      p.score += C.pointsPerCell * this.zoneMult[i];
      if (!this.revealed[i]) {
        this.revealed[i] = 1;
        this.revealedCount++;
        this.revealQueue.push(i);
      }
    }
  }

  // ── 탈락/부활 (docs/04 §3) ────────────────────────────

  private kill(p: PlayerState, killer: PlayerState | null) {
    if (!p.alive) return;
    for (const i of p.trail) this.trailOwner[i] = NONE;
    p.trail = [];
    p.alive = false;
    p.deaths++;
    if (killer) killer.kills++;

    if (p.kind === "human") {
      // 부활 규칙(제안): 영토 50% 몰수 — 임의 중심에서 가까운 절반만 보존
      p.respawnAt = this.timeMs + C.respawnDelaySec * 1000;
      const owned: number[] = [];
      for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === p.id) owned.push(i);
      if (owned.length > 0) {
        const center = owned[(this.rng() * owned.length) | 0];
        const ccx = center % this.N;
        const ccy = (center / this.N) | 0;
        owned.sort((a, b) => {
          const da = Math.abs((a % this.N) - ccx) + Math.abs(((a / this.N) | 0) - ccy);
          const db = Math.abs((b % this.N) - ccx) + Math.abs(((b / this.N) | 0) - ccy);
          return da - db;
        });
        const keep = Math.floor(owned.length * C.respawnKeepRatio);
        for (let k = keep; k < owned.length; k++) this.setOwner(owned[k], NONE);
        p.respawnCell = center;
      } else {
        p.respawnCell = NONE;
      }
    } else {
      // 봇: 전체 영토 몰수 후 새 위치에서 재스폰
      p.respawnAt = this.timeMs + C.botRespawnDelaySec * 1000;
      for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === p.id) this.setOwner(i, NONE);
      // 영토를 전부 잃었으므로 바운딩박스도 비운다
      p.bMinX = this.N;
      p.bMinY = this.N;
      p.bMaxX = -1;
      p.bMaxY = -1;
      p.respawnCell = NONE;
    }
  }

  private respawn(p: PlayerState) {
    if (p.respawnCell !== NONE && this.owner[p.respawnCell] === p.id) {
      p.cx = p.respawnCell % this.N;
      p.cy = (p.respawnCell / this.N) | 0;
    } else if (!this.placeNewSpawn(p)) {
      // 자리를 못 찾으면 잠시 후 재시도
      p.respawnAt = this.timeMs + 1000;
      return;
    }
    p.alive = true;
    p.trail = [];
    p.progress = 0;
    p.dir = p.kind === "bot" ? DIRS[(this.rng() * 4) | 0] : { x: 0, y: 0 };
    p.nextDir = null;
    p.moving = p.kind === "bot";
    if (p.ai) p.ai.mode = "expand";
  }

  // ── 스폰 ──────────────────────────────────────────────

  private placeNewSpawn(p: PlayerState): boolean {
    const N = this.N;
    const m = C.spawnEdgeMargin;
    const clear = C.spawnClearance;
    const half = (clear / 2) | 0;
    for (let attempt = 0; attempt < 60; attempt++) {
      const cx = m + ((this.rng() * (N - 2 * m)) | 0);
      const cy = m + ((this.rng() * (N - 2 * m)) | 0);
      let ok = true;
      for (let y = cy - half; y <= cy + half && ok; y++) {
        for (let x = cx - half; x <= cx + half && ok; x++) {
          if (!this.inBounds(x, y)) ok = false;
          else {
            const i = this.idx(x, y);
            if (this.owner[i] !== NONE || this.trailOwner[i] !== NONE) ok = false;
          }
        }
      }
      // 다른 생존 플레이어와 최소 거리 확보
      if (ok) {
        for (const q of this.players) {
          if (q !== p && q.alive && Math.abs(q.cx - cx) + Math.abs(q.cy - cy) < clear * 2) {
            ok = false;
            break;
          }
        }
      }
      if (ok) {
        const bh = (C.spawnBlockSize / 2) | 0;
        for (let y = cy - bh; y <= cy + bh; y++) {
          for (let x = cx - bh; x <= cx + bh; x++) {
            if (this.inBounds(x, y)) this.setOwner(this.idx(x, y), p.id);
          }
        }
        p.cx = cx;
        p.cy = cy;
        return true;
      }
    }
    return false;
  }

  private spawnHuman() {
    const p: PlayerState = this.blankPlayer(0, "human", 0, "나", HUMAN_COLOR);
    this.players.push(p);
    this.placeNewSpawn(p);
    p.alive = true;
    p.moving = this.controlMode === "classic"; // classic: 방향 입력 시 자동 전진 시작
    p.dir = { x: 0, y: 0 }; // 첫 방향 입력 전까지 대기
  }

  private spawnBots() {
    for (let b = 0; b < this.stage.botCount; b++) {
      const id = this.players.length;
      const tier = this.stage.botTier;
      const p = this.blankPlayer(
        id,
        "bot",
        tier,
        `${BOT_NAMES[b % BOT_NAMES.length]} Lv.${tier}`,
        BOT_COLORS[b % BOT_COLORS.length],
      );
      p.ai = makeBotBrain(tier, this.rng);
      this.players.push(p);
      this.placeNewSpawn(p);
      p.alive = true;
      p.moving = true;
      p.dir = DIRS[(this.rng() * 4) | 0];
    }
  }

  private blankPlayer(
    id: number,
    kind: "human" | "bot",
    botTier: 0 | 1 | 2 | 3,
    name: string,
    color: string,
  ): PlayerState {
    return {
      id,
      kind,
      botTier,
      name,
      color,
      alive: false,
      respawnAt: 0,
      respawnCell: NONE,
      cx: 0,
      cy: 0,
      dir: { x: 0, y: 0 },
      nextDir: null,
      moving: false,
      progress: 0,
      trail: [],
      areaCells: 0,
      bMinX: this.N,
      bMinY: this.N,
      bMaxX: -1,
      bMaxY: -1,
      kills: 0,
      deaths: 0,
      score: 0,
      ai: null,
    };
  }

  // ── 가중치 존 (docs/04 §4) ────────────────────────────

  private buildZoneMultipliers() {
    for (const z of this.stage.valueZones) {
      const r2 = z.radius * z.radius;
      for (let y = Math.max(0, z.y - z.radius); y <= Math.min(this.N - 1, z.y + z.radius); y++) {
        for (let x = Math.max(0, z.x - z.radius); x <= Math.min(this.N - 1, z.x + z.radius); x++) {
          const dx = x - z.x;
          const dy = y - z.y;
          if (dx * dx + dy * dy <= r2) {
            const i = this.idx(x, y);
            this.zoneMult[i] = Math.max(this.zoneMult[i], z.multiplier);
          }
        }
      }
    }
  }

  // ── 결과 판정 (docs/04 §8) ────────────────────────────

  humanAreaPercent() {
    return (this.human.areaCells / (this.N * this.N)) * 100;
  }

  private checkResult() {
    const cond = this.stage.clearCondition;
    const areaPct = this.humanAreaPercent();
    const tSec = this.timeMs / 1000;

    if (cond.type === "areaPercent" && areaPct >= cond.value) {
      this.finish("clear");
      return;
    }
    if (tSec >= this.timeLimitSec) {
      this.finish(cond.type === "surviveTime" ? "clear" : "fail");
    }
  }

  private finish(outcome: "clear" | "fail") {
    const h = this.human;
    const areaPct = this.humanAreaPercent();
    let stars = 0;
    if (outcome === "clear") {
      stars = 1;
      if (h.deaths === 0 && C.stars.noDeathBonus) stars++;
      const cond = this.stage.clearCondition;
      if (cond.type === "areaPercent") {
        if (areaPct >= cond.value * C.stars.areaOverachieveRatio) stars++;
      } else if (h.kills >= C.stars.surviveKillsFor3Stars) {
        stars++;
      }
      stars = Math.min(3, stars);
    }
    this.result = {
      outcome,
      stars,
      areaPercent: areaPct,
      score: Math.round(h.score),
      kills: h.kills,
      deaths: h.deaths,
      durationSec: Math.round(this.timeMs / 1000),
    };
  }
}

// 시드 가능한 경량 PRNG — 리플레이/디버깅 재현성 확보용
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
