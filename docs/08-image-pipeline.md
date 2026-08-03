# 08. GPT Image 기반 에셋 생성 파이프라인

## 1. 목적

배경이미지(테마 이미지) 및 일부 UI/스킨 에셋을 GPT Image API로 생성해, 관리자가 수동으로 이미지를 준비하는 부담을 줄인다.

## 2. 생성 설정

- 모델/옵션: GPT Image, **quality=low** 옵션 사용 (개발/초기 단계 비용 절감 목적)
- 생성된 이미지는 즉시 게임에 노출되지 않고, `backgroundImages` 문서에 `status: "pending"`으로 저장 후 관리자 검수를 거침 (docs/06-admin-panel.md 4장 참고)

## 3. 파이프라인 흐름

```
1. 관리자가 /admin/images에서 "AI 이미지 생성" 요청
   - 테마(theme) 선택 (예: world-map, space, underwater, city 등)
   - 프롬프트 직접 입력 또는 테마별 사전 정의 템플릿 사용
2. 서버 API Route(/api/admin/generate-image)가 GPT Image API 호출 (quality: low)
3. 생성된 이미지를 Firebase Storage에 업로드
4. backgroundImages 문서 생성 (status: pending, generatedBy: "gpt-image")
5. 관리자가 가중치 존(valueZones) 좌표를 지정 (랜드마크/보석/이벤트 존 위치 태깅)
6. 검수 승인 시 status: approved → 스테이지/매치에서 사용 가능
```

## 4. 프롬프트 템플릿 (제안 예시)

```
theme: world-map
prompt: "미니멀한 스타일의 세계지도 일러스트, 밝은 파스텔 톤, 게임 배경용, 텍스트 없음"

theme: space
prompt: "우주를 배경으로 한 행성과 별자리 일러스트, 게임 배경용, 텍스트 없음"

theme: underwater
prompt: "해저 세계 일러스트, 산호와 물고기, 게임 배경용, 텍스트 없음"
```

- "텍스트 없음", "저작권 있는 캐릭터/브랜드 요소 배제" 등의 안전 가이드를 프롬프트에 기본 포함해 생성 품질/안전성을 확보

## 5. 저장 규칙

- Firebase Storage 경로 제안: `background-images/{imageId}.png`
- 파일명은 `imageId`(UUID)로 관리, 원본 프롬프트/테마는 Firestore 문서에 별도 기록 (재생성/추적 용이)

## 6. 콘텐츠 안전 및 검수

- GPT Image API 자체의 콘텐츠 정책을 1차 필터로 신뢰하되, **관리자 육안 검수를 최종 게이트로 유지** (docs/06-admin-panel.md 4장 참고)
- 부적절하거나 게임 톤에 맞지 않는 이미지는 반려 후 재생성 요청

## 7. API 사용량 관리 (제안, 확정 필요)

- 무분별한 생성 요청 방지를 위해 관리자별/일별 생성 횟수 제한 고려
- 비용 모니터링을 위한 생성 로그 기록 (`admin/logs`에 `action: "image_generated"`로 기록 권장)

## 8. 열린 질문

- quality=low 이미지의 실제 해상도가 게임 배경으로 충분한지 초기 테스트 필요 (부족하면 업스케일링 후처리 검토)
- 생성 비용 예산 및 월별 상한선
- 스킨/아이콘 등 다른 에셋 종류까지 이 파이프라인을 확장할지 여부
