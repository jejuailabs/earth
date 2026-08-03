# Game Earth — 영토 점령 웹게임

Paper.io 스타일 실시간 영토 점령 웹게임. 전체 기획/기술 스펙은 [ORCHESTRATOR.md](ORCHESTRATOR.md)와 `docs/` 참고.

## 구조 (모노레포)

- `apps/web` — Next.js 프론트엔드 (Vercel 배포 대상). 게임 엔진은 `apps/web/game-engine/`
- `apps/realtime-server` — 실시간 멀티플레이 서버 골격 (호스팅 방식 확정 후 본격 구현)

## 실행

```bash
npm install
npm run dev        # web (http://localhost:3000)
npm run dev:realtime  # 실시간 서버 골격 (ws://localhost:8080)
```

## 현재 상태

- ✅ 솔로 봇전 MVP: 그리드/궤적/flood-fill 점령, 봇 AI Lv.1~3, 공동 리빌, 가중치 존, 스테이지 5종
- ⬜ Google 로그인 (Firebase 프로젝트 연결 필요 — docs/02)
- ⬜ Firestore 데이터 모델 연동 (docs/03)
- ⬜ 어드민 패널 (docs/06)
- ⬜ i18n (docs/07)
- ⬜ 실시간 멀티플레이 (아키텍처 확정 필요 — docs/05)
- ⬜ GPT Image 파이프라인 (docs/08)
