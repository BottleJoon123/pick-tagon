# Fighter Record Update Audit
> 작성일: 2026-05-29  
> 방법: RPC 코드 전체 읽기 + DB read-only SQL  
> DB write 없음

---

## Verdict: fighters.wins/losses/draws 자동 업데이트 미구현 — P2 (출시 후 개선)

---

## 1. 현재 정산 파이프라인 분석

### 경로
```
Admin UI → admin_set_matchup_result()
  → service_settle_matchup() [SECURITY DEFINER, service_role]
    → matchups: result_status/winner/method/round/time UPDATE
    → picks:    status=win/lose/cancelled, payout UPDATE
    → users:    points +payout / +bet_cost(환급) UPDATE
    → archive_events: ON CONFLICT (name) DO UPDATE
    → archive_fights: DELETE old + INSERT all matchups
  → admin_audit_logs: 감사 로그

Admin UI → admin_settle_event()
  → picks: 잔존 pending → cancelled
  → events: status = 'settled'

Admin UI → admin_archive_event()
  → events: status = 'archived'
```

### fighters.wins/losses/draws 업데이트 여부

| RPC | fighters UPDATE? | 근거 |
|---|---|---|
| `service_settle_matchup` | **없음** | 코드 전체 읽기 확인 — fighters 테이블 한 번도 언급 안 됨 |
| `admin_set_matchup_result` | **없음** | service_settle_matchup 위임 + audit log만 기록 |
| `admin_settle_event` | **없음** | pending picks 취소 + events.status 변경만 |
| `admin_archive_event` | **없음** | events.status = 'archived'만 변경 |
| DB 트리거 | **없음** | 트리거: users 보호 트리거 1개만 존재 |

**결론: 전체 파이프라인에서 fighters.wins/losses/draws를 자동 업데이트하는 코드/트리거가 없다.**

---

## 2. FN276 샘플 검증

### archive_fights (FN276 — Allen vs Costa)

| f1_name | f2_name | winner | method | round |
|---|---|---|---|---|
| Arnold Allen | Melquizael Costa | Arnold Allen | UD | 5 |
| DooHo Choi | DanielSantos | DooHo Choi | KO/TKO | 2 |
| MalcolmWellmaker | JuanDiaz | JuanDiaz | SUB | 2 |
| ... | ... | ... | ... | ... |

(총 13경기 저장됨 — 정상적으로 archive에 snapshot됨)

### fighters 테이블 현재 값

| name | wins | losses | draws | 비고 |
|---|---|---|---|---|
| Arnold Allen | 20 | 4 | 0 | FN276에서 승리했지만 21이 아님 |
| Melquizael Costa | 25 | 7 | 0 | FN276에서 패배했지만 8패가 아님 |
| Dooho Choi | 16 | 4 | 1 | FN276에서 승리 — 이미 반영됐거나 수동 입력 |

**분석**: 자동 업데이트가 없으므로 현재 `fighters` record는 마지막으로 수동 입력된 시점의 값. 매 이벤트 정산 후 수동으로 Admin 파이터 탭에서 업데이트해야 함.

---

## 3. 위험도 평가

### P1 여부
| 기준 | 판단 |
|---|---|
| 코어 픽/정산/포인트 기능 영향 | ✅ 없음 |
| 랭킹 탭 신뢰도 | ⚠️ 일부 영향 — 전적이 오래된 상태일 수 있음 |
| 매치업 카드 선수 stats | ⚠️ 일부 영향 — record 표시 부정확 가능 |
| 출시 전 필수 여부 | ❌ P1 아님 |

**판단: P2** — 잘못된 record는 UX 품질 문제이지 기능 오류가 아님. 관리자가 Admin 탭에서 수동으로 업데이트 가능.

### 출시 전 최소 조치 (Manual)
- 각 이벤트 결과 입력 후 주요 선수(특히 픽이 많은 선수)의 wins/losses Admin에서 수동 갱신
- 2026-06-15 이벤트 결과 입력 후 해당 선수 record 즉시 업데이트

---

## 4. 개선 설계

### 방안 비교

