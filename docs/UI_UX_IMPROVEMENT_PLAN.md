# Pick-tagon UI/UX 개선 계획

최초 작성: 2026-05-18  
기준 커밋: 767ed83  
조사 범위: Home / Pick(matchups) / Profile / Rankings 화면  
방향: 기존 UFC/다크/샤프한 톤 유지 + 사용성/가독성 개선

---

## 1. 조사 요약 — 화면별 문제/개선 후보

### 1-1. Home (`#home`)

| 항목 | 현재 상태 | 문제점 |
|------|-----------|--------|
| Hero face-off 이미지 | `background:linear-gradient(...)` 플레이스홀더 — `hero-red-img` / `hero-blue-img` | `fetchUpcomingMatchups()` 이후 DB의 `imgUrl`이 있어도 hero 카드에 반영 안 됨 |
| Ticker tape | 하드코딩 6줄 (UFC 327, 페레이라, 두 플레시 등) | DB 이벤트와 무관한 stale 문구 — 오해 유발 |
| Hero stats 레이블 | `text-[10px]` `text-gray-500` | 모바일에서 Total Fights / Your Picks / Points 레이블 가독성 낮음 |
| Latest News 섹션 | `renderHomeNews()` 동적 렌더 | 콘텐츠 없으면 빈 공간 — 빈 상태 표시 없음 |
| Hero event label | 고정 `"NEXT EVENT"` 텍스트 | 이벤트명/날짜가 카운트다운 위젯에만 있고 이벤트 제목이 hero에 별도 렌더 안 됨 |

### 1-2. Pick (`#matchups`)

| 항목 | 현재 상태 | 문제점 |
|------|-----------|--------|
| 픽 완료 상태 표시 | 두 버튼 모두 `opacity-40 cursor-not-allowed` | "어떤 파이터를 픽했는지" 카드에서 전혀 표시 안 됨 — 내가 왼쪽을 골랐는지 오른쪽을 골랐는지 카드만 봐서는 모름 |
| 픽 슬립 이후 확인 | 바텀 시트 닫히고 끝 | 카드 위에 "★ F1 픽 완료 · 정산 대기" 배지/하이라이트 없음 |
| Strip Row 태그/체급 | `hidden sm:flex` | 모바일(< sm)에서 Tag와 Division 레이블 완전 숨김 |
| Strip Row 픽 % | `text-[8px]` | 작은 화면에서 커뮤니티 픽 비율 가독성 낮음 |
| Strip Row live-total | `class="hidden"` | 픽 참여 수가 strip에서 전혀 보이지 않음 |
| Hero 카드 픽 완료 후 | settled badge는 있지만 pending 표시 없음 | 정산 전 내 선택이 카드에 시각적으로 드러나지 않음 |

### 1-3. Profile (`#profile`)

| 항목 | 현재 상태 | 문제점 |
|------|-----------|--------|
| 섹션 헤더 | `border-l-4` | Home/Rankings의 `border-l-8 lg:border-l-[12px]`와 불일치 |
| 신규 유저 빈 상태 | 리포트 그리드 "0회 / — / 0P / 0회" 표시 | 숫자 0만 나열되어 "아무것도 없음" 느낌 — 온보딩 CTA 없음 |
| Analyst Type 위치 | 리포트 그리드 하단 `profile-analyst-type` | 아이덴티티 카드와 멀리 떨어져 있어 사용자가 자신의 유형을 인지하기 어려움 |
| 아바타 | 고정 ⚡ 이모지 | 개성 없음 — 벨트 색상/닉네임 이니셜 기반 시각화 가능 |
| Profile 통계 레이블 | "NET WIN 포인트" | 잔액(Balance)과의 관계가 불명확 — 서브 텍스트에서 `잔액 ${points}P` 표기 있지만 연결 약함 |
| 체급별 통계 fallback | state 기반 (현재 이벤트만) | RPC 로드 전까지 전체 이력 보이지 않음 — 로딩 표시 없음 |

### 1-4. Rankings (`#rankings`)

| 항목 | 현재 상태 | 문제점 |
|------|-----------|--------|
| My Rank Card — Accuracy | `hidden lg:block` | 모바일에서 완전 숨김 — 핵심 지표가 PC 전용 |
| 리더보드 Accuracy 컬럼 | `hidden lg:block` | 모바일에서 Points만 보이고 Accuracy 없음 |
| Belt Legend 텍스트 | `text-[8px]` | 5칸 그리드에 8px 텍스트 — 특히 "0–1,000P" 범위 텍스트 모바일에서 거의 안 보임 |
| 리더보드 행 — 팩션 | 없음 | 닉네임 아래에 팩션 배지가 없어 집단 랭킹 탭과 개인 랭킹 탭이 연결감 없음 |
| My Rank Card — faction | `getFactionBadge` 렌더됨 | 팩션 미설정 유저는 빈 공간 — 팩션 가입 유도 문구 없음 |
| HOF 빈 상태 | `🏆 아직 완료된 시즌이 없습니다` | 괜찮음 — 현재 시즌 진행 중 안내 추가 가능 |

