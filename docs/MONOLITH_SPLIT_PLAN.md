# index.html Monolith Split Plan

> 작성일: 2026-05-25  
> 목적: `index.html` 단일 파일 분리 전략 수립  
> 제약: 이 문서는 **분석/계획 전용** — 코드 이동은 Phase 9B+에서 수행

---

## 현재 구조 (as-is)

| 항목 | 수치 |
|---|---|
| 파일 총 줄 수 | **6,304줄** |
| 인라인 `<style>` 블록 | 2개 (메인 402줄 + ticker 11줄) |
| 인라인 `<script>` 블록 | 2개 (config bridge 8줄 + 앱 로직 3,735줄) |
| 외부 `<script src>` 태그 | 15개 (`public/js/*.js`) |
| HTML 섹션 (`<section>`) | 10개 |
| 인라인 onclick 핸들러 | **162개** |
| 전역 함수 (inline script) | **89개** |

---

## HTML 섹션 맵

| 섹션 ID | 시작 라인 | 기능 |
|---|---|---|
| `#home` | 610 | Home 히어로, 카운트다운, 파이트 카드 |
| `#ufc-rankings` | 730 | UFC 공식 랭킹 표시 |
| `#matchups` | 760 | 이벤트 매치업 / 베팅 슬립 |
| `#rankings` | 849 | 사용자 랭킹 / 리더보드 |
| `#mma-news` | 965 | 뉴스 피드 (Edge Function) |
| `#community` | 990 | 커뮤니티 포스트 / 코멘트 |
| `#octagon` | 1077 | 옥타곤 배틀 |
| `#profile` | 1088 | 사용자 프로필 |
| `#archive` | 1219 | 이전 이벤트 아카이브 |
| `#admin` | 1334 | 관리자 패널 |

---

## 인라인 CSS 분석 (남은 402줄)

Phase 2에서 공통 CSS는 `public/css/app.css`로 이미 분리됨. **남은 블록은 전부 화면/컴포넌트 전용이다.**

| CSS 그룹 | 대상 화면 | 분리 후보 파일 |
|---|---|---|
| `#home` hero + `.hero-text` 애니메이션 | Home | `public/css/home.css` |
| `.countdown-unit/num/label` | Home | `public/css/home.css` |
| `.stat-counter` | Home | `public/css/home.css` |
| `.admin-tab` | Admin | `public/css/admin.css` |
| `@keyframes fighter-enter/leave` + `.anim-*` | Octagon/Pick | `public/css/octagon.css` |
| `.faction-card` | Community | `public/css/community.css` |
| Community Dense UI (matchup board, post list) | Community | `public/css/community.css` |
| `#bet-slip-*` | Pick/Bet Slip | `public/css/bet-slip.css` |

> **현재 ticker style (11줄, 690-701)**은 `app.css`의 `.ticker-wrap` 블록과 관련. Phase 9B에서 `app.css`로 통합 가능.

---

## 인라인 JS 함수 맵 (89개)

### 그룹 A — Navigation / Core (라인 2542–2770)

| 함수 | 라인 | 의존 |
|---|---|---|
| `openNicknameModal(force)` | 2542 | Auth 모달, DB |
| `saveNickname()` | 2559 | DB (nickname upsert) |
| `navigateTo(id, fromPopState)` | 2575 | **SPA 핵심** — 모든 섹션 전환 |
| `renderEventSidebarHTML()` | 2664 | Fight card data |
| `renderEventSidebar()` | 2733 | `renderEventSidebarHTML` |
| `openMobileSidebar()` | 2741 | DOM |
| `closeMobileSidebar()` | 2757 | DOM |
| `refreshUI()` | 2770 | Auth 세션, DB |

### 그룹 B — Bet Slip (라인 2893–3060)

| 함수 | 라인 | 의존 |
|---|---|---|
| `openBetSlip(fightId, side, match, pick, odds)` | 2893 | DOM, global state |
| `closeBetSlip()` | 2930 | DOM |
| `selectMethod(method)` | 2935 | Bet slip state |
| `selectRound(round)` | 2960 | Bet slip state |
| `confirmBetSlip()` | 2983 | `castVote` |
| `castVote(...)` | 2998 | `savePick`, DB, `supabase.js` |

