# Admin 결과 입력 경로 기술 부채 분석

작성: 2026-05-16 (read-only 조사 기반)
상태: 분석 완료 / 구현 미착수

---

## 1. 현재 경로 요약

### 1-A. DB matchup 기본 경로 (Path B — 현재 운영 경로)

```
confirmAdminResult() [index.html:3180]
  └─ adminSetMatchupResultWithUI() [index.html:3234]
       └─ adminSetMatchupResult() [admin.js:1627]
            └─ sb.rpc('admin_set_matchup_result', ...)
                 └─ service_settle_matchup() [SECURITY DEFINER, service_role only]
```

- 진입 조건: `isDbMatchup === true` (UUID fightId 또는 `fight._fromDB`)
- 결과: toast / 6단계 갱신 체인 (`adminSetMatchupResultWithUI` 내부)
- force=true: `confirmAdminResult()`에서 `confirm()` 다이얼로그 선행

### 1-B. Legacy fallback 경로 (dead code — 현재 미호출)

```
submitMatchupResult() [index.html:3267]
  └─ sb.functions.invoke('settle-matchup', ...)
       └─ settle-matchup Edge Function [supabase/functions/settle-matchup/index.ts]
            └─ anonClient.rpc('admin_set_matchup_result', ...)
                 └─ service_settle_matchup()
```

- 현재 `confirmAdminResult()`에서 직접 호출하는 곳 없음
- 함수 정의는 `index.html:3267`에 보존, admin.js:1626에 주석 참조
- 3-retry cold start 로직 포함

### 1-C. localStorage 경로 (settleBet — legacy fight)

```
confirmAdminResult() [index.html:3180]
  └─ else if (fight) 분기 [line 3223]
       └─ settleBet() [index.html:3318]
            └─ state.pendings[fightId] 포인트 연산 (localStorage 전용)
```

- 진입 조건: `isDbMatchup === false` 이고 `fight` 객체 존재 (localStorage fight)
- DB 기록 없음, 운영 환경에서 실질적으로 사용되지 않음

### 1-D. simulateFight() 경로 (test helper)

```
simulateFight() [index.html:3140]
  └─ settleBet() 직접 호출 [line 3150]
```

- 랜덤 결과 시뮬레이션용 테스트 헬퍼
- DB 경로 없음

---

## 2. Legacy 호출점 조사

### submitMatchupResult — 실제 호출 위치

| 위치 | 내용 | 상태 |
|------|------|------|
| `index.html:3267` | 함수 정의 | 정의만 존재 |
| `admin.js:1626` | 주석 참조 ("legacy fallback으로 보존") | 주석 |

**결론: `submitMatchupResult()`는 현재 운영 코드 어디에서도 호출되지 않는다 (dead code).**

### settle-matchup Edge Function — 호출 위치

| 위치 | 내용 | 상태 |
|------|------|------|
| `index.html:3272` | `submitMatchupResult()` 함수 본문 내부 | dead code 내부 |
| `supabase/functions/settle-matchup/index.ts` | Edge Function 파일 자체 | 배포 상태 |

- `admin.js:638, 688, 739`의 `functions.invoke` 호출은 `settle-matchup`이 아닌
  `sync-all-fighters`, `purge-inactive-fighters`, `sync-fighter-stats` 호출임

**결론: `settle-matchup` Edge Function은 현재 운영 흐름에서 호출되지 않는다.**

### settleBet — 호출 위치

| 위치 | 내용 | 상태 |
|------|------|------|
| `index.html:3150` | `simulateFight()` 내부 (test helper) | test only |
| `index.html:3225` | `confirmAdminResult()` else if (fight) 분기 | localStorage fight only |
| `index.html:3318` | 함수 정의 | 정의 |

---

## 3. Edge Function 보존/제거 판단

### 현재 상태

- `settle-matchup` Edge Function 배포 상태 유지
- 함수 자체는 내부에서 `admin_set_matchup_result` RPC를 호출 (동일 최종 경로)
- admin 인증: `users.is_admin` 컬럼 체크 (Edge Function 자체 인증 레이어)
- `service_settle_matchup` 직접 호출 없음 (Edge Function은 RPC 통해 간접 호출)

### 제거 시 리스크 평가

| 항목 | 평가 |
|------|------|
| 현재 호출됨? | 아니오 (dead code) |
| 제거 시 기능 영향 | 없음 |
| 재활성화 시나리오 | cold start 대비 fallback 목적으로 보존 중 |
| 보안 surface | Edge Function 자체 is_admin 체크 있음 → 추가 공격면 낮음 |
| 유지 비용 | 배포 상태 유지 비용 거의 없음 |

### 판단

**보존 권장** (단기):
- 제거 이익보다 유지 비용이 적음
- RPC 직접 호출 방식이 cold start 이슈 발생 시 fallback 재활성화 경로로 가치 있음
- 단, `submitMatchupResult()` JS 함수는 명확한 dead code이므로 **삭제 후보**

