# QA Run: Community Post Detail Modal

일시: 2026-05-18
대상 커밋: 0572ffb → 수정 후 신규 커밋 예정
검증 방법: 코드 정적 분석 (실제 브라우저 실행 불가 환경)

---

## 결과 요약

| 항목 | 결과 | 비고 |
|------|------|------|
| 1. Community 탭 글 목록 표시 | ✅ CODE PASS | |
| 2. 글 클릭 → modal open | ✅ CODE PASS | |
| 3. inline post-expand 사용자 경로에서 제거 | ✅ CODE PASS | |
| 4. X / backdrop / ESC 닫기 | ✅ CODE PASS | |
| 5. 닫은 뒤 body scroll 복구 | ✅ CODE PASS | |
| 6. ESC handler 중복 없음 | ✅ CODE PASS | |
| 7. 제목/카테고리/작성자/본문/댓글/좋아요 표시 | ✅ CODE PASS | |
| 8. 좋아요 → modal + list count 동기화 | ✅ CODE PASS | |
| 9. 댓글 작성 → addCommentToDB + modal 갱신 | ✅ CODE PASS | |
| 10. 비로그인 댓글 guard | ✅ CODE PASS | |
| 11. 모바일 375px modal 레이아웃 | ✅ CODE PASS | |
| 12. npm run build | ✅ PASS (252ms) | |
| 13. public/dist 동기화 | ✅ PASS | |
| F-1 fix: pd-com-input 재오픈 시 초기화 | ✅ FIX 적용 | |

**코드 수정 1건, finding 3건.**

---

## 항목별 상세

### 1. Community 탭 글 목록 정상 표시
- `renderPosts()` post-row onclick → `openPostDetail(origIdx)` ✅
- cursor: pointer CSS 유지 (`post-row`: line 501) ✅
- `communityFilter`, `communitySortMode`, `communityTimeFilter` 기반 필터/정렬 영향 없음 ✅

### 2. 글 클릭 → post-detail-modal open
- `openPostDetail(origIdx)` → `posts[origIdx]` null guard ✅
- `_detailPostIdx = origIdx`, `_detailPostDbId = p.dbId` 스냅샷 ✅
- `modal.classList.remove('hidden')` ✅
- `document.body.style.overflow = 'hidden'` ✅

### 3. 기존 inline post-expand 제거
- `renderPosts()` 내 `post-expand` div 렌더링 블록 완전 제거 ✅
- `togglePostExpand()` → no-op stub ✅
- DOM에 `.post-expand` 요소 미생성 → CSS `.post-expand.open` 적용 불가 ✅

### 4. X / backdrop click / ESC 닫기
- ✕ 버튼: `onclick="closePostDetail()"` ✅
- backdrop: `onclick="if(event.target===this)closePostDetail()"` ✅
- ESC: `_detailEscHandler` keydown listener → `if(e.key==='Escape') closePostDetail()` ✅

### 5. body scroll 복구
- `closePostDetail()` → `document.body.style.overflow = ''` ✅
- 세 가지 닫기 경로(✕ / backdrop / ESC) 모두 `closePostDetail()` 단일 호출 ✅

### 6. ESC handler 중복 방지
- `openPostDetail()` 시작 시: `if (_detailEscHandler) document.removeEventListener(...)` 후 새 핸들러 등록 ✅
- `closePostDetail()` 시: `removeEventListener` + `_detailEscHandler = null` ✅
- 연속 open/open 시에도 기존 핸들러 제거 후 재등록 → 중복 없음 ✅

### 7. 컨텐츠 표시
| 요소 | 구현 | 검증 |
|------|------|------|
| 카테고리 컬러 바 | `pd-cat-bar` style.background | ✅ |
| 카테고리 배지 | `pd-cat-badge` className + textContent | ✅ |
| 날짜 | `pd-date` textContent | ✅ |
| 제목 | `pd-title` textContent via setEl | ✅ |
| 작성자+belt+faction+배틀버튼 | `pd-author` innerHTML | ✅ |
| 본문 | `pd-content` textContent (whitespace-pre-wrap) | ✅ |
| 댓글 목록 | `_renderDetailComments(p.comments)` | ✅ |
| 좋아요 버튼 | `_syncDetailLikeBtn()` | ✅ |
| stats (🔥 N  💬 N) | `pd-stats` textContent | ✅ |

- `pd-content` = `p.content` (raw string, textContent으로 XSS 방어) + `whitespace-pre-wrap` 줄바꿈 ✅
- 댓글 없을 때: "첫 댓글을 남겨주세요" placeholder ✅

### 8. 좋아요 동기화
- `likePostFromDetail()` → `likePost(_detailPostIdx)`:
  - `posts[i].likes++`, `likedPostIds.add(dbId)`, `likePostInDB(dbId)`, `save()`, `renderFeed()` ✅
