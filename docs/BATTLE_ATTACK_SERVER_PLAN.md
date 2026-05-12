# Battle Attack/Foul Server Plan

작성일: 2026-05-10
Phase: 5D 설계 (read-only 조사 — 구현 대기)
전제: Phase 5C 전체 완료 (`8bafccd`) — battles.starter_hp/receiver_hp 서버 source-of-truth 확립

---

## 1. Phase 5C 이후 위협 모델 재평가

### 1-1. winner 결정 경로 (Phase 5C 이후)

```
투표 → vote_battle RPC → battles.starter_hp / receiver_hp 갱신 (DB)
                                        ↓
배틀 종료 → finish_battle RPC → DB HP 기준 winner 결정
```

`battles.starter_hp / receiver_hp`는 오직 `vote_battle` RPC만 갱신.
attack/foul broadcast는 이 컬럼을 건드리지 않는다.

→ **attack/foul은 이미 winner에 영향을 줄 수 없다.**

> ⚠️ **전제 보정 (Finding-02)**: 위 전제는 HP 컬럼이 `vote_battle` RPC 외 경로로 변경되지 않음을 전제한다.
> 그러나 `battles_update_participant` RLS 정책이 참가자의 직접 `battles` UPDATE를 허용하므로
> HP 컬럼 직접 변조 경로가 별도로 존재한다. → 1-3 참조.

### 1-2. 남은 위협: cosmetic HP 조작

| 위협 | 영향 | Phase 5C 이후 상태 |
|------|------|-------------------|
| fake `vote_cast` broadcast | HP 화면 조작 | ✅ `postgres_changes`로 다음 DB UPDATE 시 정정 |
| fake `attack` broadcast | HP 화면 조작 | ❌ DB UPDATE 없음 → 정정 경로 없음 (다음 vote까지 유지) |
| fake `foul_called` broadcast | HP 화면 조작 | ❌ DB UPDATE 없음 → 정정 경로 없음 |
| `attack` damage 조작 (payload 변조) | 화면 HP 급락 | ❌ 클라이언트가 payload.damage를 그대로 적용 |
| `foul_called` damage 조작 | 화면 HP 급락 | ❌ 동일 |
| 내 턴이 아닐 때 `attack` broadcast 전송 | 화면 조작 | ❌ 서버 턴 검증 없음 |

→ **winner 결정은 안전하지만, 화면 HP 표시는 조작 가능하다.**

### 1-3. Finding-02: battles_update_participant RLS — HP 직접 변조 경로

**정책 현황** (`20260501_battle_rls_phase2.sql`):

```sql
CREATE POLICY battles_update_participant
    ON public.battles FOR UPDATE
    TO authenticated
    USING (starter_id = auth.uid() OR receiver_id = auth.uid());
```

컬럼 수준 제한 없이 battles row 전체 UPDATE를 허용한다.
→ starter 또는 receiver가 `starter_hp` / `receiver_hp`를 직접 UPDATE할 수 있다.

**위협 경로**:

```
authenticated user (participant)
  → supabase-js .from('battles').update({ starter_hp: 100, receiver_hp: 1 }).eq('id', ...)
  → battles_update_participant USING 통과
  → DB HP 변조 → finish_battle이 변조된 HP 기준으로 winner 결정
```

**영향도**: 높음 — Phase 5C의 "DB HP = votes 기준" 전제를 무력화할 수 있다.

**해결 후보**:

| 후보 | 방법 | 비용 | 비고 |
|------|------|------|------|
| A | `battles_update_participant` 정책 범위 축소 + 필요한 직접 UPDATE를 RPC로 이전 | 중간 | `_advanceTurn()`이 직접 UPDATE 사용 중 → RPC 이전 필요 |
| B | `starter_hp` / `receiver_hp` 컬럼에 별도 제한 정책 추가 (컬럼 수준 RLS) | 해당 없음 | PostgreSQL은 컬럼 수준 RLS 미지원 — 트리거/RPC로만 가능 |
| C | BEFORE UPDATE 트리거로 HP 변경 경로를 vote_battle 계열로 제한 | 높음 | 트리거 내 경로 검증 복잡, 유지보수 부담 |
| D | battles 직접 UPDATE 완전 차단 + 모든 UPDATE를 SECURITY DEFINER RPC로 이전 | 높음 | 장기적으로 가장 안전 — Phase 5E 적합 |