**제거 검토** (중기):
- Path B가 장기간 안정적으로 운영되면 Edge Function + `submitMatchupResult()` 동시 제거 고려
- 제거 전 확인: 다른 환경(dev branch)에서 Edge Function 호출 여부

---

## 4. Toast/갱신 중복 분석

### 현재 중복 구조

`adminSetMatchupResultWithUI()` (index.html:3234)와
`submitMatchupResult()` (index.html:3267)가 다음 블록을 **동일하게** 포함:

**공통 toast 포맷 (100% 동일):**
```javascript
showToast('⏳ 결과 정산 중...');
// ...
const isDrawNc = winnerSide === 'draw' || winnerSide === 'nc';
const label = isDrawNc
    ? `${winnerName} (${method}, R${round}) — ${cancels}명 환급`
    : `${winnerName} 승 (${method}, R${round}) — ${settled}명 정산 (${wins}승 ${losses}패)`;
showToast(`✅ ${label}${eventDone ? ' · 이벤트 완료!' : ''}`);
```

**공통 갱신 체인 (6단계, 동일):**
```javascript
if (typeof loadUserPicksFromDB === 'function') await loadUserPicksFromDB();
if (typeof loadUserFromDB === 'function' && currentUser) loadUserFromDB(currentUser.id);
if (typeof fetchUpcomingMatchups === 'function') await fetchUpcomingMatchups();
renderAdminFightCardList();
if (typeof fetchBuilderMatchups === 'function') await fetchBuilderMatchups();
if (typeof fetchBuilderPickSummary === 'function' && typeof fetchBuilderQA === 'function') {
    await Promise.all([fetchBuilderPickSummary(), fetchBuilderQA()]);
}
```

### 차이점

| 항목 | adminSetMatchupResultWithUI | submitMatchupResult |
|------|---------------------------|---------------------|
| RPC 호출 | `adminSetMatchupResult()` (admin.js) | `sb.functions.invoke('settle-matchup')` |
| retry 로직 | 없음 | 3회 retry (cold start) |
| 에러 처리 | `null` 체크 + toast (adminSetMatchupResult 내부) | `error.context?.json?.()` 비동기 파싱 |
| 에러 메시지 | `adminSetMatchupResult`에서 toast | throw new Error(detail) → catch toast |

### 리팩토링 후보: `_buildSettleToast()` + `_runPostSettleRefresh()`

공통 블록을 별도 헬퍼로 추출하면:
- 중복 제거: ~20줄 × 2 → 헬퍼 1개
- `submitMatchupResult()` 제거 시 자동으로 소비됨
- 단, `adminSetMatchupResultWithUI()`에서만 실제로 사용되므로 **현재는 리팩토링 실익 제한적**

---

## 5. settleBet 경로 분석

### 현재 역할

`settleBet()` (index.html:3318)은 localStorage 전용 fight 결과 정산 함수:
- `state.pendings[fightId]` 조회 (localStorage 상태)
- 포인트 계산 (방식 보너스, 라운드 보너스 포함)
- `state.points` 갱신 + localStorage 저장
- `state.history` 갱신

### 운영 환경 사용 여부

- DB matchup이 표준화된 이후 `confirmAdminResult()`의 DB 분기(`isDbMatchup`)가 우선 처리됨
- localStorage fight(`fight._fromDB === false`)가 없으면 `else if (fight)` 분기 진입 불가
- 현재 운영 환경에서 localStorage fight를 생성하는 UI 경로 없음 (레거시)

### 제거 전 확인 필요 사항

- `simulateFight()` (index.html:3140): `settleBet` 직접 호출 → 테스트 목적인지 운영 목적인지 확인
- 로컬 dev 환경에서 localStorage fight를 직접 생성해서 쓰는 경우 유무

### 판단

- `settleBet()`은 `simulateFight()` 테스트 헬퍼와 세트
- 두 함수 모두 localStorage 전용 — DB 경로 완전 이전 시 제거 후보
- **현재 제거 우선순위: 낮음** (실행되지 않지만 테스트 목적 잔존 가능성)

---

## 6. Archived/Settled 이벤트 결과 수정 정책 (미확정)

### 현재 상태

- `admin_set_matchup_result` RPC: `force` 파라미터로 재정산 허용
- `confirmAdminResult()`: `isForce === true` 시 `confirm()` 다이얼로그 표시
- archived 이벤트 결과 수정 허용 여부: **DB 레벨에서 제한 없음**
- `admin_set_matchup_result` 내부: `p_force = false`이면 이미 settled matchup 재정산 거부

### 잠재적 문제

1. `settled` 상태 이벤트의 matchup에 force 재정산 → 포인트 이중 역산/재지급 리스크
2. `archived` 이벤트의 matchup 결과 수정 → UI에서 노출 여부 불분명
3. audit log는 기록되지만 "원래 결과"의 스냅샷 없음

### 정책 결정 후보

