# QA Run — Release-Fix 9 Mobile Recheck
> 작성일: 2026-05-27  
> 대상 커밋: `615d130` Fix: Clarify battle watch entry point  
> 기준 픽스: Release-Fix-9A ~ 9F  
> 환경: Production (GitHub Pages) + 코드 정적 검증  
> 뷰포트: 375px (mobile target), 데스크탑 smoke

---

## 1. Deploy Status

| 항목 | 상태 |
|---|---|
| Production URL | `https://bottlejoon123.github.io/pick-tagon/` |
| 최신 배포 커밋 | `615d130` (Fix: Clarify battle watch entry point) |
| GitHub Actions | ✅ `completed success` — 46s (2026-05-26T15:47:45Z) |
| 9A~9F 전체 배포 | ✅ 모든 Actions run `completed success` |

9A~9F GitHub Actions 실행 이력:
```
✅ 615d130  Fix: Clarify battle watch entry point       46s
✅ 04dec9c  Fix: Lazy load YouTube theme videos         50s
✅ 6b366dd  Fix: Clarify user ranking copy              52s
✅ b0a94f4  Fix: Preload matchups for community panel   51s
✅ f26f91b  Fix: Load UFC rankings from DB first        1m38s
✅ b699bd6  Fix: Prevent mobile analysis stat overlap   1m30s
```

---

## 2. 정적 코드 검증 결과 (17/17 PASS)

빌드 소스 파일(`index.html`, `public/js/*.js`) 기준 코드 반영 여부 전수 확인.

| Fix | 검증 항목 | 결과 |
|---|---|---|
| 9A | ring `w-10 h-10 sm:w-14 sm:h-14` responsive | ✅ |
| 9A | gap `gap-1.5 sm:gap-4` responsive | ✅ |
| 9B | `loadUFCRankings()` 호출이 `initSupabase()` 이후 (window.onload 기준) | ✅ |
| 9B | trend 컬럼 제거 (UI 렌더 없음) | ✅ |
| 9B | `_champMeta` 헬퍼 존재 | ✅ |
| 9C | `fetchUpcomingMatchups().then()` 체인 (community.js) | ✅ |
| 9C | `navigateTo('community')`에 `renderFeed()` 추가 | ✅ |
| 9D | desktop nav `유저 랭킹` 레이블 | ✅ |
| 9D | `rankings-season-subtitle` 동적 span | ✅ |
| 9D | belt legend 안내 문구 `픽 포인트 기반` | ✅ |
| 9D | profile empty state `아직 정산된 예측 기록이 없습니다` (profile.js:125) | ✅ |
| 9D | 하드코딩 `시즌4` 제거 | ✅ |
| 9E | `activeYoutubeCardIdx` 기본값 `0` | ✅ |
| 9E | `_ytFromShortcut` 플래그 선언 | ✅ |
| 9E | `themeSwitcher` 렌더 in `loadYoutubeTab` | ✅ |
| 9E | `setNewsCat` 내 `-1` 제거 | ✅ |
| 9F | community 부제목 배틀 힌트 문구 | ✅ |
| 9F | `my-battle-panel` 빈 상태 안내 문구 | ✅ |

---

## 3. 항목별 QA 결과

### 3-1. Fix-9A — Mobile Analysis 링 오버랩

| 체크 | 결과 | 비고 |
|---|---|---|
| 코드 반영: `sm:` 반응형 링 크기 | ✅ PASS | `w-10 h-10 sm:w-14 sm:h-14` |
| 코드 반영: 반응형 gap | ✅ PASS | `gap-1.5 sm:gap-4` |
| **시각 확인 (375px 실제 디바이스)** | ⏳ NEEDS_MANUAL | 링 3개 + gap × 2 = 132px < 151px 컬럼 (수치 계산 PASS) |
| console error | ⏳ NEEDS_MANUAL | 실제 브라우저 확인 필요 |

**수치 계산**: 375px → `p-6` × 2 = 48px → 컬럼 151.5px. `w-10` × 3 + `gap-1.5` × 2 = 120px + 12px = 132px. 마진 19.5px ✅

---