---

## 2. 우선순위 정리

### Priority A — 바로 구현 가능 + 체감 효과 큼

| ID | 화면 | 내용 | 난이도 |
|----|------|------|--------|
| A-1 | Pick | 픽 완료 후 카드에 "내가 선택한 파이터" 시각 표시 (배지/하이라이트) | 낮음 |
| A-2 | Rankings | My Rank Card Accuracy `hidden lg:block` → 모바일에도 표시 | 낮음 |
| A-3 | Rankings | 리더보드 Accuracy 컬럼 모바일 표시 (col-span 재조정) | 낮음 |
| A-4 | Home | Ticker tape → DB 이벤트 정보 기반 동적 생성 (`event-name`, `matchups` 정보) | 중간 |

### Priority B — 체감 중간, 구현 가능

| ID | 화면 | 내용 | 난이도 |
|----|------|------|--------|
| B-1 | Profile | 섹션 헤더 border 통일 (`border-l-8 lg:border-l-[12px]`) | 낮음 |
| B-2 | Profile | 신규 유저 (픽 0회) 빈 상태 → CTA 카드 ("첫 픽 등록하기 →") 표시 | 낮음 |
| B-3 | Pick | Strip Row 모바일에서 Tag/Division 작은 크기로 표시 (`hidden sm:flex` → `flex`) | 낮음 |
| B-4 | Home | Hero face-off 이미지 — `_dbMatchups` 로드 후 main event imgUrl로 `hero-red-img`/`hero-blue-img` 배경 갱신 | 중간 |
| B-5 | Profile | Analyst Type을 아이덴티티 카드 하단 또는 4칸 지표 바로 위로 이동 | 낮음 |

### Priority C — 완성도/세부 개선

| ID | 화면 | 내용 | 난이도 |
|----|------|------|--------|
| C-1 | Rankings | Belt Legend 텍스트 `text-[8px]` → `text-[9px]` (범위 텍스트 가독성) | 낮음 |
| C-2 | Rankings | 리더보드 행에 팩션 이모지 표시 (닉네임 옆) | 낮음 |
| C-3 | Profile | 아바타 → 벨트 색상 기반 이니셜 원형 (Belt 색상 배경 + 2글자) | 낮음 |
| C-4 | Pick | 이벤트 리더보드 컬럼 — "픽수" → "W-L" 표시로 변경 | 낮음 |
| C-5 | Profile | 체급/방식 통계 RPC 로딩 전 skeleton 표시 | 중간 |

---

## 3. 1차 작업 추천 (바로 착수 가능)

**배치 1 — `fights-render.js` + `index.html` (픽 완료 표시, Strip Row, 리더보드)**

**A-1: 픽 완료 후 카드 내 "내 선택" 표시**  
`updateAllFightCards()` (fights-render.js:422)에서 `pending` 상태일 때  
현재: 버튼만 dim  
개선: `card-${fight.id}` 내에 파이터명 + "픽 완료" 표시 배지 렌더  
- 상단 `card-header`에 `<span>★ ${pickedFighterName} 픽 · 정산 대기</span>` 추가  
- `state.pendings[fightId].side`(`'left'` / `'right'`) + fight 데이터로 파이터명 추출

**A-2/A-3: Rankings 모바일 Accuracy 복원**  
- `index.html:1138`: My Rank Card `hidden lg:block` 제거, 크기 `text-sm lg:text-3xl`로 조정  
- `index.html:1165`: 리더보드 헤더 Accuracy col `hidden lg:block` 제거  
- `renderLeaderboardList` (index.html:3536): `hidden lg:block` 제거, col-span 재배분 필요
  - 현재: # 1 / Fighter 5 / Points 3 / Accuracy 2(hidden) / Belt 1 = 12
  - 개선: # 1 / Fighter 4 / Points 2 / Accuracy 2 / Belt 1 (모바일 작은 숫자) = 10 → 공백 2 허용 또는 다른 재배분

**B-3: Strip Row 모바일 Tag/Division 표시**  
`fights-render.js:229`: `hidden sm:flex` → `flex`  
단, 텍스트 크기 더 축소 필요 (`text-[7px]` 유지 또는 `text-[6px]`)

---

## 4. 기술 제약 및 톤 가이드

- Oswald Italic / Barlow 폰트 유지
- ufcRed (`#d20a0a`) / ufcBlue (`#2563eb`) 색상 체계 유지  
- `glass-card` / `rounded-[2rem]` 카드 스타일 유지
- 기존 grid-cols 체계 (12-col) 기준으로 col-span 수정
- 신규 API/RPC 추가 없이 기존 `state`, `_rpcStats`, `getActiveFights()` 활용
- Ticker tape 동적화 시 `fetchUpcomingMatchups` 이후 콜백에서 생성 (DB 의존)

---

## 5. 이력

| 날짜 | 내용 |
|------|------|
| 2026-05-18 | 초안 작성 — Home/Pick/Profile/Rankings 전 화면 코드 레벨 조사 완료 |
