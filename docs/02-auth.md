# 02. 인증 & 권한 구조 (Google 로그인)

## 1. 인증 방식

- **Firebase Auth의 Google Provider**를 사용한 소셜 로그인 단일 방식으로 시작 (이메일/비번 로그인 등은 범위 밖 — 필요 시 별도 논의)
- 클라이언트에서 `signInWithPopup` 또는 `signInWithRedirect`로 Google 로그인 수행 → Firebase ID Token 발급
- 서버(API Routes)에서는 요청 헤더로 전달받은 ID Token을 Firebase Admin SDK로 검증

## 2. 로그인 플로우

```
1. 유저가 "Google로 로그인" 클릭
2. Firebase Auth Google Popup/Redirect 진행
3. 로그인 성공 시 Firebase User 객체 획득 (uid, email, displayName, photoURL)
4. Firestore `users/{uid}` 문서 존재 여부 확인
   - 없으면: 신규 유저 문서 생성 (레벨 1, 포인트 0, 기본 스킨 등 초기값)
   - 있으면: lastLoginAt 갱신
5. 클라이언트 세션에 유저 상태 저장 (React Context 등)
```

## 3. 권한(역할) 구조

`users/{uid}` 문서에 `role` 필드를 두고 다음 값 중 하나를 가집니다.

| role | 설명 |
|---|---|
| `user` | 일반 플레이어 (기본값) |
| `admin` | 어드민 패널 접근 가능 — 회원관리, 스테이지/이미지 관리 |

- `role` 필드는 **클라이언트에서 수정 불가** — Firestore 보안 규칙에서 `role` 필드 쓰기를 서버(Admin SDK) 경유로만 허용
- 최초 관리자 계정은 Firebase Console 또는 서버 스크립트로 수동 지정 (닭과 달걀 문제 방지)

## 4. Firestore 보안 규칙 예시 (제안, 확실하지 않음 — 실제 배포 전 검증 필요)

```
match /users/{userId} {
  allow read: if request.auth != null && request.auth.uid == userId;
  allow write: if request.auth != null
               && request.auth.uid == userId
               && !("role" in request.resource.data.diff(resource.data).affectedKeys());
}

match /admin/{document=**} {
  allow read, write: if request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
}
```

## 5. API Route 인증 미들웨어 (제안 패턴)

```ts
// lib/verifyAuth.ts
import { adminAuth } from "@/lib/firebase-admin";

export async function verifyRequest(req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) throw new Error("No token");
  const decoded = await adminAuth.verifyIdToken(token);
  return decoded; // { uid, email, ... }
}

export async function verifyAdmin(req: Request) {
  const decoded = await verifyRequest(req);
  const userDoc = await adminFirestore.doc(`users/${decoded.uid}`).get();
  if (userDoc.data()?.role !== "admin") throw new Error("Forbidden");
  return decoded;
}
```

모든 `/api/admin/*` 라우트는 `verifyAdmin`을 거치도록 구현합니다.

## 6. 열린 질문

- 세션 만료/리프레시 정책 (Firebase ID Token은 기본 1시간 만료 — 클라이언트 SDK가 자동 갱신하지만 실시간 서버 쪽 토큰 검증 주기는 별도 설계 필요)
- 계정 정지/밴 기능의 구체적 흐름 (필드만 우선 설계해두고 UI는 추후)
