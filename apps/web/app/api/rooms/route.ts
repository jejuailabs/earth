// /api/rooms — 사용자가 직접 만드는 커스텀 방 (로그인 필요)
// GET: 내 방 목록 / POST: 방 생성(이미지 업로드 포함) / DELETE: 내 방 삭제
import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminBucket, adminFirestore } from "@/lib/firebase-admin";
import { userRoute } from "@/lib/userRoute";
import { ROOM_IMAGE_MAX_BYTES, ROOM_LIMIT_PER_USER, type RoomDoc } from "@/lib/rooms";

export const maxDuration = 60;

const ALLOWED = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export const GET = userRoute(async (_req, decoded) => {
  const snap = await adminFirestore
    .collection("rooms")
    .where("ownerUid", "==", decoded.uid)
    .limit(ROOM_LIMIT_PER_USER)
    .get();
  const rooms = snap.docs
    .map((d) => {
      const r = d.data();
      return { ...r, roomId: d.id, createdAt: r.createdAt?.toDate?.()?.toISOString() ?? null };
    })
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  return Response.json({ rooms });
});

export const POST = userRoute(async (req, decoded) => {
  const body = (await req.json()) as Partial<RoomDoc> & { dataUrl?: string };

  const count = await adminFirestore
    .collection("rooms")
    .where("ownerUid", "==", decoded.uid)
    .count()
    .get();
  if (count.data().count >= ROOM_LIMIT_PER_USER) {
    return Response.json(
      { error: `방은 최대 ${ROOM_LIMIT_PER_USER}개까지 만들 수 있습니다` },
      { status: 409 },
    );
  }

  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(body.dataUrl ?? "");
  if (!m) return Response.json({ error: "사진을 선택해주세요" }, { status: 400 });
  const ext = ALLOWED.get(m[1]);
  if (!ext) return Response.json({ error: "PNG/JPEG/WebP만 올릴 수 있습니다" }, { status: 400 });
  const buf = Buffer.from(m[2], "base64");
  if (buf.length === 0) return Response.json({ error: "빈 파일" }, { status: 400 });
  if (buf.length > ROOM_IMAGE_MAX_BYTES) {
    return Response.json(
      { error: `사진이 너무 큽니다 (최대 ${ROOM_IMAGE_MAX_BYTES / 1024 / 1024}MB)` },
      { status: 413 },
    );
  }

  const imageWidth = Math.round(Number(body.imageWidth));
  const imageHeight = Math.round(Number(body.imageHeight));
  if (!(imageWidth > 0 && imageHeight > 0 && imageWidth <= 20000 && imageHeight <= 20000)) {
    return Response.json({ error: "사진 해상도를 읽지 못했습니다" }, { status: 400 });
  }

  const fieldSize = ["small", "medium", "large"].includes(String(body.fieldSize))
    ? body.fieldSize!
    : "medium";
  const controlMode = body.controlMode === "manual" ? "manual" : "classic";
  const botTier = ([1, 2, 3].includes(Number(body.botTier)) ? Number(body.botTier) : 1) as 1 | 2 | 3;
  const botCount = Math.max(0, Math.min(6, Number(body.botCount ?? 2)));
  const clearType = body.clearType === "surviveTime" ? "surviveTime" : "areaPercent";
  const clearValue =
    clearType === "areaPercent"
      ? Math.max(5, Math.min(90, Number(body.clearValue ?? 30)))
      : Math.max(30, Math.min(600, Number(body.clearValue ?? 120)));
  const timeLimitSec =
    clearType === "surviveTime"
      ? clearValue
      : Math.max(30, Math.min(900, Number(body.timeLimitSec ?? 180)));
  const name = String(body.name ?? "").trim().slice(0, 40) || "내 방";

  const roomId = randomUUID();
  const path = `room-images/${decoded.uid}/${roomId}.${ext}`;
  const token = randomUUID();
  await adminBucket.file(path).save(buf, {
    contentType: m[1],
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${adminBucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

  const room = {
    roomId,
    ownerUid: decoded.uid,
    name,
    imageUrl,
    imageWidth,
    imageHeight,
    fieldSize,
    controlMode,
    botTier,
    botCount,
    clearType,
    clearValue,
    timeLimitSec,
  };
  await adminFirestore.doc(`rooms/${roomId}`).set({ ...room, createdAt: FieldValue.serverTimestamp() });

  return Response.json({ room });
});

export const DELETE = userRoute(async (req, decoded) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  const ref = adminFirestore.doc(`rooms/${id}`);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ ok: true });
  if (snap.data()?.ownerUid !== decoded.uid) {
    return Response.json({ error: "내 방만 삭제할 수 있습니다" }, { status: 403 });
  }
  // Storage 파일도 함께 정리 (실패해도 문서 삭제는 진행)
  await adminBucket
    .deleteFiles({ prefix: `room-images/${decoded.uid}/${id}` })
    .catch((e) => console.warn("방 이미지 삭제 실패:", e));
  await ref.delete();
  return Response.json({ ok: true });
});
