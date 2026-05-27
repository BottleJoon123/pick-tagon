# Release Fix Closeout — 2026-05-26

> 작성일: 2026-05-26  
> 기준 커밋: `f88f447` Style: Tighten matchup card spacing  
> 공개 배포: **2026-06-10**  
> 기능 동결: **2026-06-07 night**

---

## 1. 배경

2026-05-25~26 수동 QA에서 12개 항목 발견.  
6월 10일 출시 기준으로 triage하여 8개 코드 fix + 1개 문서 scan + 2개 문서 계획 완료.  
나머지 항목은 NEEDS_MANUAL 또는 출시 후 backlog로 분류.

---

## 2. 완료된 항목

### Fix 1 — Admin nav 비노출 / 모바일 Archive 탭 노출
**커밋**: `bc5b31a` Fix: Hide admin nav for non-admin users  
**변경 파일**: `index.html`, `public/js/api/supabase.js`  
**내용**: 비어드민 유저에게 Admin 탭이 노출되는 문제 수정. 로그인 상태 변경 시 Admin nav DOM 토글. 모바일 하단 nav Archive 아이콘 표시 수정.

---

### Fix 2 — Signup / Account UX 강화
**커밋**: `d3da88a` Fix: Harden signup account UX  
**변경 파일**: `index.html`  
**내용**: 회원가입 폼 validation 강화 (이메일/비밀번호 형식), 에러 메시지 한국어 명확화, 이미 가입된 계정 처리 UX 개선.

---

### Fix 3 — Matchup 스탯 표시 복원
**커밋**: `dcaf4ce` Fix: Restore matchup stats display  
**변경 파일**: `public/js/api/supabase.js`  
**내용**: `_fs()` helper 추가 — camelCase + snake_case 이중 폴백. `_localFighters` 맵 도입으로 fighter ID 누락 시 인라인 fetch. 스탯 레이더 차트 / 스탯 바에 데이터가 표시되지 않던 문제 해결.

---

### Fix 4 — UFC 랭킹 챔피언 배지 오류 수정
**커밋**: `30be165` Fix: Correct UFC rankings champion badge  
**변경 파일**: `index.html`, `public/js/data/constants.js`  
**내용**: `fetchAndSyncUFCRankings()` 파서 버그 수정 — `######` 헤딩을 무조건 챔피언 확정으로 처리하던 로직을 `/champion/i.test(line)` 조건부로 변경. seed data에서 FW 챔피언 이칸 토픽(잘못) → 볼카노프스키, LW 챔피언 마카체프(잘못) → 일리야 토푸리아로 정정. Aleksandre Topuria에 챔피언 배지(C)가 잘못 표시되던 문제 해결.

---

### Fix 5 — UFC 랭킹 DB 재동기화 리허설 계획
**커밋**: `25d4844` Docs: Add UFC rankings resync rehearsal plan  
**변경 파일**: `docs/UFC_RANKINGS_RESYNC_REHEARSAL_2026-06-10.md` (신규)  
**내용**: DB에 남아 있을 수 있는 과거 잘못된 sync 결과(bw: Petr Yan, flw: Joshua Van, lhw: Carlos Ulberg, mw: Sean Strickland 등) 정정을 위한 read-only 확인 + Admin 재동기화 실행 절차 문서화. 승인 없이 DB write 금지.

---

### Fix 6 — 뉴스 fallback 이미지 다양화
**커밋**: `c3f67e1` Fix: Diversify news fallback images  
**변경 파일**: `public/js/home.js`, `public/js/news.js`, `public/js/news-render-helpers.js`  
**내용**: 단일 Unsplash URL → 5개 풀 `_NEWS_FALLBACK_POOL` + 카테고리별 풀 `_NEWS_CATEGORY_POOLS`. 인덱스 기반 순환 선택으로 카드마다 다른 이미지 표시. 세 가지 렌더 경로 모두 통일 적용. Playwright QA 8/8 PASS.

---

