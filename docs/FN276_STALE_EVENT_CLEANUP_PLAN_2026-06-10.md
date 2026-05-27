# FN276 Stale Event Cleanup Plan
> 작성일: 2026-05-27  
> origin/main HEAD: `5e01565` Docs: Plan White House event setup  
> 조사 방법: Supabase read-only SQL  
> 실행 예정: 2026-06-02~04 Admin 리허설 윈도우 (별도 승인 필요)

---

## 1. 문제 요약

| 항목 | 내용 |
|---|---|
| 이벤트명 | UFC Fight Night 276 - Allen vs. Costa |
| event_id | `c7d651da-cd4c-4f0e-949a-4f3cfca58b4a` |
| event_date | 2026-05-16 (과거) |
| 현재 status | `upcoming` ← **스테일. 종료된 이벤트가 upcoming으로 방치됨** |
| picks | 0건 (사용자 데이터 없음) |
| matchup 수 | 14개 |

**근본 원인 3가지:**

1. **스크래퍼 파서 아티팩트**: matchup 1개의 red_fighter_name = "UFC Fight Night 276 - Allen vs. Costa", blue_fighter_name = "Ultimate Fighting Championship (UFC)" — 이벤트 제목이 선수 이름 칼럼에 잘못 파싱된 쓰레기 행
2. **sort_order = 99**: 전체 14 matchup의 sort_order가 모두 default 99 — 카드 순서 미설정
3. **weight_class = null**: 전체 14 matchup의 weight_class가 모두 null

이 이벤트는 **picks = 0이므로 사용자 데이터 손실 없이 삭제 가능**.

---

## 2. DB 현재 상태 확인 (2026-05-27 read-only 쿼리 결과)

### 2-1. 이벤트 행

| 컬럼 | 값 |
|---|---|
| id | `c7d651da-cd4c-4f0e-949a-4f3cfca58b4a` |
| title | UFC Fight Night 276 - Allen vs. Costa |
| event_date | 2026-05-16T00:00:00+00:00 |
| status | upcoming |
| location | null |
| venue | null |
| source_url | https://www.sherdog.com/events/UFC-Fight-Night-276-Allen-vs-Costa-111865 |
| picks_locked_at | null |
| settled_at | null |
| archived_at | null |
| completed_at | null |

### 2-2. Matchup 행 (14개)

| 항목 | 값 |
|---|---|
| 총 matchup 수 | 14 |
| sort_order 분포 | 전부 99 (default) |
| weight_class 분포 | 전부 null |
| card_segment 분포 | 전부 'main' |
| result_status 분포 | 전부 'scheduled' |

**파서 아티팩트 matchup** (1개):

| 컬럼 | 값 |
|---|---|
| id | `4dc19f6b-5c7b-4666-a8e0-ecfc42a27e9b` |
| red_fighter_name | UFC Fight Night 276 - Allen vs. Costa |
| blue_fighter_name | Ultimate Fighting Championship (UFC) |
| is_main_event | false |
| sort_order | 99 |

### 2-3. Picks 현황

```
picks_total = 0
pending  = 0
win      = 0
lose     = 0
cancelled = 0
```

**사용자 picks 없음 — 삭제 시 데이터 손실 없음.**

### 2-4. Community FK 확인

```sql
-- posts 테이블: matchup_id 컬럼 없음
-- 커뮤니티 연결 FK 없음
```

posts 테이블에 matchup_id 컬럼이 존재하지 않으므로 **community 참조 없음**.

### 2-5. FK 제약 확인

| 제약 | 상세 |
|---|---|
| `matchups.event_id → events.id` | **NO ACTION** (cascade 없음) |
| `picks.matchup_id → matchups.id` | **NO ACTION** (cascade 없음) |

NO ACTION이므로 부모 행을 먼저 지우면 FK violation 발생. **삭제 순서 준수 필수.**

---

## 3. 삭제 옵션

### Option A — Admin UI `admin_delete_event` RPC (권장)

**방법:** Admin 패널 → 해당 이벤트 → "Delete Event" (또는 Danger Zone) → confirm

