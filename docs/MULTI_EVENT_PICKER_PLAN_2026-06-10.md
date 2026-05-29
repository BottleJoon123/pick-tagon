# Multi-Event Matchup Picker — 설계 계획

> 작성일: 2026-05-29  
> Release-Feature-19A (read-only audit + 설계)  
> 구현 여부: **출시 후 보류** (아래 결론 참고)

---

## 1. 현재 구조 분석

### 1.1 DB 현황

| 항목 | 내용 |
|---|---|
| upcoming events | **2개** — UFC FIGHT NIGHT 277 (2026-05-30, 13 matchups), UFC FREEDOM 250 (2026-06-15, 7 matchups) |
| picks_locked_at | 두 이벤트 모두 NULL (미설정) |
| archived events | 5개 |

### 1.2 `fetchUpcomingMatchups()` 흐름

```
events 테이블 전체 조회 (status, event_date 포함)
  → _sidebarEventsCache = allEvents  ← 이미 전체 이벤트 캐시됨
  → event = find(status === 'upcoming')  ← 첫 번째 upcoming만 선택
  → matchups 조회: .eq('event_id', event.id)  ← 단일 이벤트
  → _dbMatchups = 변환된 matchup 배열 (각 m에 _eventId: event.id 포함)
  → renderFightCards() / renderEventSidebar() / loadAllEventPickCounts()
```

**핵심 관찰**: `_sidebarEventsCache`에 이미 모든 이벤트 데이터가 있다.  
문제는 이를 사용자가 선택 가능한 UI로 노출하지 않은 것뿐이다.

### 1.3 `getActiveFights()` — 단일 진실 소스

```js
// admin.js:79
function getActiveFights() {
    if (_dbMatchups && _dbMatchups.length > 0) return _dbMatchups;
    if (customFights && customFights.length > 0) return customFights;
    return FIGHTS; // 하드코딩 fallback
}
```

- `_dbMatchups`는 전역 배열로, 현재는 "첫 upcoming event의 matchups"만 담음
- community.js, fights-render.js, admin.js, h2h.js 모두 `getActiveFights()` 의존

### 1.4 `state.pendings / state.settled` 구조

```js
state.pendings = {
    [fight_id(UUID)]: { side, pick, payout, betCost, odds, ... }
}
state.settled = {
    [fight_id(UUID)]: { result, actualWinner, payout, ... }
}
```

- fight_id(matchup UUID)로 키잉 → **이벤트 경계에 무관함**
- 여러 이벤트 픽이 동시에 존재해도 state 구조상 충돌 없음 ✅

### 1.5 `loadUserPicksFromDB()` 의존성

```js
var activeFightIds = getActiveFights().map(f => f.id);
// → 현재 _dbMatchups의 fight_id만 조회
```

- 다른 이벤트로 스위칭 시 그 이벤트의 픽 상태를 DB에서 가져오는 경로 없음
- 해결: `selectEvent()` 호출 시 `loadUserPicksFromDB()` 재실행하면 자동 해결

### 1.6 `place_pick` / `change_pick` RPC

- `fight_id` + `matchup_id` + `event_id` 파라미터를 프론트에서 전달
- `_eventId`는 이미 각 fight 객체에 포함 (`fight._eventId`)
- RPC 자체는 어떤 event의 pick이든 처리 가능 — **변경 불필요** ✅

### 1.7 Lock 상태

서버 체크:
```sql
-- place_pick RPC 내부
e.picks_locked_at IS NOT NULL → 'pick_locked' exception
m.result_status IN ('completed', 'draw', 'no_contest') → 'pick_locked' exception
```

프론트 체크:
- `fetchUpcomingMatchups()`가 `picks_locked_at`을 matchup 쿼리에 **포함하지 않음**
- `_dbMatchups`의 각 fight에 lock 상태 필드 없음
- UI에서 사전 차단 불가 → RPC 에러 후 toast로만 처리됨

### 1.8 Home/Community 의존성