### Fix 7 — Analysis / Recent 탭 empty state 명확화
**커밋**: `6e7ba3f` Fix: Clarify matchup analysis empty states  
**변경 파일**: `public/js/fights-render.js`  
**내용**: 대진표 Stats 패널 네 함수 개선.
- `renderDotForm`: string(`'W'/'L'`) + object(`{r,opp,method,event}`) 포맷 모두 처리
- `renderStatBarsHTML`: "타격 스탯 비교" 헤더 + 설명형 empty state
- `renderInsightHTML`: "승리 방법 인사이트" 헤더 + KO/TKO·서브미션·판정 안내, 데이터 있을 때 "스탯 기반·승리 패턴 분석" 헤더
- `renderRecentHTML`: 빈 배열 `[]` 체크 수정, "최근전적 데이터 준비 중 / 정식 출시 후 보강" 안내

Playwright QA 13/13 PASS.

---

### Fix 8 — Matchup 카드 compact layout 가능성 스캔
**커밋**: `e9113fa` Docs: Scan matchup compact layout options  
**변경 파일**: `docs/MATCHUP_CARD_COMPACT_LAYOUT_SCAN_2026-06-10.md` (신규)  
**결론**:
- Option B (2열 grid): P1 섹션 헤더 스팬 문제 + JS 리팩토링 필요 → 출시 후 Phase 8 보류
- Option C (gap 축소만): CSS/HTML 1줄, 기능 무관 → 출시 전 P2 진행 가능

---

### Fix 9 — Matchup 카드 간격 축소 적용
**커밋**: `f88f447` Style: Tighten matchup card spacing  
**변경 파일**: `index.html`  
**내용**: `#fight-cards-container` spacing `space-y-6 lg:space-y-8` → `space-y-4 lg:space-y-5`. JS/카드 구조 변경 없음. Playwright QA 8/8 PASS (desktop 1440px + mobile 375px, overflow 없음, 콘솔 에러 없음).

---

### Fix 10 — Mobile Analysis 탭 승리 방법 비율 겹침 수정
**커밋**: `b699bd6` Fix: Prevent mobile analysis stat overlap  
**변경 파일**: `public/js/fights-render.js`  
**발견**: 모바일 375px Analysis 탭에서 KO/TKO · 서브미션 · 판정 ring 3개가 중앙에서 겹침.  
**원인**: `p-6` 패딩(24px×2) + `grid-cols-2 gap-6` → 컬럼당 151.5px. `w-14`(56px) ring × 3 + `gap-4`(16px) × 2 = **200px 필요 → 48.5px 초과**.  
**수정**: `ring` 함수에서 `w-14 h-14` → `w-10 h-10 sm:w-14 sm:h-14`, `text-sm` → `text-xs sm:text-sm`. `card` 함수에서 `gap-4` → `gap-1.5 sm:gap-4`.  
**결과**: 모바일 132px 필요 (19.5px 여백 확보) ✅ / desktop 640px+ 이상 원복 ✅. 빌드 성공 (1.81s).

---

### Fix 11 — UFC 랭킹 DB 우선 로드 + 카드 compact 정리
**커밋**: (이번 커밋)  
**변경 파일**: `index.html`  
**발견 A**: 첫 진입 시 seed/localStorage 데이터가 표시됨. `loadUFCRankings()`가 `initSupabase()` 이전에 호출되어 `sb = null` → DB fetch 미실행.  
**수정 A**: `window.onload`에서 `loadUFCRankings()` 호출 순서를 `initSupabase()` 이후로 이동. `sb` 동기 생성 직후 DB select 시작.  
**발견 B**: 랭킹 행에서 trend `→` 가 12-col grid 초과로 모바일에서 다음 줄로 밀려 불필요한 높이 차지. height/reach `—` 도 빈 텍스트로 표시됨.  
**수정 B**: trend 헤더·셀 완전 제거. 이름 col-span `lg:col-span-5` 유지(`col-span-6`으로 단일화). height/reach `'—'`·empty 시 해당 `<p>` 미렌더. champion 카드 동일 처리(`_champMeta` 헬퍼).  
**참고**: DB resync(M-1) 은 여전히 Admin 리허설 필요 (06-02~04). `loadUFCRankings()`는 read-only select만 수행. 빌드 성공 (1.50s).
**커밋**: `f26f91b` Fix: Load UFC rankings from DB first

