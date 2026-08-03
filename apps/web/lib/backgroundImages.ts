// 게임 클라이언트에서 승인된 배경이미지 조회 (docs/08 §3-6 — approved만 사용)
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { ValueZone } from "@/game-engine/types";

export interface ApprovedImage {
  storageUrl: string;
  valueZones: ValueZone[];
}

export async function fetchApprovedImage(imageId: string): Promise<ApprovedImage | null> {
  try {
    const snap = await getDoc(doc(db, "backgroundImages", imageId));
    if (!snap.exists()) return null;
    const d = snap.data();
    if (d.status !== "approved" || !d.storageUrl) return null;
    return {
      storageUrl: d.storageUrl as string,
      valueZones: Array.isArray(d.valueZones) ? (d.valueZones as ValueZone[]) : [],
    };
  } catch (e) {
    console.warn("배경이미지 조회 실패:", e);
    return null;
  }
}
