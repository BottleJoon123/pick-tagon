# QA Run: Community Post Edit/Delete + RLS Security
> 실행일: 2026-05-28  
> 대상 커밋: `1a94f2c` Fix: Secure community post edit delete (`74387c7` 포함)  
> 방법: Playwright (Chrome headless) + Supabase MCP read-only SQL  
> 환경: local dev server (Vite, .env.local 없음) + Supabase MCP

---

## Verdict: PARTIAL PASS

자동화 가능한 항목 전부 PASS. 로그인 필요 항목(실제 edit/delete/like 조작)은 별도 수동 QA 필요.

---

## 1. GitHub Actions 배포 확인

| 항목 | 결과 |
|---|---|
| Actions 상태 | ✅ `completed / success` |
| build job | ✅ 17s |
| deploy job | ✅ 22s |
| 대상 커밋 | `1a94f2c Fix: Secure community post edit delete` |

---

## 2. Playwright 자동화 결과

### 2-A. 비로그인 상태 — edit/delete 버튼 숨김

| 검사 항목 | 결과 |
|---|---|
| `#pd-edit-btn` hidden (비로그인) | ✅ hidden class 확인됨 |
| `#pd-delete-btn` hidden (비로그인) | ✅ hidden class 확인됨 |
| `#pd-edit-form` hidden (비로그인) | ✅ hidden class 확인됨 |

> **근거:** Playwright로 `#pd-edit-btn:not(.hidden)`, `#pd-delete-btn:not(.hidden)` 쿼리 → 0개 반환.  
> `openPostDetail()` 내 `isOwn = !!(currentUser && p.userId && p.userId === currentUser.id)` —  
> 비로그인 시 `currentUser = null` → `isOwn = false` → 버튼에 `hidden` class 유지.

### 2-B. 레이아웃 — 3개 뷰포트

| 뷰포트 | 스크린샷 | 결과 |
|---|---|---|
| Desktop 1440×900 | `01_home_desktop_nologin.png` | ✅ 정상 |
| Desktop 1440×900 Community | `02_community_desktop_nologin.png` | ✅ 필터바·카테고리·글쓰기 버튼 정상 |
| Mobile 375×812 Community | `04_community_mobile375_nologin.png` | ✅ 모바일 네비·필터·레이아웃 정상 |
| Mobile 430×932 Community | `06_community_mobile430_nologin.png` | ✅ 정상 |

모달 하단 바(수정/삭제 + 좋아요 + 통계)는 로그인 후에만 실제 테스트 가능. 레이아웃 구조는 HTML 검사로 확인:
- `pd-edit-btn`, `pd-delete-btn` → 하단 바 flex 컨테이너 내에 `hidden` 상태로 존재
- `pd-stats` span → 같은 flex 컨테이너 내 정상 위치

### 2-C. 콘솔 에러

| 에러 | 원인 | 실제 버그 여부 |
|---|---|---|
| `Failed to load resource: 404` | `.env.local` 없음 → Supabase URL 미설정 → fetch 실패 | ❌ 개발 환경 아티팩트, 배포 환경 정상 |

---

## 3. DB 보안 정책 검증 (Supabase MCP read-only SQL)

### 3-A. RLS Policy 매트릭스

| CMD | Policy | USING | WITH CHECK |
|---|---|---|---|
| SELECT | 게시글 전체 공개 | `true` | — |
| INSERT | 게시글 본인만 작성 | — | `auth.uid() = user_id` |
| UPDATE | own post update | `auth.uid() = user_id` | `auth.uid() = user_id` |
| DELETE | own post delete | `auth.uid() = user_id` | — |

이전 취약 정책 "posts likes update" (`USING: true`) → **삭제 확인** ✅

### 3-B. 컬럼 레벨 UPDATE 권한

| 역할 | Table-level UPDATE | 허용 컬럼 |
|---|---|---|
| `authenticated` | ❌ 없음 (table-level REVOKE됨) | `title`, `content` 컬럼만 (column-level GRANT) |
| `anon` | ❌ 없음 | 없음 |

→ `likes`, `user_id`, `belt`, `nickname`, `is_pick_share` 등: 클라이언트 직접 UPDATE 불가 ✅

### 3-C. increment_post_likes RPC

| 항목 | 확인 내용 | 결과 |
|---|---|---|
| 등록 여부 | `information_schema.routines` 조회 | ✅ `increment_post_likes` 존재 |
| SECURITY 타입 | `security_type = DEFINER` | ✅ SECURITY DEFINER 확인 |
| 인증 거부 | 함수 내 `auth.uid() IS NULL → RAISE EXCEPTION` | ✅ 코드 확인 |
| 중복 방지 | `ON CONFLICT (post_id, user_id) DO NOTHING` + `IF FOUND` | ✅ 코드 확인 |
| authenticated EXECUTE | granted | ✅ |
| anon EXECUTE | granted (Supabase 플랫폼 자동 부여) | ⚠️ 아래 참조 |

