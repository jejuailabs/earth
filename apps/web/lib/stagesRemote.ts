// Firestore stages 컬렉션 조회 (docs/03 §2) — 비어 있거나 실패 시 정적 STAGE_DEFS 폴백
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { getStaticStageDef, STAGE_DEFS } from "./stages";
import type { StageDef } from "@/game-engine/types";

function toStageDef(raw: Record<string, unknown>): StageDef {
  const d = raw as Partial<StageDef> & Record<string, unknown>;
  return {
    stageId: String(d.stageId ?? ""),
    order: Number(d.order ?? 0),
    name: d.name ?? { ko: String(d.stageId ?? "이름 없음") },
    description: d.description ?? { ko: "" },
    botTier: ([1, 2, 3].includes(Number(d.botTier)) ? Number(d.botTier) : 1) as 1 | 2 | 3,
    botCount: Math.max(1, Math.min(6, Number(d.botCount ?? 2))),
    fieldSize: ["small", "medium", "large"].includes(String(d.fieldSize))
      ? (d.fieldSize as StageDef["fieldSize"])
      : "medium",
    clearCondition:
      d.clearCondition?.type === "surviveTime"
        ? { type: "surviveTime", value: Number(d.clearCondition.value ?? 120) }
        : { type: "areaPercent", value: Number(d.clearCondition?.value ?? 30) },
    timeLimitSec: Number(d.timeLimitSec ?? 180),
    theme: d.theme === "space" ? "space" : "earth",
    valueZones: Array.isArray(d.valueZones) ? d.valueZones : [],
    backgroundImageId: typeof d.backgroundImageId === "string" ? d.backgroundImageId : undefined,
    isActive: d.isActive !== false,
  };
}

export async function fetchActiveStageDefs(): Promise<StageDef[]> {
  try {
    const snap = await getDocs(query(collection(db, "stages"), where("isActive", "==", true)));
    if (snap.empty) return STAGE_DEFS;
    return snap.docs.map((s) => toStageDef(s.data())).sort((a, b) => a.order - b.order);
  } catch (e) {
    console.warn("stages 원격 조회 실패 — 내장 스테이지 사용:", e);
    return STAGE_DEFS;
  }
}

export async function fetchStageDef(stageId: string | null): Promise<StageDef> {
  if (!stageId) return getStaticStageDef(null);
  try {
    const snap = await getDoc(doc(db, "stages", stageId));
    if (snap.exists()) return toStageDef(snap.data());
  } catch (e) {
    console.warn("stage 원격 조회 실패 — 내장 스테이지 사용:", e);
  }
  return getStaticStageDef(stageId);
}
