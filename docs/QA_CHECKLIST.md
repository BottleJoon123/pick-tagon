# Picktagon 운영 QA 체크리스트

> **용도:** 신규 배포 전 또는 주요 기능 변경 후 운영자가 순서대로 따라 할 수 있는 실사용 테스트 가이드  
> **기준 버전:** Event Lifecycle Phase 2 (커밋 `f08a6fd`) 이후  
> **작성일:** 2026-05-02

---

## 목차

1. [테스트 전 준비](#1-테스트-전-준비)
2. [테스트 계정 및 권한 준비](#2-테스트-계정-및-권한-준비)
3. [핵심 사용자 플로우](#3-핵심-사용자-플로우)
4. [Admin 운영 플로우](#4-admin-운영-플로우)
5. [보안 / RLS 체크](#5-보안--rls-체크)
6. [포인트 / 정산 체크](#6-포인트--정산-체크)
7. [모바일 / 반응형 체크](#7-모바일--반응형-체크)
8. [회귀 테스트](#8-회귀-테스트)
9. [배포 후 스모크 테스트](#9-배포-후-스모크-테스트)
10. [현재 알려진 리스크](#10-현재-알려진-리스크)
11. [발견 이슈 기록 템플릿](#11-발견-이슈-기록-템플릿)

---

## 1. 테스트 전 준비

### 환경 확인

- [ ] Supabase 프로젝트 URL / anon key가 `public/js/api/supabase.js`에 올바르게 설정되어 있는지 확인
- [ ] Edge Function `settle-matchup`이 배포되어 있는지 확인
  - 절차: Supabase Dashboard → Edge Functions → `settle-matchup` 상태 확인
  - 기대 결과: Active 상태
- [ ] `npm run build` 실행 후 `dist/` 산출물이 최신인지 확인
  - 절차: `npm run build` → `dist/index.html` 파일 날짜 확인
  - 기대 결과: 빌드 성공, 오류 없음
- [ ] 브라우저 콘솔에 JS 에러 없는지 확인 (새탭 오픈 후)

---

## 2. 테스트 계정 및 권한 준비

### 필요한 계정

| 역할 | 이메일 예시 | 조건 |
|---|---|---|
| 일반 사용자 A | `test_user_a@example.com` | `is_admin = false`, 포인트 1000 |
| 일반 사용자 B | `test_user_b@example.com` | `is_admin = false`, 포인트 1000 |
| Admin | `admin@example.com` 또는 실제 admin 계정 | `is_admin = true` |

### 계정 준비 절차

- [ ] Supabase Dashboard → Authentication → 테스트 계정 생성 또는 회원가입 흐름으로 생성
- [ ] Admin 계정: `UPDATE public.users SET is_admin = true WHERE id = '<admin_uuid>';` (service_role key 필요)
- [ ] 테스트용 이벤트/매치업 1개 이상 생성 (Admin 로그인 후 Admin → 대진표 빌더에서 생성)

---

## 3. 핵심 사용자 플로우

### 3-1. 회원가입 / 프로필 생성

- [ ] 신규 이메일로 회원가입
  - 절차: 앱 접속 → 로그인 버튼 → 회원가입 탭 → 이메일/비밀번호/닉네임 입력 → 가입
  - 기대 결과: 가입 성공 toast, 자동 로그인
  - 관련 파일/함수: `index.html` → `sb.auth.signUp()` (line ~4782), `createUserProfile()` (line ~4847)

- [ ] 가입 후 `public.users` 테이블에 프로필 생성 확인
  - 절차: Supabase Dashboard → Table Editor → users 테이블에서 신규 행 확인
  - 기대 결과: `id`, `nickname`, `points = 1000`, `is_admin = false` 행 존재

- [ ] 닉네임 중복 시 에러 처리 확인
  - 절차: 기존 닉네임과 동일한 닉네임으로 가입 시도
  - 기대 결과: 에러 toast 표시, 가입 불가

### 3-2. 로그인 / 로그아웃

- [ ] 일반 사용자 로그인
  - 절차: 이메일/비밀번호 입력 → 로그인
  - 기대 결과: 로그인 성공, 닉네임 표시, 포인트 표시
  - 관련 파일/함수: `index.html` → `sb.auth.signInWithPassword()` (line ~4765)

- [ ] 로그아웃 후 재로그인
  - 절차: 로그아웃 → 새로고침 → 재로그인
  - 기대 결과: 세션 초기화, 재로그인 후 포인트/닉네임 정상 복원

- [ ] 세션 유지 (새로고침)
  - 절차: 로그인 후 새로고침
  - 기대 결과: 로그인 상태 유지, 포인트가 DB 기준으로 표시
  - 관련 파일/함수: `public/js/api/supabase.js` → `sb.auth.onAuthStateChange()` (line ~144)

### 3-3. 예측 등록 (place_pick)

- [ ] 로그인 후 예측 등록 → points 차감 확인
  - 절차: 로그인 → 이벤트 선택 → 파이터 선택 → 예측 등록
  - 기대 결과: 예측 성공 toast, 포인트 BET_COST만큼 감소
  - 관련 파일/함수: `index.html` → `savePick()` (line ~4877) → `sb.rpc('place_pick', ...)`

- [ ] 예측 후 새로고침 시 points가 DB 기준으로 유지
  - 절차: 예측 등록 후 새로고침
  - 기대 결과: 차감된 포인트가 새로고침 후에도 동일하게 표시

- [ ] method/round 선택 예측이 DB에 저장되는지
  - 절차: method(KO, SUB, 판정 등)와 round 선택 후 예측 등록
  - 기대 결과: `public.picks` 테이블에 `method`, `predicted_round` 값 저장 확인

- [ ] 같은 경기 중복 예측 차단
  - 절차: 동일 경기에 예측 등록 → 재시도
  - 기대 결과: `⚠️ 이미 이 경기에 예측을 등록했습니다.` toast
  - 관련 파일/함수: `index.html` line ~4900, `place_pick` RPC duplicate_pick 예외

- [ ] 포인트 부족 시 예측 차단
  - 절차: 포인트를 0에 가깝게 소진 후 예측 시도 (또는 Supabase에서 users.points 직접 수정)
  - 기대 결과: `⚠️ 포인트가 부족합니다!` toast, 예측 불가
  - 관련 파일/함수: `index.html` line ~4899, `place_pick` RPC insufficient_points 예외

- [ ] 비로그인 사용자 예측 시도 차단
  - 절차: 로그아웃 상태에서 예측 버튼 클릭
  - 기대 결과: 로그인 유도 또는 예측 불가 처리

### 3-4. 픽 마감 후 예측 차단

- [ ] 픽 마감 후 예측 시도 → pick_locked toast 표시
  - 절차: Admin으로 이벤트 픽 마감 → 일반 사용자로 해당 이벤트 예측 시도
  - 기대 결과: `🔒 픽 마감된 경기입니다. 예측을 등록할 수 없습니다.` toast
  - 관련 파일/함수: `index.html` line ~4901, `place_pick` RPC pick_locked 예외, `public/js/admin.js` → `adminLockEventPicks()`

---

## 4. Admin 운영 플로우

### 4-1. Admin 접근 권한 확인

- [ ] Admin 계정으로 로그인 → Admin 탭 접근 가능
  - 절차: Admin 계정 로그인 → Admin 탭 클릭
  - 기대 결과: Admin 패널 표시
  - 관련 파일/함수: `public/js/api/supabase.js` line ~251 `adminUnlocked = res.data.is_admin === true`

- [ ] 일반 사용자로 Admin 탭 접근 불가 확인
  - 절차: 일반 계정 로그인 → Admin URL 직접 접근 또는 탭 클릭 시도
  - 기대 결과: Admin 패널 미표시 또는 접근 차단

### 4-2. 이벤트 생성 / 수정 / 삭제

- [ ] 이벤트 생성
  - 절차: Admin → 이벤트 탭 → + 이벤트 추가 → 제목/날짜 입력 → 저장
  - 기대 결과: 이벤트 목록에 추가, `events` 테이블에 행 생성
  - 관련 파일/함수: `public/js/admin.js` → `saveNewEvent()` → `sb.rpc('admin_upsert_event', ...)`

- [ ] 이벤트 삭제
  - 절차: 이벤트 목록에서 🗑 클릭 → confirm 확인
  - 기대 결과: 이벤트와 하위 대진표 함께 삭제
  - 관련 파일/함수: `public/js/admin.js` → `deleteBuilderEvent()` → `sb.rpc('admin_delete_event', ...)`

### 4-3. 대진표(매치업) 생성 / 수정 / 삭제 / 순서 변경

- [ ] 매치업 추가
  - 절차: 이벤트 선택 → + 경기 추가 → 파이터 검색 및 선택 → 저장
  - 기대 결과: 매치업 카드 표시, `matchups` 테이블에 행 생성
  - 관련 파일/함수: `public/js/admin.js` → `saveMatchupFromModal()` → `sb.rpc('admin_upsert_matchup', ...)`

- [ ] 매치업 수정
  - 절차: 매치업 카드 클릭 → 파이터 변경 → 저장
  - 기대 결과: 변경사항 반영

- [ ] 매치업 삭제
  - 절차: 매치업 수정 모달 → 삭제 버튼 → confirm
  - 기대 결과: 매치업 제거
  - 관련 파일/함수: `public/js/admin.js` → `deleteMatchupFromModal()` → `sb.rpc('admin_delete_matchup', ...)`

- [ ] 매치업 순서 변경 (드래그 앤 드롭)
  - 절차: 매치업 카드 드래그 → 다른 위치에 드롭
  - 기대 결과: 순서 변경 성공 toast, DB sort_order 갱신
  - 관련 파일/함수: `public/js/admin.js` → `_onFightDrop()` → `sb.rpc('admin_reorder_matchups', ...)`

### 4-4. 픽 마감 / 재오픈

- [ ] 이벤트 픽 마감
  - 절차: Admin → 이벤트 선택 → lifecycle 패널에서 🔒 픽 마감 클릭 → confirm
  - 기대 결과: 이벤트 상태 → `locked`, 배지 `🔒 LOCKED` 표시, 마감 날짜 표시
  - 관련 파일/함수: `public/js/admin.js` → `onLifecycleLock()` → `adminLockEventPicks()` → `admin_lock_event_picks` RPC

- [ ] 픽 마감 멱등성 확인
  - 절차: 이미 마감된 이벤트에서 다시 픽 마감 클릭
  - 기대 결과: `이미 마감된 이벤트입니다` toast (에러 없음)

- [ ] 픽 재오픈
  - 절차: locked 이벤트 선택 → lifecycle 패널에서 🔓 재오픈 클릭 → confirm
  - 기대 결과: 이벤트 상태 → `upcoming`, 배지 `▶ OPEN` 표시
  - 관련 파일/함수: `public/js/admin.js` → `onLifecycleReopen()` → `adminReopenEventPicks()` → `admin_reopen_event_picks` RPC

### 4-5. 결과 입력

- [ ] 매치업 결과 입력 (승자/방식/라운드)
  - 절차: 이벤트 선택 → 매치업 카드 🏆 클릭 → 결과 선택 → 확인
  - 기대 결과: 정산 완료 toast, `matchups.result_status = 'completed'`, 관련 picks win/lose 처리
  - 관련 파일/함수: `index.html` → `confirmAdminResult()` → `submitMatchupResult()` → Edge Function `settle-matchup`

- [ ] 무승부(DRAW) 처리
  - 절차: 결과 모달에서 DRAW 선택
  - 기대 결과: `matchups.result_status = 'draw'`, 해당 picks → cancelled, 포인트 환급

- [ ] No Contest(NC) 처리
  - 절차: 결과 모달에서 NC 선택
  - 기대 결과: `matchups.result_status = 'no_contest'`, 해당 picks → cancelled, 포인트 환급

- [ ] 결과 수정 (force)
  - 절차: 이미 결과가 입력된 매치업 ✏️ 클릭 → 다른 결과 선택
  - 기대 결과: 재정산 완료, picks 상태 갱신
  - 관련 파일/함수: `index.html` → `openResultModalForEdit()`, `result-modal-force = 'true'`

- [ ] 결과 입력 후 picks 상태 확인
  - 절차: 결과 입력 후 `public.picks` 테이블 쿼리
  - 기대 결과: 예측 성공한 픽 → `status = 'win'`, 실패 → `status = 'lose'`, draw/nc → `status = 'cancelled'`

### 4-6. 이벤트 정산

- [ ] 결과 미입력 matchup 있을 때 정산 차단
  - 절차: 일부 매치업에 결과가 없는 locked 이벤트에서 ✅ 정산 클릭
  - 기대 결과: `⚠️ 결과 미입력 경기가 있습니다. 모든 경기 결과를 먼저 입력하세요.` toast
  - 관련 파일/함수: `public/js/admin.js` → `adminSettleEvent()`, `admin_settle_event` RPC (event_has_unresolved_matchups 예외)

- [ ] 모든 결과 입력 후 이벤트 정산
  - 절차: 모든 매치업 결과 입력 → locked/completed 이벤트에서 ✅ 정산 클릭 → confirm
  - 기대 결과: 이벤트 상태 → `settled`, 배지 `✅ SETTLED`, 정산 날짜 표시
  - 관련 파일/함수: `public/js/admin.js` → `onLifecycleSettle()` → `adminSettleEvent()` → `admin_settle_event` RPC

- [ ] 이벤트 정산 중복 실행 방지 (멱등성)
  - 절차: 이미 settled 이벤트에서 정산 시도
  - 기대 결과: `이미 정산된 이벤트입니다` toast (에러 없음)

- [ ] 정산 후 랭킹 반영 확인
  - 절차: 정산 후 랭킹 탭 확인
  - 기대 결과: win 픽 사용자 포인트 증가, 순위 변경
  - 관련 파일/함수: `index.html` line ~5013 → `sb.rpc('get_leaderboard', { p_limit: 20 })`

### 4-7. 이벤트 아카이브

- [ ] settled 이벤트 아카이브
  - 절차: settled 이벤트 선택 → lifecycle 패널 📦 아카이브 클릭 → confirm
  - 기대 결과: 이벤트 상태 → `archived`, 배지 `📦 ARCHIVED`, 버튼 사라짐
  - 관련 파일/함수: `public/js/admin.js` → `onLifecycleArchive()` → `adminArchiveEvent()` → `admin_archive_event` RPC

- [ ] settled 상태 아닌 이벤트 아카이브 차단
  - 절차: completed/locked 이벤트에서 아카이브 시도 (아카이브 버튼은 settled에만 표시됨)
  - 기대 결과: 아카이브 버튼 미표시 (UI 레벨 차단)

---

## 5. 보안 / RLS 체크

- [ ] 비관리자가 admin RPC 직접 호출 시 차단
  - 절차: 일반 사용자 세션에서 브라우저 콘솔에서 직접 RPC 호출:
    ```javascript
    supabase.rpc('admin_lock_event_picks', { p_event_id: '<uuid>' })
    ```
  - 기대 결과: `admin_required` 에러 반환
  - 관련 파일/함수: 모든 admin RPC → `private.is_admin()` 체크

- [ ] 미로그인 사용자가 picks 조회/insert 불가 확인
  - 절차: 비로그인 상태에서 picks 테이블 직접 접근 시도
  - 기대 결과: RLS 정책에 의해 0 행 반환 또는 insert 거부

- [ ] 다른 사용자의 picks 수정 불가 확인
  - 절차: 사용자 A 세션에서 사용자 B의 pick_id를 대상으로 update 시도
  - 기대 결과: RLS에 의해 거부

- [ ] 공개 랭킹에서 is_admin 필드 노출 안 되는지 확인
  - 절차: `get_leaderboard` RPC 결과 확인 (콘솔 또는 네트워크 탭)
  - 기대 결과: is_admin 컬럼 없음
  - 관련 파일/함수: `get_leaderboard` RPC SELECT 쿼리 확인

- [ ] users 테이블 타인 정보 조회 불가 확인
  - 절차: 사용자 A 세션에서 사용자 B의 users 행 SELECT 시도
  - 기대 결과: RLS `users_select_own` 정책에 의해 0 행 반환
  - 관련 파일/함수: `supabase/migrations/20260418_rls_core_tables.sql` `users_select_own` 정책

- [ ] is_admin 필드 직접 업데이트 시도 차단
  - 절차: 일반 사용자 세션에서 `UPDATE users SET is_admin = true WHERE id = auth.uid()`
  - 기대 결과: `trg_protect_users_privileged_fields` 트리거에 의해 거부

---

## 6. 포인트 / 정산 체크

- [ ] 예측 등록 시 BET_COST(포인트) 차감
  - 절차: 예측 전후 포인트 비교
  - 기대 결과: 예측 등록 수 × BET_COST만큼 감소

- [ ] 경기 승리 시 포인트 지급
  - 절차: 결과 입력 후 win pick 보유 사용자 포인트 확인
  - 기대 결과: `base_payout` 또는 `settled_payout` 기준 포인트 증가

- [ ] DRAW/NC 시 포인트 환급
  - 절차: DRAW 결과 입력 후 해당 picks 보유 사용자 포인트 확인
  - 기대 결과: `bet_cost`만큼 포인트 환급 (원금 복구)

- [ ] 정산 시 orphan pending picks 환급
  - 절차: 일부 픽이 pending 상태로 남아있는 이벤트 정산
  - 기대 결과: 해당 picks → `cancelled`, 사용자에게 `bet_cost` 환급

- [ ] users.points가 실제 DB와 동기화되는지
  - 절차: Supabase Dashboard에서 특정 사용자 points 확인 후 앱 UI 비교
  - 기대 결과: 일치

---

## 7. 모바일 / 반응형 체크

- [ ] 모바일 브라우저(iPhone/Android)에서 메인 화면 레이아웃 정상
  - 절차: 실제 모바일 기기 또는 Chrome 개발자도구 Toggle Device Toolbar
  - 기대 결과: UI 깨짐 없음, 버튼 클릭 가능

- [ ] 모바일에서 예측 등록 플로우 정상
  - 절차: 모바일 환경에서 파이터 선택 → method/round 선택 → 예측 등록
  - 기대 결과: 전체 플로우 정상 동작

- [ ] Admin 대진표 빌더 화면 모바일에서 확인
  - 절차: Admin 계정으로 모바일에서 대진표 탭 접근
  - 기대 결과: lifecycle 패널 버튼 표시, 클릭 가능

- [ ] 모바일에서 toast 메시지 표시 위치 확인
  - 절차: 예측 등록 등 toast 발생 동작 수행
  - 기대 결과: toast가 화면 내 적절한 위치에 표시

---

## 8. 회귀 테스트

> 이전 기능이 새 변경으로 인해 깨지지 않는지 확인

- [ ] Battle 초대 → 수락 → 결과 처리 플로우
  - 절차: 사용자 A → B에게 배틀 요청 → B가 초대 모달에서 수락 → 결과 처리
  - 기대 결과: 전체 배틀 플로우 정상

- [ ] Battle 초대 거절
  - 절차: 배틀 요청 → 초대 모달에서 거절 클릭
  - 기대 결과: DB에서 battle.status = 'declined' 반영 (모달 닫히는 것만이 아닌 DB 반영 확인)
  - 관련 파일/함수: `index.html` → `declineBattle()` → `_declineBattleById()` → `sb.rpc('decline_battle', ...)`

- [ ] Fighter DB에서 파이터 추가/수정
  - 절차: Admin → 파이터 탭 → 파이터 추가
  - 기대 결과: fighters 테이블에 저장, audit log 기록
  - 관련 파일/함수: `public/js/admin.js` → `saveFighter()` → `sb.rpc('admin_upsert_fighter', ...)`

- [ ] UFC 랭킹 동기화
  - 절차: Admin → UFC 랭킹 탭 → 랭킹 불러오기/동기화
  - 기대 결과: ufc_rankings 테이블 갱신, audit log 기록
  - 관련 파일/함수: `index.html` → `fetchAndSyncUFCRankings()` → `sb.rpc('admin_upsert_ufc_rankings', ...)`

- [ ] 파이터 랭크 동기화
  - 절차: Admin → UFC 랭킹 동기화 후 파이터 랭크 동기화 실행
  - 기대 결과: fighters.rank 갱신, updated/skipped 건수 toast
  - 관련 파일/함수: `index.html` → `syncFighterRanksFromRankings()` → `sb.rpc('admin_update_fighter_ranks', ...)`

---

## 9. 배포 후 스모크 테스트

> 배포 직후 5분 이내 빠르게 확인하는 핵심 항목

- [ ] 앱 로드 시 JS 콘솔 에러 없음
- [ ] Admin 계정으로 로그인 가능
- [ ] 이벤트 목록 정상 로드 (선택 시 매치업 목록 표시)
- [ ] 일반 사용자로 예측 등록 1건 성공 → 포인트 차감 확인
- [ ] lifecycle 패널에 상태 배지 정상 표시
- [ ] Edge Function `settle-matchup` 응답 정상 (결과 입력 1건 테스트)

---

## 10. 현재 알려진 리스크

| # | 리스크 | 상태 | 비고 |
|---|---|---|---|
| R-1 | 결과 입력이 `settle-matchup` Edge Function 경유 | 유지 중 | `admin_set_matchup_result` RPC 전환 가능하나 현재 미적용 |
| R-2 | `archived` 이벤트의 matchup 결과 수정 정책 미확정 | 미결 | `force=true`로 RPC 재호출 가능 — 운영 정책 결정 필요 |
| R-3 | Edge Function (`sync-all-fighters`, `purge-inactive-fighters` 등)의 fighters 직접 write는 admin audit log 미통합 | 미결 | Phase 3에서 RPC 전환 시 통합 예정 |
| R-4 | `dist/*`는 CI 빌드 산출물로 git에 커밋하지 않는 운영 원칙 | 운영 원칙 | `npm run build` 후 로컬 서빙 또는 별도 배포 파이프라인 필요 |
| R-5 | `place_pick` 에서 `p_matchup_id = null` 경로(로컬/커스텀 픽)는 lock 체크 우회 | 의도된 동작 | DB 매치업이 아닌 경우 lock이 없으므로 정상 |
| R-6 | `admin_settle_event`를 `completed` 상태에서 호출 시 미결 pending picks 자동 취소 | 주의 필요 | 정산 전 모든 결과 입력 확인 필수 |

---

## 11. 발견 이슈 기록 템플릿

이슈 발견 시 아래 형식으로 기록하세요.

```
## 이슈 #[번호]

- **발견일:** YYYY-MM-DD
- **발견자:**
- **심각도:** Critical / High / Medium / Low
- **재현 환경:** 브라우저, OS, 로그인 계정 유형
- **재현 절차:**
  1.
  2.
  3.
- **기대 결과:**
- **실제 결과:**
- **관련 파일/함수:**
- **스크린샷/로그:**
- **상태:** Open / In Progress / Fixed / Won't Fix
```

---

*이 문서는 새 기능 추가 또는 DB 변경 시 업데이트해야 합니다.*
