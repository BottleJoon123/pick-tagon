# Admin 결과 수정/force 재정산 정책 설계

작성: 2026-05-17 (read-only 조사 기반)
상태: 분석 완료 / 구현 미착수

---

## 1. 현재 결과 수정/force 재정산 흐름

### 호출 경로

```
[UI] editMatchupResult(fightId)
     → adminSetResult(fightId)  [result modal 오픈, force=true 세팅]
     → confirmAdminResult()     [index.html:3180]
         → isForce=true → confirm() 다이얼로그
         → adminSetMatchupResultWithUI(matchupId, ..., force=true)
             → adminSetMatchupResult(matchupId, ..., force=true)  [admin.js:1627]
                 → sb.rpc('admin_set_matchup_result', { p_force: true, ... })
                     → [DB] admin_set_matchup_result()              [SECURITY DEFINER]
                         ① is_admin() 체크
                         ② v_before = to_jsonb(matchup)            [before snapshot]
                         ③ archived guard: IF archived RAISE       [차단]
                         ④ service_settle_matchup(force=true)       [역산 + 재정산]
                         ⑤ INSERT admin_audit_logs                  [before/after 기록]
```

### force=true 시 service_settle_matchup 내부 처리 순서

1. matchup FOR UPDATE 잠금
2. 멱등성 체크: `result_status IN ('completed','draw','no_contest') AND NOT p_force` → 이미 정산됐으면 no-op (force=true면 통과)
3. **역산 루프** (기존 win/lose/cancelled picks):
   - `win` 픽: `users.points -= settled_payout`, `success_picks -= 1`
   - `lose` 픽: `users.points += bet_cost` (패배 비용 환급)
   - `cancelled` 픽: `users.points -= bet_cost` (기존 환급 취소)
   - picks → 모두 `pending` 초기화
4. matchup 결과 저장 (새 결과로 UPDATE)
5. **재정산 루프** (pending picks): WIN/LOSE/CANCEL 판정 + points 적용
6. 이벤트 자동 완료 체크 → 모든 matchup 완료 시 `events.status='completed'` + archive 스냅샷 재작성

---

## 2. events.status별 현재 허용/차단 상태

| events.status | admin_set_matchup_result | 차단 근거 |
|--------------|------------------------|----------|
| `upcoming`   | ✅ 허용 | 차단 없음 |
| `locked`     | ✅ 허용 | 차단 없음 |
| `completed`  | ✅ 허용 | 차단 없음 |
| `settled`    | ✅ 허용 (force=true 가능) | 차단 없음 |
| `archived`   | ❌ **차단** | `event_already_archived` 예외 (20260503 migration) |

**현재 archived 이벤트 결과 수정은 DB/RPC 레벨에서 이미 차단되어 있다.**
(20260503_admin_set_matchup_archived_guard.sql 적용 완료)

`settled` 이벤트는 force=true 재정산이 허용된다. 이것이 현재 핵심 위험 구간이다.

---

## 3. service_settle_matchup force=true 역산 분석

### 역산 대상 picks

```sql
SELECT * FROM public.picks
WHERE (matchup_id = p_matchup_id OR fight_id = p_matchup_id::TEXT)
  AND status IN ('win', 'lose', 'cancelled')
FOR UPDATE
```

### 역산 로직 상세

| pick.status | 역산 내용 | users 변경 |
|-------------|----------|-----------|
| `win`       | settled_payout 회수 | `points -= settled_payout`, `success_picks -= 1` |
| `lose`      | 패배 비용 환급 | `points += bet_cost` |
| `cancelled` | 기존 환급 취소 | `points -= bet_cost` |

역산 후 모든 대상 picks → `status='pending'`, settled 필드 초기화

### 역산 범위 제한

- 역산은 `matchup_id = p_matchup_id` 또는 `fight_id = p_matchup_id::TEXT` 조건으로 해당 matchup 픽만 역산
- 동일 이벤트 다른 matchup 픽은 역산 대상 아님

