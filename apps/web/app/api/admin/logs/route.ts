// GET /api/admin/logs — 관리자 액션 로그 최근 100건 (docs/06 §2-5)
import { adminFirestore } from "@/lib/firebase-admin";
import { adminRoute } from "@/lib/adminRoute";

export const GET = adminRoute(async () => {
  const snap = await adminFirestore
    .collection("admin")
    .doc("logs")
    .collection("entries")
    .orderBy("timestamp", "desc")
    .limit(100)
    .get();
  const logs = snap.docs.map((d) => {
    const l = d.data();
    return {
      logId: d.id,
      adminUid: l.adminUid ?? "",
      action: l.action ?? "",
      targetId: l.targetId ?? "",
      timestamp: l.timestamp?.toDate?.()?.toISOString() ?? null,
    };
  });
  return Response.json({ logs });
});