---

### Fix 12 — Community matchup 패널 preload (대진표 탭 방문 의존 제거)
**커밋**: (이번 커밋)  
**변경 파일**: `public/js/community.js`, `index.html`  
**발견**: 앱 진입 후 대진표 탭을 먼저 방문한 경우에만 커뮤니티 상단 메인/코메인 패널이 정상 표시됨. 직접 커뮤니티 탭 진입 시 "로딩 중" 영구 표시.  
**원인**: `renderFeed()`가 `fetchUpcomingMatchups()`를 trigger하지만 완료 콜백이 없어 `_dbMatchups` 세팅 후에도 `renderMatchups()` 미호출.  
**수정 A** (`community.js`): `fetchUpcomingMatchups().then()`으로 완료 후 `_communityMatchupsFetching` 리셋 + `renderMatchups(_dbMatchups)` 재호출.  
**수정 B** (`index.html`): `navigateTo('community')`에 `renderFeed()` 추가 — 데이터가 이미 있을 때도 탭 진입 시 보드 갱신. `loadMyBattles()` 유지.  
빌드 성공 (1.67s), 검증 5/5 PASS.
**커밋**: `b0a94f4` Fix: Preload matchups for community panel

---

### Fix 13 — 유저 랭킹 명칭 및 시즌 표시 정리
**커밋**: (이번 커밋)  
**변경 파일**: `index.html`, `public/js/season.js`, `public/js/profile.js`  
**발견 A**: 유저 랭킹 탭 nav가 "랭킹"으로만 표시 → UFC 랭킹(UFC)과 구분 불명확.  
**수정 A**: desktop nav `>랭킹<` → `>유저 랭킹<`, mobile nav `>랭킹<` → `>유저랭킹<`.  
**발견 B**: rankings 섹션 서브타이틀이 "시즌 4" 하드코딩 → 실제 시즌(시즌 1)과 불일치.  
**수정 B**: 서브타이틀을 `<span id="rankings-season-subtitle">` 동적 요소로 교체. `season.js` `loadCurrentSeasonFromDB()` + `renderHallOfFame()` 두 경로에서 `'· ' + seasonData.current.name` 업데이트.  
**발견 C**: belt legend 기준이 포인트 범위만 표시 → 기준 안내 부재.  
**수정 C**: belt legend 하단에 "픽 포인트 기반 · 예측 기록이 쌓일수록 등급이 올라갑니다" 안내 문구 추가.  
**발견 D**: 프로필 empty state "아직 예측 기록이 없습니다" → pending/settled 구분 모호.  
**수정 D**: "아직 정산된 예측 기록이 없습니다" + "경기 결과 확정 후 통계가 업데이트됩니다" 안내 추가.  
**출시 후 backlog**: 벨트 아이콘 디자인 개선 (색 동그라미 → 실제 벨트 모양).  
빌드 성공 (1.53s), 검증 10/10 PASS.
**커밋**: `7c0b3fb` Fix: Clarify user ranking copy

---

### Fix 14 — YouTube 탭 테마별 Lazy Load
**변경 파일**: `public/js/state.js`, `public/js/youtube.js`  
**발견**: 뉴스 탭 → YouTube 클릭 시 YOUTUBE_CARDS 6개(각 6영상 = 36개 요청)를 `Promise.all`로 동시 fetch. 첫 로드 시 불필요한 36개 jina.ai 프록시 요청 발생.  
**수정 A** (`state.js`): `activeYoutubeCardIdx` 기본값 `-1` → `0`. `_ytFromShortcut = false` 플래그 추가.  
**수정 B** (`youtube.js` `setNewsCat`): `activeYoutubeCardIdx = 0`, `_ytFromShortcut = false` 초기화.  
**수정 C** (`youtube.js` `goToYoutubeCard`): `_ytFromShortcut = true` 설정 (숏컷 경유 플래그).  
**수정 D** (`youtube.js` `loadYoutubeTab`): `activeYoutubeCardIdx >= 0` 경로에서 해당 카드 1개만 fetch. 완료 후 테마 6개 스위처 버튼 표시(`!_ytFromShortcut`). 숏컷 경유 시(`_ytFromShortcut`) 뒤로 버튼 단독 표시.  
**결과**: YouTube 탭 첫 진입 시 요청 수 36개 → 6개(1 테마). 캐시(`ytVideoCache`) 활용으로 테마 전환 시 재요청 없음.  
빌드 성공 (1.32s), 검증 7/7 PASS.
**커밋**: `04dec9c` Fix: Lazy load YouTube theme videos

