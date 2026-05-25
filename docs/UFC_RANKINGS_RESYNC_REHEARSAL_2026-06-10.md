# UFC Rankings DB Resync Rehearsal Plan — 2026-06-10

> 작성일: 2026-05-25  
> 연관 커밋: `30be165` Fix: Correct UFC rankings champion badge  
> 실행 예정: **운영자 승인 후** (공개 배포 전 — 2026-06-10 이전)  
> Production URL: **https://bottlejoon123.github.io/pick-tagon/**  
> 릴리즈 기준: [`docs/RELEASE_DEADLINE_PLAN_2026-06-10.md`](RELEASE_DEADLINE_PLAN_2026-06-10.md)

---

## 1. 배경

### 1-1. Release-Fix-4 파서 버그 요약

`fetchAndSyncUFCRankings()` 함수는 UFC.com 공식 랭킹 페이지를 Jina.ai 프록시로 가져와 마크다운으로 파싱한다.  
파서 버그: `######` heading이 등장하면 직전 `##### [이름](url)` 선수를 무조건 챔피언으로 확정했다.

**버그 코드 (수정 전):**
```javascript
if (line.startsWith('######') && pendingChamp) {
    allRows.push({ rank_position: 'C', fighter_name: pendingChamp, ... });
}
```

**수정 코드 (30be165 이후):**
```javascript
if (line.startsWith('######')) {
    if (pendingChamp && /champion/i.test(line)) {
        allRows.push({ rank_position: 'C', fighter_name: pendingChamp, ... });
    }
    pendingChamp = null;
    continue;
}
```

Jina.ai가 UFC.com 렌더링 시 파이터 이름 바로 아래에 `###### [2](#)` 같은 순위 링크 heading을 생성하는 경우, 버그 코드는 해당 선수를 챔피언으로 오등록했다.

### 1-2. 잘못된 champion badge 발생 원인

| 단계 | 설명 |
|---|---|
| 1 | 과거 sync 실행 시 버그 파서가 잘못된 champion row를 DB에 upsert |
| 2 | `loadUFCRankings()`가 DB에서 `rank_position = 'C'` row를 읽어 champion 섹션에 표시 |
| 3 | 비챔피언(예: Aleksandre Topuria)이 챔피언 배지(C)로 노출 |
| 4 | localStorage 캐시에도 저장돼 Supabase 연결 실패 시 잔류 |

### 1-3. 코드 수정과 DB 데이터 정정의 차이

| 항목 | 코드 수정 (완료) | DB 데이터 정정 (미완료) |
|---|---|---|
| 대상 | `index.html` 파서 로직 | `ufc_rankings` 테이블 rows |
| 효과 | **향후 sync** 시 올바른 champion 등록 | **현재 DB**의 잘못된 rows 제거 |
| 실행 방법 | git push | Admin 화면 "🔄 UFC 랭킹 자동 갱신" 1회 실행 |
| 승인 필요 | 완료 (30be165) | **운영자 승인 필요** |

> **결론:** 코드는 수정됐으나 현재 DB에는 과거 잘못된 sync 데이터가 남아 있다.  
> Admin 화면에서 "자동 갱신" 1회 실행 시 수정된 파서로 재싱크되어 정정된다.

---

## 2. 현재 의심 Champion Rows

> **아래 항목은 Supabase DB read 및 production UI에서 실제 확인 필요.**  
> 2026-05-24 sync 기준으로 P4P 순위와 모순되는 champion 할당이 확인됨.

| Division | DB champion (의심) | 의심 근거 | 실제 확인 결과 |
|---|---|---|---|
| bw (밴텀급) | Petr Yan | P4P #5인데 BW 챔피언 보유는 비일치 (현 BW 챔피언은 Merab 가능성) | |
| flw (플라이급) | Joshua Van | P4P 15위권 밖 — 챔피언 가능성 낮음 | |
| lhw (라이트헤비급) | Carlos Ulberg | P4P #14 — 챔피언이면 P4P 상위권이어야 함 | |
| mw (미들급) | Sean Strickland | P4P 15위권 밖 — 챔피언 가능성 낮음 | |

**신뢰 가능한 champion rows (현재 DB, P4P와 일치):**

| Division | DB champion | 신뢰 근거 |
|---|---|---|
| lw (라이트급) | Ilia Topuria | P4P #2 |
| fw (페더급) | Alexander Volkanovski | P4P #3 |
| hw (헤비급) | Tom Aspinall | P4P #6 |
| ww (웰터급) | Islam Makhachev | P4P #1 |

---

## 3. Read-Only 확인 절차

> **전제:** 관리자 계정 로그인 상태. 어떠한 write 액션도 실행하지 않는다.