**장점:**
- RPC가 삭제 순서(picks → matchups → event)를 내부에서 처리함
- Admin UI 접근 기록이 Supabase 로그에 남음
- 코드 변경 불필요

**단점:**
- Admin UI에서 이벤트를 찾는 단계 필요 (status=upcoming 필터)
- 실수로 다른 이벤트를 클릭할 수 있음 → event_id를 반드시 사전 확인

**RPC 코드 경로:** `admin.js:1639` `deleteBuilderEvent()` → `admin_delete_event` RPC

---

### Option B — Supabase SQL (MCP 또는 대시보드)

**방법:** Supabase SQL 에디터에서 순서대로 실행

```sql
-- Step 1: picks 삭제 (0건이지만 순서상 먼저)
DELETE FROM picks
WHERE matchup_id IN (
  SELECT id FROM matchups WHERE event_id = 'c7d651da-cd4c-4f0e-949a-4f3cfca58b4a'
);

-- Step 2: matchups 삭제 (14개)
DELETE FROM matchups
WHERE event_id = 'c7d651da-cd4c-4f0e-949a-4f3cfca58b4a';

-- Step 3: event 삭제
DELETE FROM events
WHERE id = 'c7d651da-cd4c-4f0e-949a-4f3cfca58b4a';
```

**장점:**
- event_id 하드코딩으로 정확한 타겟 지정
- 각 단계 결과 확인 가능

**단점:**
- 3번의 SQL 실행 필요
- Supabase SQL 에디터 직접 접근 또는 MCP write 권한 필요

---

### Option C — status 업데이트만 (임시 처리)

**방법:** status를 `archived`로 변경하여 UI에서 숨김

```sql
UPDATE events
SET status = 'archived', archived_at = now()
WHERE id = 'c7d651da-cd4c-4f0e-949a-4f3cfca58b4a';
```

**장점:**
- 데이터 보존 (롤백 가능)
- 위험도 최소

**단점:**
- 쓰레기 데이터가 DB에 남음 (data hygiene 미해결)
- 파서 아티팩트 matchup도 잔존
- 권장하지 않음 — picks=0이므로 굳이 보존할 이유 없음

---

### Option D — 방치 (No Action)

**장점:** 즉각 작업 없음

**단점:**
- 종료된 이벤트가 upcoming으로 표시됨 — UI 오염
- 파서 아티팩트 선수 이름이 Rankings/Community 등에 노출될 가능성
- Release 품질 위험

**권장하지 않음.**

---

## 4. 권장안

> **Option A — Admin UI `admin_delete_event` RPC 사용**

**근거:**
- picks = 0 → 사용자 데이터 손실 없음, 삭제 100% 안전
- Admin UI RPC가 FK 순서를 내부 처리 → SQL 순서 오류 위험 없음
- 06-02~04 Admin 리허설 윈도우에서 Admin UI 접근이 예정되어 있음 → 동선 통합 가능
- Supabase 로그에 RPC call 기록 자동 생성

---

## 5. 실행 전 체크리스트

실행 직전(06-02~04 Admin 리허설 윈도우)에 아래를 재확인한다.

| # | 확인 항목 | 방법 | 기준 |
|---|---|---|---|
| P-1 | event_id 재확인 | Admin 패널 이벤트 목록 또는 DB | `c7d651da-cd4c-4f0e-949a-4f3cfca58b4a` |
| P-2 | picks count 재확인 | `SELECT COUNT(*) FROM picks WHERE matchup_id IN (SELECT id FROM matchups WHERE event_id = 'c7d651da-...')` | 0건 |
| P-3 | FK 참조 재확인 | `SELECT COUNT(*) FROM posts WHERE event_id = 'c7d651da-...'` (posts에 event_id 있으면) | 0건 또는 컬럼 없음 |
| P-4 | Admin UI 접근 확인 | Admin 패널 로그인 | adminUnlocked = true |
| P-5 | GitHub Actions 상태 | `https://github.com/BottleJoon123/pick-tagon/actions` | latest green |
| P-6 | Production site 정상 | `https://bottlejoon123.github.io/pick-tagon/` | UI 로드 정상 |

