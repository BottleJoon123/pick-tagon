# Picktagon Next Work Plan

최초 작성: 2026-05-02 / 마지막 업데이트: 2026-05-05
현재 기준 커밋: `1c0e6d8` (origin/main)

---

## 2026-05-05 상태 업데이트

**완료 (이번 세션):**
- Phase 4A: `get_event_leaderboard` RPC 구현 · DB 적용 · 프론트 연결 · push (`6eabf9e`)
- Phase 4C: `get_event_pick_ratios` RPC 구현 · DB 적용 · 프론트 연결 · push (`bfcae51`)
  - `event_picks` vs `picks` source-of-truth 판단 완료 → `picks`로 확정
- Phase 4B: `get_user_pick_stats` RPC 구현 · DB 적용 · docs 업데이트 · push (`1c0e6d8`)
  - 체급별/방식별/upset 통계, GRANT authenticated only
- Build: dist/ 4개 파일 커밋 (`a6ecbfa`) — admin lifecycle UI, DnD, RPC 전환, castVote fix

**현재 dirty:**
- `.claude/settings.json`, `.claudeignore`: untracked, 커밋하지 않음

**완료 항목 참조 (이하 목록에서 완료된 것):**
- 1번 KDI 데이터 정리 ✅
- 2번 QA 2차 ✅
- 3번 공통 데이터 RPC (Phase 4A/B/C) ✅
- 4번 Event Lifecycle Phase 3 ✅
- 12번 배포/레포 정리 (.gitignore) ✅

---

## 현재 완료 상태

- `place_pick` 서버 함수 도입 및 pick 저장/포인트 차감 원자화 완료
- method/round 저장 및 중복 예측 차단 완료
- users RLS insert own 및 구형 broad policy 제거 완료
- admin 이벤트/대진표/fighter/ranking mutation RPC 서버화 1차 완료
- event lifecycle Phase 1/2 완료
  - 픽 마감
  - 재오픈
  - 정산
  - 아카이브
  - admin UI 버튼 연결
- QA 체크리스트 및 QA run 문서 작성 완료
- ISSUE-01 orphan pending picks repair 완료
- ISSUE-02 users legacy RLS policy 제거 완료
- ISSUE-03 place_pick pick_id UUID/BIGINT mismatch 수정 완료

---

## 다음 작업 순서

### 1. KDI 데이터 정리

목표: 과거 이벤트 데이터의 남은 불일치/중복을 정리한다.

작업:
- KDI-01: matchup `248de009`의 `result_status=completed` / `result_method=NC` 불일치 확인
- KDI-02: UFC 274 `TalitaAlencar vs JuliaPolastri` 중복 matchup 확인
- 먼저 조회만 수행
- 어떤 row를 살릴지 결정 후 repair migration 작성
- repair 후 QA_RUN 문서 업데이트

원칙:
- 바로 수정하지 말고 조회 결과를 먼저 보고
- 데이터 삭제/변경은 migration으로만 수행
- 운영 DB에 적용한 경우 문서에 before/after 기록

---

### 2. QA 2차 실행

목표: 오늘 수정한 ISSUE-01/02/03과 lifecycle 흐름이 실제 운영 기준으로 닫혔는지 확인한다.

필수 확인:
- 로그인 사용자 예측 등록
- 포인트 차감 및 새로고침 후 유지
- method/round 저장
- 중복 예측 차단
- 픽 마감 후 `pick_locked` 차단
- 결과 입력
- 이벤트 정산
- 중복 정산 방지
- 랭킹 반영
- admin lifecycle 버튼
- completed/locked 이벤트 내 pending pick 잔존 여부

산출물:
- `docs/QA_RUN_YYYY-MM-DD.md` 또는 기존 QA_RUN 업데이트
- 발견 이슈는 ISSUE/KDI로 분류

---

### 3. 공통 데이터/RPC 기반 구축 ✅ (Phase 4A/B/C 완료)

완료:
- Phase 4A: `get_event_leaderboard(p_event_id)` — 이벤트 리더보드 ✅
- Phase 4B: `get_user_pick_stats(p_user_id)` — 유저 프로필 집계 + `profile.js` 연결 ✅
- Phase 4C: `get_event_pick_ratios(p_event_id)` — 커뮤니티 픽 비율 ✅

