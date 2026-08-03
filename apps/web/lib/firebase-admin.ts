// Firebase Admin SDK 초기화 (docs/01 §4) — 서버 전용. 클라이언트 번들에 포함 금지.
import "server-only";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const adminApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          // .env에는 개행이 \n 문자열로 저장됨
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
      });

export const adminAuth = getAuth(adminApp);
export const adminFirestore = getFirestore(adminApp);
export const adminBucket = getStorage(adminApp).bucket(
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
);
