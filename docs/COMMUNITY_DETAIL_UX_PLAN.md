# Community Post Detail UX Plan

작성: 2026-05-18
구현 상태: 설계 완료 (미구현)

---

## 배경 및 문제

현재 커뮤니티 포스트 목록은 **인라인 아코디언** 패턴을 사용한다.
`post-row` 클릭 → `togglePostExpand(origIdx)` → `post-expand` div가 해당 행 아래 펼쳐짐.

**문제점:**

| # | 문제 | 영향 |
|---|------|------|
| 1 | 아코디언 영역이 테이블 레이아웃에 제약됨 | 본문/댓글 가독성 저하 |
| 2 | 긴 본문(`content`) 크롭 없이 노출 → 레이아웃 깨짐 | 가독성, 미관 |
| 3 | 아코디언 오픈 시 하위 행 전체 밀림 | 모바일 UX 저하 |
| 4 | 스크롤 고립 없음 — 댓글 긴 포스트에서 UX 붕괴 | 모바일 |
| 5 | URL 기반 딥링크 없음 | 공유, 직접 접근 불가 |

---

## 현재 코드 구조 조사 결과

### renderPosts() 핵심 구조 (`public/js/community.js`)

```
post-list-container
└── post-list-head (컬럼 헤더)
└── div
    ├── post-row#post-row-{origIdx}   ← onclick="togglePostExpand(origIdx)"
    └── post-expand#post-expand-{origIdx}   ← 아코디언 본체
        ├── 작성자 + belt + 옥타곤 버튼
        ├── p.post-expand-body (content)
        ├── post-com-list-{origIdx}   (댓글 목록)
        └── post-com-input-row (댓글 입력 + SEND)
```

### togglePostExpand() 동작
- 기존 `.post-expand.open` 전부 닫기
- 클릭된 `post-expand` → `.open` 추가

### DB 연동 함수 위치

| 함수 | 파일 | 역할 |
|------|------|------|
| `loadPostsFromDB()` | `public/js/api/supabase.js:67` | posts + post_comments + users(factions) JOIN 로드 |
| `publishPost()` | `index.html:3310` | 신규 포스트 INSERT |
| `postCom(i)` | `index.html:3291` | 댓글 INSERT → `addCommentToDB(dbId, nick, text)` |
| `likePostInDB(dbId)` | `index.html:4973` | post_likes INSERT + posts.likes UPDATE |
| `addCommentToDB(postDbId, userNick, text)` | `index.html:4988` | `post_comments` 테이블 INSERT |
| `likePost(i)` | `community.js:350` | 프론트 상태 + DB 호출 진입점 |

### posts 배열 스키마 (`loadPostsFromDB` 매핑 기준)

```javascript
{
    id, dbId,          // UUID (같은 값)
    author,            // nickname
    title,             // "[카테고리프리픽스] 제목" 형태
    content,           // 본문 (최대 2000자)
    likes,             // 정수
    date,              // "YYYY.MM.DD"
    comments: [        // post_comments JOIN
        { user, text }
    ],
    belt,              // "White Belt" ~ "Black Belt"
    isPickShare,       // boolean
    faction,           // { id, name, emoji_icon } | null
}
```

### 기존 Modal 패턴 참조

`news-detail-modal` (index.html:2375):
- `hidden fixed inset-0 z-[200] flex items-center justify-center p-4`
- `background:rgba(0,0,0,0.88)`, backdrop click → `closeNewsDetail()`
- `glass-card rounded-[2rem] w-full max-w-2xl border border-white/10 max-h-[92vh] overflow-y-auto`
- 상단 카테고리 컬러 바: `<div id="nd-cat-bar" class="h-1 w-full rounded-t-[2rem]"></div>`

---

## 목표 설계: Modal Detail View

### 설계 결정: Modal (Route 아님)

Route-style (hash 기반 하위 네비게이션) 검토 후 **모달로 확정**:

| 방식 | 장점 | 단점 | 결정 |
|------|------|------|------|
| Modal | 기존 패턴 일관성, 상태 변경 최소 | 딥링크 없음 | **채택** |
| Route (hash) | URL 공유 가능 | `navigateTo()` 오버홀 필요, `loadPostsFromDB` 타이밍 복잡 | 보류 |