남은 작업:
- Phase 4D: `get_event_pick_summary(p_event_id)` — 이벤트별 총 베팅/페이아웃 집계 (예정)
- 집단/소속 랭킹 포인트 산정 RPC (미설계)
- 파이터 상세 stat 조회 RPC (미설계)

참고 문서: `docs/COMMON_DATA_RPC_PLAN.md`

---

### 4. Event Lifecycle Phase 3 + Archive 연동

목표: 결과 입력, 정산, 아카이브, 감사 로그 흐름을 하나로 정리한다.

작업:
- 결과 입력 경로를 `settle-matchup` Edge Function에서 `admin_set_matchup_result` RPC 중심으로 통일 검토
- 대진표 관리에서 입력한 결과가 아카이브에 자동 반영되도록 로직 정리
- archived 이벤트 결과 수정 가능 여부 정책 결정
- 결과 재수정/재정산 시 audit log 기록 강화

결정 필요:
- archived 이벤트에서 결과 수정 허용 여부
- NC/DRAW/결과 수정 시 포인트 재정산 정책

---

### 5. 랭킹 시스템 고도화

목표: 단순 전체 포인트 랭킹을 넘어 운영에 쓸 수 있는 랭킹 체계를 만든다.

작업:
- 전체 랭킹
- 시즌 랭킹
- 이벤트별 랭킹
- 소속/집단 랭킹
- 보조 랭킹 아이디어
  - 최근 폼 랭킹
  - 언더독 적중왕
  - 방식 적중왕
  - 연승 랭킹
  - 참여율 랭킹

주의:
- 집단 랭킹 포인트 산정 시스템이 현재 작동하지 않는 것으로 보이므로 우선 검증 필요
- 포인트 산정 공식은 문서화 후 구현

---

### 6. 대진표 UX 개선

목표: 유저가 예측할 때 더 빠르고 명확하게 판단할 수 있는 경기 카드 경험을 만든다.

작업:
- 이벤트 리더보드 데이터 연동 및 고도화
- H2H 비교 기능 속도 개선
  - 캐싱
  - lazy load
  - 필요한 데이터만 조회
- 대진표 경기 카드 UI/UX 개선
- 파이터 사진 선명도/구도 개선
- 모든 대진표 카드에서 선수 프로필/stat 연동
- 메인카드뿐 아니라 전체 matchup 선수의 stat 접근 가능하게 개선

검토 포인트:
- 현재 카드에서 어떤 정보가 과하고 어떤 정보가 부족한지 유저 관점으로 평가
- 모바일에서 카드 높이/버튼/사진이 답답하지 않은지 확인

---

### 7. 커뮤니티 개선 1차

목표: 현재 커뮤니티 영역의 정보 과다와 실시간성 문제를 먼저 정리한다.

작업:
- 메인/코메인 픽 비율 실시간 연동 검증
- 픽 비율 영역 UI 축소
- 커뮤니티 영역 확대
- 픽 비율 카드에 사진 표시
- 커뮤니티 글에 "내가 픽한 내용" 자동 노출 제거
- 글 목록/댓글 구조 정리

주의:
- 픽 비율 source of truth: Phase 4C에서 `picks` 테이블로 확정 완료 (`event_picks`는 실시간 구독 트리거 역할만 유지)

---

### 8. 커뮤니티 개선 2차

목표: 긴 분석글과 이미지가 가능한 게시판 구조로 확장한다.

작업:
- 게시글 클릭 시 상세 페이지 구조 도입
- 이미지 첨부 지원
- 긴 분석글 레이아웃 지원
- 카테고리 분리
  - 전체
  - 이벤트별
  - 소속별
  - 분석글
  - 자유글
- 내 소속별 게시판 설계
- 소속 게시판 RLS 설계

결정 필요:
- 소속 가입/탈퇴/관리 방식
- 소속 게시판 공개 범위

---

### 9. 프로필 고도화

목표: 유저가 자신의 예측 성향과 강점을 볼 수 있는 분석 리포트를 만든다.

