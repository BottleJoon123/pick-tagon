# QA Run: Final Visible UI Sweep (Release-Fix-17B)
> 실행일: 2026-05-29  
> 방법: 코드 정적 분석 (grep + file read)  
> 대상: 출시 전 사용자 가시 화면 전체

---

## Verdict: PASS — P2 2건 수정, P0/P1 없음

---

## 영역별 점검 결과

### 1. Home
| 항목 | 상태 | 비고 |
|---|---|---|
| live event label 크기 | ✅ | 15C에서 text-xs→text-sm 수정됨 |
| 뉴스 카드 링크 밑줄/파란색 | ✅ | 15C에서 no-underline text-inherit 적용됨 |
| hero text overflow | ✅ | clamp + truncate 정상 |

### 2. Event/Pick
| 항목 | 상태 | 비고 |
|---|---|---|
| ★ MY PICK / CHANGE PICK CTA | ✅ | 13C emerald 색상 적용됨 |
| Stats/Analysis empty state | ✅ | "최근전적 데이터 준비 중입니다" |
| mobile 375px overflow | ✅ | 별도 QA 필요 (플레이그라운드) |

### 3. UFC Rankings
| 항목 | 상태 | 비고 |
|---|---|---|
| 신장 표시 가독성 | ✅ | 15D에서 text-[9px]→text-[10px] 수정, fighters cross-ref |
| 컬럼 헤더 | ✅ | "신장/리치" → "신장" 수정됨 |
| champion badge | ✅ | absolute top-2 left-2 위치 정상 |

### 4. User Ranking
| 항목 | 상태 | 비고 |
|---|---|---|
| "유저랭킹" 명칭 | ✅ | 이전 fix에서 nav 명칭 통일됨 |
| season subtitle | ✅ | `#rankings-season-subtitle` 동적 업데이트 정상 |
| belt legend | ✅ | "픽 포인트 기반 · 예측 기록이 쌓일수록 등급이 올라갑니다" 이미 있음 |

### 5. Profile
| 항목 | 상태 | 비고 |
|---|---|---|
| 비밀번호 재설정 버튼 | ✅ | 60초 cooldown, 한국어 에러 메시지 적용됨 |
| predictor type 설명 | ✅ | 16B에서 기준 설명 추가됨 |
| history empty state | **P2 수정됨** | "No history found" (영어) → "정산된 예측 기록이 없습니다" |
| history 5개 compact | ✅ | `PREVIEW=5` + 전체 보기 버튼 정상 |
| form chart | ✅ | 별도 수정 없음 |

### 6. News/YouTube
| 항목 | 상태 | 비고 |
|---|---|---|
| YouTube category 버튼 크기 | ✅ | 15C에서 text-[9px]→text-[11px] 수정됨 |
| news card fallback 다양성 | ✅ | _NEWS_FALLBACK_POOL 5개 순환 |
| news modal body overflow | ✅ | body scroll lock 미사용 — 큰 문제 없음 |

### 7. Community
| 항목 | 상태 | 비고 |
|---|---|---|
| pick activity post 숨김 | ✅ | 15B에서 isPickShare 필터 적용됨 |
| own post edit/delete | ✅ | author === getDisplayUsername() 조건 정상 |
| empty state copy | **P2 수정됨** | `color:#2e2e2e` (거의 안 보임) → `color:#666` |
| battle entry hint | ✅ | "⚡ 옥타곤 버튼으로 배틀 신청" 안내 이미 있음 |

### 8. Archive
| 항목 | 상태 | 비고 |
|---|---|---|
| mobile 14C 유지 | ✅ | lg:hidden 2-line 레이아웃 정상 |
| desktop 14D 유지 | ✅ | hidden lg:flex face-off 레이아웃 정상 |
| winner/method/time 가독성 | ✅ | desktop text-xs, mobile text-[9px] |

---

## 수정 사항 (2건)

| 파일 | 수정 내용 |
|---|---|
| `public/js/profile.js:469` | history empty state: "No history found" → "정산된 예측 기록이 없습니다" |
| `public/js/community.js:162` | empty state color: `#2e2e2e` → `#666` (다크 배경 가시성 개선) |

---

## 잔존 P3 (출시 후 개선)

| 항목 | 분류 | 비고 |
|---|---|---|
| news modal 뒤 scroll 허용 | P3 | body scroll lock 미적용 — 기능 문제 아님 |
| archive fight winner text-[9px] (mobile) | P3 | compact 의도적, 기능 문제 아님 |
| history "WIN" pill font-size text-[8px] | P3 | readable, compact 의도적 |
