// 봇전 스테이지 정의 — Firestore `stages` 컬렉션(docs/03 §2) 연동 전까지의 정적 데이터.
// 어드민 패널(docs/06)에서 CRUD 구현 시 이 파일은 Firestore 조회로 대체.

import type { StageConfig } from "@/game-engine/types";

export const STAGES: StageConfig[] = [
  {
    stageId: "stage-01",
    order: 1,
    name: "첫 발자국",
    description: "느긋한 봇 2기와 함께 기본기를 익히세요. 맵의 30%를 점령하면 클리어.",
    botTier: 1,
    botCount: 2,
    mapSize: 100,
    clearCondition: { type: "areaPercent", value: 30 },
    timeLimitSec: 180,
    theme: "earth",
    valueZones: [
      { x: 25, y: 25, radius: 6, type: "landmark", multiplier: 2 },
      { x: 75, y: 70, radius: 6, type: "landmark", multiplier: 2 },
    ],
  },
  {
    stageId: "stage-02",
    order: 2,
    name: "붐비는 대륙",
    description: "봇 4기가 영토를 다툽니다. 맵의 40%를 점령하세요.",
    botTier: 1,
    botCount: 4,
    mapSize: 100,
    clearCondition: { type: "areaPercent", value: 40 },
    timeLimitSec: 180,
    theme: "earth",
    valueZones: [
      { x: 50, y: 50, radius: 8, type: "landmark", multiplier: 3 },
      { x: 20, y: 78, radius: 5, type: "landmark", multiplier: 2 },
    ],
  },
  {
    stageId: "stage-03",
    order: 3,
    name: "추격자들",
    description: "Lv.2 봇은 노출된 궤적을 노립니다. 40% 점령이 목표.",
    botTier: 2,
    botCount: 3,
    mapSize: 100,
    clearCondition: { type: "areaPercent", value: 40 },
    timeLimitSec: 200,
    theme: "space",
    valueZones: [
      { x: 70, y: 30, radius: 7, type: "landmark", multiplier: 3 },
      { x: 30, y: 65, radius: 6, type: "landmark", multiplier: 2 },
    ],
  },
  {
    stageId: "stage-04",
    order: 4,
    name: "생존 시험",
    description: "Lv.2 봇 4기 사이에서 120초를 버티세요.",
    botTier: 2,
    botCount: 4,
    mapSize: 100,
    clearCondition: { type: "surviveTime", value: 120 },
    timeLimitSec: 120,
    theme: "space",
    valueZones: [{ x: 50, y: 50, radius: 8, type: "landmark", multiplier: 3 }],
  },
  {
    stageId: "stage-05",
    order: 5,
    name: "포위망",
    description: "Lv.3 봇들은 당신의 확장 경로를 예측해 차단합니다. 50% 점령에 도전.",
    botTier: 3,
    botCount: 4,
    mapSize: 100,
    clearCondition: { type: "areaPercent", value: 50 },
    timeLimitSec: 240,
    theme: "earth",
    valueZones: [
      { x: 30, y: 30, radius: 6, type: "landmark", multiplier: 2 },
      { x: 70, y: 70, radius: 6, type: "landmark", multiplier: 2 },
      { x: 50, y: 15, radius: 5, type: "landmark", multiplier: 3 },
    ],
  },
];

export function getStage(stageId: string | null): StageConfig {
  return STAGES.find((s) => s.stageId === stageId) ?? STAGES[0];
}