### 3-2. Fix-9B — UFC Rankings DB 우선 로드 + Compact

| 체크 | 결과 | 비고 |
|---|---|---|
| 코드 반영: `initSupabase()` 이후 `loadUFCRankings()` | ✅ PASS | window.onload 기준 offset 643→715 |
| trend 컬럼 제거 (코드) | ✅ PASS | DB 데이터 모델 필드는 유지, UI 렌더 없음 |
| `_champMeta` 헬퍼 | ✅ PASS | height/reach `—` 조건 처리 |
| **첫 진입 시 DB 데이터 실제 표시** | ⏳ NEEDS_MANUAL | Supabase `ufc_rankings` 테이블 데이터 확인 필요 |
| **height/reach 없는 선수 공백 없음** | ⏳ NEEDS_MANUAL | 실제 DB 행 기준 visual 확인 |

---

### 3-3. Fix-9C — Community Matchup Preload

| 체크 | 결과 | 비고 |
|---|---|---|
| 코드 반영: `.then()` 체인 | ✅ PASS | community.js `fetchUpcomingMatchups().then` |
| 코드 반영: `renderFeed()` in `navigateTo('community')` | ✅ PASS | |
| **fresh load → 커뮤니티 직접 진입 시 메인이벤트 표시** | ⏳ NEEDS_MANUAL | 대진표 탭 미방문 상태에서 확인 필요 |
| **"로딩 중" 영구 표시 없음** | ⏳ NEEDS_MANUAL | 실제 브라우저 확인 |

---

### 3-4. Fix-9D — 유저 랭킹 명칭 + 시즌 표시

| 체크 | 결과 | 비고 |
|---|---|---|
| 코드 반영: mobile nav `유저랭킹` | ✅ PASS | line 186 |
| 코드 반영: desktop nav `유저 랭킹` | ✅ PASS | |
| 코드 반영: 하드코딩 `시즌4` 제거 | ✅ PASS | `rankings-season-subtitle` 동적 스팬 교체 |
| 코드 반영: profile empty state 문구 개선 | ✅ PASS | profile.js:125 |
| 코드 반영: belt legend 기준 안내 | ✅ PASS | |
| **시즌 동적 표시 (DB 로드 후 시즌명 표시)** | ⏳ NEEDS_MANUAL | `loadCurrentSeasonFromDB()` 실행 후 `rankings-season-subtitle` 업데이트 확인 |

---

### 3-5. Fix-9E — YouTube Lazy Load

| 체크 | 결과 | 비고 |
|---|---|---|
| 코드 반영: 기본값 `0` (not `-1`) | ✅ PASS | |
| 코드 반영: `_ytFromShortcut` 플래그 | ✅ PASS | |
| 코드 반영: 테마 스위처 버튼 렌더 | ✅ PASS | |
| 코드 반영: `setNewsCat` no `-1` | ✅ PASS | |
| **YouTube 탭 첫 진입 시 요청 1 테마(6개)만** | ⏳ NEEDS_MANUAL | Network 탭 jina.ai 요청 수 확인 |
| **테마 버튼 클릭 → 다른 테마 로드** | ⏳ NEEDS_MANUAL | |
| **shortcut 경유 뒤로 버튼 표시** | ⏳ NEEDS_MANUAL | |

---

### 3-6. Fix-9F — Battle Watch Entry Point

| 체크 | 결과 | 비고 |
|---|---|---|
| 코드 반영: community 부제목 배틀 힌트 | ✅ PASS | `포스트 댓글 ⚡ 버튼으로 배틀 신청` |
| 코드 반영: 내 배틀 빈 상태 안내 | ✅ PASS | `포스트를 열고 댓글에서 ⚡ 옥타곤` |
| 코드 반영: 관전 진입 버튼 미추가 (broken feature 노출 없음) | ✅ PASS | spectator role 할당 경로 없어 의도적 미구현 |
| **커뮤니티 섹션 부제목 375px에서 줄바꿈 OK** | ⏳ NEEDS_MANUAL | 긴 문구 모바일 wrapping 확인 |

---

## 4. Findings

