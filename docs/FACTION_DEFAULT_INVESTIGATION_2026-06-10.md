# Faction Default Assignment Investigation
조사일: 2026-05-26  
기준 커밋: `3c6c24b`  
공개 배포: 2026-06-10

---

## 1. 이슈 설명

**수동 QA 발견**: 첫 가입 시 집단 선택 절차 없이 "다게스탄"으로 설정되는 것처럼 보임.  
**조사 목표**: 신규 유저 faction 자동 배정 여부를 read-only로 확인하고 원인 후보를 규명한다.

---

## 2. 재현 가능 여부

**재현 불가 / 코드 경로 없음.**

조사 결과 어떠한 코드 경로도 신규 유저에게 Dagestan(id=1)을 자동 배정하지 않는다.  
아래 섹션에서 근거를 제시한다.

---

## 3. DB 조사 결과

### 3-1. `users.faction_id` 컬럼 스키마

```
column_name  data_type  column_default  is_nullable
-----------  ---------  --------------  -----------
faction_id   integer    NULL            YES
```

**결론**: `DEFAULT` 없음. 신규 row INSERT 시 `faction_id = NULL`로 생성됨. DB 레벨에서 Dagestan 자동 배정 없음.

### 3-2. `users` 테이블 트리거

| 트리거명 | 이벤트 | 함수 |
|---|---|---|
| `trg_protect_users_privileged_fields` | INSERT, UPDATE | `private.protect_users_privileged_fields()` |

**함수 내용** (요약):
```sql
IF auth.role() <> 'service_role' THEN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_admin, false) = true THEN
      RAISE EXCEPTION 'setting is_admin is not allowed';
    END IF;
  ELSE
    -- UPDATE: is_admin 변경 차단
  END IF;
END IF;
RETURN NEW;
```

**결론**: `is_admin` 필드 보호만 수행. `faction_id` 설정 로직 없음.

### 3-3. `factions` 테이블 데이터

| id | name | emoji_icon |
|---|---|---|
| 1 | 다게스탄 | 🐻 |
| 2 | 브라질 | 🇧🇷 |
| 3 | 미국 | 🇺🇸 |
| 4 | 영국 | 🇬🇧 |
| 5 | 한국 | 🇰🇷 |
| 6 | 아프리카 | 🌍 |
| 7 | 조지아 | ⚔️ |
| 8 | 일본 | 🌸 |

다게스탄이 `id=1`로 최초 등록. PK 순서상 첫 번째.

### 3-4. `users.faction_id` 분포 (현재 DB)

| faction_id | user_count |
|---|---|
| NULL | 2 |
| 1 (다게스탄) | 1 |
| 5 (한국) | 1 |
| 7 (조지아) | 1 |

총 5명. NULL 유저 2명은 faction 미선택 상태이며 다게스탄이 아님.  
faction_id=1은 테스트 계정 1개에만 존재 — 수동 선택 결과로 추정.

### 3-5. `get_faction_leaderboard()` RPC

```sql
RETURNS TABLE(rank bigint, faction_id integer, faction_name text, ...)
SELECT
  RANK() OVER (ORDER BY total_win_points DESC, win_picks DESC, member_count DESC) AS rank,
  f.id::INTEGER AS faction_id,
  f.name        AS faction_name,
  ...
FROM public.factions f
LEFT JOIN public.users u ON u.faction_id = f.id
...
ORDER BY total_win_points DESC, win_picks DESC, member_count DESC
```

**결론**: 픽 실적이 없을 때 `member_count DESC`로 정렬. 현재 다게스탄이 멤버 1명으로 다른 faction(0명)보다 먼저 표시될 가능성 있음 → **UI 상 다게스탄이 모달 첫 번째 카드로 등장**.

---

## 4. 프론트엔드 조사 결과

### 4-1. `currentFaction` 초기값

