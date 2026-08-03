// /api/admin/users — 회원 관리 (docs/06 §2-1)
// GET: 목록 조회 / PATCH: status(정지·해제), role(user↔admin) 변경 + 액션 로그
import { adminFirestore } from "@/lib/firebase-admin";
import { adminRoute, writeAdminLog } from "@/lib/adminRoute";

export const GET = adminRoute(async () => {
  const snap = await adminFirestore
    .collection("users")
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();
  const users = snap.docs.map((d) => {
    const u = d.data();
    return {
      uid: d.id,
      email: u.email ?? "",
      displayName: u.displayName ?? "",
      photoURL: u.photoURL ?? "",
      role: u.role ?? "user",
      status: u.status ?? "active",
      level: u.level ?? 1,
      exp: u.exp ?? 0,
      points: u.points ?? 0,
      rankTier: u.rankTier ?? "-",
      createdAt: u.createdAt?.toDate?.()?.toISOString() ?? null,
      lastLoginAt: u.lastLoginAt?.toDate?.()?.toISOString() ?? null,
    };
  });
  return Response.json({ users });
});

export const PATCH = adminRoute(async (req, decoded) => {
  const body = (await req.json()) as {
    uid?: string;
    status?: "active" | "suspended";
    role?: "user" | "admin";
  };
  if (!body.uid) return Response.json({ error: "uid required" }, { status: 400 });

  const updates: Record<string, string> = {};
  if (body.status === "active" || body.status === "suspended") updates.status = body.status;
  if (body.role === "user" || body.role === "admin") updates.role = body.role;
  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "no valid updates" }, { status: 400 });
  }
  // 자기 자신의 admin 권한 회수 방지 (콘솔/스크립트로만 가능)
  if (updates.role === "user" && body.uid === decoded.uid) {
    return Response.json({ error: "cannot revoke your own admin role" }, { status: 400 });
  }

  await adminFirestore.doc(`users/${body.uid}`).update(updates);
  // 민감 액션 감사 로그 (docs/06 §2-1, §2-5)
  if (updates.status) {
    await writeAdminLog(
      decoded.uid,
      updates.status === "suspended" ? "user_suspended" : "user_unsuspended",
      body.uid,
    );
  }
  if (updates.role) {
    await writeAdminLog(decoded.uid, `role_changed_to_${updates.role}`, body.uid);
  }
  return Response.json({ ok: true });
});
