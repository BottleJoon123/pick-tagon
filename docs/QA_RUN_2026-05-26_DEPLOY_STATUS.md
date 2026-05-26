# Deploy Status Check — 2026-05-26

> 작성일: 2026-05-26  
> 확인 커밋: `2b9b177` Docs: Prepare mobile click flow QA  
> 공개 배포: **2026-06-10**

---

## 1. GitHub Actions — Deploy to GitHub Pages

| 항목 | 값 |
|---|---|
| **Run ID** | `26446144579` |
| **트리거 커밋** | `2b9b177` Docs: Prepare mobile click flow QA |
| **상태** | ✅ `completed — success` |
| **소요 시간** | 4m 18s |
| **실행 시각** | 2026-05-26T10:12:04Z |

직전 4개 run 모두 `success` 확인 (커밋 `5e76b72`, `3c6c24b`, `f88f447`, `e9113fa`).

---

## 2. Production URL Smoke

| 항목 | 값 |
|---|---|
| **URL** | `https://bottlejoon123.github.io/pick-tagon/` |
| **HTTP 상태** | ✅ `200 OK` |
| **응답 시간** | 0.40s |
| **확인 시각** | 2026-05-26 10:12 KST |

---

## 3. Release Gate 현황 (이 시점 기준)

| Gate | 상태 | 비고 |
|---|---|---|
| G-1 Production 빌드 smoke | ✅ PASS | `e494e63` |
| G-2 Supabase 연결 확인 | ✅ PASS | Auth + DB 조회 정상 |
| G-3 Admin 비노출 (비어드민) | ✅ PASS | `bc5b31a` |
| G-4 Pick Slip open/close | ✅ PASS | Playwright smoke 통과 |
| G-5 뉴스 카드 이미지 다양화 | ✅ PASS | `c3f67e1`, QA 8/8 |
| **G-6 Admin settle 리허설** | ⏳ NEEDS_MANUAL | 06-02~04 예정 |
| **G-7 Mobile 핵심 플로우** | ⏳ NEEDS_MANUAL | 05-29~06-01 예정, 체크리스트: [`MOBILE_CLICK_FLOW_QA_2026-06-10.md`](MOBILE_CLICK_FLOW_QA_2026-06-10.md) |
| **G-8 UFC 랭킹 DB resync** | ⏳ NEEDS_MANUAL | 06-02~04 예정 (승인 필요) |
| P0 known issues | ✅ 0건 | |
| P1 known issues | ✅ 0건 (수정 후) | |

---

## 4. 남은 NEEDS_MANUAL

| 코드 | 항목 | 시점 | 문서 |
|---|---|---|---|
| **M-3** | Mobile 핵심 클릭 플로우 QA | **2026-05-29~06-01** | [`MOBILE_CLICK_FLOW_QA_2026-06-10.md`](MOBILE_CLICK_FLOW_QA_2026-06-10.md) |
| **M-1** | UFC 랭킹 DB resync | 2026-06-02~04 | [`UFC_RANKINGS_RESYNC_REHEARSAL_2026-06-10.md`](UFC_RANKINGS_RESYNC_REHEARSAL_2026-06-10.md) |
| **M-2** | Admin settlement 리허설 | 2026-06-02~04 | [`ADMIN_SETTLEMENT_REHEARSAL_2026-06-10.md`](ADMIN_SETTLEMENT_REHEARSAL_2026-06-10.md) |

---

## 5. 다음 마일스톤

| 일정 | 항목 |
|---|---|
| **2026-05-29~06-01** | Manual QA 윈도우 2 (M-3 Mobile 클릭 플로우) |
| **2026-06-02~04** | Admin 리허설 윈도우 (M-1 UFC resync, M-2 Admin settle) |
| **2026-06-07 night** | 기능 동결 |
| **2026-06-08~09** | Final smoke QA (production) |
| **2026-06-10** | 공개 출시 |
