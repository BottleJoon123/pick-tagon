# Battle State Server Plan

작성일: 2026-05-10
Phase: 5C (5C-1~3 완료 / 5C-4~5 구현 대기)
전제: Phase 5B (battle_votes + vote_battle RPC) 완료 (`8c4d731`)

---

## 1. Phase 5B 이후 남은 리스크

| 리스크 | 레벨 | Phase 5B 처리 여부 |
|--------|------|--------------------|
| DB 레벨 중복 투표 | HIGH | ✅ 해결 (UNIQUE 제약 + RPC) |
| Broadcast vote_cast 스팸 | HIGH | ❌ 미해결 |
| 클라이언트 HP 직접 조작 | MEDIUM | ❌ 미해결 |
| _endBattle() 클라이언트 winner 결정 | MEDIUM | ❌ 미해결 |
| attack/foul broadcast HP 조작 | MEDIUM | ❌ 미해결 (Phase 5D 후보) |
| battles 직접 UPDATE | LOW | ✅ RLS로 참가자 제한 |

### 미해결 위협 상세

**A. Broadcast vote_cast 스팸**
- `octagon:room:<battleId>` 채널에 `vote_cast` 이벤트를 아무 인증 사용자가 전송 가능
- 수신 측은 `d.for === 'starter'` 여부만 보고 `±3` HP 계산을 직접 적용
- Phase 5B가 DB 투표는 막지만 broadcast 이벤트는 차단 불가
- 정상 투표 없이 HP를 임의 방향으로 무제한 조작 가능

**B. 클라이언트 HP 직접 조작 → winner 변조**
- 콘솔에서 `octagon.starterHp = 5` 후 `_endBattle()` 호출 → winner 결정 영향
- `_endBattle()`이 `octagon.starterHp / receiverHp` (클라이언트 변수) 기준으로 winner 계산
- battles 테이블에 HP 컬럼 없음 — DB에 사후 검증 가능한 source 없음

---

## 2. 현재 구조 요약

### HP 상태
- `octagon.starterHp`, `octagon.receiverHp` — 클라이언트 메모리에만 존재
- 초기값: `acceptBattle()` 시 하드코딩 100
- 변경 경로 3가지:
  1. `octagonVote()` RPC 성공 후 로컬 ±3 계산
  2. `vote_cast` broadcast 수신 시 ±3 계산
  3. `attack` / `foul_called` broadcast 수신 시 damage 적용
- DB 저장: 없음 (배틀 진행 중 HP는 어디에도 저장되지 않음)
- 재입장 시 복원 불가 (rejoinBattle은 current_round, current_turn_nick만 DB에서 로드)

### Broadcast 이벤트 목록

| 이벤트 | 발신처 | HP 영향 | payload 검증 |
|--------|--------|---------|--------------|
| battle_accepted | receiver | 없음 | 없음 |
| live_typing | 참가자 | 없음 | 없음 |
| turn_submitted | 참가자 | 없음 | 없음 |
| turn_changed | _advanceTurn() | 없음 | 없음 |
| attack | 참가자 (게임화) | ±damage | 없음 |
| foul_called | 참가자 (게임화) | ±damage | 없음 |
| **vote_cast** | **octagonVote()** | **±3** | **없음 ← 취약** |
| battle_ended | _endBattle() | 없음 | 없음 |

### 배틀 종료
- `_endBattle()` — 클라이언트 함수, `octagon.starterHp` vs `receiverHp` 비교
- Tie-break: 발언 수(`octagon.messages`) 비교 → 동수 시 starter 우선
- DB UPDATE: `status='finished'`, `winner_nick`, `starter_votes`, `receiver_votes`, `finished_at`
- 문제: `_advanceTurn()`이 양쪽 참가자 모두에서 실행 → 5라운드 완료 시 양쪽이 각자 `_endBattle()` 호출
  → 경쟁 조건 발생 가능 (두 번의 `battles UPDATE` 전송)

---

## 3. 현재 DB 스키마

### battles 테이블 (코드에서 추론)