```javascript
// public/js/state.js:95
var currentFaction = null; // 현재 로그인 유저의 faction 객체 (null = 미선택)
```

페이지 로드 시 항상 `null`로 초기화. localStorage 저장 없음.

### 4-2. `createUserProfile()` — 신규 유저 row 생성

```javascript
// index.html:4054
sb.from('users').insert({
    id: userId,
    nickname: nickname,
    points: state.points,
    total_picks: state.total,
    success_picks: state.success
    // faction_id 없음 → DB DEFAULT null 적용
});
```

**결론**: `faction_id` 미포함. 신규 유저 row는 `faction_id = NULL`로 생성됨.

### 4-3. `loadUserFromDB()` — 로그인 후 faction 로드

```javascript
// public/js/api/supabase.js:270
sb.from('users').select('*, factions(id, name, emoji_icon)').eq('id', userId).single()
.then(function(res) {
    // ...
    currentFaction = res.data.factions || null;  // line 288
    // ...
    if (!res.data.faction_id && typeof openFactionSelectModal === 'function'
        && !sessionStorage.getItem('factionModalDismissed')) {
        setTimeout(function() {
            if (currentUser && currentUser.id === requestedUserId) openFactionSelectModal();
        }, 800);
    }
});
```

- `faction_id = NULL` 유저: `res.data.factions = null` → `currentFaction = null` ✓
- `faction_id = NULL` && `factionModalDismissed` 미설정 → 800ms 후 `openFactionSelectModal()` 호출 ✓

**결론**: 코드가 Dagestan을 강제 배정하지 않음.

### 4-4. `openFactionSelectModal()` — 집단 선택 UI

```javascript
// index.html:5562
grid.innerHTML = factions.map(function(f, i) {
    var isSelected = currentFaction && currentFaction.id === f.id; // null → 모두 false
    return '<div ... onclick="selectFaction(' + f.id + ')">'
        + f.emoji_icon + escapeHtml(f.name) + ...;
});
```

`factions` 배열은 `get_faction_leaderboard()` RPC 결과 — `member_count DESC` 정렬.  
현재 다게스탄이 유일한 멤버 보유 → **다게스탄 카드가 맨 앞에 렌더링됨**.

신규 유저는 모달에서 어떤 faction도 pre-selected 없음(`isSelected = false`).  
사용자가 첫 번째 카드(다게스탄)를 클릭하면 `selectFaction(1)` → `setUserFaction(1)` → DB에 `faction_id=1` 저장.

### 4-5. `getFactionBadge()` / 프로필 표시 fallback

```javascript
// public/js/utils.js:43
function getFactionBadge(factionObj, size) {
    if (!factionObj || !factionObj.emoji_icon) return '';  // null → ''
}
```

```javascript
// public/js/utils.js:70
if (currentFaction) {
    factionEl.innerHTML = getFactionBadge(currentFaction, 'md') + ...;
} else {
    factionEl.innerHTML = '<button onclick="openFactionSelectModal()">+ 집단 선택</button>';
}
```

**결론**: `currentFaction = null`일 때 Dagestan을 fallback으로 표시하지 않음.  
프로필에는 "집단 선택" 버튼만 노출됨.

### 4-6. `sessionStorage.factionModalDismissed` 영향

`closeFactionSelectModal()` 호출 시 `factionModalDismissed = '1'` 설정.  
세션 유지 중 재로드 시 모달이 다시 열리지 않음 → 이미 닫은 유저는 다시 안 보임.  
탭 닫기 / 새 세션 시 초기화 → 다음 로그인 때 모달 재표시.

---

## 5. 원인 후보별 판단

