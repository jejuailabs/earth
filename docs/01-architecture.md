# 01. 시스템 아키텍처 (Vercel + Firebase)

## 1. 전체 구조 개요

```
[Client - Next.js / React]
        │
        ├── Vercel (정적 호스팅 + REST API Routes)
        │     ├── /api/auth/*        (Firebase Auth 연동 확인)
        │     ├── /api/shop/*        (상점 구매)
        │     ├── /api/admin/*       (관리자 기능)
        │     └── /api/stages/*      (스테이지 데이터 조회)
        │
        ├── Firebase
        │     ├── Firebase Auth      (Google 로그인)
        │     ├── Firestore          (유저/매치/상점/스테이지 데이터)
        │     └── Firebase Storage   (배경이미지, 스킨 에셋)
        │
        └── 실시간 게임 서버 (제안: Fly.io/Railway 등 별도 배포)
              └── WebSocket 서버 (매치 상태 틱 동기화, 룸 단위 관리)
```

## 2. 왜 별도 실시간 서버가 필요한가 (확실하지 않음 — 결정 필요)

Vercel 서버리스 함수(및 API Routes)는 요청-응답 단위로 실행되고 일정 시간 후 종료되는 구조라, 매치 진행 중 지속적으로 상태를 유지하며 초당 여러 번 브로드캐스트해야 하는 실시간 게임 서버 역할에는 적합하지 않습니다. 이 프로젝트는 다음 원칙을 제안합니다(최종 확정 필요):

- **정적 프론트엔드 + 인증/상점/관리자 API** → Vercel
- **매치 상태(그리드 점유, 플레이어 좌표, 리빌 진행도) 실시간 동기화** → 별도 상시 구동 서버
- **영구 저장(유저 프로필, 레벨, 매치 결과 로그)** → Firestore (매치 종료 후 결과만 기록, 매치 중 실시간 데이터는 서버 메모리에서 처리)

실시간 서버 프레임워크는 Node.js + `ws` 또는 Colyseus(게임 룸 관리에 특화된 프레임워크) 사용을 검토해볼 만합니다. 이 부분은 팀 내 확정 후 `docs/05-realtime-multiplayer.md`를 갱신하세요.

## 3. 환경 변수 (제안)

```
# Firebase (Client SDK)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin SDK (서버 전용, Vercel API Routes / 관리자 기능용)
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=

# 실시간 게임 서버 주소
NEXT_PUBLIC_REALTIME_SERVER_URL=

# GPT Image API
OPENAI_API_KEY=
```

## 4. 폴더 구조 제안 (Next.js 기준)

```
/app
  /(game)          # 게임 플레이 화면
  /(auth)          # 로그인 화면
  /(admin)         # 어드민 패널
  /api
    /shop
    /admin
    /stages
/lib
  /firebase.ts     # Firebase 클라이언트 초기화
  /firebase-admin.ts # Firebase Admin SDK 초기화 (서버 전용)
  /i18n.ts
/components
/locales           # i18next 번역 파일 (docs/07-i18n.md 참고)
/game-engine        # 클라이언트 렌더링/입력 처리 로직 (Canvas)
/realtime-server    # 별도 배포되는 실시간 게임 서버 (모노레포 구조 시)
```

모노레포(예: `apps/web`, `apps/realtime-server`)로 구성해 Vercel은 `apps/web`만 배포하고, `apps/realtime-server`는 별도 플랫폼에 배포하는 구조를 권장합니다.

## 5. 배포 파이프라인 (제안)

- Vercel: GitHub 연동, main 브랜치 push 시 자동 배포
- Firebase: Firestore 보안 규칙 및 Storage 규칙은 별도 CI 단계에서 `firebase deploy --only firestore:rules,storage:rules`로 배포
- 실시간 서버: 별도 플랫폼의 자동 배포 파이프라인 연결 (예: Fly.io GitHub Actions)

## 6. 열린 질문

- 실시간 서버 플랫폼 최종 선정 (Fly.io / Railway / Render 등 비용·리전 비교 필요)
- 모노레포 도구 선정 여부 (Turborepo, Nx 등) 또는 별도 레포 분리
