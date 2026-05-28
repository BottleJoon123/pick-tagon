# Auth SMTP Setup Plan
> 작성일: 2026-05-29  
> 대상: Pick-tagon 운영자 (Supabase Dashboard 작업)  
> 상태: NEEDS_MANUAL — 코드 적용 완료, Dashboard 설정 대기

---

## 1. 왜 필요한가

### Supabase built-in email 한계
| 항목 | 내용 |
|---|---|
| Rate limit | 프로젝트 단위 시간당 발송 상한 (public 계획: 매우 낮음) |
| Production 적합성 | Supabase 공식 문서: "built-in email은 개발/테스트 전용, production에는 custom SMTP 필수" |
| 실 발생 증상 | 재설정 메일 연속 발송 시 "email rate limit exceeded" 에러 → 다른 사용자도 영향 |
| 운영 위험 | 출시 후 다수 사용자 동시 가입/비번 재설정 시 이메일 전면 중단 가능 |

---

## 2. 권장 설정: Resend + Supabase Integration

### 왜 Resend인가
- Supabase Dashboard에 공식 one-click Resend 연동 있음
- 무료 플랜: 월 3,000건 (Pick-tagon 초기 운영에 충분)
- DKIM/SPF 자동 설정 제공
- 실시간 배달 모니터링

