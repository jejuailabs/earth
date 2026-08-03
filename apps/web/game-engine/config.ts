// 게임 수치 설정 — 모든 값은 docs 문서 세트의 "제안값"이며 플레이테스트 후 조정 대상.
// 하드코딩 금지 원칙(ORCHESTRATOR.md 6장)에 따라 여기로 분리.

export const GAME_CONFIG = {
  // 그리드 (docs/04 §1)
  mapSize: 100, // N×N 셀
  cellPx: 10, // 렌더링 시 셀 1개의 픽셀 크기 (100셀 × 10px = 1000px 캔버스)

  // 로직 틱 (docs/04 §9 — 권장 20~30Hz)
  tickRate: 20,

  // 이동 속도 (cells/sec)
  playerSpeed: 7,
  botSpeed: 6.2,

  // 탈락/부활 (docs/04 §3)
  respawnDelaySec: 5,
  respawnKeepRatio: 0.5, // 부활 시 기존 영토 보존 비율 (50% 몰수)
  botRespawnDelaySec: 4,

  // 스폰
  spawnBlockSize: 5, // 스폰 시 부여되는 초기 영토 한 변
  spawnEdgeMargin: 8, // 맵 가장자리로부터 최소 거리
  spawnClearance: 7, // 스폰 지점 주변에 비어 있어야 하는 영역 한 변

  // 봇 AI (docs/04 §6)
  bot: {
    excursionMin: 6, // 영역 밖 원정 최소 길이(셀)
    excursionMax: 16,
    exitChance: 0.5, // 자기 영역 안에 있을 때 원정을 시작할 확률(경계 결정마다)
    turnChance: 0.15, // 원정 중 방향 전환 확률
    chaseRadius: 22, // Lv2+: 궤적 추적을 시작하는 탐지 반경
    chaseMargin: 2, // 추적 성립 판정 여유값
    lookaheadCells: 6, // Lv3: 확장 경로 예측 셀 수
    threatRadius: 6, // 자기 궤적에 적이 이 거리 안이면 귀환
  },

  // 점수 (docs/04 §4) — 셀 1개 점령 = 기본 1점 × 가중치 존 배율
  pointsPerCell: 1,

  // 별점 (docs/04 §8 — 세부 배점 공식은 열린 질문, 아래는 임시 공식)
  stars: {
    noDeathBonus: true, // 무사망 시 +1
    areaOverachieveRatio: 1.5, // 목표의 1.5배 점령 시 +1 (areaPercent 스테이지)
    surviveKillsFor3Stars: 2, // 생존 스테이지에서 킬 N 이상 시 +1
  },
} as const;