- `renderFeed()` 완료 후 `_syncDetailLikeBtn()` → modal 버튼 상태 갱신 ✅
- `pd-stats` textContent 업데이트 ✅
- `likePost` 비로그인 early-return 시 `_syncDetailLikeBtn()` 호출 → 상태 변화 없어 표시 정상 유지 ✅
- `posts[]` 직접 수정이 일어나므로 `_detailPostIdx`로 재참조 시 최신 likes 값 반영 ✅

### 9. 댓글 작성 플로우
- `sendDetailComment()`:
  1. `_detailPostIdx < 0` guard ✅
  2. `p.dbId !== _detailPostDbId` stale guard ✅
  3. `text.trim()` 빈 문자열 guard ✅
  4. `!currentUser` guard → toast ✅
  5. `p.comments.push(comment)` → 즉시 로컬 반영 ✅
  6. `input.value = ''` 초기화 ✅
  7. `await addCommentToDB(p.dbId, nick, text.slice(0, 300))` → DB 저장 ✅
  8. `save()` → localStorage 동기화 ✅
  9. `_renderDetailComments(p.comments)` → modal 댓글 목록 갱신 ✅
  10. `pd-stats` 업데이트 ✅
- Enter 키 submit: `onkeydown="if(event.key==='Enter')sendDetailComment()"` ✅

### 10. 비로그인 댓글 guard
- `if (!currentUser) { showToast('⚠ 댓글은 로그인 후 작성할 수 있습니다'); return; }` ✅
- text 빈 문자열 체크 후, currentUser 체크 순서 → 빈 input 비로그인 시 text guard에서 먼저 걸림. 기능적으로 문제 없음

### 11. 모바일 375px 레이아웃
- outer: `fixed inset-0 p-4` → 16px 여백 유지 ✅
- card: `w-full max-w-2xl flex flex-col max-h-[92vh]` → 375px에서 343px 폭 ✅
- scroll area: `flex-1 overflow-y-auto p-5` → 독립 스크롤 ✅
- bottom bar: `flex-shrink-0` → 스크롤 영역 아래 고정 ✅
- 댓글 입력: `flex gap-2` row — input + SEND 버튼이 같은 행에 배치. 375px에서는 input이 flex-1로 버튼 옆에 배치 → 겹침 없음 ✅
- 실제 브라우저/모바일 확인: NOT RUN (DevTools 에뮬레이션 환경 없음)

---

## 코드 수정: F-1

**버그**: `pd-com-input` 값이 `openPostDetail()` 호출 시 초기화되지 않음.
- 재현: 글A 열기 → 댓글 입력하다 닫기 → 글B 열기 → 이전 입력 텍스트 잔류

**수정** (`public/js/community.js`, `openPostDetail()` 최상단 null guard 직후):
```javascript
// 이전 댓글 입력 잔여 텍스트 초기화
var comInput = document.getElementById('pd-com-input');
if (comInput) comInput.value = '';
```

**검증**: dist/js/community.js에 `comInput` 3회, `pd-com-input` 2회 포함 확인 ✅

---

## Finding (코드 수정 없음)

| ID | 항목 | 영향 | 조치 |
|----|------|------|------|
| F-2 | `.post-expand`, `.post-expand.open`, `.post-expand-body`, `.post-com-input-row`, `.post-com-send`, `.post-row.is-expanded` CSS — post-expand DOM 제거로 dead CSS | 없음 (렌더링에 영향 없음) | 후순위 CSS cleanup 세션에서 처리 |
| F-3 | `toggleComArea(i)` in index.html — `post-expand-{i}` 조회 실패 후 `com-area-{i}` 조회 → effective no-op | 없음 | 후순위 dead code cleanup |
| F-4 | `postCom(i)` in index.html — 모달 전환 후 사용자 경로에서 호출 안 됨. `sendDetailComment()` 대체 | 없음 | 후순위 dead code cleanup |

---

## NOT RUN 항목

- 실제 브라우저에서 modal open/close 육안 확인
- 모바일 375px DevTools 에뮬레이션
- 로그인 상태에서 댓글 실제 작성 → DB INSERT 확인
- 비로그인 상태에서 댓글 입력 → toast 확인
- 좋아요 실제 클릭 → DB post_likes INSERT + posts.likes UPDATE 확인

---

## QA 결론

| 구분 | 건수 |
|------|------|
| CODE PASS | 13/13 |
| Fix 적용 | 1 (F-1: input clear) |
| Finding (no-action) | 3 (F-2~F-4: dead CSS/code) |
| NOT RUN | 5 (실제 브라우저 테스트) |

커밋: `Fix: Polish community post detail modal QA findings`
