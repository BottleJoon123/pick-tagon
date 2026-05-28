# QA Run: Archive UI Polish (Release-Fix-14A + 14B)
> 실행일: 2026-05-28  
> 대상: Archive 탭 UI 개선 + 모바일 레이아웃 겹침 수정  
> 방법: 코드 정적 분석 + npm run build  
> 제약: DB write/delete 금지, archive_events/archive_fights 수정 금지

---

## Verdict: PASS (build) — 브라우저 smoke QA 필요

---

## Release-Fix-14B: 모바일 레이아웃 겹침 수정

### 문제
모바일 375px에서:
1. 이벤트명이 넘쳐서 카드 밖으로 흘러나옴 (min-w-0 체인 끊김)
2. 메인 이벤트 행에서 파이터 이미지가 flex-wrap으로 줄바꿈되어 쌓임
3. Fight row에서 f1img + 이름 + f2img가 좌우에서 텍스트를 압박, names flex-wrap으로 3줄 스택

### 수정 (`public/js/archive.js`)

| 영역 | 수정 내용 |
|---|---|
| 이벤트 헤더 icon+text 컨테이너 | `min-w-0` 추가, text 래퍼 `min-w-0`, 이벤트명 `truncate`, 날짜 `truncate`, UPCOMING 배지 `flex-shrink-0` |
| 메인 이벤트 행 | `flex-wrap` 제거 → `min-w-0 flex-1`, 파이터 이미지 `hidden lg:block`, 파이터명 `truncate min-w-0`, 태그 배지 `flex-shrink-0` |
| Fight row 왼쪽 컨테이너 | `flex items-center gap-2 min-w-0 flex-1` |
| Fight row f1 이미지 | `hidden lg:block` (모바일 숨김) |
| Fight row f2 이미지 | 제거 (텍스트 뒤에 붙어 width 잠식, 정보 중복) |
| Fight row 이름 행 | `flex-wrap` 제거, 각 이름 `flex-1 min-w-0 truncate`, "vs" `flex-shrink-0` |
| Fight row 텍스트 블록 | `min-w-0 flex-1` |

### 변경 없는 항목
- 데스크탑: lg+ breakpoint에서 이미지 정상 표시 유지
- DB/data 로직 변경 없음
- admin archive flow 변경 없음

---

## 1. 조사 결과 요약

### Archive 데이터 출처
| 구성 요소 | 결론 |
|---|---|
| `public/js/archive.js` | 100% DB-driven. `archiveDB` ← `archive_events` + `archive_fights` only. 하드코딩 없음 |
| `public/js/data/fights.js` FIGHTS 배열 | 현재 이벤트 fight card 전용 (archive와 무관) |
| `index.html` line 2314 | 사이드바 current-event fallback (`eventInfo` localStorage) — archive와 무관 |

→ **제거할 하드코딩 archive 데이터 없음.** Archive는 이미 DB 기반.

### DB archive_events 현황 (11개)
| 이벤트 | 날짜 | 경기수 |
|---|---|---|
| UFC Fight Night 276 - Allen vs. Costa | 2026-05-16 | 13 |
| UFC 328 - Chimaev vs. Strickland | 2026-05-09 | 13 |
| UFC Fight Night 275 - Della Maddalena vs. Prates | 2026-05-02 | 0 |
| UFC Fight Night 274 - Sterling vs. Zalal | 2026-04-25 | 12 |
| UFC Fight Night 273 - Burns vs. Malott | 2026-04-18 | 13 |
| UFC 327 | 2026-04-12 | 0 |
| UFC 312 | 2025-02-08 | 2 |
| UFC 311 | 2025-01-18 | 3 |
| UFC 308 | 2024-10-26 | 2 |
| UFC 303 | 2024-06-29 | 3 |
| UFC 300 | 2024-04-13 | 4 |

→ FN275 / UFC 327: fight_count=0. UI에서 "0경기" + 버튼 없음으로 정상 표시됨 (버그 아님).

---