### 그룹 C — Admin Result (라인 3061–3187)

| 함수 | 라인 | 의존 |
|---|---|---|
| `adminSetResult(fightId)` | 3061 | DOM |
| `editMatchupResult(fightId)` | 3078 | DOM |
| `closeResultModal()` | 3083 | DOM |
| `confirmAdminResult()` | 3087 | DB, RPC |
| `_showMatchupSettleToast(...)` | 3148 | Toast |
| `_runPostSettleRefresh()` | 3161 | Multiple loaders |
| `adminSetMatchupResultWithUI(...)` | 3173 | DB, `confirmAdminResult` |

### 그룹 D — Community (라인 3188–3270)

| 함수 | 라인 | 의존 |
|---|---|---|
| `toggleComArea(i)` | 3188 | DOM |
| `postCom(i)` | 3196 | DB (`addCommentToDB`) |
| `publishPost()` | 3215 | DB (`savePostToDB`) |

### 그룹 E — Leaderboard (라인 3270–3472)

| 함수 | 라인 | 의존 |
|---|---|---|
| `renderEventLeaderboard()` | 3270 | DB, DOM |
| `renderLeaderboard()` | 3341 | DB, `renderLeaderboardList` |
| `renderLeaderboardList(...)` | 3402 | DOM, auth state |

### 그룹 F — Event / Countdown (라인 3472–3518)

| 함수 | 라인 | 의존 |
|---|---|---|
| `startEventCountdown(eventDateStr)` | 3472 | DOM timer |

### 그룹 G — Fighter Profile (라인 3518–3864)

| 함수 | 라인 | 의존 |
|---|---|---|
| `openFighterProfile(fighter)` | 3518 | DB, DOM modal |
| `closeFighterProfile()` | 3656 | DOM |
| `renderFighterHistory(name)` | 3661 | DB |

### 그룹 H — UFC Rankings (라인 3864–4270) ⚠️ 대형 데이터 포함

| 함수 | 라인 | 의존 |
|---|---|---|
| `syncFighterRanksFromRankings(allRows)` | 3864 | DB |
| `loadRankVerifyPanel()` | 3873 | DB |
| `saveRankRow(input)` | 3916 | DB |
| `syncRankFromUFCRankings()` | 3929 | DB, UFC_RANKINGS_SEED |
| `loadUFCRankings()` | 3945 | DB, seed data |
| `saveUFCRankings()` | 3994 | DB |
| `fetchAndSyncUFCRankings()` | 3999 | DB, external |
| `renderUFCRankingTabs()` | 4113 | DOM |
| `_loadRankImgs()` | 4128 | DOM, images |
| `_lookupRankFighter(name)` | 4144 | seed data |
| `_getRankImg(name)` | 4156 | seed data |
| `switchDivision(divId)` | 4168 | DOM, render |
| `renderUFCRankings()` | 4174 | DOM, seed data |
| `openUFCFighterProfile(fighter)` | 4270 | DOM modal |

> `UFC_RANKINGS_SEED` 데이터 객체가 이 그룹 안에 포함됨 (추정 ~500줄). 별도 `public/js/rankings-seed.js` 추출이 가장 큰 단순 분리 기회.

### 그룹 I — News (라인 4360–4550)

| 함수 | 라인 | 의존 |
|---|---|---|
| `renderNewsGrid()` | 4360 | DOM, local state |
| `openNewsDetail(idx)` | 4466 | DOM, Gemini translation |
| `closeNewsDetail()` | 4543 | DOM |
| `fetchMMANews()` | 4551 | Edge Function, `SUPABASE_URL` |

### 그룹 J — Auth (라인 4589–4740) 🔴 HIGH RISK

| 함수 | 라인 | 의존 |
|---|---|---|
| `setAuthTab(tab)` | 4589 | DOM |
| `submitAuth()` | 4609 | Supabase Auth |
| `runSupabaseMutation(op, msg)` | 4664 | `supabase.js` |
| `skipAuth()` | 4676 | DOM, `refreshUI` |
| `logoutUser()` | 4681 | Supabase Auth, `refreshUI` |
| `createUserProfile(userId, nickname)` | 4707 | DB |
| `syncUserToDB()` | 4725 | DB, `loadMyBattles` |

