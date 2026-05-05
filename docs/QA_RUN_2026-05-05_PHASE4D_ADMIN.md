# QA Run — 2026-05-05 (Phase 4D — Admin Pick Summary Panel)

작성일: 2026-05-05
기준 커밋: `c78859a` (origin/main)

---

## 목적

Phase 4D `get_event_pick_summary` RPC를 어드민 대진표 워크스페이스에 연결한 뒤,
이벤트별 픽 현황 패널이 RPC 값과 동일한 숫자를 표시하도록 매핑되었는지 검증한다.

검증 범위:
- RPC 반환값 확인
- `renderPickSummaryPanel()` 표시 분기 확인
- `public/js/admin.js`와 `dist/js/admin.js` 일치 확인
- production build 확인

브라우저에서 admin 계정으로 직접 클릭하는 visual QA는 별도 후속으로 남긴다.

---

## 적용 커밋

| 커밋 | 내용 |
|------|------|
| `2bce3fd` | Feat: Event pick summary RPC (Phase 4D) |
| `38a798c` | Feat: Connect admin workspace to get_event_pick_summary RPC (Phase 4D frontend) |
| `c78859a` | Docs: Update Phase 4D frontend connection in COMMON_DATA_RPC_PLAN and NEXT_WORK_PLAN |

---

## QA 케이스

### 케이스 1 — archived 이벤트: FN 273

| 항목 | RPC 값 | 패널 기대 |
|------|--------|-----------|
| total_picks | 11 | 총 픽 11 |
| unique_bettors | 2 | 참여자 2 |
| accuracy | 60 | 60%, `text-white` |
| W-L-P-C | 6-4-0-1 | 6W / 4L / 1C |
| total_paid_out | 1140 | 1,140P |

결과: PASS

### 케이스 2 — archived 이벤트: FN 274

| 항목 | RPC 값 | 패널 기대 |
|------|--------|-----------|
| total_picks | 9 | 총 픽 9 |
| unique_bettors | 1 | 참여자 1 |
| accuracy | 75 | 75%, `text-ufcRed` |
| W-L-P-C | 6-2-0-1 | 6W / 2L / 1C |
| total_paid_out | 1140 | 1,140P |

결과: PASS

### 케이스 3 — locked pending-only 이벤트: FN 275

| 항목 | RPC 값 | 패널 기대 |
|------|--------|-----------|
| total_picks | 5 | 총 픽 5 |
| unique_bettors | 2 | 참여자 2 |
| accuracy | NULL | `—`, `text-gray-600` |
| W-L-P-C | 0-0-5-0 | 5P |
| total_paid_out | 0 | 지급 포인트 영역 미표시 |

결과: PASS

### 케이스 4 — upcoming 0픽 이벤트

확인 이벤트:
- UFC 328 — Chimaev vs. Strickland
- UFC Fight Night 276 — Allen vs. Costa

| 항목 | RPC 값 | 패널 기대 |
|------|--------|-----------|
| total_picks | 0 | `픽 없음` |
| unique_bettors | 0 | empty panel |
| accuracy | NULL | empty panel |
| total_paid_out | 0 | empty panel |

결과: PASS

---

## 코드 경로 확인

| 경로 | 확인 |
|------|------|
| 이벤트 선택 | `selectBuilderEvent()` → `fetchBuilderMatchups()` → `fetchBuilderPickSummary()` |
| RPC 호출 | `sb.rpc('get_event_pick_summary', { p_event_id: _builderState.eventId })` |
| 렌더 위치 | `_renderLifecyclePanel(ev)` 바로 아래 `renderPickSummaryPanel(_builderPickSummary)` |
| 정산 후 갱신 | `onLifecycleSettle()` → `adminSettleEvent()` → `fetchBuilderPickSummary()` |
| RPC 실패 | `_builderPickSummary = null`, 패널 미표시 |
| 0픽 이벤트 | `total_picks === 0` → `픽 없음` |

결과: PASS

---

## 빌드/파일 검증

| 항목 | 결과 |
|------|------|
| `npm run build` | PASS |
| `public/js/admin.js` vs `dist/js/admin.js` | 동일 |
| `git diff --check` | PASS |

---

## 결론

| 항목 | 결과 |
|------|------|
| RPC 값과 패널 표시 매핑 | PASS |
| archived 이벤트 표시 | PASS |
| pending-only 이벤트 표시 | PASS |
| 0픽 이벤트 표시 | PASS |
| RPC 실패 방어 | 코드 경로 PASS |
| build/static 검증 | PASS |

**전체 PASS. Phase 4D admin pick summary panel smoke QA 완료.**

후속 권장:
- 실제 admin 계정으로 브라우저에서 FN 273/274/275/276 이벤트 선택 visual QA
- 정산 직후 패널 갱신 visual QA