---

### Fix 15 — Battle 관전 진입점 명확화
**변경 파일**: `index.html`  
**발견**: 커뮤니티 탭에서 배틀/옥타곤 기능 진입점을 찾기 어려움. "⚡ 내 배틀" 패널의 빈 상태가 사용 방법을 안내하지 않음. 관전(spectator) 기능은 인프라 존재(`octagon.role = 'spectator'` 정의, Presence 추적, 투표 함수)하지만 spectator role을 할당하는 경로가 없어 실질적으로 미완성.  
**수정 A** (`index.html` community subtitle): `격투기 팬들의 뜨거운 설전과 분석` → `격투기 팬들의 뜨거운 설전과 분석 · 포스트 댓글 ⚡ 버튼으로 배틀 신청` — 배틀 신청 경로 힌트 추가.  
**수정 B** (`index.html` `renderMyBattleList` 빈 상태): "진행 중인 배틀 없음" 단독 → 안내 문구 추가: "포스트를 열고 댓글에서 ⚡ 옥타곤 버튼으로 배틀을 신청할 수 있습니다".  
**미수정 (Option B)**: 관전 진입점 추가 없음 — spectator role 할당 경로가 없어 broken feature 노출 방지. 관전 기능은 출시 후 backlog.  
빌드 성공 (1.61s), 검증 5/5 PASS.
**커밋**: `(이번 커밋)` Fix: Clarify battle watch entry point

---

## 3. NEEDS_MANUAL — 출시 전 수동 확인 필요

### M-1. UFC 랭킹 DB 재동기화
**상태**: ~~승인 대기~~ → **HOLD / NOT NEEDED**  
**사유**: Release-Gate-1B(2026-05-27) 결과, QA 문서의 WRONG 판정 전부가 false positive로 확인됨.  
현재 DB champion rows는 프로젝트 2026 기준과 일치. Admin 자동 갱신 실행 불필요.  
**재검토 조건**: 실제 UFC 공식 랭킹 불일치 발견 시에 한해 재검토.  
**절차 문서**: `docs/UFC_RANKINGS_RESYNC_REHEARSAL_2026-06-10.md` (HOLD 상태로 보존)

### M-2. Admin Settlement 리허설
**상태**: 계획 수립 완료, 미실행  
**절차**: `docs/ADMIN_SETTLEMENT_REHEARSAL_2026-06-10.md` 참고  
**내용**: 실제 이벤트 settle, 포인트 지급, 시즌 정산 흐름 read-only 확인  
**시점**: 2026-06-02~06-04

### M-3. Mobile 핵심 클릭 플로우 최종 확인
**상태**: 미실행  
**체크리스트**: `docs/QA_RUN_2026-05-29_MANUAL_USER_FLOWS.md` 참고  
**내용**: 모바일 375px/430px에서 Pick Slip open/confirm, Stats toggle, Analysis 탭, Community 포스트 열기/닫기  
**시점**: 2026-05-29~06-01 QA 윈도우 2

### M-4. Dagestan / 팩션 default 재현 여부 확인
**상태**: 조건부 확인 필요  
**내용**: 다게스탄 팩션이 신규 계정 생성 시 기본값으로 잘못 할당된다는 이슈. 현재 재현 여부 불명확. 2026-05-29 QA 윈도우 2에서 신규 계정 가입 시 확인.

---

## 4. 출시 후 Backlog (Phase 8+)

