// /api/admin/stages — 스테이지 CRUD (docs/06 §2-2, 스키마: docs/03 §2)
import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";
import { adminRoute, writeAdminLog } from "@/lib/adminRoute";
import type { StageDef } from "@/game-engine/types";

function validateStage(body: Partial<StageDef>): string | null {
  if (!body.stageId || !/^[a-z0-9-]{2,40}$/.test(body.stageId)) {
    return "stageId: 소문자/숫자/하이픈 2~40자";
  }
  if (!body.name?.ko) return "name.ko는 필수";
  if (![1, 2, 3].includes(Number(body.botTier))) return "botTier: 1~3";
  const bc = Number(body.botCount);
  if (!(bc >= 1 && bc <= 6)) return "botCount: 1~6";
  const ms = Number(body.mapSize);
  if (!(ms >= 40 && ms <= 200)) return "mapSize: 40~200";
  if (!body.clearCondition || !["areaPercent", "surviveTime"].includes(body.clearCondition.type)) {
    return "clearCondition.type: areaPercent | surviveTime";
  }
  if (!(Number(body.clearCondition.value) > 0)) return "clearCondition.value > 0";
  if (!(Number(body.timeLimitSec) > 0)) return "timeLimitSec > 0";
  if (!["earth", "space"].includes(body.theme ?? "")) return "theme: earth | space";
  if (!Array.isArray(body.valueZones)) return "valueZones: 배열";
  return null;
}

function stageDocData(body: StageDef) {
  return {
    stageId: body.stageId,
    order: Number(body.order ?? 0),
    name: { ko: body.name.ko, en: body.name.en ?? "" },
    description: { ko: body.description?.ko ?? "", en: body.description?.en ?? "" },
    botTier: Number(body.botTier),
    botCount: Number(body.botCount),
    mapSize: Number(body.mapSize),
    clearCondition: {
      type: body.clearCondition.type,
      value: Number(body.clearCondition.value),
    },
    timeLimitSec: Number(body.timeLimitSec),
    theme: body.theme,
    valueZones: body.valueZones.map((z) => ({
      x: Number(z.x),
      y: Number(z.y),
      radius: Number(z.radius),
      type: ["landmark", "gem", "event"].includes(z.type) ? z.type : "landmark",
      multiplier: Number(z.multiplier ?? 2),
    })),
    backgroundImageId: typeof body.backgroundImageId === "string" ? body.backgroundImageId : "",
    isActive: body.isActive !== false,
  };
}

export const GET = adminRoute(async () => {
  const snap = await adminFirestore.collection("stages").orderBy("order").get();
  return Response.json({ stages: snap.docs.map((d) => d.data()) });
});

export const POST = adminRoute(async (req, decoded) => {
  const body = (await req.json()) as StageDef;
  const err = validateStage(body);
  if (err) return Response.json({ error: err }, { status: 400 });

  const ref = adminFirestore.doc(`stages/${body.stageId}`);
  if ((await ref.get()).exists) {
    return Response.json({ error: "이미 존재하는 stageId" }, { status: 409 });
  }
  await ref.set({
    ...stageDocData(body),
    createdBy: decoded.uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  await writeAdminLog(decoded.uid, "stage_created", body.stageId);
  return Response.json({ ok: true });
});

export const PATCH = adminRoute(async (req, decoded) => {
  const body = (await req.json()) as StageDef;
  const err = validateStage(body);
  if (err) return Response.json({ error: err }, { status: 400 });

  const ref = adminFirestore.doc(`stages/${body.stageId}`);
  if (!(await ref.get()).exists) {
    return Response.json({ error: "존재하지 않는 stageId" }, { status: 404 });
  }
  await ref.update(stageDocData(body));
  await writeAdminLog(decoded.uid, "stage_updated", body.stageId);
  return Response.json({ ok: true });
});

export const DELETE = adminRoute(async (req, decoded) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  await adminFirestore.doc(`stages/${id}`).delete();
  await writeAdminLog(decoded.uid, "stage_deleted", id);
  return Response.json({ ok: true });
});
