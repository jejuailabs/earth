// GET /api/admin/summary — 대시보드 요약 통계 (docs/06 §3)
import { adminFirestore } from "@/lib/firebase-admin";
import { adminRoute } from "@/lib/adminRoute";

export const GET = adminRoute(async () => {
  const [users, matches, stages, pendingImages] = await Promise.all([
    adminFirestore.collection("users").count().get(),
    adminFirestore.collection("matches").count().get(),
    adminFirestore.collection("stages").count().get(),
    adminFirestore.collection("backgroundImages").where("status", "==", "pending").count().get(),
  ]);
  return Response.json({
    users: users.data().count,
    matches: matches.data().count,
    stages: stages.data().count,
    pendingImages: pendingImages.data().count,
  });
});