**현실적 권고**:
`_advanceTurn()` 직접 UPDATE를 RPC로 이전(후보 A)하는 것이 선행되어야
battles 직접 UPDATE RLS를 제거할 수 있다.
Phase 5D 구현 범위에 5D-0으로 포함.

---

## 2. 현재 attack/foul 코드 구조

### 2-1. OCTAGON_ATTACKS 정의

```javascript
var OCTAGON_ATTACKS = {
    'z':  { name: 'JAB',      emoji: '👊', damage: 3,  durationMs: 400, ... },
    'x':  { name: 'KICK',     emoji: '🦵', damage: 5,  durationMs: 500, ... },
    'c':  { name: 'UPPERCUT', emoji: '🥊', damage: 7,  durationMs: 550, ... },
    ' ':  { name: 'SPECIAL',  emoji: '⚡', damage: 10, durationMs: 700, ... },
};
```

damage 범위: 3 / 5 / 7 / 10. HP floor: `Math.max(5, hp - damage)`.

### 2-2. _doAttack() 흐름

```
키보드 입력 (_handleOctagonKey)
  → 내 턴 확인 (currentTurnNick === myNick, 클라이언트 로컬)
  → attackCooldown 확인 (850ms, 로컬)
  → 상대 HP -damage (로컬, Math.max(5, ...))
  → 애니메이션 + _showAttackEffect()
  → broadcast 'attack' { attackerNick, attackerRole, attackName, emoji, damage }
```

`attack` 수신 측:
```
→ attackerNick === myNick 이면 무시
→ victimRole HP -d.damage (로컬, Math.max(5, ...))
→ 애니메이션 + _showAttackEffect()
```

### 2-3. _triggerFoul() 흐름

```
onOctagonTyping() → _checkSwearWords()
  → foulCooldown 확인 (5000ms, 로컬)
  → 내 HP -10 (로컬, Math.max(5, ...))
  → _showRefereeModal()
  → broadcast 'foul_called' { nick, foul, role, damage: 10 }
```

`foul_called` 수신 측:
```
→ d.nick === myNick 이면 무시
→ foul 발동자 role HP -d.damage (로컬, Math.max(5, ...))
→ _showRefereeModal()
```

### 2-4. 핵심 취약점 요약

| 항목 | 현재 |
|------|------|
| 턴 검증 | 클라이언트 로컬만 (`currentTurnNick === myNick`) |
| cooldown 검증 | 클라이언트 로컬만 (`attackCooldown`, `foulCooldown`) |
| damage 검증 | 없음 — payload.damage를 그대로 적용 |
| DB 반영 | 없음 — attack/foul은 battles HP를 건드리지 않음 |
| postgres_changes 정정 경로 | 없음 — 다음 `vote_battle` 이전까지 화면 유지 |

---

## 3. 설계 후보 비교

### 후보 A — attack/foul도 DB HP 반영 (apply_attack RPC)

새 `apply_attack(p_battle_id, p_attack_name)` / `apply_foul(p_battle_id)` RPC를 만들어
`battles.starter_hp / receiver_hp`를 서버에서 직접 갱신.

```
_doAttack() → apply_attack RPC (await) → DB HP 갱신 → postgres_changes로 정정
```

| 기준 | 평가 |
|------|------|
| winner 결정 정확도 | 높음 — attack도 DB HP에 반영 |
| 보안 | 높음 — damage 서버 검증, 턴 서버 검증 |
| UX 반응성 | 낮음 — 공격마다 RPC 왕복 → 애니메이션 지연 체감 |
| 구현 복잡도 | 높음 — RPC 2개 신규 + 프론트 대규모 수정 |
| 턴 로직 복잡도 | 높음 — 서버에서 current_turn_nick 검증 필요 |

### 후보 B — damage 캡 검증만 (수신 측 클램핑)

broadcast를 그대로 유지하되, 수신 측에서 `d.damage`를 OCTAGON_ATTACKS 목록의 최대값으로 클램핑.

