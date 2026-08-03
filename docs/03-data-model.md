# 03. Firestore 데이터 모델

> 모든 필드명/타입은 제안값입니다. 실제 구현 중 조정 가능하나, 컬렉션 구조(관계)는 유지하는 것을 권장합니다.

## 1. `users/{uid}`

```ts
{
  uid: string,
  email: string,
  displayName: string,
  photoURL: string,
  role: "user" | "admin",
  level: number,              // 계정 레벨
  exp: number,                // 누적 경험치
  points: number,             // 상점용 재화 (현금 구매 불가, 플레이로만 획득)
  unlockedStartSlots: number, // 해금된 출발 슬롯 개수
  unlockedControlModes: ("classic" | "manual")[],
  equippedSkin: string,       // 장착 스킨 ID
  equippedStartSlot: string,  // 장착 출발 슬롯 ID
  rankTier: string,           // 브론즈~레전드 등
  rankPoints: number,
  createdAt: Timestamp,
  lastLoginAt: Timestamp,
  status: "active" | "suspended"
}
```

## 2. `stages/{stageId}` (봇전 스테이지)

```ts
{
  stageId: string,
  order: number,
  name: { [locale]: string },      // i18n 다국어 텍스트 (docs/07-i18n.md 참고)
  botTier: 1 | 2 | 3,
  botCount: number,
  mapSize: number,
  clearCondition: {
    type: "areaPercent" | "surviveTime",
    value: number
  },
  backgroundImageId: string,       // images 컬렉션 참조
  isActive: boolean,
  createdBy: string,               // admin uid
  createdAt: Timestamp
}
```

## 3. `backgroundImages/{imageId}`

```ts
{
  imageId: string,
  storageUrl: string,              // Firebase Storage 경로
  theme: string,                   // 예: "world-map", "space", "underwater"
  status: "pending" | "approved" | "rejected", // 관리자 검수 상태
  valueZones: [
    {
      x: number, y: number, radius: number,
      type: "landmark" | "gem" | "event",
      multiplier: number,
      spawnRule: "fixed" | "timed" | "random"
    }
  ],
  generatedBy: "gpt-image" | "manual-upload",
  uploadedBy: string,               // admin uid
  uploadedAt: Timestamp
}
```

## 4. `matches/{matchId}` (매치 결과 로그 — 실시간 상태 아님)

```ts
{
  matchId: string,
  mode: "soloBot" | "quickMatch" | "ranked" | "custom",
  controlMode: "classic" | "manual",
  backgroundImageId: string,
  startedAt: Timestamp,
  endedAt: Timestamp,
  durationSec: number,
  participants: [
    {
      uid: string,
      finalAreaPercent: number,
      kills: number,
      rank: number,
      expGained: number,
      pointsGained: number
    }
  ]
}
```

> 매치 진행 중 실시간 데이터(플레이어 좌표, 그리드 점유, 리빌 진행도)는 Firestore가 아니라 실시간 게임 서버 메모리에서 처리하고, 매치 종료 시점에만 이 컬렉션에 결과를 기록합니다. (docs/05-realtime-multiplayer.md 참고)

## 5. `shopItems/{itemId}`

```ts
{
  itemId: string,
  type: "skin" | "startSlot" | "controlMode" | "trailPattern",
  name: { [locale]: string },
  cost: number,               // points
  requiredLevel: number,
  isActive: boolean
}
```

## 6. `admin/logs/{logId}` (관리자 액션 로그)

```ts
{
  logId: string,
  adminUid: string,
  action: string,             // 예: "image_approved", "user_suspended"
  targetId: string,
  timestamp: Timestamp
}
```

## 7. 인덱스 제안

- `matches`: `mode` + `endedAt` 복합 인덱스 (모드별 최근 매치 조회용)
- `backgroundImages`: `status` 단일 인덱스 (관리자 검수 대기열 조회용)

## 8. 열린 질문

- 랭크 시즌 리셋 시 `rankTier`/`rankPoints`를 별도 서브컬렉션(`seasons/{seasonId}/users/{uid}`)으로 분리할지, 현재 구조 유지하며 리셋할지
- 리더보드 조회 성능을 위해 별도 집계 컬렉션(`leaderboards`)이 필요할지 여부 (유저 수 늘어난 후 판단)