### 그룹 K — Picks / Votes (라인 4737–4910)

| 함수 | 라인 | 의존 |
|---|---|---|
| `savePick(...)` | 4737 | DB, `supabase.js` |
| `loadAllEventPickCounts()` | 4781 | DB |
| `loadMyEventPicks()` | 4806 | DB |
| `saveEventPick(fightId, fighterIdx)` | 4816 | DB |
| `updateLivePickBar(fightId)` | 4834 | DOM |
| `loadRealRankings()` | 4860 | DB |
| `savePostToDB(post)` | 4865 | DB |
| `likePostInDB(dbId)` | 4878 | DB |
| `addCommentToDB(postDbId, userNick, text)` | 4893 | DB |
| `startRealtimeSubscription()` | 4910 | Supabase Realtime |
| `stopRealtimeSubscription()` | 4932 | Supabase Realtime |

### 그룹 L — Octagon / Battle (라인 5012–6097) 🔴 HIGH RISK

| 함수 | 라인 | 의존 |
|---|---|---|
| `loadMyBattles()` | 5012 | DB |
| `_updateBattleBadge(count)` | 5043 | DOM |
| `renderMyBattleList()` | 5063 | DOM, battle state |
| `toggleMyBattlePanel()` | 5113 | DOM |
| `acceptBattleFromList(...)` | 5120 | `_subscribeOctagonRoom` |
| `_declineBattleById(battleId)` | 5127 | DB |
| `declineBattleFromList(battleId)` | 5135 | DB |
| `cancelBattleById(battleId)` | 5140 | DB |
| `rejoinBattle(...)` | 5150 | Realtime, `_subscribeOctagonRoom` |
| `requestBattle(opponentNick, evt)` | 5168 | DB, Realtime |
| `initOctagonListener()` | 5213 | Supabase Realtime Presence |
| `acceptBattle()` | 5265 | DB, Realtime |
| `declineBattle()` | 5307 | DB, Realtime |
| `_subscribeOctagonRoom(...)` | 5316 | **Realtime Broadcast 핵심** |
| `_startTimer()` | 5490 | timer state |
| `_startTimerDisplay()` | 5500 | DOM |
| `_stopTimer()` | 5510 | timer state |
| `_cleanupOctagonGame()` | 5513 | Realtime, state |
| `_updateTimerEl()` | 5518 | DOM |
| `_autoSubmit()` | 5526 | `submitOctagonTurn` |
| `sendOctagonMessage()` | 5532 | DOM, `submitOctagonTurn` |
| `onOctagonTyping(text)` | 5539 | Realtime Broadcast |
| `_checkSwearWords(text)` | 5550 | word list |
| `_triggerFoul()` | 5556 | DB, Realtime |
| `_showRefereeModal(foulName, nick)` | 5583 | DOM |
| `_handleOctagonKey(e)` | 5593 | key mapping |
| `_doAttack(attack)` | 5608 | battle state, Realtime |
| `_doAttackByKey(key)` | 5652 | `_doAttack` |
| `_showAttackEffect(emoji, name, damage)` | 5655 | DOM |
| `submitOctagonTurn(text)` | 5668 | DB, Realtime, `_advanceTurn` |
| `_advanceTurn()` | 5688 | DB, Realtime, `_endBattle` |
| `_endBattle()` | 5730 | DB, Realtime |
| `octagonVote(forWho)` | 5788 | DB |
| `renderOctagonWaiting()` | 5841 | DOM |
| `renderOctagonRoom()` | 5856 | DOM, full battle state |
| `_messagesHtml()` | 5974 | DOM |
| `_renderMessages()` | 5990 | DOM |
| `renderOctagonResult(...)` | 5995 | DOM |
| `_updateTurnUI()` | 6020 | DOM |
| `_updateHpBars()` | 6054 | DOM |
| `_updateSpectatorCount()` | 6062 | DOM |
| `cancelBattleRequest()` | 6068 | DB |
| `exitOctagon()` | 6074 | Realtime cleanup, `loadMyBattles` |

### 그룹 M — Faction / Rank (라인 6098–6267)