| 항목 | 내용 | 우선순위 |
|---|---|---|
| 배틀 관전(spectator) 진입점 | `octagon.role='spectator'` 할당 경로 + 진행 중인 배틀 목록 UI. 인프라 존재(Presence, 투표 함수), 진입 경로만 없음 | P2 |
| Stat scoring v2 / 랭커 보정 | 예측 적중 시 스탯 반영 로직 개선 | P2 |
| Recent fights 공식 데이터 | 최근전적 실제 DB 연결 (스크래핑 필요) | P2 |
| 2026 archive event scrape | 과거 이벤트 결과 아카이브 보강 | P2 |
| 대진표 2열 grid 재설계 | Hero 1열 + 프렐림 2열, 레이더 차트 resize 포함 | P2 |
| Account management 강화 | 닉네임 변경, 이메일 변경, 계정 삭제 | P3 |
| News OG 이미지 추출 | Edge Function으로 RSS item 이미지 URL 추출 | P3 |
| Admin fighter stats UI | Fighter 스탯 편집 UI 개선 | P3 |

---

## 5. Release Gate 현황

| Gate | 상태 | 비고 |
|---|---|---|
| G-1 Production 빌드 smoke | ✅ PASS | `e494e63` |
| G-2 Supabase 연결 확인 | ✅ PASS | Auth + DB 조회 정상 |
| G-3 Admin 비노출 (비어드민) | ✅ PASS | `bc5b31a` |
| G-4 Pick Slip open/close | ✅ PASS | Playwright smoke 통과 |
| G-5 뉴스 카드 이미지 다양화 | ✅ PASS | `c3f67e1`, QA 8/8 |
| G-6 Admin settle 리허설 | ⚠️ 부분 통과 | read-only PASS (2026-05-27). settlement 이력 3건 확인. write rehearsal + 2026-06-15 이벤트 생성은 06-02~04 예정 |
| G-7 Mobile 핵심 플로우 | ⏳ NEEDS_MANUAL — Manual scheduled | 05-29~06-01, 체크리스트: [`MOBILE_CLICK_FLOW_QA_2026-06-10.md`](MOBILE_CLICK_FLOW_QA_2026-06-10.md) |
| G-8 UFC 랭킹 DB resync | 🚫 HOLD / NOT NEEDED | false positive 확인 — 실행 불필요 (2026-05-27) |
| **P0 known issues** | ✅ 0건 | |
| **P1 known issues** | ✅ 0건 (수정 후) | |

---

## 6. 다음 액션

| 일정 | 항목 | 담당 |
|---|---|---|
| 2026-05-29~06-01 | Manual User Flow QA 윈도우 2 | QA |
| 2026-06-02~06-04 | Admin 리허설 (settle) | Admin |
| ~~2026-06-04~~ | ~~UFC rankings resync 승인 여부 최종 결정~~ | ~~HOLD — 불필요~~ |
| **2026-06-07 night** | **기능 동결** | All |
| 2026-06-07~09 | Final smoke QA (production) | QA |
| **2026-06-10** | **공개 출시** | All |

---

## 7. 관련 문서

| 문서 | 용도 |
|---|---|
| [`docs/RELEASE_DEADLINE_PLAN_2026-06-10.md`](RELEASE_DEADLINE_PLAN_2026-06-10.md) | 출시 마일스톤 전체 계획 |
| [`docs/RELEASE_QA_PLAN_2026-06-10.md`](RELEASE_QA_PLAN_2026-06-10.md) | QA 체크리스트 |
| [`docs/QA_RUN_2026-05-29_MANUAL_USER_FLOWS.md`](QA_RUN_2026-05-29_MANUAL_USER_FLOWS.md) | 수동 QA 체크리스트 (05-29~06-01) |
| [`docs/ADMIN_SETTLEMENT_REHEARSAL_2026-06-10.md`](ADMIN_SETTLEMENT_REHEARSAL_2026-06-10.md) | Admin settlement 리허설 계획 |
| [`docs/UFC_RANKINGS_RESYNC_REHEARSAL_2026-06-10.md`](UFC_RANKINGS_RESYNC_REHEARSAL_2026-06-10.md) | UFC 랭킹 DB resync 절차 |
| [`docs/MATCHUP_CARD_COMPACT_LAYOUT_SCAN_2026-06-10.md`](MATCHUP_CARD_COMPACT_LAYOUT_SCAN_2026-06-10.md) | 대진표 레이아웃 compact 스캔 결과 |
