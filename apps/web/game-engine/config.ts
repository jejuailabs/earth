// 게임 수치 설정 — 모든 값은 docs 문서 세트의 "제안값"이며 플레이테스트 후 조정 대상.
// 하드코딩 금지 원칙(ORCHESTRATOR.md 6장)에 따라 여기로 분리.

export const GAME_CONFIG = {
  // 그리드 (docs/04 §1)
  // 격자 크기는 스테이지의 fieldSize(소/중/대) + 배경이미지 비율로 결정된다 (types.ts)
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

  // 파워업 — 스피드 부스트 (docs/04 §7, 캐주얼 모드 한정)
  // 맵 곳곳에 주기적으로 떨어지고, 밟으면 일정 시간 이동속도가 오른다.
  powerup: {
    spawnIntervalSec: 9, // 이 간격마다 하나씩 떨어진다
    firstSpawnSec: 4, // 첫 드롭까지
    maxOnField: 5, // 동시에 필드에 존재하는 최대 개수
    lifetimeSec: 22, // 줍지 않으면 사라진다
    speedMultiplier: 1.7,
    durationSec: 4,
    pickupRadius: 1, // 이 칸 이내로 지나가면 획득 (셀 단위 맨해튼)
    botSeekRadius: 12, // 봇이 이 거리 안의 아이템을 주우러 간다
    // 맵이 넓으면 완전 무작위 드롭은 플레이어가 평생 못 만난다.
    // 일부는 플레이어 주변에 떨어뜨려 실제로 주울 수 있게 한다.
    nearPlayerChance: 0.55,
    nearPlayerRadius: 26,
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
