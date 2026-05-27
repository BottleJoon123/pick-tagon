# Auth / Signup / Faction Hardening
> 작성일: 2026-05-27  
> 기준 커밋: `241f55c` Fix: Connect real matchup stats analysis data  
> 조사 범위: index.html auth modal / public/js/api/supabase.js / public/js/utils.js / public/js/modal-helpers.js  
> Supabase DB read-only 확인 포함

---

## 1. QA 관찰 항목별 진단 결과

| QA 관찰 | 진단 결과 | 코드/DB 근거 |
|---|---|---|
| 아무 이메일 가입 가능 | ✅ 예상 동작 — Supabase Dashboard email confirmation **OFF** | `submitAuth()` line 3968: `!res.data.session` 분기 존재하나 현재 비활성 |
| 이메일 확인 없이 바로 가입 | ✅ Dashboard 설정 문제 — 코드 버그 아님 | Supabase Auth > Email 설정 변경 필요 |
| 동일 인물 다중 계정 | ⚠ 이메일이 다르면 앱 레벨에서 방지 불가 | email은 auth.users에서 unique — 다른 이메일은 DB 정책 영역 |
| 비밀번호 변경 앱에서 찾기 어려움 | ✅ 버그 확인 — 프로필에 entry 없음 | auth modal login탭에만 "비밀번호를 잊으셨나요?" 존재 |
| 다게스탄 자동 설정 | ❌ 코드/DB 버그 아님 | DB `users.faction_id` default=null · 최신 가입 유저 2명 모두 faction_id=null |

---

## 2. DB 확인 결과 (Read-only)

### users 테이블 스키마
```
column_name  data_type  column_default  is_nullable
faction_id   integer    null            YES
```
→ **DB-level faction default 없음. `faction_id`는 항상 NULL로 시작.**

### factions 테이블
```
id=1 다게스탄 🐻  id=2 브라질 🇧🇷  id=3 미국 🇺🇸  id=4 영국 🇬🇧
id=5 한국 🇰🇷     id=6 아프리카 🌍  id=7 조지아 ⚔️  id=8 일본 🌸
```

### 최근 가입 유저 (faction_id)
```
1234          (2026-05-27) faction_id: null  ← 오늘 가입
오늘내일       (2026-05-25) faction_id: null
k             (2026-03-30) faction_id: 5 (한국, 수동 선택)
das           (2026-03-26) faction_id: null
보틀준         (2026-03-26) faction_id: 7 (조지아, 수동 선택)
KINGBOTTLE    (2026-03-26) faction_id: 1 (다게스탄, 수동 선택 — 개발자 계정)
```

**"다게스탄 자동 설정" 원인**: QA 테스터가 개발자 계정(KINGBOTTLE, faction_id=1)을 보거나, 이전에 다게스탄을 선택한 계정을 사용. 신규 유저 faction_id는 항상 null.

---

## 3. 코드 분석 요약

### 3-1. Auth Flow
- **이메일 확인 enabled** (`!res.data.session`): 녹색 안내 표시, 모달 유지 (index.html line 3968-3972)
- **이메일 확인 disabled** (`res.data.session` 존재): 즉시 `createUserProfile()` + 모달 닫기 (line 3973-3978)
- **이메일 확인 경로 닉네임 보존 버그**: `sb.auth.signUp()` 호출 전 `nickname`을 localStorage에 저장하지 않음 → 이메일 인증 후 `loadUserFromDB` → `createUserProfile()`에서 `getNickname()` 실패 → `email.split('@')[0]`로 fallback

### 3-2. Faction Modal
- `_renderFactionCards()`: `isSelected = currentFaction && currentFaction.id === f.id` — null 시 모든 카드 unselected
- `openFactionSelectModal()`: `faction_id` 없는 유저 로그인 시 sessionStorage 'factionModalDismissed' 없으면 800ms 후 자동 표시
- `closeFactionSelectModal()`: sessionStorage에 'factionModalDismissed' 저장 (세션 종료 시 초기화)
- **CSS 확인**: `.faction-card.selected`만 빨간 border+glow. `:first-child` 스타일 없음. 자동 선택 UI 없음.

### 3-3. Profile Password Reset 접근성
- `handlePasswordReset()`: auth modal input에서 이메일 수동 입력 필요
- 프로필 화면에 비밀번호 관련 버튼 전혀 없음 → 로그인 상태 유저가 비밀번호 변경 경로를 찾기 어려움

### 3-4. 중복 계정
- Supabase Auth: 동일 이메일 중복 가입 자동 거부
- 다른 이메일 다중 가입: 앱 레벨 방지 불가 → 운영정책 영역

---

## 4. 적용된 수정 (Fix: Harden auth signup faction UX)

| Fix | 위치 | 변경 내용 |
|---|---|---|
| **A** | index.html `submitAuth()` | `sb.auth.signUp()` 호출 전 `nickname` → localStorage 저장 (이메일 확인 경로 닉네임 보존) |
| **B** | index.html profile section | "비밀번호 재설정" 버튼 추가 (id: `profile-reset-pw-btn`, 로그인 시만 표시) |
| **B2** | index.html | `profilePasswordReset()` 함수 추가 — `currentUser.email` 기반 1-click 재설정 메일 발송 |
| **B3** | public/js/api/supabase.js `updateAuthUI()` | `profile-reset-pw-btn` hidden 토글 추가 |
| **C** | index.html faction-select-modal | 부제목: "선택 전까지는 미소속 상태입니다 · 프로필에서 언제든 변경 가능" |

---

## 5. Supabase Dashboard 필수 수동 조치 (코드로 불가)

| 항목 | 현재 상태 | 권장 조치 | 우선순위 |
|---|---|---|---|
| **Email Confirmation** | OFF (추정) | Supabase Dashboard > Auth > Providers > Email > "Confirm email" 활성화 | **P1 — 출시 전 권장** |
| **Allowed Redirect URLs** | 확인 필요 | `https://bottlejoon123.github.io/pick-tagon/` 명시 등록 | P1 |
| **Rate Limiting** | Supabase 기본값 | 가입/로그인 시도 rate limit 확인 (기본 60/hr) | P2 |
| **CAPTCHA** | OFF | hCaptcha/Turnstile 고려 (스팸 가입 방지) | P2 |
| **Duplicate Account Policy** | 이메일 unique만 | 운영정책/약관으로 다중 계정 금지 명시 | P3 |

---

## 6. Backlog

| 항목 | 내용 | 우선순위 |
|---|---|---|
| 중복 계정 운영정책 | 같은 사람 다중 이메일 가입 방지 — 약관/관리자 모니터링 | P3 |
| Email 인증 강제 | Dashboard email confirmation ON 후 종단 테스트 필요 | P1 (수동) |
| 비밀번호 변경(인앱) | 현재 비밀번호 입력 후 새 비밀번호 설정 — Supabase `updateUser` API 필요 | 출시 후 |

---

## 7. Release Gate 업데이트

| Gate | 상태 | 비고 |
|---|---|---|
| 프로필 비밀번호 재설정 entry | ✅ 추가됨 | profile-reset-pw-btn |
| faction 미소속 상태 명확화 | ✅ 모달 부제목 개선 | 코드/DB 버그 없음 확인 |
| 닉네임 이메일 인증 경로 보존 | ✅ Fix A 적용 | localStorage pre-save |
| Email Confirmation | ⏳ Dashboard 수동 설정 필요 | P1 — 출시 전 권장 |
| Allowed Redirect URLs | ⏳ Dashboard 확인 필요 | P1 |
