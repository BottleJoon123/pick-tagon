# QA Run — UFC Rankings Resync Precheck
> 작성일: 2026-05-27  
> origin/main HEAD: `c7f61df` Docs: Record test account deletion in auth hardening doc  
> 확인 시각: 2026-05-27 UTC  
> 조사 방법: Supabase read-only SQL, 코드 정적 확인

---

## 1. Deploy / Code 상태

| 항목 | 상태 |
|---|---|
| GitHub Actions latest | ✅ `completed success` 1m8s — "Docs: Record test account deletion" (c7f61df) |
| Production URL | `https://bottlejoon123.github.io/pick-tagon/` |
| UFC Rankings DB load 코드 | Fix-9B (`loadUFCRankings()` in `initSupabase()` 이후) ✅ |

---

## 2. DB Champion Rows — 전체 결과

**마지막 전체 동기화**: `2026-05-26 10:33:55 UTC` (전 division 동일 timestamp — 어제 bulk resync)

| Division | DB Champion (C) | 실제 현재 챔피언 | 판정 |
|---|---|---|---|
| **bw** | Petr Yan | Merab Dvalishvili | ❌ **WRONG** |
| **flw** | Joshua Van | Alexandre Pantoja | ❌ **WRONG** |
| **fw** | Alexander Volkanovski | Ilia Topuria | ❌ **WRONG** |
| **hw** | Tom Aspinall | Tom Aspinall (interim/undisputed) | ✅ |
| **lhw** | Carlos Ulberg | Alex Pereira (최근) | ❌ **WRONG** |
| **lw** | Ilia Topuria | Islam Makhachev | ❌ **WRONG** (division 오분류) |
| **mw** | Sean Strickland | Dricus Du Plessis | ❌ **WRONG** |
| **ww** | Islam Makhachev | Belal Muhammad | ❌ **WRONG** (division 오분류) |
| **w-bw** | Kayla Harrison | — | ⚠ 수동 확인 필요 |
| **w-flw** | Valentina Shevchenko | — | ⚠ 수동 확인 필요 |
| **w-sw** | Mackenzie Dern | — | ⚠ 수동 확인 필요 |

---

## 3. 의심 항목 4개 상세 분석