딥링크는 Step B에서 별도 구현 가능.

---

## HTML 구조 (`post-detail-modal`)

index.html community section 바로 뒤, z-[250] (news-detail-modal z-[200]보다 앞):

```html
<div id="post-detail-modal"
     class="hidden fixed inset-0 z-[250] flex items-center justify-center p-4"
     style="background:rgba(0,0,0,0.92)"
     onclick="if(event.target===this)closePostDetail()">
    <div class="glass-card rounded-[2rem] w-full max-w-2xl border border-white/10
                flex flex-col max-h-[92vh]">

        <!-- 카테고리 컬러 바 (news-detail-modal 패턴) -->
        <div id="pd-cat-bar" class="h-1 w-full rounded-t-[2rem] flex-shrink-0"></div>

        <!-- 스크롤 본문 -->
        <div class="flex-1 overflow-y-auto p-5 lg:p-8">

            <!-- 헤더: 배지 + 날짜 + 닫기 -->
            <div class="flex justify-between items-start mb-5 gap-4">
                <div class="flex items-center gap-2 flex-wrap">
                    <span id="pd-cat-badge" class="post-type-tag"></span>
                    <span id="pd-date"
                          class="oswald-sharp text-[9px] text-gray-600 italic"></span>
                </div>
                <button onclick="closePostDetail()"
                        class="text-gray-500 hover:text-white text-2xl transition flex-shrink-0">
                    ✕
                </button>
            </div>

            <!-- 제목 -->
            <h2 id="pd-title"
                class="oswald-sharp text-xl lg:text-2xl font-black italic text-white
                       uppercase tracking-tight leading-snug mb-3"></h2>

            <!-- 작성자 정보 -->
            <div id="pd-author"
                 class="flex items-center gap-2 mb-6 pb-5 border-b border-white/08
                        text-[11px] text-gray-500 font-inter flex-wrap">
                <!-- JS로 채움: factionBadge + author + belt + 옥타곤 버튼 -->
            </div>

            <!-- 본문 -->
            <p id="pd-content"
               class="text-gray-300 text-sm leading-relaxed mb-6
                      whitespace-pre-wrap"></p>

            <!-- 댓글 목록 -->
            <div id="pd-com-list" class="space-y-2 mb-5">
                <!-- JS로 채움 -->
            </div>

            <!-- 댓글 입력 -->
            <div class="flex gap-2 pt-4 border-t border-white/08">
                <input type="text" id="pd-com-input"
                    class="flex-1 bg-black/40 border border-white/10 rounded-xl
                           px-4 py-3 text-white text-sm focus:outline-none
                           focus:border-ufcRed"
                    placeholder="의견을 남겨주세요...">
                <button onclick="sendDetailComment()"
                    class="oswald-sharp bg-ufcRed hover:bg-red-700 text-white
                           font-black px-5 py-3 rounded-xl italic uppercase
                           text-xs tracking-widest transition-all">
                    SEND
                </button>
            </div>
        </div>

        <!-- 하단 고정 바: 좋아요 + 댓글 수 -->
        <div class="flex items-center justify-between px-6 py-3
                    border-t border-white/08 rounded-b-[2rem] flex-shrink-0">
            <button id="pd-like-btn" onclick="likePostFromDetail()"
                class="post-act-btn oswald-sharp text-xs font-black italic
                       uppercase tracking-wider">
                🔥 추천
            </button>
            <span id="pd-stats"
                  class="oswald-sharp text-[10px] text-gray-600 italic
                         uppercase tracking-widest">
                <!-- "🔥 12  💬 3" 형태 -->
            </span>
        </div>
    </div>
</div>
```

---

## JS 함수 설계

### openPostDetail(origIdx)

