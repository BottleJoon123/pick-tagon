# Pick-tagon

**Official site:** https://pick-tagon.com/

Pick-tagon Official is the UFC & MMA prediction platform published at
`pick-tagon.com`. Use this domain as the canonical public URL for SEO,
social profiles, and external references.

---

UFC 경기 결과 예측 플랫폼. Supabase + Vite + Tailwind CSS 기반 SPA.

---

## 기술 스택

| 레이어 | 기술 |
|---|---|
| 빌드 | Vite 5, Tailwind CSS v3 (PostCSS) |
| 백엔드 | Supabase (Auth, PostgreSQL, Edge Functions) |
| 호스팅 | GitHub Pages (GitHub Actions 자동 배포) |
| 스타일 | Tailwind CSS (npm 빌드, CDN 미사용) |

---

## 로컬 개발 환경 설정

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.example`을 복사해 `.env.local`을 생성하고 실제 값을 입력합니다.

```bash
cp .env.example .env.local
```

`.env.local` 파일을 열어 아래 3개 변수를 채웁니다:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
VITE_ADMIN_EMAILS=your@email.com
```

#### 변수 설명

| 변수 | 설명 | 위치 |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL | Supabase Dashboard → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key | Supabase Dashboard → Project Settings → API → `anon` `public` |
| `VITE_ADMIN_EMAILS` | 관리자 이메일 (comma-separated) | 직접 입력 (예: `a@b.com,c@d.com`) |

> **⚠️ 중요:** `anon` key만 사용하세요. `service_role` key는 서버 전용이며 **절대 브라우저 코드에 포함하지 마세요**.  
> Supabase anon key는 퍼블릭 키이며 브라우저에 포함해도 안전합니다. 실제 보안은 RLS(Row Level Security)와 `SECURITY DEFINER` RPC가 담당합니다.

> **`.env.local`은 gitignore 처리되어 있습니다.** 절대 커밋하지 마세요.

### 3. 개발 서버 실행

```bash
npm run dev
# → http://localhost:5173/pick-tagon/
```

### 4. 프로덕션 빌드

```bash
npm run build
# → dist/ 생성
```

빌드 후 브라우저 DevTools Console에서 `[PICKTAGON] Supabase config missing` 경고가 없는지 확인하세요.

---

## GitHub Pages 배포

`main` 브랜치에 push하면 `.github/workflows/deploy.yml`이 자동으로 빌드 + 배포합니다.

배포 시 Vite는 GitHub Actions Repository Secrets에서 환경 변수를 읽습니다.

**필요한 GitHub Secrets:**

| Secret 이름 | 설명 |
|---|---|
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_ADMIN_EMAILS` | 관리자 이메일 (comma-separated) |

등록 위치: GitHub repo → Settings → Secrets and variables → Actions → New repository secret

---

## 프로젝트 구조

```
pick-tagon/
├── index.html              # 앱 진입점 (Vite 처리, env bridge 포함)
├── src/
│   └── tailwind.css        # Tailwind CSS 진입점 (Vite/PostCSS 빌드)
├── public/
│   ├── js/
│   │   ├── config.js       # Env bridge 소비 → SUPABASE_URL/KEY/ADMIN_EMAILS 전역 생성
│   │   ├── api/
│   │   │   └── supabase.js # Supabase API 레이어
│   │   └── ...             # 기타 모듈 (home, profile, community 등)
│   └── css/                # 커스텀 CSS (tokens, theme-bridge, app)
├── .env.example            # 환경 변수 템플릿 (tracked)
├── .env.local              # 실제 로컬 값 (gitignored — 직접 생성 필요)
├── tailwind.config.js      # Tailwind 설정
├── postcss.config.cjs      # PostCSS 설정
├── vite.config.js          # Vite 설정 (base: /pick-tagon/)
└── docs/                   # 계획/QA 문서
```

---

## 문서

| 문서 | 설명 |
|---|---|
| [docs/ENV_CONFIG_MIGRATION_PLAN.md](docs/ENV_CONFIG_MIGRATION_PLAN.md) | Supabase env 설정 마이그레이션 상세 |
| [docs/DESIGN_REFACTOR_PLAN.md](docs/DESIGN_REFACTOR_PLAN.md) | 디자인/빌드 리팩토링 진행 현황 |
| [docs/TAILWIND_CDN_MIGRATION_PLAN.md](docs/TAILWIND_CDN_MIGRATION_PLAN.md) | Tailwind CDN → npm 전환 계획/결과 |