### 3-1. Production UI 확인

| ID | 체크 항목 | 예상 결과 | 실제 결과 |
|---|---|---|---|
| R-1 | Production URL 접속 | 정상 로드 | |
| R-2 | Rankings 섹션 진입 | division 탭 + champion 카드 표시 | |
| R-3 | bw(밴텀급) division 확인 | champion 카드에 Petr Yan 또는 다른 선수? | |
| R-4 | flw(플라이급) division 확인 | champion 카드에 Joshua Van 또는 다른 선수? | |
| R-5 | lhw(라이트헤비급) division 확인 | champion 카드에 Carlos Ulberg 또는 다른 선수? | |
| R-6 | mw(미들급) division 확인 | champion 카드에 Sean Strickland 또는 다른 선수? | |
| R-7 | lw(라이트급) champion 확인 | Ilia Topuria (C 배지 유지) | |
| R-8 | fw(페더급) champion 확인 | Alexander Volkanovski (C 배지 유지) | |
| R-9 | Aleksandre Topuria C 미표시 | 어느 division에도 Aleksandre Topuria C 없음 | |
| R-10 | console error 확인 | DevTools Console 에러 없음 | |

### 3-2. Supabase DB 직접 확인 (선택)

Supabase Dashboard → SQL Editor에서 아래 쿼리 실행 (read-only):

```sql
-- 챔피언 전체 확인
SELECT division, rank_position, fighter_name, updated_at
FROM ufc_rankings
WHERE rank_position = 'C'
ORDER BY division;

-- 의심 항목 집중 확인
SELECT division, rank_position, fighter_name
FROM ufc_rankings
WHERE division IN ('bw', 'flw', 'lhw', 'mw')
  AND rank_position = 'C';
```

| Division | 예상 현황 | 실제 DB 값 | 판정 |
|---|---|---|---|
| bw | Petr Yan (의심) | | |
| flw | Joshua Van (의심) | | |
| lhw | Carlos Ulberg (의심) | | |
| mw | Sean Strickland (의심) | | |

---

## 4. Write 실행 절차

> **⛔ 아래 절차는 운영자 명시적 승인 후에만 실행한다.**  
> 승인 문구: Section 7 참조.

| 순서 | 액션 | 비고 |
|---|---|---|
| 1 | Section 5 실행 전 체크리스트 모두 완료 확인 | |
| 2 | 현재 화면 스크린샷 (Admin Rankings 탭, champion rows 보이도록) | 롤백 기준점 |
| 3 | Admin 화면 → Rankings 탭 진입 | |
| 4 | **"🔄 UFC 랭킹 자동 갱신" 버튼 1회 클릭** | 수정된 파서로 UFC.com 재싱크 |
| 5 | 토스트 메시지 확인 ("✅ N개 랭킹 갱신 완료!") | 실패 시 console 확인 |
| 6 | Section 6 실행 후 체크리스트 순서대로 확인 | |
| 7 | 의심 division champion 재확인 (화면 + DB read) | |
| 8 | console error 확인 | |

**실패 시 대응:**

| 증상 | 조치 |
|---|---|
| 토스트 "⚠ ufc_rankings 테이블 없음" | Supabase SQL Editor에서 테이블 생성 후 재실행 |
| 토스트 "❌ Jina.ai 응답 오류" | 잠시 후 재시도 (Jina.ai 일시 장애) |
| 토스트 "❌ DB 저장 실패" | console 에러 내용 캡처 후 운영자 확인 |
| 재싱크 후에도 champion 이상 | Section 3-2 SQL로 DB 재확인, 운영자 판단 |

---

## 5. 실행 전 체크리스트

> ✅ = 완료 / ❌ = 미완료 / ⚠️ = 확인 필요

| # | 항목 | 기준 | 상태 |
|---|---|---|---|
| 1 | GitHub Actions 최신 배포 success | `gh run list` 최신 run = `completed success` | |
| 2 | origin/main HEAD 확인 | `30be165` 이상 (parser fix 포함) | |
| 3 | Parser fix production 반영 확인 | Production URL에서 `fetchAndSyncUFCRankings` 소스에 `/champion/i.test` 존재 | |
| 4 | 관리자 계정 로그인 | Admin 탭 또는 톱니바퀴 노출 | |
| 5 | 네트워크 안정 | DevTools Network 탭 — Supabase 연결 정상 | |
| 6 | Jina.ai 접근 가능 | `https://r.jina.ai/` 직접 접속 시 응답 확인 | |
| 7 | 이 문서 참조 준비 | 체크리스트 인쇄 또는 별도 탭 열기 | |

