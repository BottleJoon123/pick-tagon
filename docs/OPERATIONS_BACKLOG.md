# Operations Backlog

운영 관점의 중장기 아이디어/제도 백로그. 구현 확정이 아니라 검토용 메모.

---

## Division Steward 제도 (체급별 스탯 보정 보조)

### 목적
체급별 선수 스탯 보정을 운영자 혼자 처리하지 않고, 검증된 유저의 집단 지식으로 보조한다.
(현재 fighters.stats 수동 보정은 운영자 1인이 admin 패널에서 직접 수정 → 확장성·신뢰성 한계)

### 후보 조건 (Steward 선발)
- 블랙벨트 이상 등급
- 시즌별 특정 체급 예측 정확도 Top N
- 최소 픽 수 조건 (표본 부족 방지)
- 최근 시즌 성과 가중치 (오래된 성과는 가중 ↓)

### 권한 단계
1. **1단계** — 선수 스탯 수정 *제안* (반영 아님, 큐에 적재)
2. **2단계** — 해당 체급 담당 Steward 2명 이상 동의 시 *반영 후보* 승격
3. **3단계** — 운영자 *최종 승인* 후 실제 fighters.stats 반영
4. **장기** — 신뢰도 높은 Steward에게 특정 체급 *limited edit* 권한 부여 (안전장치 하에)

### 안전장치
- 모든 변경은 `admin_audit_logs`에 기록 (현행 update_fighter audit 패턴 재사용)
- before/after diff 공개 (투명성)
- 하루 수정 횟수 제한 (rate limit)
- 챔피언 / Top5는 운영자 승인 필수 (Steward 단독 반영 불가)
- 자기 픽 예정 경기에 출전하는 선수는 수정 제한 또는 쿨다운 (이해상충 방지)

### 연관 메모
- 수동 스탯 변경 시 `stats_updated_at`이 갱신되어야 추적 가능
  (2026-06-04 `admin_upsert_fighter`에 stats 변경 감지 → `stats_updated_at` bump 로직 추가 완료).
- Steward 반영 경로도 동일하게 stats 변경 시 `stats_updated_at` 갱신 + audit 기록을 따라야 한다.

---

## Ranked Fighter Pixel Portraits

> 설계 메모만. 이번 단계에서는 이미지 생성/적용/코드 변경 없음. 폴더(`public/fighters/pixel`)도 아직 생성하지 않는다.

### 목적
랭커/챔피언 선수의 공유카드와 프로필에 Pick-tagon 고유 16-bit 캐릭터 자산을 사용한다.
(외부 사진 의존을 줄이고 브랜드 일관성·저작권 안전성 확보)

### 경로 규칙
- `public/fighters/pixel/{fighter_id}.png`
- `{fighter_id}`는 `fighters.id` 기준 (예: `ilia-topuria` → `public/fighters/pixel/ilia-topuria.png`)

### 대상 우선순위
1. Champion
2. Top5
3. Top10
4. Top15
5. 공유 빈도 높은 스타 선수

### 이미지 규격
- 1024×1024 PNG 권장
- 배경: 검은색 또는 `#08090b` 계열
- 16-bit / pixel-art fighter portrait
- 상반신 중심 구도
- 투명 배경은 보류 — 우선 검은 배경으로 통일

### 금지 / 주의
- UFC 로고, 공식 장갑 로고, 브랜드 상표 직접 사용 금지
- 실제 사진을 그대로 변환한 듯한 저작권 위험 이미지 지양
- 선수 특징은 반영하되 Pick-tagon 자체 스타일로 재해석

### fallback 정책
- pixel 이미지가 있으면 우선 사용
- 없으면 기존 `fighter.image_url` 사용

### 적용 우선순위
1. fighter share card
2. fighter profile modal
3. H2H compare
4. match card — 추후 검토

### 향후 구현 메모
- `getFighterPixelImage(fighter)` 헬퍼 검토 (pixel 경로 → 있으면 반환, 없으면 image_url fallback)
- 이미지 존재 여부를 런타임 fetch로 매번 체크하지 말 것 → manifest/json 또는 DB flag 방식 검토
  - 예: `public/fighters/pixel/manifest.json` (id 목록) 또는 `fighters.pixel_image_path` 컬럼
- 빌드/배포 시 자산이 dist에 포함되는지(public 정적 경로) 확인 필요

### 1차 샘플 대상 10명
검수용 첫 배치. 파일명은 `fighters.id` 기준 (`public/fighters/pixel/{id}.png`).

1. `alexander-volkanovski`
2. `ilia-topuria`
3. `charles-oliveira`
4. `islam-makhachev`
5. `sean-omalley`
6. `alex-pereira`
7. `max-holloway`
8. `tom-aspinall`
9. `zhang-weili`
10. `valentina-shevchenko`

> 참고: 실제 `fighters.id` 표기(예: Zhang Weili = `weili-zhang`)와 다를 수 있으니, asset intake 시 DB의 `fighters.id`로 최종 확인 후 파일명을 맞춘다.