| 컬럼 | 타입 | 기본값 | 비고 |
|------|------|--------|------|
| id | UUID | gen_random_uuid() | PK |
| starter_id | UUID | — | FK → auth.users |
| receiver_id | UUID | NULL | FK → auth.users, 수락 시 세팅 |
| starter_nick | TEXT | — | |
| receiver_nick | TEXT | — | |
| status | TEXT | 'pending' | pending/active/finished/cancelled/declined |
| current_round | INT | 1 | |
| current_turn_nick | TEXT | NULL | |
| turn_started_at | TIMESTAMPTZ | NULL | |
| winner_nick | TEXT | NULL | |
| starter_votes | INT | 0 | |
| receiver_votes | INT | 0 | |
| finished_at | TIMESTAMPTZ | NULL | |
| round_info | JSONB | {} | **현재 미사용 — Phase 5C에서 활용 예정** |
| created_at | TIMESTAMPTZ | now() | |

**주목: `starter_hp` / `receiver_hp` 컬럼 없음 — 추가 필요**

### battle_messages 테이블

| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | UUID/BIGINT | PK |
| battle_id | UUID | FK → battles |
| user_nick | TEXT | user_id 없음 (보류 항목) |
| content | TEXT | |
| round | INT | |
| created_at | TIMESTAMPTZ | |

### battle_votes 테이블 (Phase 5B 신규)

| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | UUID | PK |
| battle_id | UUID | FK → battles ON DELETE CASCADE |
| voter_id | UUID | FK → auth.users |
| side | TEXT | CHECK IN ('starter','receiver') |
| created_at | TIMESTAMPTZ | |
| — | — | UNIQUE(battle_id, voter_id) |

---

## 4. 설계 후보 비교

### 후보 A — battles 직접 HP 컬럼 + finish_battle RPC

`battles` 테이블에 `starter_hp INT DEFAULT 100`, `receiver_hp INT DEFAULT 100` 추가.
`vote_battle` RPC가 HP도 함께 갱신. `finish_battle` RPC에서 DB HP 기반 winner 결정.

| 기준 | 평가 |
|------|------|
| 운영 데이터 안정성 | 높음 — vote_battle RPC의 FOR UPDATE 잠금으로 동시성 안전 |
| 구현 범위 | 중간 — 컬럼 추가 + RPC 2개 수정/신규 + 프론트 3곳 |
| Realtime UI 유지 | 높음 — broadcast 흐름 유지, HP payload만 변경 |
| 중복/스팸 내성 | 높음 — 스팸 broadcast는 UI에만 반영, DB HP가 실제 source |
| 배틀 결과 재현 | 가능 — DB HP + round_info snapshot으로 추적 |
| 기존 UX 유지 비용 | 낮음 — 화면 흐름 변경 없음 |

### 후보 B — battle_rounds 테이블 신규

라운드별 HP 레코드 저장. 히스토리 복원 가능.

| 기준 | 평가 |
|------|------|
| 운영 데이터 안정성 | 매우 높음 |
| 구현 범위 | 높음 — 새 테이블 + RPC 복수 + 프론트 대규모 수정 |
| Realtime UI 유지 | 중간 — polling 또는 새 구독 필요 |
| 중복/스팸 내성 | 높음 |
| 배틀 결과 재현 | 매우 높음 |
| 기존 UX 유지 비용 | 높음 |

### 후보 C — battle_state 테이블 신규 (PK = battle_id)

현재 상태만 저장하는 별도 테이블. 히스토리 없음.

| 기준 | 평가 |
|------|------|
| 운영 데이터 안정성 | 높음 |
| 구현 범위 | 중간 — 새 테이블 + RPC + 프론트 |
| Realtime UI 유지 | 중간 |
| 중복/스팸 내성 | 높음 |
| 배틀 결과 재현 | 낮음 — 히스토리 없음 |
| 기존 UX 유지 비용 | 중간 |

### 후보 D — broadcast 유지, 서버 vote count만 확인

Phase 5B와 유사한 수준 유지.

| 기준 | 평가 |
|------|------|
| 운영 데이터 안정성 | 낮음 — HP 조작 근본 해결 안 됨 |
| 구현 범위 | 낮음 |
| 중복/스팸 내성 | 낮음 |
| 배틀 결과 재현 | 낮음 |