---

## 6. 실행 후 체크리스트

| ID | 체크 항목 | 예상 결과 | 실제 결과 | Pass/Fail |
|---|---|---|---|---|
| W-1 | Aleksandre Topuria C 미표시 | 어느 division에도 C 배지 없음 | | |
| W-2 | bw champion 정정 확인 | 실제 BW 챔피언 표시 (Petr Yan 제거됐거나 정상 확인) | | |
| W-3 | flw champion 정정 확인 | 실제 FLW 챔피언 표시 (Joshua Van 제거됐거나 정상 확인) | | |
| W-4 | lhw champion 정정 확인 | 실제 LHW 챔피언 표시 (Carlos Ulberg 제거됐거나 정상 확인) | | |
| W-5 | mw champion 정정 확인 | 실제 MW 챔피언 표시 (Sean Strickland 제거됐거나 정상 확인) | | |
| W-6 | lw champion 유지 | Ilia Topuria C 배지 유지 | | |
| W-7 | fw champion 유지 | Alexander Volkanovski C 배지 유지 | | |
| W-8 | hw champion 유지 | Tom Aspinall C 배지 유지 | | |
| W-9 | ww champion 유지 | Islam Makhachev C 배지 유지 | | |
| W-10 | rankings contenders 정상 | 각 division 1-15위 선수 목록 표시 | | |
| W-11 | champion profile modal | champion 클릭 → modal에 🏆 CHAMPION 표시 | | |
| W-12 | console error 없음 | DevTools Console 에러 0건 | | |
| W-13 | localStorage 갱신 | 재로드 후에도 정정된 champion 표시 유지 | | |

**W-1~W-5 중 모두 Pass** 이면 DB resync 성공으로 판정.

---

## 7. 승인 문구 템플릿

운영자가 이 문서를 검토한 후 아래 문구로 실행을 승인한다.

```
UFC rankings DB resync 실행을 승인합니다.
Section 5 체크리스트 확인 완료.
Admin 화면에서 "🔄 UFC 랭킹 자동 갱신" 버튼을 1회 실행하세요.
```

> **주의:** 버튼은 1회만 클릭. 중복 클릭 시 동일 데이터로 재upsert되어 문제 없으나 불필요한 API 호출 발생.

---

## 8. Release Gate 반영

| Gate | 항목 | 조건 | 현재 상태 |
|---|---|---|---|
| G-2 | P1 버그 0개 | champion badge 오표시 P1 — 정정 완료 | ⚠️ NEEDS_MANUAL (resync 전) |
| G-5 | Production URL smoke | champion C 표시 정상 | ⚠️ NEEDS_MANUAL (resync 전) |
| G-6 | Admin 기능 확인 | 자동 갱신 버튼 동작 확인 포함 | 🔲 2026-06-02~04 예정 |

**champion badge finding 판정:**

| 단계 | 판정 |
|---|---|
| Release-Fix-4 parser fix 완료 (`30be165`) | P1 — 코드 수정 완료 |
| DB resync 실행 전 (현재) | NEEDS_MANUAL |
| DB resync 실행 + W-1~W-5 모두 Pass | **P1 CLOSED** |

---

## 9. 참고 — 자동 갱신 실패 시 수동 SQL 대안

> **운영자 별도 승인 필요. 아래는 참고용 SQL만 제공.**

```sql
-- 의심 champion rows 수동 확인 후 실제 챔피언으로 update 예시 (실행 금지 — 승인 후)
-- UPDATE ufc_rankings
--   SET fighter_name = '실제챔피언이름', fighter_name_ko = '실제챔피언한국어',
--       updated_at = now()
-- WHERE division = 'bw' AND rank_position = 'C';
```

실제 챔피언 이름은 UFC.com 공식 페이지에서 확인 후 입력.  
SQL 실행 전 운영자 명시적 승인 필요.

---

## 10. 관련 문서

| 문서 | 링크 |
|---|---|
| 릴리즈 기준 | [`RELEASE_DEADLINE_PLAN_2026-06-10.md`](RELEASE_DEADLINE_PLAN_2026-06-10.md) |
| QA 체크리스트 | [`RELEASE_QA_PLAN_2026-06-10.md`](RELEASE_QA_PLAN_2026-06-10.md) |
| Admin rehearsal | [`ADMIN_SETTLEMENT_REHEARSAL_2026-06-10.md`](ADMIN_SETTLEMENT_REHEARSAL_2026-06-10.md) |
| Manual QA run sheet | [`QA_RUN_2026-05-29_MANUAL_USER_FLOWS.md`](QA_RUN_2026-05-29_MANUAL_USER_FLOWS.md) |