| 컴포넌트 | 현재 의존 | 멀티 이벤트 영향 |
|---|---|---|
| `renderHomeTicker()` | `_dbMatchups` (첫 upcoming) | 주의 필요 — 항상 nearest event 유지해야 |
| `loadAllEventPickCounts()` | `getActiveFights()[0]._eventId` | 스위칭 시 이 값이 바뀌면 community pick bar가 오염됨 |
| community matchup board | `_dbMatchups` | 스위칭 시 선택 이벤트 matchup을 커뮤니티에 노출하면 혼란 |
| event sidebar | `_sidebarEventsCache` (이미 전체) | 영향 없음 ✅ |

---

## 2. UX 옵션 비교

### Option A — 대진표 상단 Event Dropdown (Compact `<select>`)

```
┌─────────────────────────────────────────┐
│ UFC 일정:  [UFC FN 277 (05/30) ▼]      │  ← select
│ UFC FIGHT NIGHT 277 · 2026.05.30        │
└─────────────────────────────────────────┘
[MAIN EVENT] [CO-MAIN] [PRELIMS] ... fight cards
```

**장점**: 구현 최소, 모바일 친화적 (네이티브 select), 빠른 구현  
**단점**: 이벤트 정보(날짜, 상태) 노출이 제한적  
**구현 난이도**: ⭐⭐ (쉬움)

---

### Option B — Horizontal Event Tabs

```
[UFC FN 277 · 05/30] [UFC FREEDOM · 06/15]
─────────────────────────────────
fight cards ...
```

**장점**: 시각적 직관성, PC에서 좋음  
**단점**: 이벤트 3개 이상 시 모바일 overflow 문제, 탭 수 가변적  
**구현 난이도**: ⭐⭐⭐ (중간)

---

### Option C — Event Card Grid + Selected State

```
┌────────────────┐  ┌────────────────┐
│ ● UFC FN 277   │  │   UFC FREE 250 │
│   05/30 [선택] │  │   06/15        │
└────────────────┘  └────────────────┘
```

**장점**: 이벤트별 날짜/픽 수/락 상태 표시 가능  
**단점**: 공간 많이 차지, 모바일에서 스크롤 추가  
**구현 난이도**: ⭐⭐⭐⭐ (높음)

---

### Option D — Sidebar 클릭 선택 + Mobile Bottom Sheet

기존 sidebar의 "예정된 이벤트" 항목에 클릭 → 대진표 전환  

**장점**: 추가 UI 없음, sidebar 재활용  
**단점**: 모바일에서 sidebar 접근성 낮음 (drawer), 인지 어려움  
**구현 난이도**: ⭐⭐⭐ (중간)

---

### ✅ 추천 MVP: Option A (Dropdown) + Option D 부분 연계

- **대진표 탭 이벤트 헤더 아래에 compact dropdown 추가**
- 동시에 sidebar의 "예정된 이벤트" 항목을 클릭 가능하게 변경 (Option D 요소)
- 기본 선택: 가장 가까운 upcoming event
- 선택 변경 시 fight cards만 교체 (Home/Community는 유지)

---

## 3. 구현 설계 — MVP 상세

### 3.1 새 전역 변수

```js
// index.html 또는 state.js
var _selectedEventId = null;      // 현재 대진표에 표시 중인 event UUID
var _nextEventId = null;          // 항상 nearest upcoming (home/community용)
var _upcomingEventsCache = [];    // fetchUpcomingMatchups에서 채움
```

### 3.2 `fetchUpcomingMatchups()` 수정 (supabase.js)

```js
async function fetchUpcomingMatchups(targetEventId = null) {
    // ... 기존 events 쿼리 ...
    
    // 전체 upcoming 저장
    var upcomingEvents = allEvRes.data.filter(e => e.status === 'upcoming');
    _upcomingEventsCache = upcomingEvents;
    _nextEventId = upcomingEvents[0]?.id || null;  // home/community용
    
    // 표시할 event 결정
    var event = targetEventId
        ? upcomingEvents.find(e => e.id === targetEventId) || upcomingEvents[0]
        : upcomingEvents[0];
    _selectedEventId = event?.id || null;
    
    // 이하 기존 로직 동일 (matchups 쿼리 등)
    // matchups 쿼리에 picks_locked_at 추가:
    //   .select('..., picks_locked_at')
    //   → _dbMatchups 각 fight에 _picksLocked: !!m.picks_locked_at 추가
    
    // 이벤트 헤더, countdown은 선택된 event 기준으로 업데이트
    renderEventSelector();  // 새 함수
    ...
}
```