---

## 5. 추천안 — 후보 A (battles HP 컬럼 + finish_battle RPC)

### 근거

1. `round_info JSONB` 컬럼이 이미 존재 → 라운드별 HP snapshot을 추가 테이블 없이 저장 가능
2. `vote_battle` RPC의 `FOR UPDATE` 잠금이 이미 있음 → HP 동시성 업데이트 안전하게 확장 가능
3. broadcast 흐름은 유지하되 payload에 서버 HP 값을 포함 → 스팸 broadcast가 와도 정상 클라이언트는 서버 값을 따름
4. Supabase Realtime postgres_changes로 `battles` 행을 구독 → HP authoritative fallback 제공
5. `_endBattle()` → `finish_battle` RPC로 이전 → 클라이언트 winner 조작 차단, 이중 종료 경쟁 조건도 RPC의 `FOR UPDATE`로 해결

### 설계 원칙

- `vote_battle` RPC가 HP를 DB에 직접 업데이트 — 클라이언트가 HP를 계산하지 않음
- broadcast `vote_cast`는 애니메이션 trigger 목적만. payload에 HP 절대값 포함
- 수신 측은 ±3 계산 금지 — payload의 `starter_hp / receiver_hp` 절대값 적용
- `finish_battle` RPC — 서버 HP + votes 기준 winner 결정, 이중 종료 방지

---

## 6. 필요한 Migration 초안

### Migration: battles HP 컬럼 추가

```sql
-- Phase 5C-1: battles 테이블에 HP 컬럼 추가
ALTER TABLE public.battles
    ADD COLUMN IF NOT EXISTS starter_hp  INT NOT NULL DEFAULT 100,
    ADD COLUMN IF NOT EXISTS receiver_hp INT NOT NULL DEFAULT 100;
```

### Migration: vote_battle RPC 확장

```sql
-- vote_battle RPC 확장 — HP 갱신 + HP 반환 추가
-- 기존: starter_votes / receiver_votes 카운터만 증가
-- 변경: starter_hp / receiver_hp 도 DB에 갱신, 반환 payload에 포함

CREATE OR REPLACE FUNCTION public.vote_battle(
    p_battle_id UUID,
    p_side      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid      UUID := auth.uid();
    v_battle   RECORD;
    v_new_s_hp INT;
    v_new_r_hp INT;
BEGIN
    -- 1. 인증 필수
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'authentication_required');
    END IF;

    -- 2. side 검증
    IF p_side NOT IN ('starter', 'receiver') THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_side');
    END IF;

    -- 3. 배틀 조회 + 잠금
    SELECT * INTO v_battle FROM public.battles WHERE id = p_battle_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'battle_not_found');
    END IF;

    -- 4. active 상태
    IF v_battle.status <> 'active' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'battle_not_active');
    END IF;

    -- 5. 참가자 본인 투표 차단
    IF v_battle.starter_id = v_uid OR v_battle.receiver_id = v_uid THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'participant_cannot_vote');
    END IF;

    -- 6. INSERT — 중복 투표 차단
    INSERT INTO public.battle_votes (battle_id, voter_id, side)
    VALUES (p_battle_id, v_uid, p_side)
    ON CONFLICT (battle_id, voter_id) DO NOTHING;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'already_voted');
    END IF;

    -- 7. HP + 카운터 갱신
    IF p_side = 'starter' THEN
        v_new_s_hp := LEAST(100, v_battle.starter_hp + 3);
        v_new_r_hp := GREATEST(10, v_battle.receiver_hp - 3);
        UPDATE public.battles SET
            starter_hp    = v_new_s_hp,
            receiver_hp   = v_new_r_hp,
            starter_votes = COALESCE(starter_votes, 0) + 1
        WHERE id = p_battle_id;
    ELSE
        v_new_r_hp := LEAST(100, v_battle.receiver_hp + 3);
        v_new_s_hp := GREATEST(10, v_battle.starter_hp - 3);
        UPDATE public.battles SET
            starter_hp     = v_new_s_hp,
            receiver_hp    = v_new_r_hp,
            receiver_votes = COALESCE(receiver_votes, 0) + 1
        WHERE id = p_battle_id;
    END IF;

    RETURN jsonb_build_object(
        'ok',          true,
        'side',        p_side,
        'starter_hp',  v_new_s_hp,
        'receiver_hp', v_new_r_hp
    );
END;
$$;
```