> **⚠️ anon EXECUTE 잔존 이슈:** Supabase는 migration 후 `public` 스키마의 모든 함수에 `anon`을 포함한 역할에 EXECUTE를 자동으로 re-grant함. Migration 내 `REVOKE FROM PUBLIC` 이후에도 플랫폼이 덮어씀. 함수 내부의 `auth.uid() IS NULL → RAISE EXCEPTION 'Not authenticated'` 가드가 실질적 차단 역할을 함. 기능적 보안은 유지됨.

### 3-D. 보안 검사 매트릭스 (정책 분석 기반)

| 시나리오 | 기대 결과 | 정책 분석 |
|---|---|---|
| 타인 글 title/content UPDATE (authenticated) | ❌ 차단 | RLS `auth.uid()=user_id` 불일치 → DENY |
| 본인 글 title/content UPDATE (authenticated) | ✅ 허용 | column GRANT (title,content) + RLS pass |
| 타인 글 likes 직접 UPDATE (authenticated) | ❌ 차단 | column GRANT 없음 (likes 제외됨) |
| user_id 직접 UPDATE (authenticated) | ❌ 차단 | column GRANT 없음 (user_id 제외됨) |
| anon UPDATE 시도 | ❌ 차단 | table-level UPDATE REVOKE됨 |
| 본인 글 DELETE | ✅ 허용 | RLS `own post delete` pass |
| 타인 글 DELETE | ❌ 차단 | RLS `own post delete` → auth.uid()≠user_id → DENY |
| 좋아요 RPC (authenticated) | ✅ 동작 | EXECUTE grant + auth.uid() not null |
| 좋아요 RPC (anon) | ❌ 차단 | 함수 내 null 체크 → EXCEPTION |
| 중복 좋아요 RPC | ❌ 차단 (증가 없음) | ON CONFLICT DO NOTHING + IF FOUND |

---

## 4. BLOCKED — 수동 QA 필요 항목

로컬 dev 환경에 `.env.local` 없음, 테스트 계정 자격증명 없음 → 아래 항목은 **직접 브라우저 수동 QA 필요**.

| # | 항목 | 방법 |
|---|---|---|
| M-1 | 로그인 후 내 글 → 수정/삭제 버튼 표시 확인 | 배포 URL 로그인 → 내 글 클릭 |
| M-2 | 타인 글 → 수정/삭제 버튼 미표시 확인 | 배포 URL 로그인 → 타인 글 클릭 |
| M-3 | 테스트 글 수정 → 목록/detail 반영 | 수정 버튼 → 제목/내용 변경 → 저장 |
| M-4 | 테스트 글 삭제 → 목록 제거/modal 닫힘 | 삭제 버튼 → confirm → 목록 확인 |
| M-5 | 좋아요 1회 증가 | 🔥 추천 클릭 → likes +1 확인 |
| M-6 | 중복 좋아요 차단 | 같은 글 다시 추천 → 증가 없음 확인 |
| M-7 | 로그인 후 수정/삭제 버튼 mobile 375px 레이아웃 | 모바일 뷰에서 버튼 깨짐 없음 확인 |

> **권장:** 배포 URL(`https://bottlejoon123.github.io/pick-tagon/`) → 테스트 글 작성 → M-1~M-7 순서로 QA 후 이 문서에 결과 추가.

---

## 5. 미구현 — Post-release Backlog

| 항목 | 상태 |
|---|---|
| 사진 첨부 | Post-release backlog |
| 댓글 수정/삭제 | Post-release backlog |
| Admin 전체 삭제 | Post-release backlog |

---

## 6. 관련 파일

| 파일 | 내용 |
|---|---|
| `supabase/migrations/20260528_secure_posts_update_rls.sql` | increment_post_likes RPC + own post update policy |
| `supabase/migrations/20260528_posts_column_update_hardening.sql` | table-level REVOKE + column-specific GRANT |
| `public/js/community.js` | startOwnPostEdit, saveOwnPostEdit, deleteOwnPost, cancelOwnPostEdit |
| `public/js/api/supabase.js` | loadPostsFromDB에 userId 추가 |
| `index.html` | publishPost newPost에 userId 추가, 모달 edit form + 하단 바 수정/삭제 버튼, likePostInDB → RPC |