| 함수 | 라인 | 의존 |
|---|---|---|
| `setRankTab(tab)` | 6098 | DOM |
| `renderFactionRanking()` | 6116 | DB, DOM |
| `toggleFactionMemberRanking(factionId)` | 6201 | DB, DOM |
| `openFactionSelectModal()` | 6215 | DOM |
| `closeFactionSelectModal()` | 6223 | DOM |
| `_renderFactionCards()` | 6230 | DOM, faction state |
| `selectFaction(factionId)` | 6249 | DB |

---

## 위험도 분류

| 그룹 | 위험도 | 이유 |
|---|---|---|
| L — Octagon/Battle | 🔴 HIGH | Realtime Broadcast + Presence, 타이머, 상태머신, `_subscribeOctagonRoom` 중심 의존 그래프 |
| J — Auth | 🔴 HIGH | `refreshUI` 호출 체인, `syncUserToDB` → `loadMyBattles` 연쇄, Supabase Auth 세션 |
| A — Navigation/Core | 🟠 MEDIUM | `navigateTo` 는 모든 화면 전환의 진입점 — 162개 onclick 핸들러 모두가 의존 |
| C — Admin Result | 🟠 MEDIUM | DB RPC 직접 호출, 결과 확정 로직 — 실수 시 데이터 손상 가능 |
| H — UFC Rankings | 🟡 LOW-MED | `UFC_RANKINGS_SEED` 데이터만 분리하면 대부분 안전. 실 DB 변경 없음 |
| B — Bet Slip | 🟡 LOW-MED | 외부 deps 명확(`castVote` → `savePick`). CSS도 명확히 분리됨 |
| I — News | 🟢 LOW | Edge Function 호출만. 분리 시 영향 범위 작음 |
| D — Community | 🟢 LOW | `toggleComArea` / `postCom` — DOM + DB만 |
| E — Leaderboard | 🟢 LOW | Read-only DB + DOM render |
| G — Fighter Profile | 🟢 LOW | 모달 열기/닫기 + DB read |
| F — Event Countdown | 🟢 LOW | 타이머만, 외부 deps 없음 |
| M — Faction | 🟢 LOW | DB read + DOM |

---

## inline onclick 의존성 현황

**162개 inline onclick 핸들러** — 모두 글로벌 스코프 함수를 직접 호출한다.

```html
<!-- 예시 패턴들 -->
onclick="navigateTo('home')"
onclick="openBetSlip(...)"
onclick="castVote(...)"
onclick="requestBattle(...)"
onclick="selectFaction(...)"
```

**제약:** 함수가 글로벌 스코프에 없으면 onclick은 `ReferenceError`로 실패한다.  
`public/js/*.js`로 이동하면 `window.funcName = funcName` 형태로 노출해야 한다.

> **이 의존성이 분리를 어렵게 만드는 핵심 이유다.** inline onclick을 전부 `addEventListener`로 교체하기 전까지는 함수는 글로벌 스코프에 있어야 한다.

---

## 분리 전략 원칙

1. **CSS 우선, JS 나중** — CSS는 onclick 의존성이 없어 위험 없이 분리 가능  
2. **데이터 객체 우선** — `UFC_RANKINGS_SEED` 같은 순수 데이터는 로직 없이 이동 가능  
3. **LOW 위험 JS 그룹부터** — News, Community, Leaderboard, Faction  
4. **HIGH 위험 그룹은 마지막** — Octagon, Auth는 전체 앱 안정성 검증 후  
5. **각 단계마다 `npm run build` + 브라우저 smoke test** — 회귀 즉시 감지  
6. **onclick → addEventListener 교체는 별도 Phase** — 현재 구조에서 강제 교체 금지  

---

## 제안 작업 순서 (Phase 9B+)

### Phase 9B — CSS 분리 (🟢 안전)

```
index.html 인라인 <style> 402줄 → public/css/*.css 파일들로 분리
```

| 대상 | 분리 파일 | 줄 수 (추정) |
|---|---|---|
| Home hero + countdown + stat-counter | `public/css/home.css` | ~120줄 |
| Admin tabs | `public/css/admin.css` | ~30줄 |
| Octagon animations | `public/css/octagon.css` | ~80줄 |
| Community dense UI + faction cards | `public/css/community.css` | ~100줄 |
| Bet slip | `public/css/bet-slip.css` | ~70줄 |