### Migration: finish_battle RPC 신규

```sql
-- finish_battle RPC — 서버 HP 기준 winner 결정
-- 호출 주체: 배틀 참가자 (starter OR receiver)
-- 이중 종료 방지: FOR UPDATE 잠금 + status 검증

CREATE OR REPLACE FUNCTION public.finish_battle(p_battle_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid        UUID := auth.uid();
    v_battle     RECORD;
    v_winner     TEXT;
    v_reason     TEXT;
    v_s_msg_cnt  INT;
    v_r_msg_cnt  INT;
BEGIN
    -- 1. 인증 필수
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'authentication_required');
    END IF;

    -- 2. 배틀 조회 + 잠금 (이중 종료 방지)
    SELECT * INTO v_battle FROM public.battles WHERE id = p_battle_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'battle_not_found');
    END IF;

    -- 3. 이미 종료된 배틀 — 결과 반환 (멱등성)
    IF v_battle.status = 'finished' THEN
        RETURN jsonb_build_object(
            'ok',          true,
            'winner_nick', v_battle.winner_nick,
            'starter_hp',  v_battle.starter_hp,
            'receiver_hp', v_battle.receiver_hp,
            'reason',      'already_finished'
        );
    END IF;

    -- 4. active 상태 검증
    IF v_battle.status <> 'active' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'battle_not_active');
    END IF;

    -- 5. 참가자 검증
    IF v_battle.starter_id <> v_uid AND v_battle.receiver_id <> v_uid THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_participant');
    END IF;

    -- 6. HP 기준 winner 결정
    IF v_battle.starter_hp > v_battle.receiver_hp THEN
        v_winner := v_battle.starter_nick;
        v_reason := '투표 결과';
    ELSIF v_battle.receiver_hp > v_battle.starter_hp THEN
        v_winner := v_battle.receiver_nick;
        v_reason := '투표 결과';
    ELSE
        -- Tie-break 1: 투표 수
        IF v_battle.starter_votes > v_battle.receiver_votes THEN
            v_winner := v_battle.starter_nick;
            v_reason := '동점 — 투표 수 Tie-break';
        ELSIF v_battle.receiver_votes > v_battle.starter_votes THEN
            v_winner := v_battle.receiver_nick;
            v_reason := '동점 — 투표 수 Tie-break';
        ELSE
            -- Tie-break 2: 발언 수 (battle_messages)
            SELECT COUNT(*) INTO v_s_msg_cnt FROM public.battle_messages
            WHERE battle_id = p_battle_id AND user_nick = v_battle.starter_nick;
            SELECT COUNT(*) INTO v_r_msg_cnt FROM public.battle_messages
            WHERE battle_id = p_battle_id AND user_nick = v_battle.receiver_nick;

            v_winner := CASE
                WHEN v_s_msg_cnt >= v_r_msg_cnt THEN v_battle.starter_nick
                ELSE v_battle.receiver_nick
            END;
            v_reason := '동점 — 참여도 기준 Tie-break';
        END IF;
    END IF;

    -- 7. DB 저장
    UPDATE public.battles SET
        status      = 'finished',
        winner_nick = v_winner,
        finished_at = NOW()
    WHERE id = p_battle_id;

    RETURN jsonb_build_object(
        'ok',          true,
        'winner_nick', v_winner,
        'starter_hp',  v_battle.starter_hp,
        'receiver_hp', v_battle.receiver_hp,
        'reason',      v_reason
    );
END;
$$;

REVOKE ALL ON FUNCTION public.finish_battle(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finish_battle(UUID) TO authenticated;
```

---

## 7. 필요한 RPC 목록

