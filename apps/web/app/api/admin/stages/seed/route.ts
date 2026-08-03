// POST /api/admin/stages/seed — 내장 스테이지 5종을 Firestore로 시드 (기존 문서는 건너뜀)
import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "@/lib/firebase-admin";
import { adminRoute, writeAdminLog } from "@/lib/adminRoute";
import { STAGE_DEFS } from "@/lib/stages";

export const POST = adminRoute(async (_req, decoded) => {
  let seeded = 0;
  for (const def of STAGE_DEFS) {
    const ref = adminFirestore.doc(`stages/${def.stageId}`);
    if ((await ref.get()).exists) continue;
    await ref.set({
      ...def,
      createdBy: decoded.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    seeded++;
  }
  if (seeded > 0) await writeAdminLog(decoded.uid, "stages_seeded", `${seeded} stages`);
  return Response.json({ seeded });
});
