// 최초 관리자 지정 스크립트 (docs/02 §3 — 닭과 달걀 문제 방지)
// 사용법: node scripts/set-admin.mjs <email>
// 대상 유저가 앱에서 최소 1회 Google 로그인한 뒤 실행해야 합니다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const email = process.argv[2];
if (!email) {
  console.error("사용법: node scripts/set-admin.mjs <email>");
  process.exit(1);
}

// apps/web/.env.local에서 Admin 자격증명 로드
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envText = readFileSync(join(root, "apps/web/.env.local"), "utf8");
const env = {};
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const user = await getAuth().getUserByEmail(email);
const db = getFirestore();
await db.doc(`users/${user.uid}`).set({ role: "admin" }, { merge: true });
await db.collection("admin").doc("logs").collection("entries").add({
  adminUid: "script",
  action: "role_changed_to_admin",
  targetId: user.uid,
  timestamp: FieldValue.serverTimestamp(),
});
console.log(`${email} (${user.uid}) → role: admin 지정 완료`);
