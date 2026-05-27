# White House Event Setup Plan — 2026-06-15
> 작성일: 2026-05-27  
> 대상 이벤트: 2026-06-15 White House event  
> 실행 예정: **운영자 승인 후 — 2026-06-02~04 Admin 리허설 윈도우**  
> 참고 게이트: Release-Gate-2A (`QA_RUN_2026-05-27_ADMIN_SETTLEMENT_READONLY.md`) P2-C  
> 릴리즈 기준: [`docs/RELEASE_DEADLINE_PLAN_2026-06-10.md`](RELEASE_DEADLINE_PLAN_2026-06-10.md)

---

## 1. 목적

| 목적 | 설명 |
|---|---|
| 출시 전 이벤트 준비 | 2026-06-10 공개 배포 시점에 메인 이벤트가 앱에 노출되어야 함 |
| 사용자 픽 등록 가능 상태 확보 | 배포 직후 사용자가 바로 픽 등록 가능하도록 이벤트 + 대진표 준비 |
| 운영자 숙지 | 이벤트 생성/매치업 등록/픽 마감 흐름을 리허설 윈도우에서 사전 실습 |
| 실수 방지 | title 오타·날짜 오입력·중복 이벤트 생성 방지를 위한 체크리스트 제공 |

---

## 2. 필요한 데이터

이벤트 생성 전 아래 정보를 **공식 UFC 소스에서 확인**한 후 진행한다.

### 2-1. 이벤트 메타데이터

| 필드 | DB 컬럼 | 확인 여부 | 비고 |
|---|---|---|---|
| 이벤트 타이틀 | `events.title` | ⚠ 수동 확인 필요 | 예: `UFC 314 — White House` |
| 이벤트 날짜/시간 | `events.event_date` (timestamptz) | ⚠ 수동 확인 필요 | Admin UI는 `YYYY-MM-DD` 입력 → UTC 00:00으로 저장 |
| 타임존 | — | ⚠ 수동 확인 필요 | 이벤트 시작 시간 기준 KST 환산 확인 |
| 장소/도시 | `events.location` | ⚠ 수동 확인 필요 | 예: `Washington D.C., USA` |
| Venue | `events.venue` | ⚠ 수동 확인 필요 | 예: `The White House South Lawn` |
| 공식 URL | `events.source_url` | ⚠ 수동 확인 필요 | UFC 공식 이벤트 페이지 |

### 2-2. 대진표 데이터 (matchup 당)

| 필드 | DB 컬럼 | 비고 |
|---|---|---|
| 레드 코너 파이터 이름 | `matchups.red_fighter_name` | 공식 영문명 그대로 입력 |
| 블루 코너 파이터 이름 | `matchups.blue_fighter_name` | 공식 영문명 그대로 입력 |
| 레드 코너 fighter_id | `matchups.red_fighter_id` | Admin 검색으로 자동 매핑 — DB에 없으면 수동 입력 후 별도 추가 |
| 블루 코너 fighter_id | `matchups.blue_fighter_id` | 동일 |
| 체급 | `matchups.weight_class` | `hw`, `lhw`, `mw`, `ww`, `lw`, `fw`, `bw`, `flw` 등 |
| 카드 구분 | `matchups.card_segment` | `main` 또는 `prelim` (default: `main`) |
| 경기 순서 | `matchups.sort_order` | 메인카드 1번이 메인이벤트 — **default=99 주의, 반드시 수동 지정** |
| 파이터 이미지 | `red_image_url` / `blue_image_url` | DB fighters 테이블에서 자동 채워짐 (fighter_id 매핑 시) |
| 오즈 (선택) | — | 현재 이벤트 레벨에서 별도 관리 없음 — matchup 카드에 표시 미지원 |

---

## 3. 현재 DB 상태

| 항목 | 현재 상태 | 비고 |
|---|---|---|
| 2026-06-15 White House event | **없음** | 생성 필요 |
| UFC Fight Night 276 (2026-05-16) | upcoming — **stale** | 날짜 지났으나 픽 마감 미처리 |
| FN276 parser artifact matchup | 1개 (red=이벤트 타이틀, blue=UFC) | 삭제 또는 수정 필요 |
| 현재 active 이벤트 수 | 2 (UFC 328 + FN276) | |
| archived 이벤트 수 | 3 | FN273/274/275 — 정상 정산 완료 |