## 2. UI 개선 내역

### 문제: 이벤트 카드 padding/font 과대
- 이벤트 헤더 `px-6 lg:px-10 py-5 lg:py-7` → 카드 1개가 화면을 많이 차지
- 이벤트명 `text-lg lg:text-3xl` → 데스크탑에서 과도하게 큼
- 아이콘 배지 `w-10 h-10 lg:w-14 lg:h-14` → 불필요하게 큼
- Stats bar `p-4 lg:p-8`, 숫자 `text-2xl lg:text-5xl` → 과대

### 수정 (`public/js/archive.js` `renderArchive()`)

| 요소 | 변경 전 | 변경 후 |
|---|---|---|
| 이벤트 헤더 padding | `px-6 lg:px-10 py-5 lg:py-7` | `px-4 lg:px-6 py-3 lg:py-4` |
| 아이콘 배지 크기 | `w-10 h-10 lg:w-14 lg:h-14 rounded-2xl` | `w-8 h-8 lg:w-10 lg:h-10 rounded-xl` |
| 이벤트명 폰트 | `text-lg lg:text-3xl` | `text-sm lg:text-xl` |
| 토글 버튼 | `px-3 lg:px-4 py-1 lg:py-2 text-xs` | `px-2 lg:px-3 py-1 text-[10px]` |
| 메인 이벤트 padding | `px-6 lg:px-10 py-5 lg:py-6` | `px-4 lg:px-6 py-3 lg:py-4` |
| 메인 이벤트 파이터명 | `text-sm lg:text-xl` | `text-xs lg:text-base` |
| 경기 row padding | `px-6 lg:px-10 py-4` | `px-4 lg:px-6 py-2.5` |
| 경기 row 파이터명 | `text-xs lg:text-base` | `text-xs lg:text-sm` |

### 수정 (`index.html` archive section)

| 요소 | 변경 전 | 변경 후 |
|---|---|---|
| Stats bar card padding | `p-4 lg:p-8` | `p-3 lg:p-5` |
| Stats bar 숫자 폰트 | `text-2xl lg:text-5xl` | `text-xl lg:text-3xl` |
| archive-list 간격 | `space-y-4 lg:space-y-6` | `space-y-3 lg:space-y-4` |

---

## 3. 변경 없는 항목

| 항목 | 판단 |
|---|---|
| `fights.js` FIGHTS 배열 | archive와 무관한 현재 이벤트 데이터 — 유지 |
| `index.html` sidebar fallback (line 2314) | localStorage eventInfo 기반 사이드바 — archive와 무관, 유지 |
| FN275/UFC 327 0경기 표시 | 정상 동작 (버튼 없음, "0경기" 표시) — DB에 fights 입력 시 자동 해결 |
| Admin archive flow | 변경 없음 |

---

## 4. 수동 QA 체크리스트

| # | 항목 | 확인 방법 |
|---|---|---|
| Q-1 | 이벤트 카드 컴팩트 표시 | Archive 탭 → 카드 높이 감소, 이벤트명 축소 확인 |
| Q-2 | 결과 보기 토글 동작 | "결과 보기" 클릭 → 경기 목록 펼침/접힘 |
| Q-3 | Stats bar 숫자 표시 | 총 이벤트/총 경기/KO 비율 정상 렌더링 |
| Q-4 | 0경기 이벤트 (FN275, UFC 327) | 헤더만 표시, "0경기", 버튼 없음 |
| Q-5 | 검색/필터 동작 | 이벤트 검색 → 필터링 정상 |
| Q-6 | Mobile 375px | 카드 레이아웃 깨짐 없음 |
| Q-7 | console error 없음 | DevTools 확인 |

---

## 5. 수정 파일 요약

| 파일 | 수정 내용 |
|---|---|
| `public/js/archive.js` | `renderArchive()`: 헤더/메인이벤트/경기row padding 축소, 폰트 축소 |
| `index.html` | archive stats bar padding/font 축소, archive-list 간격 축소 |
