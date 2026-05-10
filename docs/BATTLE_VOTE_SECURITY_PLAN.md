# Battle Vote Security Plan

작성일: 2026-05-10
Phase: 5B (완료) / 5C (후보)

---

## 배경 및 문제 정의

배틀 관전자 투표(`octagonVote`)가 client-side `votedThisBattle` 플래그에만 의존했다.
새로고침·다른 탭·콘솔 조작으로 중복 투표가 가능한 상태였으며,
Supabase Realtime broadcast는 채널 가입자 누구나 `vote_cast` 이벤트를 전송할 수 있어
HP를 무제한으로 조작할 수 있는 보안 취약점이 존재했다.

---

## 리스크 분류 (조사일: 2026-05-10)

| 리스크 | 레벨 | 설명 |
|--------|------|------|
| votedThisBattle 우회 | HIGH | 새탭/새로고침/`exitOctagon()` 재호출 후 재투표 가능 |
| Broadcast vote_cast 스팸 | HIGH | 채널 구독자 누구나 `vote_cast` 무제한 전송 → HP 조작 |
| 콘솔 HP 직접 조작 | MEDIUM | `octagon.starterHp = 5` → `_endBattle()` 시 winner 결정 영향 |
| battles 직접 UPDATE | LOW | `battles_update_participant` RLS로 참가자만 UPDATE 가능 |

---

## Phase 5B — DB 레벨 중복 투표 차단 ✅ (2026-05-10)

커밋: `8c4d731`
Migration: `supabase/migrations/20260507_vote_battle_rpc.sql`

### 구현 내용

#### battle_votes 테이블

| 컬럼 | 타입 | 제약 |
|------|------|------|
| id | UUID | PK, gen_random_uuid() |
| battle_id | UUID | NOT NULL, FK → battles(id) ON DELETE CASCADE |
| voter_id | UUID | NOT NULL, FK → auth.users(id) |
| side | TEXT | NOT NULL, CHECK IN ('starter','receiver') |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| — | — | UNIQUE(battle_id, voter_id) |

- RLS: ENABLED
- SELECT policy: `battle_votes_select_public` — 공개 조회 허용
- INSERT policy: **없음** — SECURITY DEFINER RPC를 통해서만 삽입 가능

#### vote_battle RPC

```sql
FUNCTION public.vote_battle(p_battle_id UUID, p_side TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
GRANT authenticated
```

검증 순서:
1. `auth.uid() IS NULL` → `authentication_required`
2. `p_side NOT IN ('starter','receiver')` → `invalid_side`
3. `FOR UPDATE` 잠금으로 race condition 방지
4. `battles` NOT FOUND → `battle_not_found`
5. `status <> 'active'` → `battle_not_active`
6. `starter_id = v_uid OR receiver_id = v_uid` → `participant_cannot_vote`
7. `INSERT ... ON CONFLICT DO NOTHING` → `IF NOT FOUND` → `already_voted`
8. `starter_votes = COALESCE(starter_votes, 0) + 1` (카운터 증가)
9. `ok: true, side: p_side` 반환

#### octagonVote() 변경 (index.html)

- `function` → `async function`
- `currentUser` 없으면 조기 반환 (RPC 호출 안 함)
- `voteSubmitting` flag: RPC 요청 중 중복 클릭 차단
- RPC `ok:true`일 때만 HP ±3, `vote_cast` broadcast 실행
- RPC `ok:false` 또는 error일 때 HP/broadcast 차단, reason별 toast 표시
- `already_voted` 응답 시 `votedThisBattle = true`로 서버 기준 동기화
- `exitOctagon()` 리셋에 `voteSubmitting: false` 포함

---

## Phase 5B QA 결과

### DB/RPC 검증 (코드 레벨 + Supabase MCP)

| 항목 | 결과 |
|------|------|
| UNIQUE(battle_id, voter_id) 제약 존재 | PASS |
| CHECK(side IN ('starter','receiver')) | PASS |
| FK battles(id) ON DELETE CASCADE | PASS |
| FK auth.users(id) | PASS |
| RLS ENABLED | PASS |
| SELECT policy만 존재, INSERT policy 없음 | PASS |
| SECURITY DEFINER + SET search_path | PASS |
| GRANT authenticated only (REVOKE PUBLIC) | PASS |
| auth.uid() null → authentication_required | PASS |
| invalid_side → invalid_side | PASS |
| battle not found → battle_not_found | PASS |
| FOR UPDATE row lock (race condition 방지) | PASS |
| status ≠ active → battle_not_active | PASS |
| 참가자 본인 → participant_cannot_vote | PASS |
| ON CONFLICT DO NOTHING + IF NOT FOUND → already_voted | PASS |
| COALESCE(starter_votes, 0) + 1 증가 | PASS |

