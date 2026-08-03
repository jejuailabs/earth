// 봇전 스테이지 기본 정의 — Firestore `stages` 컬렉션(docs/03 §2)이 비어 있을 때의 폴백이자
// 어드민 패널의 시드 데이터. 콘텐츠 다국어는 { ko, en } 맵 (docs/07 §4).

import type { LocalizedText, StageConfig, StageDef } from "@/game-engine/types";

export const STAGE_DEFS: StageDef[] = [
  {
    stageId: "stage-01",
    order: 1,
    name: { ko: "첫 발자국", en: "First Steps" },
    description: {
      ko: "느긋한 봇 2기와 함께 기본기를 익히세요. 맵의 30%를 점령하면 클리어.",
      en: "Learn the basics against 2 easygoing bots. Capture 30% of the map to clear.",
    },
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
    isActive: true,
  },
  {
    stageId: "stage-02",
    order: 2,
    name: { ko: "붐비는 대륙", en: "Crowded Continent" },
    description: {
      ko: "봇 4기가 영토를 다툽니다. 맵의 40%를 점령하세요.",
      en: "4 bots fight over land. Capture 40% of the map.",
    },
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
    isActive: true,
  },
  {
    stageId: "stage-03",
    order: 3,
    name: { ko: "추격자들", en: "The Chasers" },
    description: {
      ko: "Lv.2 봇은 노출된 궤적을 노립니다. 40% 점령이 목표.",
      en: "Lv.2 bots hunt exposed trails. Capture 40% to win.",
    },
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
    isActive: true,
  },
  {
    stageId: "stage-04",
    order: 4,
    name: { ko: "생존 시험", en: "Survival Trial" },
    description: {
      ko: "Lv.2 봇 4기 사이에서 120초를 버티세요.",
      en: "Survive 120 seconds among 4 Lv.2 bots.",
    },
    botTier: 2,
    botCount: 4,
    mapSize: 100,
    clearCondition: { type: "surviveTime", value: 120 },
    timeLimitSec: 120,
    theme: "space",
    valueZones: [{ x: 50, y: 50, radius: 8, type: "landmark", multiplier: 3 }],
    isActive: true,
  },
  {
    stageId: "stage-05",
    order: 5,
    name: { ko: "포위망", en: "The Encirclement" },
    description: {
      ko: "Lv.3 봇들은 당신의 확장 경로를 예측해 차단합니다. 50% 점령에 도전.",
      en: "Lv.3 bots predict and cut off your expansion. Capture 50% to win.",
    },
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
    isActive: true,
  },
];

export function pickText(t: LocalizedText | undefined, locale: string): string {
  if (!t) return "";
  return (locale === "en" && t.en) || t.ko;
}

export function localizeStage(def: StageDef, locale: string): StageConfig {
  return {
    stageId: def.stageId,
    order: def.order,
    name: pickText(def.name, locale),
    description: pickText(def.description, locale),
    botTier: def.botTier,
    botCount: def.botCount,
    mapSize: def.mapSize,
    clearCondition: def.clearCondition,
    timeLimitSec: def.timeLimitSec,
    theme: def.theme,
    valueZones: def.valueZones,
    backgroundImageId: def.backgroundImageId,
  };
}

export function getStaticStageDef(stageId: string | null): StageDef {
  return STAGE_DEFS.find((s) => s.stageId === stageId) ?? STAGE_DEFS[0];
}