### Intake checklist (repo 반영 전)
- [ ] 파일명이 `fighters.id`와 정확히 일치
- [ ] 1024×1024 PNG
- [ ] 배경이 검은색 또는 `#08090b` 계열
- [ ] 상반신 중심 구도
- [ ] 16-bit / pixel-art 스타일
- [ ] no text / no UFC logo / no brand logo / no sponsor logo / no watermark
- [ ] 작은 카드 크기(공유카드 썸네일)에서도 얼굴/실루엣 식별 가능
- [ ] repo에 넣기 전 로컬 inbox(예: 미추적 임시 폴더)에서 1차 검수 완료

### Reject 기준 (하나라도 해당 시 반려)
- 공식 UFC / 브랜드 / 스폰서 로고가 보임
- 실사 사진을 단순 필터 처리한 느낌 (저작권 위험)
- 배경이 너무 밝거나 색상이 제각각 (검은 배경 통일 위반)
- 선수 특징이 거의 없음 (누군지 식별 불가)
- 얼굴 / 손 / 글러브가 심하게 깨짐
- 공유카드 크기에서 식별 불가

### Manifest 방식 제안
초기 구현은 DB 컬럼보다 `public/fighters/pixel/manifest.json`을 추천.

```json
{
  "alexander-volkanovski": "/fighters/pixel/alexander-volkanovski.png"
}
```

- **장점**: DB migration 없이 빠르게 적용 가능, asset 존재 여부를 명시적으로 관리 (런타임 fetch 404 체크 불필요)
- **단점**: 이미지 추가/삭제 시 manifest를 수동 갱신해야 함
- **추후**: asset 운영이 안정화되면 `fighters.pixel_image_path` 컬럼으로 이관 검토

### Asset size policy
- 1차 샘플은 PNG 1024×1024로 시작.
- 다음 batch부터 목표 용량: **1장당 1MB 이하 권장**, 가능하면 500KB~1MB.
- 1024 PNG가 1.5MB 이상이면 압축 또는 **WebP 후보** 검토.
- repo에 대량 누적 전 **Supabase Storage / R2** 등 외부 asset storage 검토.
- WebP 전환 시 canvas/share-card 로딩 QA 필수 (same-origin·디코딩·toBlob taint 확인).
- 원본 고해상도 파일은 repo 밖 inbox/archive에 보관, repo에는 **서비스용 최적화본만** 커밋.

### 구현 순서 (도입 시)
1. 1차 샘플 10장 검수 (Intake checklist + Reject 기준)
2. `public/fighters/pixel/` 폴더 추가
3. `manifest.json` 추가
4. `getFighterPixelImage(fighter)` 헬퍼 추가 (manifest 조회 → 있으면 pixel 경로, 없으면 `image_url` fallback)
5. fighter share card에서 우선 사용
6. profile modal / H2H compare는 다음 단계, match card는 추후 검토

---

## PWA App Icon — 캐시 한계 & maskable 정책

> 2026-06-06 정리. 코드/매니페스트는 이미 옥타곤(검정 배경 + 빨간 8각형 + 흰 체크) v2 아이콘을 정확히 가리킴.

### 옛 아이콘이 보이는 원인
- 일부 기기에서 보이는 **옛 "빨간 둥근 사각형 체크"** 아이콘은 레포/매니페스트에 **존재하지 않음**.
- 그 디자인이 쓰이던 **과거 설치 시점에 OS 홈화면이 캡처한 아이콘 캐시**가 남은 것 → **OS 홈스크린 캐시 문제(코드 문제 아님)**.
- 파일명 `-v2` 리네임은 **브라우저 HTTP 캐시**만 무효화할 뿐, **OS 홈화면 아이콘 캐시는 건드리지 못함**(설치 시점에 굳고 재설치 전에는 거의 안 바뀜).

### 코드로 강제 갱신 불가
- OS 홈화면 아이콘 refresh를 트리거하는 **웹 표준 API는 없음**. 매니페스트/링크가 최신이어도 기존 설치 아이콘은 자동 교체되지 않음.

### 기존 설치자 조치 (운영 안내용)
1. 홈화면에서 **기존 아이콘 삭제(앱 제거)**
2. 브라우저로 pick-tagon.com **재방문**
3. **"홈 화면에 추가"로 재설치**
- 보조: 브라우저 사이트 데이터/캐시 삭제 후 재추가.

### 신규 설치자
- 현재 `manifest.webmanifest`의 **v2 아이콘(192/512)** 을 처음부터 정상 수신. 라이브 서빙 200 확인 완료.

### maskable 정책 (이번 정리 반영)
- 현재 v2 아이콘은 옥타곤이 가장자리까지 차 있어 **Android adaptive 마스크(maskable)로 크롭하면 모서리가 잘릴 위험**이 있음.
- 이에 매니페스트 아이콘 `purpose`를 **`"any maskable"` → `"any"`** 로 정정(일반 app icon 용도로만 사용).
- **maskable 전용 패딩 아이콘**(콘텐츠를 세이프존 중앙 ~80%, 약 410² 안쪽에 배치한 512²)은 **후속 자산 작업으로 보류**. 준비되면 `purpose:"maskable"` 별도 엔트리로 추가.

### 후속(보류) 자산 작업
- maskable 패딩 512² 1장 추가 → manifest에 `any`/`maskable` 2종 분리.
- (선택) 아이콘 세트 `-v3` 리네임 + head/manifest 동기로 신규/일부 기기 갱신 가속.
- iOS 커스텀 스플래시(`apple-touch-startup-image` 기기별 세트)는 ROI 재평가 후 결정.