```javascript
// 수신 측에서:
var maxDmg = Math.max(...Object.values(OCTAGON_ATTACKS).map(a => a.damage)); // 10
var safeDmg = Math.min(d.damage, maxDmg);
octagon.victimHp = Math.max(5, octagon.victimHp - safeDmg);
```

| 기준 | 평가 |
|------|------|
| winner 결정 정확도 | 변화 없음 (여전히 votes만 반영) |
| 보안 | 부분적 — damage 과장은 막지만 fake broadcast 자체는 막지 못함 |
| UX 반응성 | 높음 — 기존과 동일 |
| 구현 복잡도 | 낮음 — 수신 핸들러 2줄 수정 |
| cosmetic 조작 방지 | 낮음 — damage 크기만 제한, frequency는 무제한 |

### 후보 C — attack/foul HP 분리 (cosmetic HP 별도 관리)

`battles.starter_hp / receiver_hp` = vote 전용 (winner 결정용)
`octagon.displayStarterHp / displayReceiverHp` = 화면 표시용 (vote + attack + foul 합산)

HP bar는 displayHp로 표시. finish_battle 결과는 DB HP(votes only)로 표시.
postgres_changes 수신 시 displayHp는 DB값 + 현재 로컬 attack/foul 오프셋으로 재계산.

| 기준 | 평가 |
|------|------|
| winner 결정 정확도 | Phase 5C와 동일 — votes만 반영 |
| 보안 | 낮음 — cosmetic 조작은 여전히 가능 |
| UX 일관성 | 낮음 — 화면 HP와 결과 HP가 다를 수 있어 혼란 가능 |
| 구현 복잡도 | 중간 — 상태 2개 관리 |
| cosmetic 조작 방지 | 없음 |

### 후보 D — 현상 유지 + Phase 5C-4 fallback 활용

attack/foul은 cosmetic으로 명시적으로 분류하고 수정하지 않는다.
다음 vote_battle 발생 시 postgres_changes로 DB HP로 정정됨.
결과 화면에는 DB HP(votes only)를 표시 — 이미 Phase 5C에서 구현됨.

| 기준 | 평가 |
|------|------|
| winner 결정 정확도 | 높음 — votes만 반영, attack/foul은 결과 없음 |
| cosmetic 조작 방지 | 없음 — 허용됨 (cosmetic으로 명시) |
| 구현 복잡도 | 없음 |
| 설계 명확성 | 낮음 — attack/foul이 "게임화 overlay"임을 명시해야 |

---

## 4. 추천안

### 단기 (Phase 5D-1): 후보 B + damage 캡 클램핑

구현 비용 최소, winner 결정에 영향 없음, damage 과장 공격 즉시 차단.

```javascript
// attack 수신 핸들러 수정
var MAX_ATTACK_DAMAGE = 10; // SPECIAL 기준
var safeDmg = Math.min(d.damage, MAX_ATTACK_DAMAGE);
// foul 수신 핸들러 수정
var MAX_FOUL_DAMAGE = 10;
var safeDmg = Math.min(d.damage, MAX_FOUL_DAMAGE);
```

### 중기 (Phase 5D-2, 선택적): 후보 A — apply_attack RPC

공격도 DB HP에 반영하고 싶다면:
- `battles.starter_hp / receiver_hp`가 vote + attack + foul 합산값으로 변경
- `finish_battle`도 그대로 DB HP 기준이므로 attack 참여가 winner에 반영됨
- 단, RPC 왕복 지연으로 인한 UX 저하를 감수해야 함

### 현실적 권고

**Phase 5C의 설계 원칙(votes = HP 권한) 유지를 전제로:**

attack/foul은 cosmetic overlay로 명시적으로 문서화하고,
damage 캡 클램핑만 추가하는 선에서 Phase 5D를 마무리하는 것을 권장.

이유:
1. attack/foul이 winner에 영향을 주면 투표 시스템의 의미가 희석됨
2. 공격 반응성(즉시 애니메이션)은 배틀 UX의 핵심 — RPC 지연이 큰 손해
3. fake broadcast 피해는 cosmetic + 다음 vote 시 자동 정정 — 실용적으로 수용 가능