> **FN276 cleanup**: 이번 작업 범위 밖이나 White House event 생성 전 또는 동시에 처리 권장.  
> FN276 처리 절차: Admin → Event 탭 → FN276 선택 → `🔒 픽 마감` → (선택) 결과 입력 없이 Archive.  
> 또는 이벤트 삭제 (`🗑` 버튼) — 픽이 없을 경우 삭제 가능.

---

## 4. 생성 방식 옵션

### Option A — Admin UI 수동 생성 (권장)

**방법:**
1. Admin → Event 탭 → `+ 이벤트 추가` 버튼
2. 이벤트 이름 / 날짜 / 상태 입력 → 저장
3. 생성된 이벤트 선택 → `+ 경기 추가` 버튼으로 매치업 1개씩 등록
4. 각 매치업: 파이터 검색 → RED/BLUE 코너 지정 → 체급 / 카드구분 / 순서 입력

| 장점 | 단점 |
|---|---|
| 코드 변경 없음 | 매치업 수가 많으면 반복 작업 발생 (10~15경기) |
| Admin RPC + UI 흐름 전체 리허설 겸함 | 오타/순서 오입력 위험 → 체크리스트 필수 |
| 파이터 검색으로 fighter_id 자동 매핑 | DB에 없는 파이터는 이름만 입력 (fighter_id null) |
| 출시 후 운영 방식과 동일 | |

### Option B — Supabase SQL seed 스크립트

**방법:** SQL Editor에서 `INSERT INTO events` + `INSERT INTO matchups` 일괄 실행

| 장점 | 단점 |
|---|---|
| 빠르고 정확 (오타 없음) | SQL 작성/검토 시간 필요 |
| sort_order 등 세부 필드 정확히 제어 | fighter_id 매핑을 SQL에서 직접 해야 함 |
| 복붙 실수 시 롤백 쉬움 (단건 DELETE) | Admin UI 흐름 미검증 (Admin 리허설 목적과 일부 상충) |

### Option C — scraper/import 자동화

**방법:** 기존 `scrape-matchups` Edge Function 트리거 또는 신규 스크래핑 스크립트

| 장점 | 단점 |
|---|---|
| 자동화 — 시간 절약 | 출시 전 신규 코드 작업 위험 |
| 대규모 매치업도 빠르게 처리 | 파서 버그 가능성 (FN276 artifact 재발) |
| | UFC 공식 사이트 렌더 변경 시 실패 |
| | **출시 전 금지/보류** |

### 권장 방식

```
Option A (Admin UI 수동 생성)
  → 생성 전 Section 2 데이터 준비 완료 후 진행
  → 매치업 수 10개 이상이면 Section 2-2 표를 미리 채워서 복붙 방식으로 진행
  → 완료 후 Section 7 체크리스트 순서대로 확인
```

Option B는 Admin UI 검증이 필요 없을 경우 보조 수단으로 허용.  
Option C는 **출시(2026-06-10) 이전 금지**.

---

## 5. Admin UI 이벤트 생성 절차 상세

### 5-1. 이벤트 생성 (`saveNewEvent`)

```
Admin 화면 → Event 탭 → 좌측 "+ 이벤트 추가" 버튼
→ [new-event-title]  : UFC [번호] — White House
→ [new-event-date]   : 2026-06-15  (YYYY-MM-DD 형식)
→ [new-event-status] : 예정 (upcoming)
→ 저장 버튼 클릭
```

> **주의:** `new-event-date` 입력은 Admin UI에서 `YYYY-MM-DD` 형식만 허용.  
> 저장 시 `new Date('2026-06-15T00:00:00Z').toISOString()` → UTC 00:00으로 저장됨.  
> 이벤트 당일 KST 기준 시작 시간과 다를 수 있음 (표시만, 픽 마감은 수동).

### 5-2. 매치업 등록 (`saveMatchupFromModal`)