| 원인 후보 | 판단 |
|---|---|
| DB `faction_id` DEFAULT Dagestan | ❌ 없음 — DEFAULT NULL |
| INSERT trigger로 faction_id 자동 설정 | ❌ 없음 — trigger는 is_admin만 보호 |
| `createUserProfile` 에서 faction_id 삽입 | ❌ 없음 — insert에 faction_id 미포함 |
| `loadUserFromDB` 에서 강제 배정 | ❌ 없음 — `res.data.factions \|\| null` |
| `getFactionBadge` / 프로필 Dagestan fallback | ❌ 없음 — null이면 "집단 선택" 버튼 표시 |
| localStorage에 이전 faction 캐시 | ❌ 없음 — `currentFaction`은 sessionStorage/localStorage에 저장 안 됨 |
| **UI 시각 혼동: 모달 첫 번째 카드가 다게스탄** | ✅ **유력 원인** |
| **기존 테스트 계정에 faction_id=1 설정 잔존** | ✅ **유력 원인** |

---

## 6. 결론

**Dagestan 자동 배정 버그는 존재하지 않는다.**

QA에서 "다게스탄으로 설정된 것처럼 보임"의 원인은 두 가지 중 하나:

**A. 기존 테스트 계정 사용**  
DB에 `faction_id=1` 유저가 이미 1명 존재. 이 테스트 계정으로 로그인하면 다게스탄 배지가 보임. 신규 가입이 아닌 기존 계정으로 테스트한 경우.

**B. Faction 선택 모달 UI 혼동**  
신규 유저 첫 로그인 시 faction 선택 모달이 열림. 실적이 없을 때 `member_count DESC` 정렬로 다게스탄이 첫 번째 카드로 등장. 사용자가:
- 첫 번째 카드(다게스탄)를 실수로 빠르게 클릭했거나
- 모달에서 다게스탄이 "기본 선택된 것처럼 보인다"고 오인했을 가능성

---

## 7. 수정 권고

### 현재 P0/P1 버그 없음 → 출시 전 코드 변경 불필요

다만 아래 P2/P3 UX 개선은 출시 후 검토 가능:

#### 옵션 A — 모달 정렬을 id 순서(고정)로 변경 (P3)
`get_faction_leaderboard()` 대신 `factions` 직접 조회 + `ORDER BY id` 사용.  
다게스탄이 항상 첫 번째인 것은 동일하나, 실적 기반 동적 순서 변경 없음.  
→ 랭킹 탭의 집단 순위 표시와 선택 모달을 분리해야 하는 trade-off 있음.

#### 옵션 B — 모달에 "선택 안 함" 안내 문구 추가 (P3)
선택하지 않고 닫을 수 있음을 명시하는 안내 텍스트 추가.  
"집단을 선택하면 팀 랭킹에 기여합니다. 나중에 선택해도 됩니다."

#### 옵션 C — 선택된 집단 없을 때 모달 first card 강조 제거 (P3)
`isSelected = false` 상태에서 첫 번째 카드가 시각적으로 도드라져 보일 경우 스타일 통일.

**출시 전 P2 이상 조치: 없음.**

---

## 8. NEEDS_MANUAL

2026-05-29 QA 윈도우 2에서 아래를 확인한다:

- [ ] 새 이메일로 신규 계정 가입 후 faction 배정 확인
  - 가입 후 즉시 다게스탄이 배지로 표시되는지 확인
  - faction 선택 모달이 열리는지 확인
  - 모달을 닫지 않고 이탈 시 faction_id가 NULL인지 확인
- [ ] 기존 테스트 계정으로 로그인 시 faction 표시 확인
  - `faction_id=1` 계정 → 다게스탄 배지 정상 표시 (버그 아님)

---

## 9. 등급 및 출시 영향

| 항목 | 값 |
|---|---|
| **버그 실재 여부** | ❌ 없음 (코드 및 DB 확인 완료) |
| **P0/P1** | 0건 |
| **P2/P3 UX 개선 후보** | 3건 (출시 후 Phase 8) |
| **출시 전 코드 변경 필요** | 없음 |
| **NEEDS_MANUAL** | 05-29 신규 계정 가입 흐름 재확인 |