---

## 6. 실행 절차 (Option A)

1. Admin 패널 접속 → Admin 게이트 통과 (adminKey 입력)
2. 이벤트 목록에서 "UFC Fight Night 276 - Allen vs. Costa" 확인
3. **event_id `c7d651da-cd4c-4f0e-949a-4f3cfca58b4a` 일치 확인** (브라우저 개발자 도구 또는 Admin 상세에서 확인)
4. Danger Zone 또는 Delete 버튼 클릭
5. 확인 다이얼로그에서 **"UFC Fight Night 276 - Allen vs. Costa"** 텍스트 재확인 후 confirm
6. 성공 메시지 확인

> ⚠️ 확인 다이얼로그에서 이벤트 이름이 다르면 즉시 취소. 다른 이벤트를 열었을 가능성.

---

## 7. 실행 후 체크리스트

| # | 확인 항목 | 기준 |
|---|---|---|
| A-1 | Admin 이벤트 목록에서 FN276 소멸 | 목록에 없음 |
| A-2 | DB events 행 없음 | `SELECT COUNT(*) FROM events WHERE id = 'c7d651da-...'` → 0 |
| A-3 | DB matchups 행 없음 | `SELECT COUNT(*) FROM matchups WHERE event_id = 'c7d651da-...'` → 0 |
| A-4 | Home 화면 이벤트 목록 정상 | FN276 미표시, 다른 이벤트 정상 표시 |
| A-5 | Rankings 화면 정상 | 파서 아티팩트 선수명 미표시 |
| A-6 | Console 에러 없음 | 개발자 도구 Console 탭 |
| A-7 | 다른 이벤트 picks 영향 없음 | 다른 이벤트 1개 picks 수 변동 없음 |

---

## 8. 승인 문구 템플릿

06-02~04 Admin 리허설 윈도우 실행 시 아래 문구로 승인 요청:

```
Release-Gate-2C 실행 승인 요청

대상: FN276 stale event 삭제
event_id: c7d651da-cd4c-4f0e-949a-4f3cfca58b4a
이벤트명: UFC Fight Night 276 - Allen vs. Costa
방법: Admin UI admin_delete_event RPC (Option A)

사전 확인:
- picks: 0건 (재확인 완료)
- community FK: 없음 (재확인 완료)
- Admin UI 접근: 정상

승인하시면 Admin 패널에서 삭제를 진행합니다.
```

---

## 9. Release Gate 영향

| Gate | 현재 상태 | 완료 후 상태 |
|---|---|---|
| G-6 Admin settlement write rehearsal | ⚠️ 부분 통과 (P2-A 미해결) | ✅ P2-A 해소 |
| P2-A: FN276 stale event | ⚠️ OPEN | ✅ 삭제 완료 |
| P2-B: FN276 data quality | ⚠️ (matchups 삭제로 자동 해소) | ✅ 삭제 완료 |

FN276 삭제는 **P2 Data Hygiene** 항목 해소이며 Release 블로커가 아니다. 단, 미실행 시 FN276이 upcoming으로 잔류하여 사용자 UI에서 종료된 이벤트로 노출되는 리스크가 있다.

---

## 10. 관련 문서

- [RELEASE_FIX_CLOSEOUT_2026-05-26.md](./RELEASE_FIX_CLOSEOUT_2026-05-26.md) — G-6 Admin settlement gate 현황
- [QA_RUN_2026-05-27_ADMIN_SETTLEMENT_READONLY.md](./QA_RUN_2026-05-27_ADMIN_SETTLEMENT_READONLY.md) — Admin read-only 리허설 결과 (P2-A 출처)
- [WHITE_HOUSE_EVENT_SETUP_PLAN_2026-06-15.md](./WHITE_HOUSE_EVENT_SETUP_PLAN_2026-06-15.md) — 06-02~04 Admin 리허설 윈도우 병행 작업
