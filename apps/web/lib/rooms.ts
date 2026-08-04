// 사용자가 직접 만드는 커스텀 방 — 사진/크기/조작모드를 골라 만들고 바로 플레이한다.
// 멀티플레이(docs/05)가 붙기 전까지는 봇전 전용이며, 만든 사람만 볼 수 있다.

import type { ControlMode, FieldSize, StageDef } from "@/game-engine/types";

export interface RoomDoc {
  roomId: string;
  ownerUid: string;
  ownerName: string;
  name: string;
  // public이면 누구나 목록에서 보고 참여할 수 있다 (같은 게임장에서 각자 기록 경쟁)
  visibility: "private" | "public";
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  fieldSize: FieldSize;
  controlMode: ControlMode;
  botTier: 1 | 2 | 3;
  botCount: number;
  clearType: "areaPercent" | "surviveTime";
  clearValue: number;
  timeLimitSec: number;
  createdAt?: string | null;
}

export const ROOM_LIMIT_PER_USER = 20;
export const ROOM_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

// 방 랭킹 한 줄 (rooms/{roomId}/scores/{uid} — 유저별 최고 기록만 남긴다)
export interface RoomScore {
  uid: string;
  displayName: string;
  photoURL: string;
  score: number;
  areaPercent: number;
  kills: number;
  cleared: boolean;
  playedAt: string | null;
}

// 비로그인 상태에서 만든 임시 방을 다음 화면으로 넘기는 자리
export const TEMP_ROOM_KEY = "game-earth:temp-room";

export function roomToStageDef(room: RoomDoc): StageDef {
  return {
    stageId: room.roomId,
    order: 0,
    name: { ko: room.name },
    description: { ko: "" },
    botTier: room.botTier,
    botCount: room.botCount,
    fieldSize: room.fieldSize,
    clearCondition: { type: room.clearType, value: room.clearValue },
    timeLimitSec: room.timeLimitSec,
    theme: "earth",
    valueZones: [],
    isActive: true,
  };
}

export function roomAspect(room: RoomDoc) {
  return room.imageWidth > 0 && room.imageHeight > 0 ? room.imageWidth / room.imageHeight : 1;
}
