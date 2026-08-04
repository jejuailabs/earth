// 매치 결과 기록 (docs/03 §4) + 유저 진행도 갱신
// MVP: 클라이언트 SDK로 직접 기록. 치트 방지가 필요해지면 서버 검증(API Route/실시간 서버)으로 이전.

import { addDoc, collection, doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { gainsFromResult, levelFromExp } from "./progression";
import type { UserDoc } from "./userDoc";
import type { GameEngine } from "@/game-engine/engine";
import type { ControlMode, GameResult, StageConfig } from "@/game-engine/types";

export interface MatchGains {
  exp: number;
  points: number;
  leveledUpTo: number | null;
}

export async function recordMatch(
  uid: string,
  userDoc: UserDoc,
  stage: StageConfig,
  controlMode: ControlMode,
  engine: GameEngine,
  result: GameResult,
): Promise<MatchGains> {
  const gains = gainsFromResult(result);

  // 순위: 최종 영토 기준
  const ranked = [...engine.players].sort((a, b) => b.areaCells - a.areaCells);
  const now = new Date();

  await addDoc(collection(db, "matches"), {
    mode: "soloBot",
    controlMode,
    stageId: stage.stageId,
    backgroundImageId: `placeholder-${stage.theme}`, // GPT Image 파이프라인 연동 시 실제 imageId로
    startedAt: new Date(now.getTime() - result.durationSec * 1000),
    endedAt: now,
    durationSec: result.durationSec,
    participants: engine.players.map((p) => ({
      uid: p.kind === "human" ? uid : `bot:${p.name}`,
      finalAreaPercent: (p.areaCells / (engine.W * engine.H)) * 100,
      kills: p.kills,
      rank: ranked.indexOf(p) + 1,
      expGained: p.kind === "human" ? gains.exp : 0,
      pointsGained: p.kind === "human" ? gains.points : 0,
    })),
  });

  const newExp = userDoc.exp + gains.exp;
  const newLevel = levelFromExp(newExp);
  await updateDoc(doc(db, "users", uid), {
    exp: newExp,
    points: userDoc.points + gains.points,
    level: newLevel,
  });

  return {
    ...gains,
    leveledUpTo: newLevel > userDoc.level ? newLevel : null,
  };
}