예상 결과: `index.html` 인라인 `<style>` 0줄 (또는 필수 최소만 남김)

### Phase 9C — 데이터 분리 (🟢 안전)

```
UFC_RANKINGS_SEED 데이터 객체 → public/js/rankings-seed.js
```

- 단순 `var UFC_RANKINGS_SEED = {...}` 이동
- `index.html`에 `<script src="/js/rankings-seed.js">` 추가 (기존 script tags 앞)
- 예상 결과: inline script ~500줄 감소

### Phase 9D — LOW 위험 JS 그룹 분리 (🟡 주의)

```
순서: News → Leaderboard → Community → Faction → Fighter Profile → Event Countdown
```

각 그룹 이동 시:
1. 함수를 `public/js/<name>.js`로 이동
2. 필요한 전역 변수 참조 확인 (`SUPABASE_URL`, `supabase`, 각종 state)
3. onclick 핸들러가 글로벌 스코프에서 접근 가능한지 확인 (`window.funcName`)
4. `npm run build` + 브라우저 smoke test

### Phase 9E — MEDIUM 위험 JS 그룹 (🟠 주의 — 충분한 QA 필요)

```
순서: Bet Slip → Admin Result → UFC Rankings (로직 부분)
```

### Phase 9F — HIGH 위험 JS 그룹 (🔴 별도 계획 필요)

```
Auth, Octagon/Battle — 독립 계획 문서 작성 후 진행
```

- Auth: `onAuthStateChange` 리스너 전환 시 세션 상태 관리 변경 불가피
- Octagon: Realtime Broadcast/Presence 구독 구조 완전히 이해 후만 이동

---

## 분리 완료 기준 (Full)

| 항목 | 기준 |
|---|---|
| `index.html` 인라인 `<style>` | 0줄 (또는 ≤50줄 필수 최소) |
| `index.html` 인라인 `<script>` | config bridge만 (8줄) + 필수 초기화 |
| `npm run build` | 빌드 통과 |
| 브라우저 smoke test | 전체 7개 화면 탐색 오류 없음 |
| Console errors | 0개 |

---

## Phase 9A 완료 기준

- [x] `index.html` 구조 분석 (라인 수, 섹션 맵, 함수 목록)
- [x] 위험도 분류표 작성
- [x] 분리 전략 원칙 정의
- [x] 제안 작업 순서 (Phase 9B–9F) 정의
- [x] 코드 이동 없음 (분석 전용)

---

## Phase 9B — CSS 분리 결과 (2026-05-25)

### 변경 내역

| 항목 | Before | After |
|---|---|---|
| `index.html` 줄 수 | 6,304줄 | 5,891줄 (-413줄) |
| `index.html` 인라인 `<style>` 블록 수 | 2개 (402줄 + 11줄) | **0개** |
| `public/css/app.css` 줄 수 | 780줄 | 1,186줄 (+406줄) |
| `dist/index.html` 크기 | 376.50 kB | 358.71 kB (-17.79 kB) |

### 이동된 CSS 그룹

| CSS 그룹 | 줄 수 |
|---|---|
| Home hero `#home` — `position: relative` 병합 | 1줄 (기존 블록에 통합) |
| Hero text animations (`.hero-line`, `@keyframes heroReveal`, `fadeUp`) | 10줄 |
| Countdown (`.countdown-unit`, `.countdown-num`, `.countdown-label`) | 22줄 |
| Stat counter (`.stat-counter`) | 6줄 |
| Admin tabs (`.admin-tab`, `.active-tab`) | 3줄 |
| Octagon Fighter Animations (`@keyframes fighter-*`, `.anim-*`) | 56줄 |
| Faction System (`.faction-card`, `@keyframes faction-pop`) | 22줄 |
| Community Dense Hybrid UI (matchup + post list + filter bar) | 213줄 |
| Global Bet Slip Bottom Sheet (`#bet-slip-*`, `.bs-*`) | 28줄 |
| Home Ticker (`.animate-ticker`, `@keyframes ticker-scroll`) | 9줄 |