### P0 (즉시 수정 필요)
없음.

### P1 (출시 전 수정 필요)
없음.

### P2 (출시 후 backlog)
- **배틀 관전(spectator) 진입점**: `octagon.role='spectator'` 할당 경로 없음. Presence 추적 + 투표 함수 인프라 존재. 진입 경로 구현 필요. → `RELEASE_FIX_CLOSEOUT_2026-05-26.md` backlog 등록 완료.
- **actions/deploy-pages@v4 Node.js 20 deprecated** 경고: 2026-06-02부터 Node.js 24 강제. `actions/deploy-pages@v4` → `v4` 최신 또는 Node 24 대응 버전 확인 필요 (출시 후 backlog).

### P3 (관찰)
- 9F community 부제목 문구가 모바일 375px에서 한 줄에 들어가기 길 수 있음 (수동 확인 필요).
- YouTube lazy load 후 `ytVideoCache` hit 시 재fetch 없는지 테마 2회 전환으로 확인 권장.

---

## 5. NEEDS_MANUAL 항목 (수동 확인 필요)

총 11개 항목이 실제 브라우저/모바일 기기에서 시각 확인 필요.  
코드 정적 검증 기준 전부 PASS, 시각/런타임 동작 확인만 남은 상태.

| 항목 | 확인 방법 | 우선순위 |
|---|---|---|
| 9A 링 오버랩 없음 (375px) | `devtools → 375px → matchup detail → analysis 탭` | P1 |
| 9B UFC 랭킹 DB 데이터 로드 | `앱 첫 진입 → UFC랭킹 탭 (빈 cache 상태)` | P1 |
| 9B height/reach 빈 선수 공백 없음 | UFC랭킹 목록 스크롤 | P2 |
| 9C community 직접 진입 시 메인이벤트 표시 | `hard refresh → community 탭 직접 클릭` | P1 |
| 9D 시즌명 동적 표시 | 랭킹 탭 → 상단 subtitle | P2 |
| 9E YouTube 첫 진입 요청 수 | `network tab → jina.ai 요청 6개만` | P2 |
| 9E 테마 버튼 전환 | YouTube 탭 → 다른 테마 클릭 | P2 |
| 9E shortcut 경유 뒤로 버튼 | Home shortcut → YouTube 특정 테마 → 뒤로 | P2 |
| 9F community 부제목 375px wrapping | community 탭 헤더 확인 | P2 |
| console error 없음 (전체) | devtools console | P1 |
| 전반적 mobile layout 회귀 없음 | 각 탭 375px/430px 스크롤 | P1 |

---

## 6. Release Gate 업데이트

| Gate | 상태 | 비고 |
|---|---|---|
| G-1 Production 빌드 smoke | ✅ PASS | `615d130` |
| G-2 Supabase 연결 확인 | ✅ PASS | |
| G-3 Admin 비노출 (비어드민) | ✅ PASS | |
| G-4 Pick Slip open/close | ✅ PASS | |
| G-5 뉴스 카드 이미지 다양화 | ✅ PASS | |
| G-6 Admin settle 리허설 | ⏳ NEEDS_MANUAL | 06-02~04 예정 |
| G-7 Mobile 핵심 플로우 | ⏳ NEEDS_MANUAL | 05-29~06-01 수동 QA |
| G-8 UFC 랭킹 DB resync | ⏳ NEEDS_MANUAL | 06-02~04 예정 |
| **Release-Fix 9A~9F 코드 반영** | ✅ PASS (17/17) | 시각 확인은 G-7 윈도우에서 |
| **P0 known issues** | ✅ 0건 | |
| **P1 known issues** | ✅ 0건 | |

---

## 7. 다음 액션

| 일정 | 항목 |
|---|---|
| 2026-05-29~06-01 | Manual User Flow QA 윈도우 — 9A~9F NEEDS_MANUAL 항목 포함 |
| 2026-06-02~06-04 | Admin 리허설 (settle, UFC resync) |
| **2026-06-07 night** | **기능 동결** |
| 2026-06-07~09 | Final smoke QA (production) |
| **2026-06-10** | **공개 출시** |