| RPC | 상태 | 변경 내용 |
|-----|------|-----------|
| `vote_battle(p_battle_id, p_side)` | 기존 확장 | HP 갱신 추가, `starter_hp`/`receiver_hp` 반환 |
| `finish_battle(p_battle_id)` | 신규 | 서버 HP 기준 winner 결정, 이중 종료 방지 |
| `accept_battle` / `decline_battle` / `cancel_battle` | 변경 없음 | — |

**accept_battle 고려 사항:**
- `starter_hp = 100, receiver_hp = 100` 초기화를 RPC에서 명시적으로 SET 추가 (현재는 DEFAULT에 의존)
- 필수는 아니지만 명시적 초기화 권장

---

## 8. 프론트 수정 포인트

### 8-1. octagonVote() (index.html)

```javascript
// 변경 전: 로컬 ±3 계산 후 broadcast
octagon.starterHp = Math.min(100, octagon.starterHp + 3);
octagon.receiverHp = Math.max(10, octagon.receiverHp - 3);
_updateHpBars();
octagon.battleChannel.send({ ..., event: 'vote_cast', payload: { for: forWho } });

// 변경 후: 서버 HP 값으로 설정 후 broadcast (HP 절대값 포함)
octagon.starterHp = res.data.starter_hp;
octagon.receiverHp = res.data.receiver_hp;
_updateHpBars();
octagon.battleChannel.send({
    ..., event: 'vote_cast',
    payload: { for: forWho, starter_hp: res.data.starter_hp, receiver_hp: res.data.receiver_hp }
});
```

### 8-2. vote_cast broadcast 수신 핸들러 (index.html ~5540)

```javascript
// 변경 전: ±3 계산 적용
.on('broadcast', { event: 'vote_cast' }, function(p) {
    var d = p.payload;
    if (d.for === 'starter') {
        octagon.starterHp = Math.min(100, octagon.starterHp + 3);
        octagon.receiverHp = Math.max(10, octagon.receiverHp - 3);
    } else { ... }
    _updateHpBars();
})

// 변경 후: payload 절대값 적용 (계산 금지)
.on('broadcast', { event: 'vote_cast' }, function(p) {
    var d = p.payload;
    if (d.starter_hp !== undefined) octagon.starterHp = d.starter_hp;
    if (d.receiver_hp !== undefined) octagon.receiverHp = d.receiver_hp;
    _updateHpBars();
})
```

### 8-3. _endBattle() → finish_battle RPC 호출 (index.html ~5819)

```javascript
// 변경 전: 클라이언트 HP 기반 계산 후 직접 DB UPDATE
function _endBattle() {
    _stopTimer();
    _cleanupOctagonGame();
    octagon.status = 'finished';
    var sHp = octagon.starterHp, rHp = octagon.receiverHp;
    var winnerNick, reason;
    // ... 클라이언트 계산 ...
    sb.from('battles').update({ status: 'finished', winner_nick: winnerNick, ... });
    // ...
}

// 변경 후: RPC 위임
async function _endBattle() {
    _stopTimer();
    _cleanupOctagonGame();
    octagon.status = 'finished';

    var res = await sb.rpc('finish_battle', { p_battle_id: octagon.battleId });
    if (res.error || !res.data || !res.data.ok) {
        // already_finished 는 정상 (상대방이 먼저 종료) — 결과 조회 후 표시
        if (res.data && res.data.reason === 'already_finished') {
            renderOctagonResult(res.data.winner_nick, res.data.starter_hp, res.data.receiver_hp, '');
        }
        return;
    }
    var d = res.data;
    // battle_messages INSERT (라운드별 최종 발언) — 기존 유지
    Object.keys(octagon.roundFinalMessages).forEach(function(r) { /* ... */ });
    // broadcast — 기존 유지
    if (octagon.battleChannel) {
        octagon.battleChannel.send({
            type: 'broadcast', event: 'battle_ended',
            payload: { winnerNick: d.winner_nick, starterHp: d.starter_hp, receiverHp: d.receiver_hp, reason: d.reason }
        });
    }
    renderOctagonResult(d.winner_nick, d.starter_hp, d.receiver_hp, d.reason);
}
```

