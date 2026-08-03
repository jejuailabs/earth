# 프로젝트 오케스트레이터 — 영토 점령 웹게임 (Paper.io 스타일)

이 문서는 전체 프로젝트의 진입점입니다. Claude Code로 개발을 시작할 때 이 문서를 먼저 읽고, 아래 순서대로 `docs/` 폴더의 문서를 참고하며 작업하세요.

## 0. 문서 구조

| 파일 | 내용 |
|---|---|
| `ORCHESTRATOR.md` (본 문서) | 전체 개요, 기술 스택, 개발 순서, 미결정 사항 요약 |
| `docs/01-architecture.md` | 시스템 아키텍처 (Vercel + Firebase 구조) |
| `docs/02-auth.md` | Google 로그인 & 권한(역할) 구조 |
| `docs/03-data-model.md` | Firestore 데이터 스키마 |
| `docs/04-game-mechanics.md` | 게임 로직 스펙 (그리드, 조작모드, 봇 AI, 점수/가중치존) |
| `docs/05-realtime-multiplayer.md` | 실시간 멀티플레이 구조 & 매칭 시스템 |
| `docs/06-admin-panel.md` | 어드민 모드 (회원관리, 스테이지/이미지 관리) |
| `docs/07-i18n.md` | 다국어(i18next) 구조 |
| `docs/08-image-pipeline.md` | GPT Image 기반 에셋 생성 파이프라인 |

## 1. 프로젝트 한 줄 요약

Paper.io 스타일의 실시간 영토 점령 웹게임. 솔로(봇전 스테이지)와 멀티(타임어택 영토전) 모드를 제공하며, 배경이미지를 점령할수록 전체 플레이어에게 함께 드러나는 **"공동 리빌"** 시스템, 레벨업/상점 시스템, 조작모드 선택(자동전진/수동조작)을 갖춘다.

> 게임 기획 상세 배경은 이전 기획 논의(별도 기획안 문서)를 기반으로 합니다. 본 문서 세트는 그 기획을 **개발 착수 가능한 기술 스펙**으로 옮긴 것입니다.

## 2. 기술 스택 확정 사항

| 영역 | 선택 |
|---|---|
| 프론트엔드 호스팅 | Vercel |
| 백엔드/DB/인증/스토리지 | Firebase (Firestore, Firebase Auth, Firebase Storage) |
| 로그인 | Google 로그인 (Firebase Auth Google Provider) |
| 다국어 | i18next (react-i18next) |
| 이미지 에셋 생성 | GPT Image API, quality=low 옵션 |
| 개발 도구 | Claude Code |

## 3. 아키텍처상 중요 주의사항 — 확실하지 않음, 착수 전 결정 필요

Vercel의 서버리스 함수는 장시간 유지되는 WebSocket 연결에 최적화되어 있지 않습니다. 실시간 멀티플레이(초당 다수 회 상태 동기화)를 Vercel 단독 서버리스 함수로 구현하는 것은 구조적으로 어렵습니다. 세 가지 대안이 있으며, 이 문서 세트에서는 **대안 A를 기본 제안값**으로 삼되 최종 확정은 하지 않았습니다.

- **(A, 제안)** 별도의 상시 구동형 실시간 게임 서버를 Fly.io / Railway 등에 배포하고, Vercel은 정적 프론트엔드 + REST API(인증 연동, 상점, 관리자 기능)만 담당
- **(B)** Firebase Realtime Database의 실시간 리스너로 상태 동기화 — 구현은 단순하지만 초당 다수 회 동기화가 필요한 경쟁형 매치에는 지연시간 이슈가 있을 수 있음 (캐주얼 매치엔 시도해볼 만함)
- **(C)** Vercel Edge Functions의 실험적 WebSocket 지원 활용 — 제약이 많아 비권장

자세한 내용은 `docs/01-architecture.md`, `docs/05-realtime-multiplayer.md`를 참고하세요.

## 4. 개발 순서 제안 (Claude Code 작업 순서)

1. 프로젝트 스캐폴딩 (Next.js + Vercel 배포 파이프라인 연결)
2. Firebase 프로젝트 연결 (Auth, Firestore, Storage)
3. Google 로그인 구현 — `docs/02-auth.md`
4. 데이터 모델 구축 — `docs/03-data-model.md`
5. 솔로 봇전 MVP (그리드/점령/봇 AI) — `docs/04-game-mechanics.md`
6. 어드민 패널 기본 골격 (회원관리, 스테이지 CRUD) — `docs/06-admin-panel.md`
7. i18n 셋업 — `docs/07-i18n.md`
8. 실시간 멀티플레이 (아키텍처 대안 확정 후 착수) — `docs/05-realtime-multiplayer.md`
9. 이미지 생성 파이프라인 연동 — `docs/08-image-pipeline.md`
10. 레벨업/상점 시스템, 공동 리빌 시스템 연동 (4~9단계 완료 후)

## 5. 아직 결정되지 않은 사항 (개발 중 별도 확정 필요)

- 실시간 서버 호스팅 방식 최종 확정 (3번 항목 참고)
- 랭크전 조작모드(자동전진/수동조작) 통일 여부 또는 별도 리그 분리 여부
- 수익 모델(광고/인앱결제) 및 이에 따른 재화 밸런스
- 정확한 수치값 — 제한시간, 가중치 배율, 부활 조건, 그리드 셀 크기, 서버 틱레이트 등은 본 문서 세트에서 **제안값**으로 표기했으며, 실제 값은 플레이테스트 후 확정 필요
- 관리자 업로드 이미지의 검수 프로세스(자동 필터링 vs 수동 검수) 구체화

## 6. 문서 읽는 법 (Claude Code 참고)

각 `docs/` 문서는 독립적으로 읽어도 이해되도록 작성했지만, 서로 참조 관계가 있습니다. 구현 중 막히는 부분이 있으면 다른 문서의 관련 섹션을 함께 확인하세요. 모든 수치는 "제안값"이며 하드코딩보다는 설정값(config)으로 분리해 추후 조정이 쉽도록 구현하는 것을 권장합니다.
