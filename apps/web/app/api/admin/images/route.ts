// /api/admin/images — 이미지 검수 큐 (docs/06 §2-3)
// GET: 목록 (?status= 필터) / PATCH: 승인·반려, 가중치존 갱신
import { adminFirestore } from "@/lib/firebase-admin";
import { adminRoute, writeAdminLog } from "@/lib/adminRoute";
import type { ValueZone } from "@/game-engine/types";

export const GET = adminRoute(async (req) => {
  const status = new URL(req.url).searchParams.get("status");
  let q = adminFirestore.collection("backgroundImages").orderBy("uploadedAt", "desc").limit(100);
  if (status) q = adminFirestore.collection("backgroundImages").where("status", "==", status).limit(100);
  const snap = await q.get();
  const images = snap.docs.map((d) => {
    const i = d.data();
    return {
      imageId: d.id,
      storageUrl: i.storageUrl ?? "",
      theme: i.theme ?? "",
      prompt: i.prompt ?? "",
      status: i.status ?? "pending",
      valueZones: i.valueZones ?? [],
      generatedBy: i.generatedBy ?? "manual-upload",
      uploadedAt: i.uploadedAt?.toDate?.()?.toISOString() ?? null,
    };
  });
  return Response.json({ images });
});

export const PATCH = adminRoute(async (req, decoded) => {
  const body = (await req.json()) as {
    imageId?: string;
    status?: "approved" | "rejected" | "pending";
    valueZones?: ValueZone[];
  };
  if (!body.imageId) return Response.json({ error: "imageId required" }, { status: 400 });

  const ref = adminFirestore.doc(`backgroundImages/${body.imageId}`);
  if (!(await ref.get()).exists) {
    return Response.json({ error: "존재하지 않는 imageId" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (body.status && ["approved", "rejected", "pending"].includes(body.status)) {
    updates.status = body.status;
  }
  if (Array.isArray(body.valueZones)) {
    updates.valueZones = body.valueZones.map((z) => ({
      x: Number(z.x),
      y: Number(z.y),
      radius: Number(z.radius ?? 6),
      type: ["landmark", "gem", "event"].includes(z.type) ? z.type : "landmark",
      multiplier: Number(z.multiplier ?? 2),
    }));
  }
  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "no valid updates" }, { status: 400 });
  }
  await ref.update(updates);

  if (updates.status === "approved") await writeAdminLog(decoded.uid, "image_approved", body.imageId);
  else if (updates.status === "rejected") await writeAdminLog(decoded.uid, "image_rejected", body.imageId);
  if (updates.valueZones) await writeAdminLog(decoded.uid, "image_zones_updated", body.imageId);

  return Response.json({ ok: true });
});
