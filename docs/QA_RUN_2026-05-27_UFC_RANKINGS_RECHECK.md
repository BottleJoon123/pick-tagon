# QA Run — UFC Rankings Resync Precheck
> 작성일: 2026-05-27  
> origin/main HEAD: `c7f61df` Docs: Record test account deletion in auth hardening doc  
> 확인 시각: 2026-05-27 UTC  
> 조사 방법: Supabase read-only SQL, 코드 정적 확인

> ⚠️ **정정 (2026-05-27):** 아래 섹션 2~4의 WRONG 판정은 **outdated champion baseline을 사용한 false positive**로 철회됨.  
> 현재 DB champion rows는 프로젝트가 반영한 2026 기준과 일치하는 것으로 확인.  
> Resync 필요 판정도 함께 철회. 세부 내용은 섹션 7~8 참고.

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

| Division | DB Champion (C) | 판정 | 비고 |
|---|---|---|---|
| **bw** | Petr Yan | ✅ OK | 프로젝트 2026 기준 — false positive 철회 |
| **flw** | Joshua Van | ✅ OK | 프로젝트 2026 기준 — false positive 철회 |
| **fw** | Alexander Volkanovski | ✅ OK | 프로젝트 2026 기준 — false positive 철회 |
| **hw** | Tom Aspinall | ✅ OK | |
| **lhw** | Carlos Ulberg | ✅ OK | 프로젝트 2026 기준 — false positive 철회 |
| **lw** | Ilia Topuria | ✅ OK | 프로젝트 2026 기준 — division 오분류 판정 철회 |
| **mw** | Sean Strickland | ✅ OK | 프로젝트 2026 기준 — false positive 철회 |
| **ww** | Islam Makhachev | ✅ OK | 프로젝트 2026 기준 — division 오분류 판정 철회 |
| **w-bw** | Kayla Harrison | ⚠ 수동 확인 필요 | |
| **w-flw** | Valentina Shevchenko | ⚠ 수동 확인 필요 | |
| **w-sw** | Mackenzie Dern | ⚠ 수동 확인 필요 | |

---

## 3. 의심 항목 재분류 — ~~4개 FAIL~~ → 전부 false positive 철회

> **정정:** 아래 4개 항목은 원 문서 작성 시 outdated champion 기준을 사용한 오판.  
> 현재 DB 값은 프로젝트가 반영한 2026 데이터 기준으로 정상.

| 항목 | DB 값 | ~~원 판정~~ | 정정 판정 |
|---|---|---|---|
| **bw C: Petr Yan** | Petr Yan | ~~❌ FAIL~~ | ✅ OK — 프로젝트 2026 기준 일치 |
| **flw C: Joshua Van** | Joshua Van | ~~❌ FAIL~~ | ✅ OK — 프로젝트 2026 기준 일치 |
| **lhw C: Carlos Ulberg** | Carlos Ulberg | ~~❌ FAIL~~ | ✅ OK — 프로젝트 2026 기준 일치 |
| **mw C: Sean Strickland** | Sean Strickland | ~~❌ FAIL~~ | ✅ OK — 프로젝트 2026 기준 일치 |

---

## 4. ~~Division 오분류~~ — false positive 철회

> **정정:** 원 문서에서 `lw`/`ww` champion이 "완전히 뒤바뀌어 있다"고 판정했으나,  
> 이는 프로젝트가 반영한 2026 데이터 기준과 비교하지 않고 작성자의 외부 기준으로 오판한 결과.  
> 현재 DB의 `lw`, `ww`, `fw` champion rows는 프로젝트 기준 정상.  
> **Division 오분류 판정 전부 철회. DB write 불필요.**

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

## 7. Resync 필요 판정 — 정정

~~**판정: RESYNC 필요 — P1**~~ → **정정: RESYNC 불필요**

**사유**: 섹션 2~4의 WRONG 판정 전부가 outdated champion baseline을 사용한 false positive였음.  
현재 DB champion rows는 프로젝트가 반영한 2026 기준과 일치함.

| 항목 | 원 판정 | 정정 판정 |
|---|---|---|
| bw, flw, lhw, mw, fw champion rows | ~~오류 5개~~ | ✅ OK |
| lw, ww division 오분류 | ~~오류 2개~~ | ✅ OK |
| w-bw, w-flw, w-sw | ⚠ 수동 확인 필요 | ⚠ 수동 확인 필요 (유지) |

**Admin "UFC 랭킹 자동 갱신" 실행: 불필요 / HOLD**  
실제 UFC 공식 랭킹 불일치가 발견될 때만 재검토.

---

## 8. Resync 실행 — HOLD (불필요)

> **정정 결론:** Admin "UFC 랭킹 자동 갱신" 실행은 현재 불필요하며 오히려 불필요한 DB write 리스크가 있음.  
> 실행 금지 / HOLD.

**재검토 조건**: 실제 UFC 공식 랭킹과 DB 데이터 간 불일치가 발견될 경우에 한해 재검토.  
그 경우에도 `docs/UFC_RANKINGS_RESYNC_REHEARSAL_2026-06-10.md` 절차에 따라 별도 승인 후 실행.

---

## 9. 남은 리스크

| 리스크 | 수준 | 설명 |
|---|---|---|
| 여성 division champion 미검증 | P2 | w-bw, w-flw, w-sw 수동 확인 필요 (변경 없음) |
| ~~파서 lw/ww division 오분류 반복~~ | ~~P1~~ | ~~false positive 철회 — 오분류 없음~~ |
| ~~Admin 갱신 중 기존 rows 덮어쓰기~~ | ~~P1~~ | ~~resync HOLD로 해소~~ |

---

## 10. 다음 액션

| 항목 | 승인 필요 여부 | 예정 |
|---|---|---|
| ~~Admin UFC 랭킹 자동 갱신 실행~~ | ~~승인 필요~~ | **HOLD — 불필요** |
| w-bw / w-flw / w-sw champion 수동 확인 | 불필요 | 2026-05-29~06-01 수동 QA 윈도우 |
| 실제 공식 랭킹 불일치 발견 시 resync 재검토 | 별도 승인 | 해당 시점 |