### 3.3 새 함수: `selectEvent(eventId)` (index.html)

```js
function selectEvent(eventId) {
    if (eventId === _selectedEventId) return;
    fetchUpcomingMatchups(eventId);
    // loadUserPicksFromDB()는 fetchUpcomingMatchups 완료 후 자동 호출됨
}
```

### 3.4 새 함수: `renderEventSelector()` (index.html)

```js
function renderEventSelector() {
    var el = document.getElementById('event-selector');
    if (!el || !_upcomingEventsCache.length) { if(el) el.classList.add('hidden'); return; }
    if (_upcomingEventsCache.length < 2) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = _upcomingEventsCache.map(function(ev) {
        var label = escapeHtml(ev.title) + ' · ' + (ev.event_date || '').slice(5, 10);
        return `<option value="${ev.id}" ${ev.id === _selectedEventId ? 'selected' : ''}>${label}</option>`;
    }).join('');
}
```

### 3.5 UI HTML 추가 위치 (index.html)

대진표 탭 `#event-name-label` 블록 하단, `#fight-cards-container` 상단:

```html
<!-- Event Selector (hidden when single event) -->
<div id="event-selector-wrap" class="hidden mb-4">
    <div class="flex items-center gap-3">
        <span class="oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest flex-shrink-0">이벤트 선택</span>
        <select id="event-selector" onchange="selectEvent(this.value)"
            class="oswald-sharp text-xs font-black italic uppercase bg-black/40 border border-white/10
                   text-white rounded-lg px-3 py-1.5 cursor-pointer hover:border-white/30 transition">
        </select>
        <span id="event-lock-badge" class="hidden oswald-sharp text-[9px] text-yellow-500 border border-yellow-500/30 
               px-2 py-0.5 rounded-lg italic uppercase">🔒 픽 마감</span>
    </div>
</div>
```

### 3.6 Community/Home 보호

```js
// loadAllEventPickCounts — _nextEventId 사용으로 고정
async function loadAllEventPickCounts() {
    // 기존: getActiveFights()[0]?._eventId
    // 변경: _nextEventId || getActiveFights()[0]?._eventId
    const eventId = (typeof _nextEventId !== 'undefined' && _nextEventId)
        ? _nextEventId
        : getActiveFights()[0]?._eventId;
    ...
}

// renderHomeTicker도 _dbMatchups가 아닌 _nextEventMatchups로 분리 가능 (P2)
```

### 3.7 Lock UI

- `fetchUpcomingMatchups()`에서 `picks_locked_at`을 이벤트 쿼리에 포함
- `_selectedEventId` 기반 이벤트의 `picks_locked_at` 값을 `renderEventSelector()` 시 `#event-lock-badge` 토글
- 서버 RPC는 이미 lock 체크 → 프론트는 UX 힌트만 제공

---

## 4. 변경 파일 목록

| 파일 | 변경 내용 | 규모 |
|---|---|---|
| `public/js/api/supabase.js` | `fetchUpcomingMatchups(targetEventId)` 파라미터화, `_nextEventId`/`_upcomingEventsCache` 추가, picks_locked_at 포함, `loadAllEventPickCounts` _nextEventId 사용 | ~40줄 |
| `index.html` | `selectEvent()`, `renderEventSelector()` 신규 함수, `#event-selector-wrap` HTML 추가, `_selectedEventId`/`_nextEventId` 변수 추가 | ~60줄 |
| `public/js/fights-render.js` | `renderFightCards()` — lock badge 표시 (optional) | ~10줄 |
| `public/js/state.js` | `_selectedEventId`, `_nextEventId`, `_upcomingEventsCache` 변수 선언 | ~5줄 |

