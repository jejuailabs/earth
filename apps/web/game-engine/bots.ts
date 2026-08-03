// 봇 AI (docs/04-game-mechanics.md §6)
// 상태머신: expand(원정/확장) → return(귀환) → chase(추적)
// Lv.1 랜덤 배회 / Lv.2 궤적 약점 추적 / Lv.3 확장 경로 예측 차단

import { GAME_CONFIG as C } from "./config";
import { DIRS, type Vec } from "./types";
import { NONE, type GameEngine, type PlayerState } from "./engine";

export interface BotBrain {
  mode: "expand" | "return" | "chase";
  excursionLimit: number; // 이번 원정의 최대 궤적 길이
  homeIdx: number; // 귀환 목표 셀 (마지막으로 밟은 자기 영역 셀)
  rng: () => number;
}

export function makeBotBrain(tier: 1 | 2 | 3, rng: () => number): BotBrain {
  return { mode: "expand", excursionLimit: rollExcursion(rng), homeIdx: NONE, rng };
}

function rollExcursion(rng: () => number) {
  return C.bot.excursionMin + ((rng() * (C.bot.excursionMax - C.bot.excursionMin)) | 0);
}

// 셀 경계마다 호출되어 다음 방향을 반환
export function decideBotDir(engine: GameEngine, p: PlayerState): Vec {
  const brain = p.ai!;
  const N = engine.N;
  const cur = engine.idx(p.cx, p.cy);
  const inOwn = engine.owner[cur] === p.id;

  if (inOwn) {
    brain.homeIdx = cur;
    if (brain.mode !== "expand") {
      brain.mode = "expand";
      brain.excursionLimit = rollExcursion(brain.rng);
    }
  }

  const valid = validDirs(engine, p);
  if (valid.length === 0) return p.dir; // 막다른 길 — 어쩔 수 없는 죽음

  // ── 위협 감지: 내 궤적 근처에 적이 있으면 즉시 귀환 (Lv.2+) ──
  if (p.botTier >= 2 && !inOwn && p.trail.length > 3 && enemyNearMyTrail(engine, p)) {
    brain.mode = "return";
  }

  // ── 추적 판단 (Lv.2+) ──
  if (p.botTier >= 2 && brain.mode !== "return") {
    const target = pickChaseTarget(engine, p);
    if (target !== NONE) {
      brain.mode = "chase";
      return greedyToward(engine, p, target, valid);
    }
    if (brain.mode === "chase") brain.mode = "expand"; // 표적 소실
  }

  // ── 귀환 ──
  if (!inOwn && (brain.mode === "return" || p.trail.length >= brain.excursionLimit)) {
    brain.mode = "return";
    const home = brain.homeIdx !== NONE ? brain.homeIdx : nearestOwnCell(engine, p);
    if (home !== NONE) return greedyToward(engine, p, home, valid);
  }

  // ── 확장/배회 (Lv.1 기본 행동) ──
  if (inOwn) {
    // 일정 확률로 원정 시작: 아무 방향이나 (경계를 넘으면 자연히 궤적 시작)
    if (brain.rng() < C.bot.exitChance) {
      return valid[(brain.rng() * valid.length) | 0];
    }
    // 영역 내 배회: 현재 방향 유지 우선
    return keepOrTurn(p, valid, brain);
  }
  // 원정 중: 가끔 꺾어서 면적을 만든다
  if (brain.rng() < C.bot.turnChance) {
    const turns = valid.filter((d) => d.x !== p.dir.x || d.y !== p.dir.y);
    if (turns.length > 0) return turns[(brain.rng() * turns.length) | 0];
  }
  return keepOrTurn(p, valid, brain);
}

// ── 헬퍼 ────────────────────────────────────────────────