### Resend 설정 절차
1. [resend.com](https://resend.com) 계정 생성
2. "Add Domain" → 발신 도메인 추가 (예: `noreply@pick-tagon.com` 또는 개인 도메인)
   - 도메인 없으면 Resend 기본 도메인(`@resend.dev`) 사용 가능 (단, 신뢰도 낮음)
3. DKIM / SPF / DMARC DNS 레코드 추가 (Resend가 자동 안내)
4. API Key 발급 (`Sending` 권한만)
5. Supabase Dashboard → **Authentication → SMTP Settings** → Resend 선택

---

## 3. 대안 SMTP 제공자

| 제공자 | 무료 플랜 | 설정 난이도 | 비고 |
|---|---|---|---|
| **Resend** | 3,000건/월 | ⭐ (Supabase 통합) | 권장 |
| SendGrid | 100건/일 | 중 | 도메인 인증 필요 |
| Postmark | 100건/월 (transactional) | 중 | 고신뢰도 |
| AWS SES | 62,000건/월 (EC2 기준) | 높음 | AWS 계정 필요 |
| Brevo (Sendinblue) | 300건/일 | 중 | EU 서버 |

---

## 4. Supabase Dashboard 경로 및 설정 값

### A. SMTP 활성화
```
Authentication → Settings → Email → SMTP Settings
```
| 필드 | Resend 예시 | 비고 |
|---|---|---|
| SMTP Host | `smtp.resend.com` | |
| SMTP Port | `465` (SSL) 또는 `587` (TLS) | |
| SMTP User | `resend` | Resend 고정값 |
| SMTP Password | `re_xxxxxxxx` | **⚠️ 절대 repo에 저장 금지** |
| Sender Email | `noreply@yourdomain.com` | 인증된 도메인 필요 |
| Sender Name | `Pick-tagon` | |

### B. Rate Limit 확인
```
Authentication → Settings → Rate Limits
```
- "Email OTP / Magic Link": 최소 60초 권장
- "Password Reset": 최소 60초 권장 (앱에서도 60초 cooldown 적용됨)

### C. Redirect URL 확인
```
Authentication → URL Configuration
```
- Site URL: `https://bottlejoon123.github.io/pick-tagon/`
- Additional redirect URLs에 위 URL 포함 여부 확인

---

## 5. 절대 repo에 저장하면 안 되는 값

```
❌ SMTP Password / API Key
❌ Resend API Key (re_xxx...)
❌ SendGrid API Key
❌ 도메인 DNS 관련 인증 토큰
❌ .env / .env.local 파일
```

Supabase Dashboard에서만 직접 입력. 코드/문서에 예시로도 실제 값 기재 금지.

---

## 6. 설정 후 검증 절차

### 6.1 Signup confirmation 테스트
1. 새 이메일로 회원가입
2. 이메일 도착 확인 (수신자/발신자/제목 확인)
3. 인증 링크 클릭 → Pick-tagon으로 리디렉션 → 로그인 상태 확인

### 6.2 Password reset 테스트
1. 프로필 → 비밀번호 재설정 클릭
2. 이메일 도착 확인 (발신자 `Pick-tagon <noreply@yourdomain.com>` 확인)
3. Reset 링크 클릭 → `#access_token=...&type=recovery` URL 확인
4. 새 비밀번호 설정 모달 표시 확인
5. 새 비밀번호 입력 → 변경 성공 toast 확인
6. 새 비밀번호로 로그인 테스트

### 6.3 Rate limit 해제 확인
1. 비밀번호 재설정 2회 연속 시도 (60초 내)
2. 2회째는 앱 cooldown 메시지 표시 (Supabase 미전송)
3. 60초 후 재시도 → 이메일 정상 수신

### 6.4 이메일 deliverability 확인
- 스팸 폴더 여부 확인
- DKIM/SPF 헤더 확인 (`mail-tester.com` 활용 가능)

---

## 7. Rollback

custom SMTP를 비활성화하면 built-in으로 돌아감. 단, built-in은 rate limit이 있으므로 production에서는 rollback 권장하지 않음.

---

## 7B. Release-Config-2B 실행 결과 (2026-05-29)

### 확인 사항
- Supabase 프로젝트: `ACTIVE_HEALTHY` ✅
- 코드 변경 (Recovery flow + cooldown): 커밋 완료 ✅
- 공식 문서 확인: built-in SMTP는 **프로젝트 팀 멤버 이메일로만 발송** — production 불가 ✅ 확인

### BLOCKER: 커스텀 도메인 없음
- 현재 `bottlejoon123.github.io`는 GitHub Pages 공유 도메인 → Resend 발신 도메인 인증 불가
- 결정: **도메인 구매 후 진행** (코드 freeze 2026-06-07 이전)

### Step 3 (URL Config) — 수동 설정 필요
Supabase Management API 설정은 Dashboard에서만 가능 (MCP 지원 없음).

**지금 바로 설정할 값:**
```
Supabase Dashboard → Authentication → URL Configuration

Site URL:
  https://bottlejoon123.github.io/pick-tagon/

Additional Redirect URLs (없으면 추가):
  https://bottlejoon123.github.io/pick-tagon/
  https://bottlejoon123.github.io/pick-tagon/**
```

앱의 `getAuthRedirectUrl()` 함수가 이 URL을 반환함 — 반드시 일치해야 메일 링크 클릭 후 Pick-tagon으로 도착.

### 다음 단계 순서 (2026-06-07 freeze 이전)

| 순서 | 작업 | 소요 시간 |
|---|---|---|
| 1 | 도메인 구매 (Namecheap/Google Domains) | 10분, ~$10 |
| 2 | Resend 계정 생성 + 도메인 추가 | 10분 |
| 3 | DNS 레코드 추가 (DKIM/SPF) | 5분, 전파 1~24시간 |
| 4 | Resend 도메인 verified 확인 | — |
| 5 | Resend API Key 발급 (Sending 권한만) | 5분 |
| 6 | Supabase Dashboard → Auth → SMTP 설정 | 10분 |
| 7 | Site URL / Redirect URL 설정 확인 | 5분 |
| 8 | 테스트 이메일 발송 (Step 4) | 운영자 직접 |

---

## 8. 출시 전 체크리스트 (운영자)

- [ ] Resend 계정 생성 + 도메인 인증
- [ ] Supabase Dashboard SMTP 설정 적용
- [ ] 발신자 이름 "Pick-tagon" 설정
- [ ] Signup confirmation 테스트 통과
- [ ] Password reset 테스트 통과 (Pick-tagon 앱 redirect 포함)
- [ ] 스팸 필터 테스트 (mail-tester.com)
- [ ] Rate limit 설정 확인 (60초 이상)

---

## 9. 관련 코드 변경 (이미 완료)

| 파일 | 내용 |
|---|---|
| `index.html` `handlePasswordReset()` | 60초 cooldown, rate limit 에러 한국어 안내, 버튼 disabled |
| `index.html` `profilePasswordReset()` | 동일 cooldown + 에러 매핑 |
| `public/js/api/supabase.js` `initSupabase()` | PASSWORD_RECOVERY 3-tier fallback |
