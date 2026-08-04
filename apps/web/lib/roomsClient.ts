// 커스텀 방 조회 (클라이언트) — 저장된 방은 Firestore에서, 임시 방은 세션에서 읽는다.
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { TEMP_ROOM_KEY, type RoomDoc } from "./rooms";

export async function fetchRoom(roomId: string): Promise<RoomDoc | null> {
  if (roomId === "temp") {
    try {
      const raw = sessionStorage.getItem(TEMP_ROOM_KEY);
      return raw ? (JSON.parse(raw) as RoomDoc) : null;
    } catch {
      return null;
    }
  }
  try {
    const snap = await getDoc(doc(db, "rooms", roomId));
    return snap.exists() ? ({ ...snap.data(), roomId: snap.id } as RoomDoc) : null;
  } catch (e) {
    console.warn("방 조회 실패:", e);
    return null;
  }
}