**참고**: `anon` role에도 EXECUTE가 부여돼 있으나 (`REVOKE ALL FROM PUBLIC`이 Supabase
기본 anon 부여를 덮지 못함), RPC 내부 `auth.uid() IS NULL` 체크로 비로그인 호출은
즉시 `authentication_required` 반환 — 운영 영향 없음.
다음 보안 cleanup 시 `REVOKE EXECUTE ON FUNCTION vote_battle FROM anon` 권장.

### 프론트 검증 (코드 레벨)

| 항목 | 결과 |
|------|------|
| async octagonVote | PASS |
| currentUser guard (RPC 호출 전) | PASS |
| voteSubmitting 초기화 및 exitOctagon 리셋 | PASS |
| voteSubmitting 중복 클릭 차단 | PASS |
| RPC ok:true 후에만 HP 변경 (early return 패턴 검증) | PASS |
| RPC ok:true 후에만 vote_cast broadcast 전송 | PASS |
| already_voted → votedThisBattle 서버 동기화 | PASS |
| reason별 toast (participant/not_active/auth_required) | PASS |
| npm run build PASS | PASS |
| dist/index.html 동기화 | PASS |

**전체 결론: PASS — Phase 5B 구현 완료.**

---

## Phase 5B 한계

Phase 5B는 **DB 레벨 중복 투표 방지**만 해결한다.
다음 보안 위협은 여전히 남아 있다:

1. **Broadcast 스팸** (HIGH 유지)
   - 아무 인증 사용자가 `octagon:room:<battleId>` 채널에 `vote_cast` 이벤트를 무제한 전송 가능
   - 모든 구독자의 HP가 임의로 조작됨
   - Supabase Realtime broadcast에 per-message 서버 인증이 없어 단순 차단 불가

2. **클라이언트 HP 직접 조작** (MEDIUM 유지)
   - 콘솔에서 `octagon.starterHp = 5` 후 `_endBattle()` 트리거 시 winner 영향
   - 현재 HP state는 완전히 client-side

---

## Phase 5C 후보 — Broadcast 스팸 / HP 서버사이드화

Phase 5B 이후 배틀 보안 강화 방향. **미구현, 설계 필요.**

### 후보 A: HP snapshot 서버 저장 + 종료 시 서버 검증

- `battles.hp_snapshot JSONB` — 매 라운드 HP를 DB에 저장
- `_endBattle()` 시 클라이언트 HP 대신 DB snapshot 기준으로 winner 결정
- broadcast는 UI 표시(애니메이션)용으로만 사용, 게임 결과에 영향 없음
- 구현 복잡도: 중간 — broadcast 흐름 변경 없이 DB 기록만 추가

### 후보 B: vote 이벤트 서버 집계

- `vote_battle` RPC 호출 성공 시 DB에서 HP를 직접 계산
- 클라이언트는 DB HP를 polling 또는 Realtime DB change로 수신
- broadcast `vote_cast` 제거 또는 무시
- 구현 복잡도: 높음 — battle HP 전체를 서버사이드로 이전

### 후보 C: Realtime Channel 접근 제한

- Supabase Realtime의 Channel Authorization 기능 활용
- battle 참가자/등록 관전자만 채널 입장 허용
- broadcast 메시지 자체는 여전히 인증 불가 (Supabase 현재 제약)
- 구현 복잡도: 낮음 — 하지만 broadcast spam은 제한적으로만 막힘

### 권장 순서

1. 먼저 **후보 A** (HP snapshot 저장) — broadcast 흐름 유지하며 결과 신뢰성 확보
2. 이후 **후보 B** 설계 검토 — 전체 HP 서버화
3. **후보 C**는 Supabase 기능 업데이트 확인 후 고려

---

## 보류 항목

| 항목 | 이유 |
|------|------|
| anon GRANT cleanup | 현재 auth.uid() 체크로 차단 중, 보안 cleanup Phase에서 처리 |
| battle_messages user_id 컬럼 추가 | 현재 user_nick 텍스트만 있음, 보안 강화 시 필요 |
| battles winner 결정 서버화 | Phase 5C 설계 필요 |