**변경 불필요 파일:**
- `place_pick` / `change_pick` RPC ✅
- DB schema ✅
- `state.pendings` / `state.settled` 구조 ✅
- `loadUserPicksFromDB()` — `getActiveFights()` 기반이라 자동으로 올바른 fight_id 사용 ✅

---

## 5. P0/P1 리스크

| 리스크 | 설명 | 완화 방법 |
|---|---|---|
| **P0** Community pick bar 오염 | `loadAllEventPickCounts()`가 _dbMatchups._eventId를 쓰면 스위칭 시 community pick bar가 선택 이벤트 기준으로 갱신됨 | `_nextEventId` 고정 변수 분리 |
| **P0** Home ticker 오염 | `renderHomeTicker()`가 _dbMatchups 기반이면 다른 이벤트 선택 시 home에 반영됨 | _nextEventMatchups 별도 변수 또는 조건 분기 |
| **P1** `state.pendings` 크로스 이벤트 표시 | 이벤트 A에서 픽 후 이벤트 B로 이동 시 bet-slip이 A의 픽을 보여줌 | 이벤트 스위칭 시 bet-slip 닫기 |
| **P1** 카운트다운 이벤트 변경 | 다른 이벤트 선택 시 countdown이 그 이벤트 날짜로 바뀜. 다시 돌아가면 correct | 허용 가능 (이벤트별 카운트다운이 정확함) |
| **P2** `loadUserPicksFromDB` 성능 | 이벤트 스위칭마다 DB 조회 — 캐싱 없음 | 스위칭 횟수가 많지 않아 문제 없음 |

---

## 6. 구현 여부 결론

### ❌ 출시 전 구현: **보류**

**이유:**
1. **영향 범위가 넓다** — `_dbMatchups`를 사용하는 경로가 7개 파일에 퍼져 있어 community/home 오염 리스크 존재
2. **QA 부담** — 픽 등록 → 이벤트 스위칭 → 다시 픽 확인 → 정산 전 경로를 모두 검증해야 함
3. **MVP 없이도 동작** — 현재 첫 upcoming event(UFC FN 277)만 노출해도 출시에는 문제 없음
4. **기능 동결 임박** — 2026-06-07 동결까지 3주, 안정성 우선
5. **다음 upcoming events가 2개뿐** — 출시 직후 당장 필요하지 않음

### ✅ 출시 후 구현: **P1 Post-Beta**

| 단계 | 내용 | 기간 |
|---|---|---|
| 구현 | `fetchUpcomingMatchups` 파라미터화, `selectEvent()`, Dropdown UI | 1~2일 |
| QA | 멀티 이벤트 pick flow, community 오염 방지, lock 표시 | 1일 |
| 배포 | main push | 즉시 |

---

## 7. Post-Beta Backlog 항목

1. **`fetchUpcomingMatchups(targetEventId)` 파라미터화** — 핵심 리팩터
2. **`_selectedEventId` / `_nextEventId` 분리** — community/home 보호
3. **Event Selector Dropdown UI** — 대진표 상단, 이벤트 2개 이상일 때만 표시
4. **Lock badge 표시** — picks_locked_at 포함 → `#event-lock-badge` 토글
5. **Sidebar 이벤트 클릭 → `selectEvent()` 연결** — Option D 요소
6. **`loadAllEventPickCounts` → `_nextEventId` 고정** — community 오염 방지

---

## 8. 관련 파일

| 파일 | 역할 |
|---|---|
| `public/js/api/supabase.js:373` | `fetchUpcomingMatchups()` — 수정 핵심 |
| `public/js/admin.js:79` | `getActiveFights()` — `_dbMatchups` 의존 |
| `index.html:2321` | `_sidebarEventsCache`, `renderEventSidebarHTML()` |
| `index.html:351` | `#matchups` section, event header HTML |
| `public/js/fights-render.js:287` | `renderFightCards()` |
| `public/js/community.js:247` | `_dbMatchups` 직접 참조 |
