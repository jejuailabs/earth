// 어드민 API 공통 래퍼 — 서버단 role 검증(docs/06 §1 이중 처리) + 액션 로그(docs/06 §2-5)
import "server-only";
import type { DecodedIdToken } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { adminFirestore } from "./firebase-admin";
import { verifyAdmin } from "./verifyAuth";

type Handler = (req: Request, decoded: DecodedIdToken) => Promise<Response>;

export function adminRoute(handler: Handler) {
  return async (req: Request): Promise<Response> => {
    let decoded: DecodedIdToken;
    try {
      decoded = await verifyAdmin(req);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unauthorized";
      return Response.json({ error: msg }, { status: msg === "Forbidden" ? 403 : 401 });
    }
    try {
      return await handler(req, decoded);
    } catch (e) {
      console.error("[admin api]", e);
      const msg = e instanceof Error ? e.message : "Internal error";
      return Response.json({ error: msg }, { status: 500 });
    }
  };
}

// admin/logs — docs/03 §6. Firestore 경로 규칙상 admin(컬렉션)/logs(문서)/entries(하위 컬렉션) 사용
export async function writeAdminLog(adminUid: string, action: string, targetId: string) {
  await adminFirestore.collection("admin").doc("logs").collection("entries").add({
    adminUid,
    action,
    targetId,
    timestamp: FieldValue.serverTimestamp(),
  });
}
