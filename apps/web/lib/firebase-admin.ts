// Firebase Admin SDK 초기화 (docs/01 §4) — 서버 전용. 클라이언트 번들에 포함 금지.
import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { ServerConfigError } from "./serverConfig";

// 초기화를 '첫 사용 시점'으로 미룬다. 모듈 로드 시점에 초기화하면 환경변수가 없는 배포
// 환경에서 라우트 핸들러가 실행되기도 전에 죽어, 원인을 알 수 없는 500만 남는다.
let cached: App | null = null;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new ServerConfigError(
      `서버 환경변수 ${name}이(가) 없습니다. 배포 환경(Vercel > Settings > Environment Variables)에도 ` +
        `FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY / ` +
        `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET 을 등록해야 합니다.`,
    );
  }
  return v;
}

function adminApp(): App {
  if (cached) return cached;
  if (getApps().length > 0) {
    cached = getApps()[0];
    return cached;
  }
  cached = initializeApp({
    credential: cert({
      projectId: requireEnv("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: requireEnv("FIREBASE_ADMIN_CLIENT_EMAIL"),
      // .env에는 개행이 \n 문자열로 저장됨
      privateKey: requireEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });
  return cached;
}

// 호출 시점에 초기화되도록 감싼다 (사용하는 쪽 코드는 그대로 유지)
function lazy<T extends object>(factory: () => T): T {
  let inst: T | null = null;
  const resolve = () => (inst ??= factory());
  return new Proxy({} as T, {
    get(_target, prop) {
      const target = resolve() as Record<string | symbol, unknown>;
      const value = target[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
    has: (_t, prop) => prop in (resolve() as object),
  });
}

export const adminAuth = lazy(() => getAuth(adminApp()));
export const adminFirestore = lazy(() => getFirestore(adminApp()));
export const adminBucket = lazy(() =>
  getStorage(adminApp()).bucket(requireEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET")),
);
