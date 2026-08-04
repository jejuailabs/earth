// GET /api/health — 서버 설정 자체 점검. 값은 절대 노출하지 않고 '있는지'와
// Firebase 연결 가능 여부만 보고한다. 배포 환경에서 원인을 빨리 좁히기 위한 진단용.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const present = (name: string) => Boolean(process.env[name]);
  const env = {
    FIREBASE_ADMIN_PROJECT_ID: present("FIREBASE_ADMIN_PROJECT_ID"),
    FIREBASE_ADMIN_CLIENT_EMAIL: present("FIREBASE_ADMIN_CLIENT_EMAIL"),
    FIREBASE_ADMIN_PRIVATE_KEY: present("FIREBASE_ADMIN_PRIVATE_KEY"),
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: present("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    OPENAI_API_KEY: present("OPENAI_API_KEY"),
  };
  const missing = Object.entries(env)
    .filter(([k, v]) => !v && k !== "OPENAI_API_KEY")
    .map(([k]) => k);

  // 개인키가 줄바꿈까지 제대로 들어왔는지 (Vercel에 붙여넣을 때 자주 깨진다)
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "";
  const keyShape = {
    length: rawKey.length,
    hasBeginMarker: rawKey.includes("BEGIN PRIVATE KEY"),
    hasEscapedNewlines: rawKey.includes("\\n"),
    hasRealNewlines: rawKey.includes("\n"),
  };

  const checks: Record<string, string> = {};
  if (missing.length === 0) {
    // 실제로 Firebase에 붙는지까지 확인 (실패 시 사유를 그대로 남긴다)
    try {
      const { adminFirestore, adminBucket } = await import("@/lib/firebase-admin");
      await adminFirestore.collection("rooms").limit(1).get();
      checks.firestore = "ok";
      const [exists] = await adminBucket.exists();
      checks.storage = exists ? "ok" : `버킷을 찾을 수 없음: ${adminBucket.name}`;
    } catch (e) {
      checks.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
  }

  return Response.json({ ok: missing.length === 0 && !checks.error, env, missing, keyShape, checks });
}