### 역산 후 archive 재작성 조건

이벤트의 모든 matchup이 완료 상태(`completed/cancelled/no_contest/draw`)이면:
- `events.status = 'completed'` 강제 SET
- `archive_events`, `archive_fights` 스냅샷 재작성 (`DELETE + INSERT`)

---

## 4. audit log 현재 기록 수준

### 테이블 구조 (admin_audit_logs)

```
id, admin_user_id, action, entity_table, entity_id,
before_data JSONB, after_data JSONB, metadata JSONB,
created_at
```

### set_matchup_result 기록 내용

| 필드 | 현재 기록 내용 | 평가 |
|------|--------------|------|
| `action` | `'set_matchup_result'` | ✓ |
| `entity_table` | `'matchups'` | ✓ |
| `entity_id` | matchup UUID | ✓ |
| `before_data` | `to_jsonb(matchup)` — 변경 전 matchup 전체 row | ✓ 충분 (matchup 상태) |
| `after_data` | 입력 파라미터만 (`winner_name`, `winner_side`, `method`, `round`, `time`) | ⚠ 불충분 (실제 DB after-row 아님) |
| `metadata` | `service_settle_matchup` 반환값 (`settled_count`, `win_count`, `lose_count`, `cancel_count`, `event_completed`) | ⚠ 부분적 (집계만, 개별 픽 없음) |

### 현재 기록으로 알 수 있는 것

- ✅ force 재정산 전 matchup의 이전 결과 (before_data)
- ✅ 새로 입력한 결과 파라미터 (after_data)
- ✅ 재정산된 픽 수 집계 (metadata.settled_count 등)
- ✅ 누가 언제 했는지 (admin_user_id, created_at)

### 현재 기록으로 알 수 없는 것

- ❌ 역산된 picks의 개별 before 상태 (어떤 픽이 win→pending 됐는지)
- ❌ 역산으로 회수된 총 포인트 합계
- ❌ 역산 전 영향받은 사용자 목록
- ❌ force 재정산 여부 (audit log에 `p_force` 값 기록 없음)

---

## 5. archive snapshot 영향 분석

### 현재 service_settle_matchup의 archive 재작성 코드

```sql
IF v_event_done THEN
    UPDATE public.events
    SET status = 'completed', completed_at = NOW()     -- ⚠ 이벤트 상태 무조건 덮어씀
    WHERE id = v_matchup.event_id;

    BEGIN
        INSERT INTO archive_events ... ON CONFLICT DO UPDATE ...
        DELETE FROM archive_fights WHERE event_id = v_archive_event_id;
        INSERT INTO archive_fights SELECT ... FROM matchups ...
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'archive snapshot failed (non-fatal): ...';
    END;
END IF;
```

### 발견된 버그: settled 이벤트 상태 역행 (CRITICAL)

**시나리오:**
1. 이벤트 A: events.status = `settled` (정산 완료)
2. admin이 matchup M에 force=true 재정산 실행
3. `admin_set_matchup_result`: `settled` 이벤트는 차단 없이 통과
4. `service_settle_matchup`: 재정산 완료 후 모든 matchup이 여전히 completed 상태
5. `v_event_done = TRUE` → `UPDATE events SET status = 'completed'` 실행
6. **결과: `settled` → `completed` 상태 역행 발생**

**영향:**
- 이벤트가 `settled`에서 `completed`로 다운그레이드됨
- 다음 번에 `admin_settle_event()` 호출 전까지 이벤트가 미정산 상태로 표시
- 대시보드 `unsettled_events` 카운트가 증가 (이상 감지 알림)
- archive_fights 스냅샷은 재작성됨 (force 재정산 결과 반영)

**이 버그는 현재 미수정 상태이다.**

### archive_fights 재작성 조건

`v_event_done`은 다음 조건으로 결정:
```sql
SELECT NOT EXISTS (
    SELECT 1 FROM matchups
    WHERE event_id = v_matchup.event_id
      AND result_status NOT IN ('completed', 'cancelled', 'no_contest', 'draw')
) INTO v_event_done;
```