작업:
- 나만의 분석 리포트
- 체급별 예측 적중률
- 최근 폼
- 방식별 예측 적중률
- 보너스 획득 현황
- 대표 배지/칭호
- 시즌별 성과

우선순위:
- 먼저 RPC로 데이터 집계
- 그 다음 UI 카드 구성

---

### 10. Admin 고도화

목표: 운영자가 직접 안정적으로 관리할 수 있는 admin 시스템으로 확장한다.

작업:
- 뉴스 관리 방식 설계
  - 자동 수집 후보
  - admin 검수
  - 게시/숨김
  - 출처/날짜 관리
- 시즌 관리 방식 설계
  - 시즌 생성
  - 기간 설정
  - 시즌 랭킹
  - 시즌 종료/아카이브
  - 보상 관리
- audit log 조회 UI
- 운영 대시보드
  - 미정산 이벤트
  - pending pick
  - sync 실패
  - RLS/Security warning

---

### 11. Picktagon 고유 파이터 stat 로직

목표: `striking / grappling / stamina / defensive / speed`를 Picktagon만의 일관된 방식으로 산정한다.

작업:
- 데이터 소스 정의
  - UFCStats
  - ESPN
  - 수동 입력
  - 기존 fighter stats
- 정규화 공식 설계
- 체급별 보정
- 경기 수 보정
- 최근 경기 가중치
- 결측치 처리
- admin 수동 보정
- stat 버전 기록

권장 접근:
- 바로 코드화하지 말고 먼저 `docs/FIGHTER_STAT_FORMULA.md` 작성
- 샘플 파이터 10명으로 계산 결과 검증
- 운영자가 납득 가능한 수치인지 확인 후 DB 반영

---

### 12. 배포/레포 정리

목표: 반복적으로 남는 unstaged/untracked 파일 혼란을 줄인다.

작업:
- `dist/*` 운영 원칙 확정
- `node_modules/`, `supabase/.temp/`, `.claude*` 처리 방식 정리
- 필요하면 `.gitignore` 추가
- Tailwind CDN 제거/빌드 방식 전환 검토
- CI 빌드 산출물과 로컬 빌드 산출물 책임 분리

주의:
- `.gitignore` 추가는 영향 범위가 있으므로 별도 커밋으로 진행

---

### 13. 프론트 구조 정리

목표: 이후 화면 개선이 쉬운 구조로 만든다.

작업:
- `index.html` 인라인 로직 축소
- 전역 상태 제거/축소
- localStorage는 캐시/비로그인 모드로 제한
- admin JS와 사용자 JS 경계 정리
- 기능별 모듈 분리

우선순위:
- 데이터/RPC 안정화 후 진행
- 큰 리팩터링 전 QA 기준을 먼저 고정

---

## 다음 세션 시작 추천 프롬프트

```text
Pick-tagon 작업 이어서 진행하자.

현재 상태:
- main == origin/main == (push 후 최신 SHA 확인)
- Phase 4A/B/C Common Data RPC + profile.js 프론트 연결 완료 및 push 완료
- dirty: .claude/settings.json, .claudeignore untracked (커밋 금지)

우선순위 후보 (선택해줘):
A. Phase 4D 설계 — get_event_pick_summary(p_event_id) RPC 구현
B. Profile QA — RPC 연결 후 체급별/방식별 통계가 실제 DB 데이터와 일치하는지 검증
C. 9번 프로필 고도화 UI 카드 구성 시작

원칙:
- 운영 데이터 수정 금지
- .claude/settings.json, .claudeignore 커밋 금지
- push는 별도 승인 전까지 금지
- 새 기능 전 git status 확인 먼저
```

---

## 작업 운영 원칙

- 운영 DB 수정은 항상 migration으로 수행
- 과거 migration 파일 직접 수정 금지
- 데이터 repair migration은 fresh DB replay를 고려해 no-op 가드 포함
- UI 개선 전 source of truth와 RPC 계약 먼저 확정
- QA 문서와 실제 수정 커밋을 함께 추적
- `dist/*`는 별도 지시 없으면 커밋하지 않음