function validDirs(engine: GameEngine, p: PlayerState): Vec[] {
  const out: Vec[] = [];
  for (const d of DIRS) {
    // 정반대 방향(즉시 자기 궤적 충돌) 배제
    if ((p.dir.x !== 0 || p.dir.y !== 0) && d.x === -p.dir.x && d.y === -p.dir.y) continue;
    const nx = p.cx + d.x;
    const ny = p.cy + d.y;
    if (!engine.inBounds(nx, ny)) continue;
    if (engine.trailOwner[engine.idx(nx, ny)] === p.id) continue; // 자기 궤적 = 자살
    out.push(d);
  }
  return out;
}

function keepOrTurn(p: PlayerState, valid: Vec[], brain: BotBrain): Vec {
  for (const d of valid) {
    if (d.x === p.dir.x && d.y === p.dir.y) return d;
  }
  return valid[(brain.rng() * valid.length) | 0];
}

function greedyToward(engine: GameEngine, p: PlayerState, targetIdx: number, valid: Vec[]): Vec {
  const tx = targetIdx % engine.N;
  const ty = (targetIdx / engine.N) | 0;
  let best = valid[0];
  let bestDist = Infinity;
  for (const d of valid) {
    const dist = Math.abs(p.cx + d.x - tx) + Math.abs(p.cy + d.y - ty);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

function nearestOwnCell(engine: GameEngine, p: PlayerState): number {
  // 링 탐색으로 가장 가까운 자기 영역 셀 검색 (반경 제한)
  for (let r = 1; r < engine.N; r++) {
    for (let dy = -r; dy <= r; dy++) {
      const dx = r - Math.abs(dy);
      for (const sx of dx === 0 ? [0] : [-dx, dx]) {
        const x = p.cx + sx;
        const y = p.cy + dy;
        if (engine.inBounds(x, y) && engine.owner[engine.idx(x, y)] === p.id) {
          return engine.idx(x, y);
        }
      }
    }
  }
  return NONE;
}

function enemyNearMyTrail(engine: GameEngine, p: PlayerState): boolean {
  const R = C.bot.threatRadius;
  // 궤적이 길면 샘플링으로 비용 제한
  const step = Math.max(1, (p.trail.length / 20) | 0);
  for (const q of engine.players) {
    if (q.id === p.id || !q.alive) continue;
    for (let k = 0; k < p.trail.length; k += step) {
      const i = p.trail[k];
      const tx = i % engine.N;
      const ty = (i / engine.N) | 0;
      if (Math.abs(q.cx - tx) + Math.abs(q.cy - ty) <= R) return true;
    }
  }
  return false;
}

function pickChaseTarget(engine: GameEngine, p: PlayerState): number {
  let bestTarget = NONE;
  let bestScore = Infinity;
  for (const q of engine.players) {
    if (q.id === p.id || !q.alive || q.trail.length === 0) continue;
    const headDist = Math.abs(q.cx - p.cx) + Math.abs(q.cy - p.cy);
    if (headDist > C.bot.chaseRadius) continue;

    // Lv.3: 확장 경로 예측 — 상대 진행 방향 앞쪽을 노린다 (협공 시 차단 효과)
    if (p.botTier >= 3 && (q.dir.x !== 0 || q.dir.y !== 0)) {
      const lx = clamp(q.cx + q.dir.x * C.bot.lookaheadCells, 0, engine.N - 1);
      const ly = clamp(q.cy + q.dir.y * C.bot.lookaheadCells, 0, engine.N - 1);
      const d = Math.abs(lx - p.cx) + Math.abs(ly - p.cy);
      if (d + C.bot.chaseMargin < q.trail.length + headDist && d < bestScore) {
        bestScore = d;
        bestTarget = engine.idx(lx, ly);
      }
      continue;
    }

    // Lv.2: 궤적에서 가장 가까운 셀 추적 — 상대 귀환 소요(≈궤적 길이)보다
    // 내가 먼저 도달 가능할 때만 추격 성립
    for (const i of q.trail) {
      const tx = i % engine.N;
      const ty = (i / engine.N) | 0;
      const d = Math.abs(tx - p.cx) + Math.abs(ty - p.cy);
      if (d + C.bot.chaseMargin < q.trail.length && d < bestScore) {
        bestScore = d;
        bestTarget = i;
      }
    }
  }
  return bestTarget;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