| 옵션 | 내용 | 트레이드오프 |
|------|------|-------------|
| A. 현행 유지 | force로 항상 가능, 운영자 책임 | 단순, 사고 위험 있음 |
| B. archived 차단 | archived 이벤트 matchup 수정 RPC 레벨 차단 | 안전, 실수 방지 |
| C. 감사 스냅샷 강화 | 재정산 전 기존 결과 JSON을 audit log에 저장 | 추적성 향상 |
| D. B+C 조합 | archived 차단 + 재정산 시 before 스냅샷 | 가장 안전 |

**권장: D (B+C 조합)** — settled/archived 이벤트는 force 재정산 시 before 스냅샷 기록 필수화, archived는 RPC 레벨에서 별도 확인 토큰 요구

---

## 7. 추천 후보 A~E

### 후보 A: submitMatchupResult 제거

**범위:** `index.html`에서 `submitMatchupResult()` 함수 정의 삭제 (약 50줄)

**선행 조건:**
- Path B가 충분히 안정적으로 검증됨 ✓ (완료)
- 실제 브라우저 QA에서 `adminSetMatchupResultWithUI()` 경로 확인

**리스크:** 낮음 — dead code 제거, 기능 변경 없음

**예상 작업량:** 30분 이내

---

### 후보 B: 공통 갱신 헬퍼 추출

**범위:** `index.html`에 `_runPostSettleRefresh(data, winnerName, winnerSide, method, round)` 추출

**효과:**
- toast 포맷 단일 관리
- 갱신 체인 단일 관리
- 후보 A와 함께 진행 시 자연스러운 리팩토링

**리스크:** 낮음 — `adminSetMatchupResultWithUI()` 내부만 변경, 외부 인터페이스 유지

**예상 작업량:** 1시간

---

### 후보 C: settle-matchup Edge Function 제거

**범위:** `supabase/functions/settle-matchup/` 디렉토리 삭제 + Supabase Edge Function 배포 삭제

**선행 조건:**
- 후보 A 완료 (JS 호출점 제거)
- Path B 장기 안정 확인 (1~2 이벤트 이상)

**리스크:** 낮음 (현재 미호출), 단 배포 삭제는 비가역적

**예상 작업량:** 30분 + 배포 삭제 확인

---

### 후보 D: archived/settled 수정 정책 구현

**범위:**
1. `admin_set_matchup_result` RPC: `p_force=true` 시 기존 결과 JSON을 `admin_audit_logs.details`에 before 스냅샷 저장
2. (선택) archived 이벤트 matchup 재정산 추가 확인 토큰

**리스크:** 중간 — DB migration 필요, 기존 동작 일부 변경

**예상 작업량:** 2~3시간 (migration + QA)

---

### 후보 E: settleBet + simulateFight 정리

**범위:** `settleBet()`, `simulateFight()`, `adminSetResult()`, `editMatchupResult()` 등 localStorage fight 관련 함수 정리

**선행 조건:**
- localStorage fight 생성 경로가 완전히 제거되었는지 확인
- DB matchup 전환 이후 localStorage fight 잔존 여부 확인

**리스크:** 중간 — dev/test 목적으로 쓰이는지 확인 필요

**예상 작업량:** 1~2시간 (조사 + 정리)

---

## 8. 추천 구현 순서

```
Phase 1 (단기, 낮은 리스크):
  후보 A: submitMatchupResult 제거
  후보 B: 공통 갱신 헬퍼 추출 (A와 함께)

Phase 2 (중기, Path B 안정 확인 후):
  후보 C: settle-matchup Edge Function 제거

Phase 3 (별도 세션, DB migration 필요):
  후보 D: archived/settled 수정 정책 구현

Phase 4 (판단 후):
  후보 E: settleBet / simulateFight 정리
```

### Phase 1 상세 작업 순서

1. `index.html` 에서 `submitMatchupResult()` (lines 3266-3316) 삭제
2. `adminSetMatchupResultWithUI()` 에서 toast/갱신 공통 블록을 헬퍼 함수로 추출
   - `function _buildSettleLabel(winnerName, winnerSide, method, round, data)` → string
   - `async function _runPostSettleRefresh()` → void (6단계 갱신 체인)
3. `admin.js:1626` 주석 제거 (submitMatchupResult 참조 제거)
4. `npm run build` → dist 동기화
5. 커밋: `Refactor: Remove submitMatchupResult dead code`

---

## 9. 코드/DB/운영 데이터 변경 없음 명시

**이 문서는 read-only 조사 결과를 기록한 분석 문서입니다.**

조사 과정에서:
- 코드 수정 없음
- DB migration 없음
- 운영 데이터 수정 없음
- Edge Function 배포 변경 없음
- service_settle_matchup 권한 수정 롤백 없음

실제 구현은 각 후보별 별도 세션에서 수행 예정.

---

## 이력

| 날짜 | 내용 |
|------|------|
| 2026-05-16 | 초안 작성 (read-only 조사, Path B 전환 후 기술 부채 분석) |