---

## 5. 구현 범위 (Phase 5D)

### 5D-0 (완료): battles_update_participant HP 변조 차단

**완료일**: 2026-05-12  
**Migration**: `supabase/migrations/20260512_advance_turn_rpc.sql` — DB 적용 완료

**작업 내용**:
- `advance_turn(p_battle_id UUID)` RPC 신규 생성 (SECURITY DEFINER, IS DISTINCT FROM 참가자 검증, SELECT FOR UPDATE)
- `_advanceTurn()`: 직접 `battles.update()` 제거 → `advance_turn` RPC 호출 (async, 서버 반환값 기준 로컬 상태 갱신)
- `cancelBattleRequest()`: 직접 `battles.update()` 제거 → `cancel_battle` RPC 호출
- `battles_update_participant` 정책 DROP — HP 컬럼 직접 변조 경로 완전 차단

**직접 UPDATE 잔존 경로 검색 결과**: 0개 (index.html 기준)

**Finding-02 해소**: `battles_update_participant` 정책 제거로 참가자 직접 HP 변조 불가

> 참고: `_endBattle()`은 Phase 5C-3에서 이미 `finish_battle` RPC로 이전 완료.
> `cancelBattleRequest()`는 이번 Phase에서 `cancel_battle` RPC로 이전 (Finding 추가 발견 → 함께 처리).

### 5D-1: vote_battle 참가자 차단 IS DISTINCT FROM 통일

대상: `20260510_vote_battle_server_hp.sql`  
변경: `starter_id = v_uid OR receiver_id = v_uid` → `IS DISTINCT FROM` (Finding-01)  
Migration: 신규 파일 (5D-1 tag)  
영향: 없음 (active 배틀에서 이미 안전, 단순 일관성)

### 5D-2: damage 캡 클램핑 (수신 측)

대상: `index.html` `attack` 수신 핸들러 + `foul_called` 수신 핸들러  
변경: `d.damage` → `Math.min(d.damage, MAX_ATTACK_DAMAGE)` / `Math.min(d.damage, MAX_FOUL_DAMAGE)`  
상수: `MAX_ATTACK_DAMAGE = 10` (SPECIAL 기준), `MAX_FOUL_DAMAGE = 10`  
영향: damage 과장 broadcast 무력화. fake broadcast 자체는 여전히 가능하나 damage 제한됨.

### 5D-3 (선택): attack/foul cosmetic 명시화

`renderOctagonResult` 결과 화면에 "HP 결과는 투표 기준" 주석 추가  
또는 결과 화면 UI에 "(투표 기준)" 텍스트 표시  
목적: 화면 HP와 결과 HP 차이를 사용자가 이해하도록

---

## 6. Phase 5D에서 하지 않을 것

| 항목 | 이유 |
|------|------|
| apply_attack / apply_foul RPC 생성 | 반응성 저하 + 구현 복잡도 대비 cosmetic 개선만 — Phase 5E 재검토 |
| attack 가능 여부 서버 턴 검증 | RPC 방식으로만 가능 — 위와 동일 |
| battle_actions 히스토리 테이블 | Phase 6 리플레이 UI 설계 후 결정 |
| attack/foul를 완전히 제거 | 게임화 요소 — UX 감소 |

---

## 7. 다음 세션 시작 프롬프트

```
Pick-tagon Phase 5D-1 + 5D-2 구현을 진행하자.

현재 상태:
- origin/main = HEAD = push 후 최신 SHA 확인
- Phase 5C 전체 완료
- Phase 5D-0 완료: advance_turn RPC, battles_update_participant DROP
- 설계 참조: docs/BATTLE_ATTACK_SERVER_PLAN.md

작업 순서:
1. 5D-1: vote_battle RPC 참가자 차단 IS DISTINCT FROM 통일
   - supabase/migrations/20260512_vote_battle_fix_null_check.sql 생성
   - Supabase MCP apply_migration 적용
2. 5D-2: attack/foul damage 캡 클램핑 (수신 측)
   - index.html attack/foul_called 수신 핸들러 수정
   - npm run build
3. docs 업데이트
4. 커밋 후 push 대기
```