### 잔여 인라인 CSS

**없음** — 모든 인라인 `<style>` 블록 제거 완료.

### 검증 결과

| 항목 | 결과 |
|---|---|
| `npm run build` | PASS |
| 빌드 경고 | `%VITE_*%` 3개 (env 미설정, 예상된 것) |
| `dist/css/app.css`에 이동 클래스 포함 여부 | 14개 선택자 모두 FOUND ✓ |
| `index.html` `<style>` 잔여 | 0개 ✓ |
| ticker HTML (`animate-ticker`, `home-ticker`) 보존 | ✓ |

### Phase 9B 완료 기준

- [x] 모든 인라인 `<style>` 제거 (0줄 남음)
- [x] 이동된 CSS가 `public/css/app.css` Phase 9B 블록에 위치
- [x] `npm run build` 통과
- [x] JS 로직/HTML 구조 변경 없음
- [x] inline onclick 변경 없음

---

## Phase 9C implementation result (2026-05-25)

### Changed

| Item | Before | After |
|---|---:|---:|
| `index.html` lines | 5,891 | 5,742 |
| `public/js/data/constants.js` lines | 30 | 180 |
| inline UFC ranking seed declarations | 2 | 0 |

### Extracted constants

- `UFC_DIVISIONS`
- `UFC_RANKINGS_SEED`

Both constants now live in `public/js/data/constants.js`, which already loads before `h2h.js` and the main inline script. Existing references continue to use the same global identifiers, so UFC rankings and H2H lookup paths do not need logic changes.

### Verification

- [x] No event flow changes
- [x] No inline onclick changes
- [x] `UFC_DIVISIONS` references remain valid for `index.html` and `public/js/h2h.js`
- [x] `npm run build` PASS
- [x] Expected local env placeholder warnings only (`%VITE_*%`)

---

## Phase 9C-2 implementation result (2026-05-25)

### Changed

| Item | Before | After |
|---|---:|---:|
| `index.html` lines | 5,742 | 5,727 |
| `public/js/data/constants.js` lines | 180 | 200 |

### Extracted constants

- `STAT_LABELS`
- `STAT_COLORS`
- `BET_METHOD_CONFIG`
- `FIGHT_METHOD_TEXT_CLASS`

These values now live in `public/js/data/constants.js`, which loads before `admin.js`, `h2h.js`, and the main inline script. The affected functions now reference shared constants without changing event flow or DOM structure.

### Verification

- [x] `public/js/data/constants.js` syntax check PASS
- [x] Bet slip method selection still references the same method keys
- [x] Fighter profile radar/stat labels still reference `STAT_LABELS` / `STAT_COLORS`
- [x] Admin fighter stat sliders continue to use shared `STAT_LABELS`
- [x] `npm run build` PASS
- [x] Expected local env placeholder warnings only (`%VITE_*%`)

---

## Phase 9C-3 implementation result (2026-05-25)

### Changed

| Item | Before | After |
|---|---:|---:|
| `index.html` lines | 5,727 | 5,688 |
| `public/js/data/constants.js` lines | 200 | 296 |

### Extracted constants

- `UFC_DIVISION_SHORT_LABELS`
- `UFC_DIVISION_FULL_LABELS`
- `UFC_DIVISION_NAME_MAP`
- `UFC_TREND_TEXT_CLASS`
- `NEWS_CATEGORY_KEYWORDS`
- `MMA_NEWS_KEYWORDS`
- `NEWS_CATEGORY_BAR_CLASS`
- `NEWS_CATEGORY_BAR_COLOR`
- `NEWS_CATEGORY_BADGE_CLASS`
- `NEWS_CATEGORY_LABEL`

These values are static label, class, color, and keyword maps. They now live in `public/js/data/constants.js`, while existing UFC ranking and news functions continue to own filtering, rendering, and event behavior.

### Verification

- [x] `public/js/data/constants.js` syntax check PASS
- [x] UFC ranking division labels and trend classes reference shared constants
- [x] UFC.com division name mapping references shared constants
- [x] News category keyword, badge, bar, and label maps reference shared constants
- [x] `npm run build` PASS
- [x] Expected local env placeholder warnings only (`%VITE_*%`)
