// users/{uid} 문서 스키마 (docs/03 §1)
import type { Timestamp } from "firebase/firestore";

export interface UserDoc {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: "user" | "admin";
  level: number;
  exp: number;
  points: number; // 상점용 재화 (플레이로만 획득)
  unlockedStartSlots: number;
  unlockedControlModes: ("classic" | "manual")[];
  equippedSkin: string;
  equippedStartSlot: string;
  rankTier: string;
  rankPoints: number;
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
  status: "active" | "suspended";
}

// 신규 유저 초기값 (docs/02 §2 로그인 플로우 4번)
export function initialUserDoc(u: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}) {
  return {
    uid: u.uid,
    email: u.email ?? "",
    displayName: u.displayName ?? "플레이어",
    photoURL: u.photoURL ?? "",
    role: "user" as const,
    level: 1,
    exp: 0,
    points: 0,
    unlockedStartSlots: 1,
    unlockedControlModes: ["classic" as const],
    equippedSkin: "default",
    equippedStartSlot: "default",
    rankTier: "bronze",
    rankPoints: 0,
    status: "active" as const,
  };
}