force 재정산 후 해당 matchup이 다시 `completed`로 설정되면 → `v_event_done = TRUE` → archive 재작성 가능

---

## 6. 정책 후보 A-D 비교

### 후보 A: 현행 유지

| | |
|-|-|
| **내용** | force=true이면 settled 이벤트 matchup도 수정 가능. archived는 이미 차단. |
| **장점** | 운영 유연성, KDI류 결과 수정 가능 |
| **단점** | settled→completed 상태 역행 버그 미수정. audit log에 force 여부/역산 범위 미기록. |
| **위험도** | MEDIUM — 사고 시 추적 어려움 |

### 후보 B: archived 전면 차단 (이미 구현됨)

| | |
|-|-|
| **내용** | archived 이벤트 결과 수정 RPC 레벨 차단. settled는 force=true 허용. |
| **상태** | ✅ 이미 구현됨 (20260503_admin_set_matchup_archived_guard.sql) |
| **남은 문제** | settled 이벤트 force 재정산 시 상태 역행 버그 미수정 |

### 후보 C: settled 이벤트 별도 override token 요구

| | |
|-|-|
| **내용** | UI에서 별도 confirm 외에도 RPC에 `p_reason TEXT`(필수) 요구 |
| **장점** | 의도적 재정산임을 명시, audit log에 reason 기록 |
| **단점** | 구현 복잡도 증가, 운영자 마찰 |
| **위험도** | 낮음 — 오입력 방지 효과 |

### 후보 D: force=true audit before snapshot 강화

| | |
|-|-|
| **내용** | force=true 시 역산 대상 picks 집계 + 영향 사용자 요약을 audit log metadata에 저장 |
| **예시** | `{ "force": true, "reversed_picks": { "win": 8, "lose": 7, "cancelled": 0, "total_points_clawed_back": 3200 } }` |
| **장점** | 사후 추적 가능, 포인트 회수 규모 즉시 확인 |
| **단점** | service_settle_matchup 또는 admin_set_matchup_result 수정 필요 |

---

## 7. 추천 정책

### 채택: B + D + 버그 수정 (상태 역행 패치 추가)

**이유:**
- B는 이미 구현됨 — archived 차단 완료 ✓
- settled 이벤트 force=true는 허용 유지 (KDI류 수정 필요성 있음, 완전 차단은 운영 경직)
- D: force=true 시 audit 강화 → 추적성 확보 (필수)
- 버그 수정: `service_settle_matchup`의 settled→completed 상태 역행 패치 (필수)

**정책 요약:**

| 상황 | 정책 |
|------|------|
| archived 이벤트 matchup 수정 | ❌ RPC 레벨 차단 (이미 구현) |
| settled 이벤트 matchup force=true 재정산 | ✅ 허용 — UI confirm + audit before snapshot 필수 |
| settled 이벤트 matchup force=false (일반 결과 입력) | ✅ 허용 (이미 결과 있으면 service_settle_matchup이 no-op) |
| force=true 시 audit 기록 | force 여부 + 역산 picks 집계 + 포인트 영향 summary 필수 |
| settled 이벤트에 force 재정산 후 event.status | `completed`로 역행하지 않도록 패치 필수 |

---

## 8. 구현 계획

### Phase P1: settled 이벤트 상태 역행 버그 수정 (CRITICAL)

**파일:** `supabase/migrations/20260517_fix_settle_matchup_event_status_regression.sql`

**내용:** `service_settle_matchup` 내 이벤트 자동 완료 UPDATE를 조건부로 변경:

```sql
-- 현재 (버그):
UPDATE public.events SET status = 'completed', completed_at = NOW()
WHERE id = v_matchup.event_id;

-- 수정안: settled/archived 이벤트는 completed로 역행하지 않음
UPDATE public.events SET status = 'completed', completed_at = NOW()
WHERE id = v_matchup.event_id
  AND status NOT IN ('settled', 'archived');
```