```javascript
var _detailPostIdx = -1;   // 현재 열린 post의 posts[] 인덱스
var _detailPostDbId = null; // 안전성 검증용 dbId 스냅샷

function openPostDetail(origIdx) {
    var p = posts[origIdx];
    if (!p) return;
    _detailPostIdx = origIdx;
    _detailPostDbId = p.dbId;

    // 카테고리
    var rawTitle = p.title || '';
    var cat = _getPostCategory(rawTitle);
    var catColors = {
        analysis:'#e8000d', fighter:'#f59e0b', live:'#10b981',
        news:'#3b82f6',     humor:'#a855f7',   default:'#333'
    };
    var catDisplay = {
        analysis:{ cls:'cat-analysis', lbl:'🔥 분석' },
        fighter: { cls:'cat-fighter',  lbl:'🗣️ 파이터' },
        live:    { cls:'cat-live',     lbl:'🔴 라이브' },
        news:    { cls:'cat-news',     lbl:'📰 뉴스' },
        humor:   { cls:'cat-humor',    lbl:'😂 유머' }
    };

    var bar = document.getElementById('pd-cat-bar');
    if (bar) bar.style.background = catColors[cat] || catColors.default;

    var badge = document.getElementById('pd-cat-badge');
    if (badge) {
        if (p.isPickShare) {
            badge.className = 'post-type-tag pick'; badge.textContent = '🎯 픽';
        } else if (catDisplay[cat]) {
            badge.className = 'post-type-tag ' + catDisplay[cat].cls;
            badge.textContent = catDisplay[cat].lbl;
        } else {
            badge.className = 'post-type-tag post'; badge.textContent = '✍️ 분석';
        }
    }

    var el = function(id, val) {
        var e = document.getElementById(id);
        if (e) e.textContent = val;
    };

    el('pd-date',    p.date || '');
    el('pd-title',   _stripCatPrefix(rawTitle));
    el('pd-content', p.content || '');

    // 작성자 영역
    var authorEl = document.getElementById('pd-author');
    if (authorEl) {
        var factionBadge = (typeof getFactionBadge === 'function' && p.faction)
            ? getFactionBadge(p.faction) + ' ' : '';
        var isSelf = p.author === getDisplayUsername();
        var battleBtn = (!isSelf && currentUser)
            ? '<button onclick="requestBattle(\'' + escapeHtml(p.author).replace(/'/g,"\\'") + '\', event)" ...>⚡ 옥타곤</button>'
            : '';
        authorEl.innerHTML = '✍️ ' + factionBadge
            + escapeHtml(p.author) + ' · ' + escapeHtml(p.belt || 'White Belt')
            + ' ' + battleBtn;
    }

    // 댓글 목록 렌더링
    _renderDetailComments(p.comments || []);

    // 좋아요 상태
    _syncDetailLikeBtn();

    // 통계
    var statsEl = document.getElementById('pd-stats');
    if (statsEl) statsEl.textContent = '🔥 ' + (p.likes || 0) + '  💬 ' + (p.comments || []).length;

    // 모달 표시
    var modal = document.getElementById('post-detail-modal');
    if (modal) modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}
```

### _renderDetailComments(comments)

```javascript
function _renderDetailComments(comments) {
    var listEl = document.getElementById('pd-com-list');
    if (!listEl) return;
    if (!comments || comments.length === 0) {
        listEl.innerHTML = '<p style="font-size:10px;color:#333;font-style:italic;text-align:center;padding:12px 0;">첫 댓글을 남겨주세요</p>';
        return;
    }
    listEl.innerHTML = comments.map(function(c) {
        var isSelf = c.user === getDisplayUsername();
        var battleBtn = (!isSelf && currentUser) ? '...' : '';
        return '<div class="post-comment-block">'
            + '<div class="post-comment-nick"><span>' + escapeHtml(c.user) + '</span>' + battleBtn + '</div>'
            + '<p class="post-comment-txt">' + escapeHtml(c.text) + '</p>'
            + '</div>';
    }).join('');
}
```

### sendDetailComment()

```javascript
async function sendDetailComment() {
    if (_detailPostIdx < 0) return;
    var p = posts[_detailPostIdx];
    if (!p || p.dbId !== _detailPostDbId) return; // stale guard
    var input = document.getElementById('pd-com-input');
    var text = input ? input.value.trim() : '';
    if (!text) return;
    if (!currentUser) { showToast('⚠ 댓글은 로그인 후 작성할 수 있습니다'); return; }
    var nick = getDisplayUsername();
    var comment = { user: nick, text: text.slice(0, 300) };
    p.comments.push(comment);
    if (input) input.value = '';
    await addCommentToDB(p.dbId, nick, text.slice(0, 300));
    save();
    _renderDetailComments(p.comments);
    // 통계 업데이트
    var statsEl = document.getElementById('pd-stats');
    if (statsEl) statsEl.textContent = '🔥 ' + (p.likes || 0) + '  💬 ' + p.comments.length;
}
```

