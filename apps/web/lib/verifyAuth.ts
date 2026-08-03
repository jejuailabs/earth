// API Route 인증 미들웨어 (docs/02 §5)
import "server-only";
import { adminAuth, adminFirestore } from "./firebase-admin";

export async function verifyRequest(req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) throw new Error("No token");
  return adminAuth.verifyIdToken(token); // { uid, email, ... }
}

// 모든 /api/admin/* 라우트는 이 함수를 거친다 (docs/02 §3 role 검증)
export async function verifyAdmin(req: Request) {
  const decoded = await verifyRequest(req);
  const userDoc = await adminFirestore.doc(`users/${decoded.uid}`).get();
  if (userDoc.data()?.role !== "admin") throw new Error("Forbidden");
  return decoded;
}