| | Option A: service_settle_matchup에 통합 | Option B: admin_archive_event에 통합 | Option C: 별도 RPC (권장) |
|---|---|---|---|
| 자동화 | ✅ 완전 자동 | ⚠️ archive 안 하면 미실행 | ❌ 수동 실행 필요 |
| 안전성 | ❌ 정산 트랜잭션 복잡도 증가 | ⚠️ archive optional 단계 |  ✅ 별도 트랜잭션, dry-run 지원 |
| 역산 | ❌ service_settle_matchup force 역산과 충돌 | ❌ 별도 처리 필요 | ✅ 별도 rollback 로그 |
| 테스트 가능성 | ❌ | ❌ | ✅ p_dry_run=true |
| fighter_id 없을 때 | ❌ silent skip 불투명 | ❌ | ✅ 명시적 리포트 |

**권장: Option C — `admin_apply_fight_results_to_fighters` 별도 RPC**

---

## 5. Option C 설계 (권장)

### RPC 시그니처
```sql
CREATE OR REPLACE FUNCTION public.admin_apply_fight_results_to_fighters(
    p_event_id UUID,
    p_dry_run  BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
-- 반환: { applied: [{fighter_name, fighter_id, field, before, after}], skipped, dry_run }
```

### 로직
```
1. private.is_admin() 체크
2. events 로드 — status = 'settled' OR 'archived' 여야만 실행 허용
3. 이 이벤트에 이미 적용됐는지 fighter_record_updates_applied 체크 (idempotency)
4. matchups JOIN fighters:
   - result_status = 'completed': winner fighter_id → wins+1, loser fighter_id → losses+1
   - result_status = 'draw': both fighter_ids → draws+1
   - result_status = 'no_contest': 변경 없음 (NC는 record에 포함 안 함)
   - fighter_id = NULL인 선수: skipped 리스트에 기록 (이름만 있는 경우)
5. p_dry_run = false일 때만 UPDATE 실행
6. admin_audit_logs에 before/after 기록
7. fighter_record_updates_applied에 event_id 기록 (중복 방지)
```

### 필요한 신규 테이블
```sql
CREATE TABLE public.fighter_record_updates_applied (
    event_id   UUID PRIMARY KEY REFERENCES public.events(id),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_by UUID REFERENCES auth.users(id),
    summary    JSONB
);
```

### idempotency 보장
- `fighter_record_updates_applied`에 `event_id` PRIMARY KEY → 동일 이벤트 재실행 시 RAISE EXCEPTION 또는 return idempotent=true

### rollback / repair 전략
- `admin_audit_logs`에 before_data 저장 → admin_upsert_fighter로 수동 복원 가능
- `fighter_record_updates_applied`에서 event_id 삭제 → 재실행 허용

---

## 6. 출시 전/후 액션 구분

### 출시 전 (2026-06-10 기준)
| 항목 | 타입 | 담당 |
|---|---|---|
| 현재 fighters record 현황 파악 | Manual 검토 | 운영자 |
| FN276/FN273/FN274 등 결과 반영 필요 선수 수동 업데이트 (Admin 파이터 탭) | Manual | 운영자 |
| admin_apply_fight_results_to_fighters RPC 설계 완료 | Doc | 이번 완료 |

### 출시 후 (Phase 9+)
| 항목 | 타입 | 비고 |
|---|---|---|
| `fighter_record_updates_applied` 테이블 migration | DB migration | 승인 후 |
| `admin_apply_fight_results_to_fighters` RPC 생성 | DB migration | 승인 후 |
| Admin UI에 "파이터 전적 반영" 버튼 추가 | Frontend | 별도 작업 |
| 2026-06-15 이벤트 정산 후 첫 실행 | Admin action | 테스트 필요 |

---

## 7. 관련 파일

| 파일 | 내용 |
|---|---|
| `supabase/migrations/20260426_settle_matchup_v3.sql` | `service_settle_matchup` — fighters 미업데이트 확인 |
| `supabase/migrations/20260502_event_lifecycle_phase1.sql` | `admin_settle_event`, `admin_archive_event` — fighters 미업데이트 확인 |
| `public/js/admin.js` | `adminUpsertFighter()` — 수동 record 업데이트 경로 (현재 유일한 수단) |
