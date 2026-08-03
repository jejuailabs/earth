// 레벨/경험치/포인트 산정 — 전부 제안값 (밸런스는 수익 모델 확정 후 재조정, ORCHESTRATOR §5)
import type { GameResult } from "@/game-engine/types";

export const PROGRESSION = {
  expPerScore: 1, // 매치 점수 1 = exp 1
  clearExpBonus: 50,
  starExpBonus: 25, // 별 1개당
  pointsPerScore: 0.1,
  killPoints: 5,
} as const;

export function gainsFromResult(r: GameResult) {
  const exp =
    Math.round(r.score * PROGRESSION.expPerScore) +
    (r.outcome === "clear" ? PROGRESSION.clearExpBonus + r.stars * PROGRESSION.starExpBonus : 0);
  const points = Math.round(r.score * PROGRESSION.pointsPerScore) + r.kills * PROGRESSION.killPoints;
  return { exp, points };
}

// 누적 exp → 레벨 (단순 제곱근 곡선, 제안값)
export function levelFromExp(exp: number) {
  return Math.floor(Math.sqrt(exp / 100)) + 1;
}
