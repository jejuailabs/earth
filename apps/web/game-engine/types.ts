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

// 게임장 크기 프리셋 — 값은 정사각형일 때의 한 변(셀). 봇전 기본은 medium(100×100=1만 셀).
// 배경이미지 비율이 붙으면 넓이는 유지한 채 가로/세로로 늘려 배분한다.
export type FieldSize = "small" | "medium" | "large";

export const FIELD_BASE: Record<FieldSize, number> = {
  small: 72,
  medium: 100,
  large: 142,
};

export const MIN_FIELD_SIDE = 40;
export const MAX_FIELD_SIDE = 400;

// 크기 프리셋 + 배경이미지 비율(가로/세로) → 실제 격자 크기.
// 넓이(셀 수)는 프리셋대로 유지되므로 비율만 바뀌고 게임 분량은 같다.
export function fieldDimensions(size: FieldSize, aspect = 1) {
  const base = FIELD_BASE[size] ?? FIELD_BASE.medium;
  const a = Number.isFinite(aspect) && aspect > 0 ? Math.min(4, Math.max(0.25, aspect)) : 1;
  const r = Math.sqrt(a);
  const clamp = (v: number) => Math.max(MIN_FIELD_SIDE, Math.min(MAX_FIELD_SIDE, Math.round(v)));
  return { width: clamp(base * r), height: clamp(base / r) };
}

// Firestore 콘텐츠 다국어 맵 (docs/07 §4) — 미입력 언어는 ko로 폴백
export interface LocalizedText {
  ko: string;
  en?: string;
}

// 스테이지 원본 정의 (docs/03 §2 스키마) — 정적/Firestore 공통
export interface StageDef {
  stageId: string;
  order: number;
  name: LocalizedText;
  description: LocalizedText;
  botTier: 1 | 2 | 3;
  botCount: number;
  fieldSize: FieldSize; // 게임장 크기 (소/중/대)
  clearCondition: { type: ClearConditionType; value: number };
  timeLimitSec: number;
  theme: "earth" | "space";
  valueZones: ValueZone[];
  backgroundImageId?: string; // backgroundImages 컬렉션 참조 (docs/03 §2)
  isActive: boolean;
}

// 엔진/화면에 전달되는 로컬라이즈된 스테이지 (name/description은 현재 언어로 해석 완료)
export interface StageConfig {
  stageId: string;
  order: number;
  name: string;
  description: string;
  botTier: 1 | 2 | 3;
  botCount: number;
  fieldSize: FieldSize;
  mapWidth: number; // fieldSize + 배경이미지 비율로 산출된 실제 격자 크기
  mapHeight: number;
  clearCondition: { type: ClearConditionType; value: number };
  timeLimitSec: number; // areaPercent 스테이지의 제한시간 (surviveTime은 value가 곧 시간)
  theme: "earth" | "space";
  valueZones: ValueZone[];
  backgroundImageId?: string;
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
