export type Vec = { x: number; y: number };

// 4방향 이동 (그리드 게임이므로 대각선 없음)
export const DIRS: Vec[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export type ControlMode = "classic" | "manual";

export type ZoneType = "landmark" | "gem" | "event";

// docs/03 backgroundImages.valueZones 스키마와 동일 구조 (좌표는 그리드 셀 단위)
export interface ValueZone {
  x: number;
  y: number;
  radius: number;
  type: ZoneType;
  multiplier: number;
}

export type ClearConditionType = "areaPercent" | "surviveTime";

// docs/03 stages 스키마의 로컬 버전 — Firestore 연동 전까지 lib/stages.ts에서 정적 제공.
// name은 i18n 도입(docs/07) 시 { [locale]: string } 형태로 확장 예정.
export interface StageConfig {
  stageId: string;
  order: number;
  name: string;
  description: string;
  botTier: 1 | 2 | 3;
  botCount: number;
  mapSize: number;
  clearCondition: { type: ClearConditionType; value: number };
  timeLimitSec: number; // areaPercent 스테이지의 제한시간 (surviveTime은 value가 곧 시간)
  theme: "earth" | "space";
  valueZones: ValueZone[];
}

export interface GameResult {
  outcome: "clear" | "fail";
  stars: number; // 0~3 (fail이면 0)
  areaPercent: number;
  score: number;
  kills: number;
  deaths: number;
  durationSec: number;
}