### 8-4. postgres_changes 구독 추가 (_subscribeOctagonRoom 내부)

```javascript
// 배틀 HP authoritative fallback — broadcast 스팸 방어
.on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'battles', filter: 'id=eq.' + battleId },
    function(payload) {
        var b = payload.new;
        if (b.starter_hp !== undefined) octagon.starterHp = b.starter_hp;
        if (b.receiver_hp !== undefined) octagon.receiverHp = b.receiver_hp;
        _updateHpBars();
        // 배틀이 서버에서 finished로 변경된 경우 처리
        if (b.status === 'finished' && octagon.status !== 'finished') {
            octagon.status = 'finished';
            renderOctagonResult(b.winner_nick, b.starter_hp, b.receiver_hp, '');
        }
    }
)
```

### 8-5. acceptBattle() / _subscribeOctagonRoom() — HP 초기화 명시

```javascript
// acceptBattle에서: 하드코딩 100 유지 (accept_battle RPC DEFAULT와 일치)
octagon.starterHp = 100; octagon.receiverHp = 100;  // 변경 없음

// rejoinBattle에서: DB에서 HP 로드 추가
octagon.currentRound = res.data.current_round || 1;
octagon.currentTurnNick = res.data.current_turn_nick;
octagon.starterHp = res.data.starter_hp || 100;   // 추가
octagon.receiverHp = res.data.receiver_hp || 100; // 추가
```

---

## 9. 단계별 구현 계획

### Phase 5C-1: DB Migration ✅ (2026-05-10)

Migration: `supabase/migrations/20260510_battle_state_server.sql`

완료 항목:
- `battles.starter_hp INTEGER NOT NULL DEFAULT 100` 추가
- `battles.receiver_hp INTEGER NOT NULL DEFAULT 100` 추가
- CHECK 제약: `battles_starter_hp_range` (0 ≤ starter_hp ≤ 100)
- CHECK 제약: `battles_receiver_hp_range` (0 ≤ receiver_hp ≤ 100)
- 기존 6개 row: NULL 없음, 전체 100으로 backfill 확인

QA 결과 (Supabase MCP):

| 항목 | 결과 |
|------|------|
| starter_hp: INTEGER NOT NULL DEFAULT 100 | PASS |
| receiver_hp: INTEGER NOT NULL DEFAULT 100 | PASS |
| battles_starter_hp_range CHECK (0 ≤ hp ≤ 100) | PASS |
| battles_receiver_hp_range CHECK (0 ≤ hp ≤ 100) | PASS |
| 기존 row null_rows = 0 | PASS |
| 기존 row min/max HP = 100/100 | PASS |

다음: Phase 5C-4 — postgres_changes 구독 추가

### Phase 5C-2: vote_battle RPC 확장 + 프론트 투표 흐름 변경 ✅ (2026-05-10)

Migration: `supabase/migrations/20260510_vote_battle_server_hp.sql`

완료 항목:
- `vote_battle` RPC: 투표 성공 시 `battles.starter_hp / receiver_hp` DB 갱신 추가
- `vote_battle` 반환: `{ok, side, starter_hp, receiver_hp, starter_votes, receiver_votes}`
- HP 클램핑: `LEAST(100, hp+3)` / `GREATEST(0, hp-3)` (server-side)
- `octagonVote()`: 로컬 ±3 계산 제거 → `res.data.starter_hp / receiver_hp` 절대값 적용
- `octagonVote()`: `octagon.votes.starter/receiver` 서버 값으로 동기화
- `vote_cast` broadcast payload: HP 절대값 포함 (`starter_hp, receiver_hp, starter_votes, receiver_votes`)
- `vote_cast` 수신: payload HP 절대값 우선 적용, legacy fallback 유지

QA 결과 (코드 레벨):

