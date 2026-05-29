# Cloudflare Pages 배포 계획

> 작성일: 2026-05-29  
> Release-Config-3A  
> 목표 도메인: **https://pick-tagon.com/**  
> 기존 GitHub Pages: https://bottlejoon123.github.io/pick-tagon/ (transition 기간 병행 유지)

---

## 1. 배포 구조 변경 요약

| 항목 | 기존 | 변경 후 |
|---|---|---|
| 공식 URL | `bottlejoon123.github.io/pick-tagon/` | **`pick-tagon.com/`** |
| 배포 플랫폼 | GitHub Actions → GitHub Pages | **Cloudflare Pages** (주) + GitHub Pages (병행) |
| Vite base | 하드코딩 `/pick-tagon/` | **환경변수** `VITE_BASE_PATH` 기반 |
| GitHub Pages base | `/pick-tagon/` (기존 동일) | `VITE_BASE_PATH=/pick-tagon/` CI env |
| Cloudflare base | — | 기본 `'/'` (env var 없음) |

---

## 2. 코드 변경 사항 (이미 적용됨)

### 2.1 `vite.config.js`

```js
const base = process.env.VITE_BASE_PATH || '/'
export default defineConfig({ base, ... })
```

- Cloudflare Pages: env var 없음 → `base = '/'`
- GitHub Pages CI: `VITE_BASE_PATH=/pick-tagon/` → `base = '/pick-tagon/'`

### 2.2 `.github/workflows/deploy.yml`

```yaml
- name: Build
  run: npm run build
  env:
    VITE_BASE_PATH: /pick-tagon/   # ← 추가됨
    VITE_SUPABASE_URL: ...
    ...
```

GitHub Pages 빌드는 기존 경로 그대로 유지.

### 2.3 `index.html` — `PICKTAGON_CONFIG` + `getAuthRedirectUrl()`

`siteUrl` 필드 추가:
```js
window.PICKTAGON_CONFIG = {
    supabaseUrl:  '%VITE_SUPABASE_URL%',
    supabaseKey:  '%VITE_SUPABASE_ANON_KEY%',
    adminEmails:  '%VITE_ADMIN_EMAILS%',
    siteUrl:      '%VITE_PUBLIC_SITE_URL%',   // ← 추가
};
```

`getAuthRedirectUrl()` 개선 (우선순위):
1. `VITE_PUBLIC_SITE_URL` 환경변수 설정 시 해당 값 사용
2. `pick-tagon.com` / `www.pick-tagon.com` → `https://pick-tagon.com/`
3. `bottlejoon123.github.io` → `https://bottlejoon123.github.io/pick-tagon/`
4. localhost / `*.pages.dev` preview → `window.location.origin + pathname`

---

## 3. Cloudflare Pages 설정 (대시보드)

> ⚠️ 이 단계는 운영자가 Cloudflare 대시보드에서 직접 수행

### 3.1 프로젝트 생성

1. Cloudflare Dashboard → **Workers & Pages → Create application → Pages**
2. GitHub 저장소 연결: `BottleJoon123/pick-tagon`
3. 배포 브랜치: `main`

### 3.2 빌드 설정

| 항목 | 값 |
|---|---|
| Framework preset | `None` (또는 Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` (기본) |
| Node.js version | `20` |

### 3.3 환경 변수 (Production)

> ⚠️ 값은 절대 문서/코드에 기록하지 말 것

| 환경변수 | 설명 |
|---|---|
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon public key |
| `VITE_ADMIN_EMAILS` | 쉼표 구분 admin 이메일 목록 |
| `VITE_PUBLIC_SITE_URL` | `https://pick-tagon.com/` |

> `VITE_BASE_PATH` 는 **설정하지 말 것** — 미설정 시 `'/'` 기본값 사용

### 3.4 커스텀 도메인 연결

1. Pages 프로젝트 → **Custom domains → Add domain**
2. `pick-tagon.com` 입력
3. DNS 설정: Cloudflare DNS에서 `pick-tagon.com` CNAME → Cloudflare Pages URL
4. `www.pick-tagon.com` → `pick-tagon.com` redirect 설정 (선택)
5. SSL/TLS: Cloudflare 자동 발급 (Full 또는 Full Strict)

---

## 4. Supabase Auth 설정 (대시보드)

> ⚠️ 운영자가 Supabase Dashboard에서 수행

### Authentication → URL Configuration

**Site URL:**
```
https://pick-tagon.com/
```

**Redirect URLs (허용 목록):**
```
https://pick-tagon.com/
https://pick-tagon.com/**
https://www.pick-tagon.com/
https://www.pick-tagon.com/**
https://bottlejoon123.github.io/pick-tagon/
https://bottlejoon123.github.io/pick-tagon/**
```

> Transition 기간 동안 GitHub Pages URL도 유지. 공식 전환 완료 후 GitHub Pages 항목 제거 가능.

---

## 5. 빌드 검증 (로컬)

### Cloudflare 빌드 (root base)

```bash
npm run build
# → dist/index.html asset path: /assets/index-XXX.js (root 기준)
```

### GitHub Pages 빌드 (subpath base)

```bash
VITE_BASE_PATH=/pick-tagon/ npm run build
# → dist/index.html asset path: /pick-tagon/assets/index-XXX.js
```

두 빌드 모두 `✓ built in X.Xs` 으로 종료되어야 함.

---

## 6. 전환 후 체크리스트

> 운영자 직접 검증 항목

- [ ] `https://pick-tagon.com/` 접속 → 홈 로딩 정상
- [ ] 회원가입 → 이메일 인증 링크 클릭 → `pick-tagon.com`으로 리디렉트
- [ ] 비밀번호 재설정 → 링크 클릭 → 새 비밀번호 모달 표시
- [ ] 픽 등록 → 포인트 차감 정상
- [ ] 모바일 375px 정상 표시
- [ ] GitHub Pages URL도 여전히 정상 작동
- [ ] Supabase Auth Rate Limit (Custom SMTP) 설정 확인

---

## 7. 병행 배포 구조 (Transition 기간)

```
main 브랜치 push
├── GitHub Actions → GitHub Pages (bottlejoon123.github.io/pick-tagon/)
│     VITE_BASE_PATH=/pick-tagon/
└── Cloudflare Pages (자동 감지 push) → pick-tagon.com/
      VITE_BASE_PATH 미설정 → base='/'
```

두 배포는 같은 브랜치를 바라보므로 항상 동일한 코드가 배포됨.

---

## 8. 관련 문서

| 문서 | 내용 |
|---|---|
| [`docs/AUTH_SMTP_SETUP_PLAN_2026-06-10.md`](AUTH_SMTP_SETUP_PLAN_2026-06-10.md) | Custom SMTP (Resend) 설정 |
| [`docs/RELEASE_FIX_CLOSEOUT_2026-05-26.md`](RELEASE_FIX_CLOSEOUT_2026-05-26.md) | Release gate G-9 Auth SMTP |
| [`docs/ENV_CONFIG_MIGRATION_PLAN.md`](ENV_CONFIG_MIGRATION_PLAN.md) | 환경변수 설정 전체 가이드 |
