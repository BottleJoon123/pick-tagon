# QA Run: Pending Pick Change (Release-Fix-13B)
> 실행일: 2026-05-28  
> 대상: 마감 전 pending pick 변경 기능  
> 방법: 코드 정적 분석 + npm run build  
> 제약: migration DB 적용 미완료 — 아래 §5 참조

---

## Verdict: READY (migration 적용 후 PASS 예상)

코드 구현 완료 + build clean. `change_pick` RPC migration 적용 후 기능 활성화.

---

## 1. 구현 요약

| 구성 요소 | 내용 |
|---|---|
| `supabase/migrations/20260528_change_pick_rpc.sql` | `change_pick` SECURITY DEFINER RPC 신규 생성 |
| `public/js/fights-render.js` | `openPickSlip`: pending 존재 시 변경 모드로 진입 (차단 제거) |
| `public/js/fights-render.js` | `selectPickFighter`: `isChange` 플래그 → confirm 버튼 "CHANGE PICK" |
| `index.html` | `changePick()`: `change_pick` RPC 호출부 |
| `index.html` | `castChangePick()`: 포인트 불변 + state 동기화 + 커뮤니티 픽 카운터 보정 |
| `index.html` | `confirmBetSlip()`: `bs.isChange` 분기 → `castChangePick` 경로 |

---

## 2. 데이터 안전성

### 중복 row 생성 방지

`change_pick` RPC는 INSERT 없이 UPDATE만 수행. DB 레벨 partial unique index:
```sql
picks_uniq_user_fight_active ON public.picks (user_id, fight_id)
WHERE status IN ('pending', 'win', 'lose')
```
→ row 1개 유지 보장.

### 포인트 이중 변경 방지

`castChangePick`은 `state.points` 미변경 (place_pick에서 이미 차감). `change_pick` RPC도 users.points/total_picks 불변.

### 마감 후 변경 차단 (서버 + 클라이언트)

| 계층 | 조건 | 처리 |
|---|---|---|
| 클라이언트 | `state.settled[fightId]` 존재 | `openPickSlip` toast 후 return |
| 클라이언트 | `state.settled[fightId]` 존재 | `castChangePick` early return |
| 서버 RPC | `events.picks_locked_at IS NOT NULL` | RAISE EXCEPTION 'pick_locked' |
| 서버 RPC | `matchup.result_status IN ('completed','draw','no_contest')` | RAISE EXCEPTION 'pick_locked' |
| 서버 RPC | pending pick 없음 | RAISE EXCEPTION 'no_pending_pick' |

---

## 3. 기능 흐름

```
[카드 클릭 — pending 상태]
  openPickSlipFromCard → openPickSlip
  → _betSlipIsChange = true (pending 감지)
  → 포인트 체크 스킵 (비용 없음)
  → 베팅 슬립 열림 (fighter select)

[파이터 선택]
  selectPickFighter
  → activeBetSlip.isChange = true
  → confirm 버튼: "✓ CHANGE PICK"

[confirm]
  confirmBetSlip
  → bs.isChange === true → castChangePick 경로
  → changePick → sb.rpc('change_pick', {...})
  → state.pendings[fightId] update (기존 교체)
  → state.history PENDING 항목 pick/payout 갱신
  → eventPickCounts 보정 (old side -1, new side +1)
  → updateLivePickBar, refreshUI
```

---

## 4. 수동 QA 체크리스트 (migration 적용 후)

| # | 항목 | 확인 방법 |
|---|---|---|
| Q-1 | 신규 픽 등록 (정상 경로) | 이벤트 카드 → 파이터 선택 → confirm → pick 표시 |
| Q-2 | 픽 변경 (다른 선수로) | 기존 픽 카드 클릭 → 반대 파이터 선택 → CHANGE PICK 확인 |
| Q-3 | DB pick row 1개 유지 | Supabase → picks 테이블 → user_id 필터 |
| Q-4 | 포인트 불변 확인 | 변경 전후 포인트 동일 |
| Q-5 | 커뮤니티 픽바 반영 | 변경 후 비율 바 갱신 확인 |
| Q-6 | "CHANGE PICK" 버튼 텍스트 | confirm step에서 "✓ CHANGE PICK" (P 표시 없음) |
| Q-7 | method/round 변경 | 변경 시 방식/라운드도 변경됨 |
| Q-8 | settled pick 변경 불가 | 정산된 카드 클릭 → "이미 결과가 확정된 경기입니다" |
| Q-9 | console error 없음 | 브라우저 DevTools 확인 |

---

## 5. Migration 적용 필요 ⚠️

`change_pick` RPC는 아직 Supabase에 적용되지 않음.

**적용 방법:**
```
Supabase MCP → apply_migration
파일: supabase/migrations/20260528_change_pick_rpc.sql
```

migration 미적용 상태에서 픽 변경 시도 → `sb.rpc('change_pick', ...)` → 함수 없음 에러 발생. 기존 픽 등록 등 다른 기능은 영향 없음.

---

## 6. 원칙 기록 (마감 후 변경 금지)

- `event.picks_locked_at IS NOT NULL` 이후 pick 변경 절대 불가 (서버 RPC 강제)
- matchup 결과 입력(`result_status = 'completed'` 등) 이후 변경 불가
- `status IN ('win','lose','cancelled')` pick은 change_pick 대상 아님 (pending만 허용)
- 클라이언트 `state.settled[fightId]` 가드는 UI 레벨 추가 방어선 (서버가 최종 권위)

---

## 7. 관련 파일

| 파일 | 내용 |
|---|---|
| `supabase/migrations/20260528_change_pick_rpc.sql` | change_pick SECURITY DEFINER RPC |
| `public/js/fights-render.js` | `openPickSlip` 변경 모드 분기, `_betSlipIsChange` 플래그 |
| `index.html` | `changePick`, `castChangePick`, `confirmBetSlip` 수정 |