| 항목 | 결과 |
|------|------|
| ok:false return이 HP 변경보다 선행 | PASS |
| octagon.starterHp = res.data.starter_hp | PASS |
| octagon.receiverHp = res.data.receiver_hp | PASS |
| 로컬 ±3 계산 코드 제거 | PASS |
| broadcast payload starter_hp 포함 | PASS |
| broadcast payload receiver_hp 포함 | PASS |
| votes.starter 서버 동기화 | PASS |
| vote_cast 수신: d.starter_hp !== undefined 체크 | PASS |
| vote_cast 수신: octagon.starterHp = d.starter_hp | PASS |
| legacy fallback 존재 | PASS |
| voteSubmitting guard 유지 | PASS |
| npm run build PASS | PASS |

### Phase 5C-3: 배틀 종료 서버화 ✅ (2026-05-10)

Migration: `supabase/migrations/20260510_finish_battle_rpc.sql`

완료 항목:
- `finish_battle(p_battle_id UUID) RETURNS JSONB` RPC 신규 생성
- `SELECT FOR UPDATE` 잠금으로 이중 종료 race condition 방지
- DB HP (`starter_hp / receiver_hp`) 기준 winner 결정
- `already_finished` 멱등성: 두 번 호출 시 ok:true + 기존 결과 반환
- `participant_required`: 비참가자 호출 차단
- Tie-break: battle_messages 발언 수 → 동수 시 starter 우선
- `_endBattle()` async 전환 + `finish_battle` RPC 위임
- battle_messages INSERT await 완료 후 finish_battle 호출 (tie-break 데이터 선행 확보)
- battle_ended broadcast: reason='already_finished' 시 재전송 생략
- `renderOctagonResult` displayReason 로직: HP 차 → '투표 결과' / HP 동 → '동점 — 참여도 기준 Tie-break'
- `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated`

QA 결과 (코드 레벨 — Node.js 검증 13/13):

| 항목 | 결과 |
|------|------|
| _endBattle async function 선언 | PASS |
| finish_battle RPC 호출 존재 | PASS |
| p_battle_id: octagon.battleId 전달 | PASS |
| res.error \|\| !res.data.ok 에러 처리 | PASS |
| starterHp = d.starter_hp 절대값 적용 | PASS |
| receiverHp = d.receiver_hp 절대값 적용 | PASS |
| already_finished 시 broadcast 생략 | PASS |
| battle_ended payload winnerNick 포함 | PASS |
| battle_ended payload starterHp/receiverHp 포함 | PASS |
| roundFinalMessages battle_messages INSERT 유지 | PASS |
| displayReason: already_finished → '' | PASS |
| displayReason: HP 차 → '투표 결과' | PASS |
| displayReason: HP 동 → '동점 — 참여도 기준 Tie-break' | PASS |
| npm run build PASS (371.19 kB) | PASS |

### Phase 5C-4: postgres_changes 구독

1. `_subscribeOctagonRoom()` 내 postgres_changes 핸들러 추가
2. broadcast 스팸 시 DB 값으로 자동 수정
3. 배틀 종료 서버 이벤트 처리

### Phase 5C-5: QA

Section 10 참조

---

## 10. QA 체크리스트

### DB/RPC

| 항목 | 확인 방법 |
|------|-----------|
| battles.starter_hp / receiver_hp 컬럼 존재 | `information_schema.columns` 조회 |
| DEFAULT 100 확인 | 신규 배틀 insert 후 select |
| vote_battle 반환에 starter_hp / receiver_hp 포함 | RPC 직접 호출 |
| vote_battle HP 클램핑 (MAX 100, MIN 10) | 극단값 시나리오 호출 |
| FOR UPDATE 잠금 유지 | 동시 투표 시나리오 (수동 테스트) |
| finish_battle 이중 호출 → already_finished 반환 | 두 번 호출 |
| finish_battle 비참가자 호출 → not_participant | 제3자 계정으로 호출 |
| finish_battle HP 기준 winner 정확 | 각 HP 시나리오별 |
| Tie-break: votes 우선 → messages 차선 → starter | 시나리오 3개 |
| accept_battle 후 starter_hp = receiver_hp = 100 | select 확인 |

### 프론트