```
이벤트 선택 → "+ 경기 추가" 버튼
→ 파이터 검색창에 이름 입력 → RED / BLUE 코너 지정
→ 체급 선택 (드롭다운)
→ 카드 구분: main / prelim
→ 경기 순서 숫자 입력 (메인이벤트 = 1, 코메인 = 2, ...)
→ 저장
```

> **sort_order 필수 입력:** DB default = 99 (FN276 이슈 원인). 반드시 수동 지정.  
> **is_main_event:** `card_segment === 'main' && sort_order === 1` 이면 자동 true.  
> **fighter_id 미매핑:** DB에 없는 파이터는 이름만 입력 가능 (이미지 없음, stats 없음 — 허용).

---

## 6. 생성 전 체크리스트

> ✅ = 완료 / ❌ = 미완료 / ⚠️ = 확인 필요

### 6-1. 데이터 준비

| # | 항목 | 상태 |
|---|---|---|
| 1 | 이벤트 공식 명칭 확인 (UFC 공식 사이트/UFC 앱) | ⚠️ |
| 2 | 이벤트 날짜/시간 확인 (KST 기준 명기) | ⚠️ |
| 3 | 메인이벤트 파이터 2명 확인 (공식 발표 기준) | ⚠️ |
| 4 | 코메인이벤트 파이터 2명 확인 | ⚠️ |
| 5 | 나머지 메인카드 경기 목록 확인 | ⚠️ |
| 6 | 프렐림 경기 목록 확인 (선택 — 전부 등록 아니어도 됨) | ⚠️ |
| 7 | 각 경기 체급 확인 | ⚠️ |
| 8 | 각 경기 RED/BLUE 코너 공식 배정 확인 | ⚠️ |
| 9 | fighters DB에 해당 선수 존재 여부 사전 검색 | ⚠️ |

### 6-2. DB 사전 확인

| # | 항목 | 상태 |
|---|---|---|
| 1 | 동일 타이틀 이벤트가 이미 존재하지 않는지 확인 | ⚠️ |
| 2 | FN276 stale 이벤트 처리 방침 결정 (마감/삭제) | ⚠️ |
| 3 | 누락 파이터가 있으면 Admin > Fighter 탭에서 사전 추가 | ⚠️ |

### 6-3. 픽 상태 결정

| # | 항목 | 결정 |
|---|---|---|
| 1 | 생성 시 초기 상태 | `upcoming` (픽 오픈 상태) |
| 2 | 픽 마감 시점 | 이벤트 당일 경기 시작 전 수동 마감 (`🔒 픽 마감`) |
| 3 | 공개 배포 직후 픽 오픈 여부 | upcoming 상태면 배포 즉시 픽 가능 — 의도 확인 필요 |

---

## 7. 생성 후 체크리스트

| ID | 확인 항목 | 확인 방법 | 예상 결과 |
|---|---|---|---|
| C-1 | Admin Dashboard 이벤트 카운트 | Admin → Dashboard → upcoming 수 | 기존 대비 +1 |
| C-2 | Admin Event 탭에서 이벤트 노출 | Admin → Event 탭 → 좌측 목록 | White House event 표시 |
| C-3 | 매치업 카드 렌더 | 이벤트 선택 → 워크스페이스 | 등록한 경기 목록 표시 |
| C-4 | Home 화면 이벤트 카드 노출 | 앱 진입 → Home | 이벤트 타이틀 + 날짜 표시 |
| C-5 | 대진표(Fights) 탭 표시 | Fights 탭 클릭 | 메인이벤트 카드 최상단 |
| C-6 | Pick Slip open | 메인이벤트 카드 → 픽 버튼 | slip 정상 오픈 |
| C-7 | Pick Slip confirm | 픽 선택 → 확인 | 픽 저장 및 pending 상태 |
| C-8 | Community 메인이벤트 패널 | Community 탭 | 메인/코메인 경기 표시 |
| C-9 | Stats / Analysis 렌더 | 경기 카드 → Analysis 탭 | fighter_id 매핑 시 스탯 표시 |
| C-10 | console error 없음 | DevTools Console | 0건 |
| C-11 | Admin Dashboard unresolved 지표 | Dashboard | 새 matchup 수 반영 |

---

## 8. 승인 문구 템플릿

