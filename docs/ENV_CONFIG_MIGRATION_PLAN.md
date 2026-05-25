# ENV Config Migration Plan — Phase 8A
**Date:** 2026-05-25  
**Branch:** main (`581c20b`)  
**Scope:** Supabase URL/anon key + ADMIN_EMAILS를 하드코딩에서 Vite 환경변수 기반으로 전환

---

## 1. 현재 상태 분석

### 1-1. Config 파일 위치

| 파일 | 크기 | 내용 | 실제 사용 여부 |
|---|---|---|---|
| `public/js/config.js` | 443 B | SUPABASE_URL, SUPABASE_KEY, ADMIN_EMAILS | **예 — Vite가 이 파일을 서빙** |
| `js/config.js` (루트) | 299 B | SUPABASE_URL, SUPABASE_KEY only | **아니오 — 레거시, 서빙 안 됨** |

**근거:** Vite의 기본 `publicDir`은 `./public`. `public/js/config.js` → `/js/config.js`로 서빙됨.  
`js/config.js` (루트)는 Vite 서버에서 서빙되지 않으며, `dist/`에도 포함되지 않는다.  
→ 루트 `js/config.js`는 향후 별도로 정리 대상.

### 1-2. index.html 로딩 순서

```html
<!-- index.html:2505 -->
<script src="/js/config.js"></script>          ← public/js/config.js (SUPABASE_URL, SUPABASE_KEY, ADMIN_EMAILS 전역 선언)
<script src="/js/data/fights.js"></script>
<script src="/js/state.js"></script>
<script src="/js/api/supabase.js?v=7"></script> ← SUPABASE_URL, SUPABASE_KEY, ADMIN_EMAILS 소비
...
```

### 1-3. 전역 변수 소비 지점

**`public/js/api/supabase.js`**:
```js
// line 168
sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// line 280
|| (typeof ADMIN_EMAILS !== 'undefined' && ADMIN_EMAILS.indexOf(userEmail) !== -1);
```

→ `SUPABASE_URL`, `SUPABASE_KEY`, `ADMIN_EMAILS`는 `var` 전역으로 선언되어 window 스코프에 바인딩됨.

### 1-4. 빌드/배포 구조

```
npm run build
  └─ Vite transforms: index.html, src/tailwind.css
  └─ Vite COPIES verbatim: public/** → dist/**
       → dist/js/config.js  ← public/js/config.js 그대로 복사 (transform 없음)
       → dist/js/api/supabase.js 등 동일
```

**deploy.yml** (`.github/workflows/deploy.yml`):
- `push: main` 트리거
- `npm ci` + `npm run build` → `dist/` → GitHub Pages 배포
- **현재 `env:` 섹션 없음** — 빌드 시 환경변수 주입 불가

---

## 2. Vite env 적용 가능성 분석

### 2-1. `public/js/*.js` — `import.meta.env` 직접 사용 불가

`public/` 하위 파일은 Vite가 **transform하지 않음** — 정적 복사만 수행.  
따라서 `import.meta.env.VITE_SUPABASE_URL` 을 `public/js/config.js`에 직접 쓰면  
→ 런타임에 리터럴 문자열 `import.meta.env.VITE_SUPABASE_URL`로 남아 **작동 안 함**.

### 2-2. `index.html` — `%VITE_..%` 치환 가능 ✓

Vite는 `index.html` 처리 시 `%VITE_변수명%` 패턴을 `.env`의 값으로 치환한다.  
이것이 **유일하게 사용 가능한 env 주입 경로**.

```html
<!-- index.html: Vite가 빌드/dev 시 %VITE_..% 를 실제 값으로 치환 -->
<script>
  window.SUPABASE_URL      = '%VITE_SUPABASE_URL%';
  window.SUPABASE_KEY      = '%VITE_SUPABASE_ANON_KEY%';
  window.ADMIN_EMAILS      = ['%VITE_ADMIN_EMAIL%'];
</script>
```

### 2-3. 가능한 방식 비교

| 방식 | 설명 | 적합성 |
|---|---|---|
| **A. index.html inline bridge** (권장) | Vite HTML 치환 → window 전역 → config.js가 window 값 소비 | ✅ 현재 아키텍처와 완전 호환 |
| B. src/ ES module 래퍼 | `src/config.js`에 import.meta.env 사용 후 global에 노출 | ⚠️ src/ 진입점 추가 필요, 복잡도 증가 |
| C. vite-plugin-html | 플러그인으로 HTML 내 변수 치환 확장 | ⚠️ 의존성 추가, 과한 접근 |
| D. 하드코딩 유지 | 현재 상태 | ❌ 환경 분리 불가, git 이력에 값 영구 존재 |

**결론: 방식 A (index.html inline bridge) 채택.**

---

## 3. 배포 경로 리스크

### 3-1. 현재 GitHub Actions 배포

```yaml
# .github/workflows/deploy.yml
- name: Build
  run: npm run build
  # env: 섹션 없음 → VITE_ 변수가 없으면 %VITE_SUPABASE_URL% 리터럴이 그대로 남음
```

### 3-2. 마이그레이션 후 필요한 deploy.yml 수정