**예상 작업량:** 1시간 이내 (migration + apply + 검증)

---

### Phase P2: force=true audit before snapshot 강화

**파일:** `supabase/migrations/20260517_admin_set_matchup_result_force_audit.sql`

**내용:** `admin_set_matchup_result`에서 force=true 시 추가 before snapshot 수집:

```sql
-- force=true일 때 역산 대상 picks 집계를 audit metadata에 추가
IF p_force THEN
    SELECT jsonb_build_object(
        'force',                  true,
        'picks_before_reversal',  jsonb_build_object(
            'win_count',          SUM(CASE WHEN status='win'       THEN 1 ELSE 0 END),
            'lose_count',         SUM(CASE WHEN status='lose'      THEN 1 ELSE 0 END),
            'cancelled_count',    SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END),
            'total_settled_payout', COALESCE(SUM(CASE WHEN status='win' THEN settled_payout ELSE 0 END), 0)
        )
    ) INTO v_force_snapshot
    FROM public.picks
    WHERE (matchup_id = p_matchup_id OR fight_id = p_matchup_id::TEXT)
      AND status IN ('win', 'lose', 'cancelled');
END IF;
```

audit log metadata에 `v_force_snapshot` 병합하여 저장.

**예상 작업량:** 2시간 (migration + 검증)

---

### Phase P3 (선택): UI reason 입력 / second confirm 강화

**내용:**
- `editMatchupResult()` 호출 시 현재 이벤트 status를 확인
- `settled` 이벤트인 경우: 기존 confirm 다이얼로그에 "settled 이벤트입니다" 경고 추가
- (선택) reason 텍스트 입력 → `admin_set_matchup_result`에 `p_reason TEXT DEFAULT NULL` 파라미터 추가 후 audit log에 기록

**예상 작업량:** 2~3시간 (UI + 선택적 DB 파라미터)

---

## 9. QA 체크리스트

### P1 버그 수정 후 검증 항목

- [ ] settled 이벤트 matchup에 force=true 재정산 후 events.status가 `settled` 유지 확인
- [ ] archived 이벤트 matchup에 force=true 시 `event_already_archived` 예외 반환 확인
- [ ] completed 이벤트 matchup에 force=true 후 events.status 변화 없음 확인 (이미 completed)
- [ ] 일반 (locked) 이벤트 matchup force=true 재정산 후 points 역산/재지급 정확성 확인
- [ ] admin_audit_logs에 set_matchup_result 기록 존재 확인

### P2 audit 강화 후 검증 항목

- [ ] force=true 재정산 후 audit log metadata에 `force: true` 기록 확인
- [ ] metadata.picks_before_reversal.win_count 값이 실제 win 픽 수와 일치 확인
- [ ] metadata.picks_before_reversal.total_settled_payout 값 확인
- [ ] force=false 일반 정산 시 force 관련 필드 없거나 null 확인

### 공통 검증 항목 (코드 변경 없이 read-only)

- [ ] `admin_set_matchup_result` proacl: `{postgres, authenticated, service_role}` 확인
- [ ] `service_settle_matchup` proacl: `{postgres, service_role}` 확인 (anon/authenticated 없음)
- [ ] admin_audit_logs before_data = matchup row (full) 확인
- [ ] DRAW/NC force=true: cancelled 역산 + 재환급 정확성 확인

---

## 10. 이번 조사에서 코드/DB/운영 데이터 변경 없음 명시

**이 문서는 read-only 조사 결과를 기록한 설계 문서입니다.**

조사 과정에서:
- 코드 수정 없음
- DB migration 없음
- 운영 데이터 수정 없음
- force 재정산 실행 없음
- 운영 points 변경 없음

실제 구현은 Phase P1~P3 각 별도 세션에서 수행 예정.

---

## 이력

| 날짜 | 내용 |
|------|------|
| 2026-05-17 | 초안 작성 (read-only 조사, settled/archived 이벤트 결과 수정 정책 설계) |