| 항목 | 확인 방법 |
|------|-----------|
| octagonVote 성공 시 서버 HP 값으로 설정 | 브라우저 콘솔 |
| vote_cast broadcast payload에 starter_hp / receiver_hp 포함 | 네트워크 인스펙터 |
| vote_cast 수신 시 ±3 계산 코드 없음 | 코드 리뷰 |
| vote_cast 수팸 broadcast → postgres_changes로 HP 정정 | 수동 broadcast 전송 |
| _endBattle() → finish_battle RPC 호출 확인 | 코드 리뷰 |
| _endBattle()에서 클라이언트 HP 비교 코드 없음 | 코드 리뷰 |
| 이중 _endBattle() → already_finished 정상 처리 | 양쪽 참가자 동시 종료 시나리오 |
| rejoinBattle HP 복원 | 도중 새로고침 후 재입장 |
| npm run build PASS | CI |
| dist/index.html 동기화 | diff 확인 |

---

## 11. Phase 5C에서 하지 않을 것

| 항목 | 이유 / 연기 대상 |
|------|-----------------|
| attack / foul broadcast HP 서버화 | Phase 5D — 동일 패턴 적용 가능하나 게임화 요소 설계 필요 |
| battle_rounds 히스토리 테이블 | 현재 round_info JSONB로 충분, 히스토리 조회 UI 미정 |
| Realtime Channel Authorization | Supabase broadcast 인증 미지원, 기능 업데이트 대기 |
| battle_messages.user_id 컬럼 추가 | Phase 5D 보안 강화 시 함께 처리 |
| 배틀 HP 실시간 조회 페이지 (전적 상세) | Phase 6 UI 설계 후 결정 |
| anon GRANT cleanup (vote_battle) | 다음 보안 cleanup Phase에서 처리 |
| 라운드 단위 HP 시각화 (리플레이) | Phase 6 |

---

## 12. 보안/RLS 정리

| RPC / 정책 | 허용 주체 | 비고 |
|------------|-----------|------|
| `vote_battle` | authenticated (spectator) | 참가자 내부 차단 |
| `finish_battle` | authenticated (참가자만) | `not_participant` 반환 |
| `accept_battle` | authenticated (receiver) | 기존 유지 |
| `decline_battle` | authenticated (receiver) | 기존 유지 |
| `cancel_battle` | authenticated (참가자) | 기존 유지 |
| `battles` UPDATE | authenticated (참가자) | RLS: starter_id OR receiver_id |
| `battle_messages` INSERT | authenticated (참가자) | RLS: battles 서브쿼리 |
| `battle_votes` INSERT | — (RPC only) | INSERT 정책 없음 |

**anon 관전:**
- `battles` SELECT: anon 허용 (공개 조회)
- `battle_messages` SELECT: anon 허용 (관전)
- `battle_votes` SELECT: anon 허용 (투표 현황)
- `vote_battle`, `finish_battle`: authenticated only (auth.uid() IS NULL 체크)

---

## 13. 다음 세션 시작 프롬프트

```
Pick-tagon Phase 5C 구현을 진행하자.

현재 상태:
- origin/main = HEAD = 3d17b08
- 설계 완료: docs/BATTLE_STATE_SERVER_PLAN.md
- 구현 대기

작업 순서:
1. Phase 5C-1: DB Migration
   - supabase/migrations/20260510_battle_state_server.sql 생성
   - battles 테이블 starter_hp / receiver_hp 추가
   - vote_battle RPC 확장 (HP 갱신 + 반환)
   - finish_battle RPC 신규
   - Supabase MCP apply_migration 적용

2. Phase 5C-2: 프론트 투표 흐름 변경
   - octagonVote() 서버 HP 사용
   - vote_cast 수신 핸들러 절대값 적용

3. Phase 5C-3: _endBattle → finish_battle RPC

4. Phase 5C-4: postgres_changes 구독 추가

5. npm run build + dist 동기화
6. 커밋: Feat: Phase 5C server-backed battle HP and finish
7. push는 QA 후 별도 승인

설계 참조: docs/BATTLE_STATE_SERVER_PLAN.md
전제 커밋: 3d17b08

주의:
- 운영 DB 수정 금지 (migration은 Supabase MCP apply_migration 경유)
- .claude/settings.json, .claudeignore 커밋 금지
```