```yaml
- name: Build
  run: npm run build
  env:
    VITE_SUPABASE_URL:       ${{ secrets.VITE_SUPABASE_URL }}
    VITE_SUPABASE_ANON_KEY:  ${{ secrets.VITE_SUPABASE_ANON_KEY }}
    VITE_ADMIN_EMAIL:        ${{ secrets.VITE_ADMIN_EMAIL }}
```

→ GitHub 레포지토리 Settings → Secrets and variables → Actions 에서 3개 시크릿 등록 필요.

### 3-3. 리스크 시나리오

| 시나리오 | 리스크 | 대응 |
|---|---|---|
| secrets 미등록 상태에서 push | 빌드 성공하지만 앱 broken (Supabase 연결 실패) | secrets 먼저 등록 후 config 변경 push |
| `.env.local` 실수로 commit | 로컬 값이 git에 노출 | `.gitignore`에 `.env*.local` 규칙 확인 |
| 빌드 시 VITE_ 변수 미설정 | `%VITE_..%` 리터럴 문자열로 HTML 포함 | 빌드 검증 단계에서 grep으로 확인 가능 |
| dist/ 추적 재활성화 | 평문 key가 git에 들어갈 수 있음 | dist/ gitignore 정책 유지 (`dist/`는 절대 track 금지) |

---

## 4. 보안 / 운영 원칙

### 4-1. Supabase anon key의 성격

- Supabase anon key = JWT (`role: anon`) — 브라우저용 **공개 키**
- Supabase 공식 문서에서 클라이언트 코드에 포함 허용을 명시
- 키 자체가 공개되어도 **RLS(Row Level Security) 가 실제 보안을 담당**
- 현재 `is_admin` DB 컬럼 + `SECURITY DEFINER` RPC 로 admin 권한 관리

### 4-2. `.env` 전환 목적

- 환경 분리 (dev / prod / staging)
- 하드코딩 제거 → 팀 협업 시 실수 방지
- `ADMIN_EMAILS` 배열을 git 이력에서 제거
- CI/CD secrets 관리 표준화

### 4-3. 실제 보안은 DB 레이어에 존재

```
Client-side ADMIN_EMAILS check → UI gate only (접근 차단 없음)
DB SECURITY DEFINER RPC       → 실제 admin 작업 권한 강제
RLS policies                  → 데이터 읽기/쓰기 권한 강제
```

---

## 5. 구현 결과 (Phase 8A-2 완료)

### 5-1. 변경된 파일

| 파일 | 변경 내용 |
|---|---|
| `.env.example` | **신규** — placeholder 값, tracked |
| `.gitignore` | `.env`, `.env.local`, `.env.*.local` 규칙 추가 |
| `index.html` | `window.PICKTAGON_CONFIG` inline bridge 삽입 (config.js 로드 직전) |
| `index.html:4570` | Edge Function URL을 `SUPABASE_URL + '/functions/v1/fetch-mma-news'`로 전환 |
| `public/js/config.js` | `window.PICKTAGON_CONFIG` 소비 + IIFE로 하드코딩 제거, placeholder 감지 |
| `js/config.js` (루트) | 레거시 주석으로 대체, 하드코딩 제거 |
| `.github/workflows/deploy.yml` | Build step에 `env:` 블록 추가 (3개 secrets 매핑) |

### 5-2. 구현된 bridge 구조

```
.env.local (gitignored)
  └─ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_ADMIN_EMAILS
       │
       ▼ Vite HTML replacement (%VITE_..% → 실제 값)
index.html inline <script>
  window.PICKTAGON_CONFIG = { supabaseUrl, supabaseKey, adminEmails }
       │
       ▼ <script src="/js/config.js">
public/js/config.js (IIFE)
  var SUPABASE_URL / SUPABASE_KEY / ADMIN_EMAILS  ← 전역 vars
       │
       ▼
public/js/api/supabase.js
  supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  ADMIN_EMAILS.indexOf(userEmail)
```

### 5-3. 검증 결과 (2026-05-25)

- `npm run build` ✓ 통과
- 소스 하드코딩 잔존 없음 (`grep` PASS — 0건)
- `dist/js/config.js` 하드코딩 없음 ✓
- `dist/index.html` PICKTAGON_CONFIG bridge 포함 ✓
- Vite 경고 (`%VITE_..% not defined`): `.env.local` 미존재 시 정상 — 빌드 통과에 영향 없음

### 5-4. ⚠️ 배포 전 필수 작업 (사용자 직접)

**GitHub repository secrets 등록 필요:**  
Settings → Secrets and variables → Actions → New repository secret

| Secret 이름 | 값 |
|---|---|
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (JWT) |
| `VITE_ADMIN_EMAILS` | 관리자 이메일 (comma-separated) |

**로컬 개발 시:**  
`.env.example`을 복사해 `.env.local` 생성 후 실제 값 입력.

> secrets 미등록 상태로 push하면: CI 빌드 성공 but 앱이 Supabase 연결 실패.  
> `[PICKTAGON] Supabase config missing` console.warn이 브라우저에서 출력됨.

---

## 6. 진행 현황

| 단계 | 상태 |
|---|---|
| Phase 8A-1: 조사 및 계획 문서화 | **완료** |
| Phase 8A-2: env bridge 구현 | **완료** |
| GitHub Secrets 등록 | **사용자 직접 필요** |