### likePostFromDetail()

```javascript
function likePostFromDetail() {
    if (_detailPostIdx < 0) return;
    likePost(_detailPostIdx); // community.js의 기존 함수 호출
    _syncDetailLikeBtn();
    var p = posts[_detailPostIdx];
    var statsEl = document.getElementById('pd-stats');
    if (statsEl && p) statsEl.textContent = '🔥 ' + (p.likes || 0) + '  💬 ' + (p.comments || []).length;
}

function _syncDetailLikeBtn() {
    var p = _detailPostIdx >= 0 ? posts[_detailPostIdx] : null;
    var btn = document.getElementById('pd-like-btn');
    if (!btn || !p) return;
    var isLiked = likedPostIds.has(p.dbId);
    btn.textContent = isLiked ? '✅ 추천' : '🔥 추천';
    btn.classList.toggle('liked', isLiked);
}
```

### closePostDetail()

```javascript
function closePostDetail() {
    var modal = document.getElementById('post-detail-modal');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
    _detailPostIdx = -1;
    _detailPostDbId = null;
}
```

---

## renderPosts() 수정 범위

`community.js` `renderPosts()` 내 post-row onclick 변경:

```javascript
// Before:
onclick="togglePostExpand(${origIdx})"

// After:
onclick="openPostDetail(${origIdx})"
```

`post-expand` div 생성 블록 전체 제거.
`togglePostExpand()` 함수 제거 (또는 empty stub 유지).

---

## 카테고리 컬러 바 색상 스펙

| 카테고리 | 색상 | hex |
|----------|------|-----|
| analysis | ufcRed | `#e8000d` |
| fighter  | amber  | `#f59e0b` |
| live     | emerald| `#10b981` |
| news     | blue   | `#3b82f6` |
| humor    | purple | `#a855f7` |
| 기본     | dark gray | `#333333` |

---

## 구현 순서

1. index.html: `post-detail-modal` HTML 추가 (community section 직후, z-250)
2. community.js: `openPostDetail`, `_renderDetailComments`, `sendDetailComment`, `likePostFromDetail`, `_syncDetailLikeBtn`, `closePostDetail`, `_detailPostIdx`, `_detailPostDbId` 추가
3. community.js `renderPosts()`: post-row onclick 변경, post-expand 제거
4. community.js: `togglePostExpand` 제거 or stub화
5. index.html `toggleComArea()`: `post-expand` fallback 제거 (or leave dead-code)
6. npm run build + 수동 QA

---

## 위험 요소 / 주의사항

| 항목 | 내용 | 대응 |
|------|------|------|
| stale index | `renderFeed()` 재호출로 `posts[]` 재정렬 시 `_detailPostIdx` 불일치 | `_detailPostDbId` 스냅샷으로 검증 |
| body overflow | 모달 닫을 때 `overflow` 복구 필수 | `closePostDetail()` 에서 무조건 복구 |
| postCom(i) 기존 호출 | `postCom`은 아코디언용으로 작성 — 모달 댓글 전용 `sendDetailComment()` 신규 작성 | 병행 유지 (postCom은 미사용 상태) |
| `toggleComArea(i)` | index.html에 `post-expand` fallback 존재 — 모달 전환 후 dead code | 명시적 제거 권장 |
| renderFeed() 중 모달 열림 | 모달이 열린 채로 `likePost` → `renderFeed()` 재호출 → 모달 내용은 stale | 모달 내부는 직접 업데이트 (renderFeed에 의존 안 함) |

---

## Step B (미래): URL 딥링크

- `openPostDetail()` 호출 시 `location.hash = '#community/post/' + p.dbId` push
- 페이지 로드 시 hash parse → `loadPostsFromDB()` 완료 후 해당 dbId 포스트 auto-open
- `navigateTo()` 에 `community/post/:id` 서브경로 파싱 추가
- 우선순위: 낮음 (현재 아코디언 → 모달 전환 완료 후 검토)
