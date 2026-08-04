// /api/rooms/scores — 방별 랭킹 (같은 방에 여러 사람이 참여해 기록을 겨룬다)
// GET ?roomId= : 상위 20명 / POST : 내 기록 제출(최고 기록만 유지)
import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";
import { userRoute } from "@/lib/userRoute";

async function readableRoom(roomId: string, uid: string) {
  const snap = await adminFirestore.doc(`rooms/${roomId}`).get();
  if (!snap.exists) return null;
  const room = snap.data()!;
  // 공개 방이거나 내가 만든 방일 때만 접근 가능
  if (room.visibility !== "public" && room.ownerUid !== uid) return null;
  return room;
}

export const GET = userRoute(async (req, decoded) => {
  const roomId = new URL(req.url).searchParams.get("roomId");
  if (!roomId) return Response.json({ error: "roomId required" }, { status: 400 });
  if (!(await readableRoom(roomId, decoded.uid))) {
    return Response.json({ error: "방을 찾을 수 없습니다" }, { status: 404 });
  }
  const snap = await adminFirestore
    .collection(`rooms/${roomId}/scores`)
    .orderBy("score", "desc")
    .limit(20)
    .get();
  const scores = snap.docs.map((d) => {
    const s = d.data();
    return {
      uid: d.id,
      displayName: s.displayName ?? "",
      photoURL: s.photoURL ?? "",
      score: Number(s.score ?? 0),
      areaPercent: Number(s.areaPercent ?? 0),
      kills: Number(s.kills ?? 0),
      cleared: Boolean(s.cleared),
      playedAt: s.playedAt?.toDate?.()?.toISOString() ?? null,
    };
  });
  return Response.json({ scores });
});

export const POST = userRoute(async (req, decoded) => {
  const body = (await req.json()) as {
    roomId?: string;
    score?: number;
    areaPercent?: number;
    kills?: number;
    cleared?: boolean;
  };
  if (!body.roomId) return Response.json({ error: "roomId required" }, { status: 400 });
  if (!(await readableRoom(body.roomId, decoded.uid))) {
    return Response.json({ error: "방을 찾을 수 없습니다" }, { status: 404 });
  }

  const score = Math.max(0, Math.round(Number(body.score ?? 0)));
  const ref = adminFirestore.doc(`rooms/${body.roomId}/scores/${decoded.uid}`);
  const prev = await ref.get();
  if (prev.exists && Number(prev.data()?.score ?? 0) >= score) {
    return Response.json({ ok: true, best: Number(prev.data()?.score ?? 0) }); // 기존 기록이 더 좋음
  }

  const userDoc = await adminFirestore.doc(`users/${decoded.uid}`).get();
  await ref.set({
    displayName: String(userDoc.data()?.displayName ?? decoded.name ?? "플레이어").slice(0, 40),
    photoURL: String(userDoc.data()?.photoURL ?? ""),
    score,
    areaPercent: Number(body.areaPercent ?? 0),
    kills: Math.max(0, Math.round(Number(body.kills ?? 0))),
    cleared: Boolean(body.cleared),
    playedAt: FieldValue.serverTimestamp(),
  });
  return Response.json({ ok: true, best: score });
});