운영자가 이 문서 Section 6 체크리스트 확인 후 아래 문구로 실행을 승인한다.

```
White House event Admin 생성을 승인합니다.
Section 6 생성 전 체크리스트 확인 완료.
이벤트 정보:
  - title: [확인된 공식 타이틀]
  - event_date: 2026-06-15
  - matchup 수: [N]개
  - 초기 status: upcoming
Admin 화면에서 이벤트 생성 및 매치업 등록을 진행하세요.
Season reset / Danger zone / 기존 이벤트 settle은 이 승인에 포함되지 않습니다.
```

---

## 9. Release Gate 영향

| Gate | 현재 상태 | White House event 생성 후 |
|---|---|---|
| G-6 Admin settle 리허설 | ⚠️ 부분 통과 | write rehearsal 포함 시 완전 통과 가능 |
| G-7 Mobile 핵심 플로우 | ⏳ NEEDS_MANUAL | White House event 매치업으로 Pick Slip 테스트 가능 |
| Release readiness | Partial | 이벤트 생성 완료 시 핵심 조건 충족 |

**최소 요건 (2026-06-10 배포 전):**  
- White House event `upcoming` 상태로 DB 존재
- 메인이벤트 + 코메인이벤트 매치업 최소 2개 이상 등록
- Pick Slip open/confirm 동작 확인 (C-6, C-7)

**권장 요건:**  
- 메인카드 전체 매치업 등록
- fighter_id 매핑 (Stats 표시용)
- Community 메인이벤트 패널 노출 확인

---

## 10. FN276 Cleanup 병행 처리 (선택)

White House event 생성과 동시에 FN276 정리를 권장한다.

| 옵션 | 방법 | 주의 |
|---|---|---|
| 픽 마감 처리 | Admin → FN276 → `🔒 픽 마감` | 이후 사용자 픽 불가 — 의도 확인 |
| 이벤트 삭제 | Admin → FN276 → `🗑` 삭제 버튼 | 매치업/픽 함께 삭제 — 픽 있으면 삭제 불가 (confirm 팝업) |
| 아카이브 | 픽 마감 → 결과 입력 없이 Archive | 이벤트가 archive에 노출됨 (의도적 아니면 비권장) |

> FN276에 연결된 픽: 현재 0건 확인됨 (Release-Gate-2A 조회 기준).  
> 삭제가 가장 깔끔한 방법. 단 삭제는 **별도 승인 필요.**

---

## 11. 다음 액션

| 항목 | 승인 필요 여부 | 예정 |
|---|---|---|
| 이벤트 공식 정보 수동 확인 (운영자) | 불필요 | 즉시 가능 |
| Section 6-1 데이터 준비 완료 | 불필요 | 2026-06-02 이전 |
| FN276 처리 방침 결정 | 불필요 | 2026-06-02 이전 |
| White House event Admin 생성 | **별도 승인 필요** (Section 8 문구) | 2026-06-02~04 |
| FN276 cleanup | **별도 승인 필요** | 2026-06-02~04 (White House event와 동시) |
| 생성 후 Section 7 체크리스트 확인 | 불필요 | 생성 직후 |
| Release Gate G-7 Mobile QA | 불필요 | 2026-05-29~06-01 QA 윈도우 |

---

## 12. 관련 문서

| 문서 | 링크 |
|---|---|
| Admin Settlement Rehearsal 계획 | [`ADMIN_SETTLEMENT_REHEARSAL_2026-06-10.md`](ADMIN_SETTLEMENT_REHEARSAL_2026-06-10.md) |
| Admin Settlement Read-Only QA | [`QA_RUN_2026-05-27_ADMIN_SETTLEMENT_READONLY.md`](QA_RUN_2026-05-27_ADMIN_SETTLEMENT_READONLY.md) |
| Release Deadline Plan | [`RELEASE_DEADLINE_PLAN_2026-06-10.md`](RELEASE_DEADLINE_PLAN_2026-06-10.md) |
| Release Fix Closeout | [`RELEASE_FIX_CLOSEOUT_2026-05-26.md`](RELEASE_FIX_CLOSEOUT_2026-05-26.md) |