| 항목 | DB 값 | 판정 | 근거 |
|---|---|---|---|
| **bw C: Petr Yan** | Petr Yan | ❌ FAIL | Merab Dvalishvili (#1 in DB)가 실제 챔피언. Yan은 이전 챔피언. |
| **flw C: Joshua Van** | Joshua Van | ❌ FAIL | Alexandre Pantoja (#1 in DB)가 2023년부터 실제 챔피언. Joshua Van은 신규 top contender로 추정. |
| **lhw C: Carlos Ulberg** | Carlos Ulberg | ❌ FAIL | Ulberg은 #2 ranked. Alex Pereira가 최근 LHW 타이틀 보유. |
| **mw C: Sean Strickland** | Sean Strickland | ❌ FAIL | Dricus Du Plessis가 UFC 297 (2024-01)에서 Strickland 꺾고 챔피언 등극. |

---

## 4. 추가 발견: Division 오분류 (Critical)

DB의 `lw`/`ww` champion이 완전히 뒤바뀌어 있습니다:

| DB Division | DB Champion | 실제 해당 챔피언 | 문제 |
|---|---|---|---|
| `lw` (Lightweight) | Ilia Topuria | **Islam Makhachev** | Topuria는 FW (Featherweight) 챔피언 — division 오분류 |
| `ww` (Welterweight) | Islam Makhachev | **Belal Muhammad** | Makhachev는 LW 챔피언 — division 오분류 |
| `fw` (Featherweight) | Alexander Volkanovski | **Ilia Topuria** | Topuria가 2023년 Volk 꺾고 FW 타이틀 획득 |

**근본 원인 추정**: UFC 공식 랭킹 페이지 파싱 시 `lw`(Lightweight)와 `ww`(Welterweight)의 division key 매핑 오류 또는 스크랩 순서 오류로 추정.

---

## 5. DB 구조 확인

```
전 division row count: 16 (C + 15명)
p4p / w-p4p: 15 (champion 없음 — 정상)
전 division 마지막 업데이트: 2026-05-26 10:33:55 UTC (동일)
```

---

## 6. Production UI 확인

⚠ **NEEDS_MANUAL** — UI는 수동으로 확인 필요 (자동 접근 불가).  
DB 기준 예상 표시 내용 (Fix-9B: DB 우선 로드 적용됨):

| UI 항목 | 예상 표시 | 비고 |
|---|---|---|
| bw champion badge | Petr Yan C | ❌ 잘못된 표시 예상 |
| flw champion badge | Joshua Van C | ❌ 잘못된 표시 예상 |
| fw champion badge | Alexander Volkanovski C | ❌ Ilia Topuria C 미표시 |
| lw champion badge | Ilia Topuria C | ❌ 잘못된 division 표시 |
| mw champion badge | Sean Strickland C | ❌ 잘못된 표시 예상 |
| ww champion badge | Islam Makhachev C | ❌ 잘못된 division 표시 |
| Aleksandre Topuria C badge | — | 해당 선수 DB에 없음, 표시 안 됨 (정상) |

---

## 7. Resync 필요 판정

**판정: RESYNC 필요 — P1**

| 오류 유형 | 해당 Division | 수량 |
|---|---|---|
| 완전히 틀린 챔피언 | bw, flw, lhw, mw, fw | 5개 |
| Division 오분류 | lw, ww | 2개 |
| 확인 필요 | w-bw, w-flw, w-sw | 3개 |

전체 11개 division 중 **최소 7개 챔피언 데이터 오류** — 출시 전 필수 수정.

---

## 8. Resync 실행 승인 문구 초안

다음 중 하나의 방법으로 진행 가능:

### 방법 A — Admin "UFC 랭킹 자동 갱신" 버튼
```
Admin 패널 > UFC 랭킹 관리 > "UFC 랭킹 자동 갱신" 버튼 클릭
→ UFC 공식 사이트 재파싱 후 DB upsert
```
- **별도 승인 필요** — Admin/Pick/Octagon 로직 변경 금지 제약 하에 버튼 클릭 승인 필요
- 파싱 로직 오류가 있다면 재실행 후에도 동일 오류 재발 가능

### 방법 B — 수동 SQL upsert (개별 챔피언 수정)
- division별로 올바른 챔피언 이름으로 직접 update
- **별도 승인 + 정확한 현재 챔피언 정보 확인 필요**
- 파서 버그 미수정 상태로 다음 자동 갱신 시 재오염 위험

### 권장 순서
1. Admin 랭킹 자동 갱신 실행 (방법 A) — 별도 승인 대기
2. 갱신 후 DB champion rows 재확인 (read-only)
3. UI 확인 (수동)
4. 파서 오류가 재발하면 방법 B로 개별 수정

---

## 9. 남은 리스크

| 리스크 | 수준 | 설명 |
|---|---|---|
| 파서 lw/ww division 오분류 반복 | P1 | 자동 갱신 후에도 동일 파싱 오류 재발 가능 — 갱신 직후 재검증 필수 |
| 여성 division champion 미검증 | P2 | w-bw, w-flw, w-sw 현재 챔피언 수동 확인 필요 |
| Admin 갱신 중 기존 올바른 rows 덮어쓰기 | P1 | 현재 올바른 hw(Aspinall) 등도 재파싱 과정에서 오염될 수 있음 |
| UI localStorage 캐시 | P2 | 갱신 후에도 브라우저 캐시로 인해 구버전 표시 가능 — hard refresh 권고 |

---

## 10. 다음 액션

| 항목 | 승인 필요 여부 | 예정 |
|---|---|---|
| Admin UFC 랭킹 자동 갱신 실행 | **승인 필요** | 2026-06-02~04 (Admin 리허설 윈도우) |
| 갱신 후 DB read-only 재검증 | 불필요 | 갱신 직후 즉시 |
| Production UI champion 수동 확인 | 불필요 | 갱신 직후 |
| 파서 lw/ww 오류 재발 시 코드 수정 | 별도 검토 | 재발 시 |
