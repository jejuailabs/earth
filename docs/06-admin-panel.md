# 06. 어드민 모드 스펙

## 1. 접근 제어

- `/admin` 경로는 `users/{uid}.role === "admin"`인 경우에만 접근 가능
- 프론트엔드 라우트 가드 + API Route 서버단 검증(`verifyAdmin`, docs/02-auth.md 참고) 이중 처리 필수 (프론트 가드만으로는 우회 가능)

## 2. 기능 구성

### 2-1. 회원 관리
- 유저 목록 조회 (검색: email/displayName, 필터: role/status)
- 유저 상세: 레벨, 포인트, 랭크티어, 최근 매치 이력
- 계정 정지(`status: "suspended"`) / 정지 해제
- role 변경(user ↔ admin) — 민감 기능이므로 액션 로그(`admin/logs`) 필수 기록

### 2-2. 스테이지 관리 (봇전)
- 스테이지 목록 CRUD (order, botTier, botCount, mapSize, clearCondition)
- 스테이지별 배경이미지 연결 (`backgroundImages` 참조)
- 활성화/비활성화 토글 (`isActive`)
- 다국어 이름 입력 (locale별 name 필드, docs/07-i18n.md 참고)

### 2-3. 이미지 관리
- 이미지 업로드 (수동 업로드 또는 GPT Image 파이프라인 트리거, docs/08-image-pipeline.md 참고)
- 업로드된 이미지 검수 큐 (`status: pending` 목록) → 승인/반려
- 가중치 존(valueZones) 좌표 지정 UI — 이미지 위에 클릭/드래그로 landmark/gem/event 존 좌표와 배율 입력
- 승인된 이미지만 스테이지/매치에서 실제 사용 가능

### 2-4. 상점 아이템 관리
- `shopItems` CRUD (스킨, 출발 슬롯, 조작모드, 궤적 패턴 등)
- 가격(cost), 필요 레벨(requiredLevel), 활성화 여부 관리

### 2-5. 액션 로그
- 모든 관리자 액션(이미지 승인, 유저 정지 등)을 `admin/logs`에 기록해 감사 추적 가능하게 함

## 3. 화면 구성 제안 (라우트)

```
/admin                  → 대시보드 (요약 통계)
/admin/users            → 회원 관리
/admin/users/[uid]      → 유저 상세
/admin/stages           → 스테이지 목록
/admin/stages/[id]      → 스테이지 편집
/admin/images           → 이미지 검수 큐
/admin/images/[id]      → 이미지 상세 + 가중치존 편집
/admin/shop             → 상점 아이템 관리
/admin/logs             → 액션 로그
```

## 4. 이미지 검수 프로세스 (제안, 확정 필요)

1. GPT Image 파이프라인 또는 수동 업로드로 `backgroundImages` 문서 생성 (`status: "pending"`)
2. 관리자가 `/admin/images`에서 검수 → 부적절 콘텐츠 여부 육안 확인
3. 승인 시 `status: "approved"`로 변경, 이때부터 스테이지/매치 선택 풀에 노출
4. 반려 시 `status: "rejected"`, 사유 기록

> 초기 단계는 수동 검수만으로 시작하고, 이미지 수가 많아지면 자동 필터링(Vision API 등) 도입을 검토하는 단계적 접근을 제안합니다.

## 5. 열린 질문

- 관리자 역할 세분화 필요 여부 (예: 콘텐츠 관리자 vs 슈퍼 관리자) — 초기엔 단일 `admin` role로 충분할 것으로 보임
- 자동 이미지 검수(콘텐츠 필터링 API) 도입 시점
