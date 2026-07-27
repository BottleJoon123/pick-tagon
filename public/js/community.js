/* ==============================
   COMMUNITY & SCORING LAYER
   (extracted from index.html – global functions, no import/export)
   의존성: state.js (posts, communityFilter, communitySortMode, communityTimeFilter, currentUser, state, likedPostIds)
           index.html (eventPickCounts — var 선언으로 cross-script 공유)
           storage.js (save)
           utils.js (escapeHtml, getDisplayUsername)
           index.html 내 함수들 (likePostInDB, toggleComArea, postCom, requestBattle, getActiveFights, navigateTo)
============================== */

    /* ── Category helpers ── */
    var CAT_PREFIXES = {
        analysis: '[분석]',
        fighter:  '[파이터]',
        live:     '[라이브]',
        news:     '[뉴스]',
        humor:    '[유머]'
    };

    function _getPostCategory(title) {
        if (!title) return '';
        for (var k in CAT_PREFIXES) {
            if (title.indexOf(CAT_PREFIXES[k]) === 0) return k;
        }
        return '';
    }

    // ── C3-3 normalized category (allowed list) ──
    var CAT_KEYS  = ['analysis', 'fighter', 'live', 'news', 'humor', 'general'];
    var CAT_LABEL = {
        analysis: { cls: 'cat-analysis', lbl: '🔥 분석' },
        fighter:  { cls: 'cat-fighter',  lbl: '🗣️ 파이터' },
        live:     { cls: 'cat-live',     lbl: '🔴 라이브' },
        news:     { cls: 'cat-news',     lbl: '📰 뉴스' },
        humor:    { cls: 'cat-humor',    lbl: '😂 유머' },
        general:  { cls: 'cat-post',     lbl: '💬 자유' }
    };
    // 정규화된 category 우선, 없으면 title prefix로 유도, 그래도 없으면 general
    function _postCategory(p) {
        var c = p && p.category;
        if (c && CAT_LABEL[c]) return c;
        var d = _getPostCategory(p && p.title);
        return (d && CAT_LABEL[d]) ? d : 'general';
    }

    function _stripCatPrefix(title) {
        if (!title) return '';
        for (var k in CAT_PREFIXES) {
            var p = CAT_PREFIXES[k];
            if (title.indexOf(p + ' ') === 0) return title.slice(p.length + 1);
            if (title.indexOf(p) === 0)        return title.slice(p.length);
        }
        return title;
    }

    function _setFilterActive(prefix, keys, active) {
        keys.forEach(function(k) {
            var btn = document.getElementById(prefix + k);
            if (!btn) return;
            var on = (k === active);
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');   // 시각 active와 aria 상태 일치
        });
    }

    function setCommunityFilter(f) {
        communityFilter = f;
        _setFilterActive('cf-', ['all','analysis','fighter','live','news','humor','general'], f);
        renderFeed();
    }

    function setCommunitySort(s) {
        communitySortMode = s;
        _setFilterActive('cs-', ['hot','latest','following'], s);
        renderFeed();
    }

    // 팔로잉 정렬 — follow 관계 데이터 필요 (Phase C3에서 연결 예정)
    function setCommunitySortFollowing() {
        if (typeof showToast === 'function') {
            showToast('⚡ 팔로잉 정렬은 준비 중입니다 (팔로우 기능 출시 예정)');
        }
    }

    // 내 글 모아보기 토글 — 표현계층(currentUser.id 기준 클라 필터). DB/RPC 변경 없음.
    // 비로그인: 안내 토스트 후 비활성 유지. 로그인: 토글 후 renderFeed.
    function setCommunityMyPosts() {
        if (typeof currentUser === 'undefined' || !currentUser) {
            if (typeof showToast === 'function') showToast('🔒 로그인 후 내 글을 모아볼 수 있어요');
            return;
        }
        communityMyPosts = !communityMyPosts;
        var btn = document.getElementById('cf-mine');
        if (btn) { btn.classList.toggle('active', communityMyPosts); btn.setAttribute('aria-pressed', communityMyPosts ? 'true' : 'false'); }
        renderFeed();
    }

    function _fmtCount(n) {
        if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        return String(n);
    }

    /* ── 공용 시간 헬퍼 ──────────────────────────────────────────────
       createdAt(timestamptz ISO 원본)을 우선 사용, 레거시 date("YYYY.MM.DD")는 자정 fallback.
       상대시간 규칙: <1분 '방금 전' / N분 / N시간 / 어제(로컬 달력) / N일 / 7일 이상 YYYY.MM.DD.
       invalid·null → null(호출측이 요소 생략), 미래 시각 → 절대일자(추측 금지). */
    function _postTime(p) {
        if (!p) return null;
        if (p.createdAt) { var t = new Date(p.createdAt); if (!isNaN(t)) return t; }
        if (p.date) { var d = new Date(String(p.date).replace(/\./g, '-') + 'T00:00:00'); if (!isNaN(d)) return d; }
        return null;
    }
    function _fmtAbsDate(t) {
        return t.getFullYear() + '.' + String(t.getMonth() + 1).padStart(2, '0') + '.' + String(t.getDate()).padStart(2, '0');
    }
    function _relTime(t) {
        if (!t || isNaN(t)) return null;
        var now = new Date();
        var diff = now - t;                      // ms
        if (diff < 0) return _fmtAbsDate(t);     // 미래 시각 → 절대일자(중립)
        if (diff < 60 * 1000) return '방금 전';   // 실제 1분 미만만
        if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + '분 전';
        if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + '시간 전';
        // 로컬 달력 기준 '어제' (timezone 이동으로 날짜가 깨지지 않게 달력 일자 비교)
        var y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        if (t.getFullYear() === y.getFullYear() && t.getMonth() === y.getMonth() && t.getDate() === y.getDate()) return '어제';
        var days = Math.floor(diff / 86400000);
        if (days < 7) return days + '일 전';
        return _fmtAbsDate(t);
    }
    function _isTodayLocal(t) {
        if (!t || isNaN(t)) return false;
        var now = new Date();
        return t.getFullYear() === now.getFullYear() && t.getMonth() === now.getMonth() && t.getDate() === now.getDate();
    }

    /* faction 배지 안전 래퍼 — utils.getFactionBadge는 emoji_icon을 raw 삽입하므로
       (utils.js는 이번 라운드 수정 범위 밖) 커뮤니티 렌더 경로에서는 escape된 사본으로 호출한다.
       정상 이모지는 escapeHtml에 영향받지 않고, 마크업이 섞인 값만 텍스트로 무력화된다. */
    function _safeFactionBadge(f, size) {
        if (!f || !f.emoji_icon || typeof getFactionBadge !== 'function') return '';
        return getFactionBadge({ id: f.id, name: f.name, emoji_icon: escapeHtml(String(f.emoji_icon)) }, size);
    }

    /* '반응' 점수 — 현재 로드된 rows의 likes/댓글 수/조회수에서 파생한 결정적 값.
       실시간 인기·기간별 증가율 데이터가 아니므로 UI에서 '실시간/트렌딩/+%'로 부르지 않는다.
       (인기 정렬·반응 많은 글·반응 많음 배지가 모두 이 하나의 공식을 공유) */
    function _hotScore(p) {
        var vc = (typeof p.viewCount === 'number') ? p.viewCount : 0;
        return (p.likes || 0) * 2 + (p.comments || []).length * 3 + Math.log10(vc + 1);
    }

    // 카테고리별 글 수 (실데이터) → 칩 카운트
    function renderFilterCounts() {
        var realPosts = (typeof posts !== 'undefined' && posts)
            ? posts.filter(function(p) { return !p.isPickShare; })
            : [];
        var counts = { all: realPosts.length, analysis: 0, fighter: 0, live: 0, news: 0, humor: 0, general: 0 };
        realPosts.forEach(function(p) {
            var c = _postCategory(p);
            if (counts[c] != null) counts[c]++;
        });
        Object.keys(counts).forEach(function(k) {
            var el = document.getElementById('cc-' + k);
            if (el) el.textContent = _fmtCount(counts[k]);
        });
    }

    function setCommunityTime(t) {
        communityTimeFilter = t;
        renderFeed();
    }

    /* ── 모달 focus trap 공용 헬퍼 ──
       Tab/Shift+Tab을 컨테이너 내 보이는 focusable 요소로 순환시킨다.
       (hidden/disabled 제외 — offsetParent 검사로 display:none 계열 배제) */
    function _trapTab(e, container) {
        var f = Array.prototype.filter.call(
            container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
            function(el) { return !el.disabled && el.offsetParent !== null; });
        if (!f.length) { e.preventDefault(); return; }
        var first = f[0], last = f[f.length - 1];
        var inside = container.contains(document.activeElement);
        if (e.shiftKey) {
            if (!inside || document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
            if (!inside || document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    }

    /* ── 글쓰기 Composer 열기/닫기 ──
       접근성: 열림 시 첫 입력(제목)으로 focus + body scroll lock + Escape + Tab trap,
       닫힘 시 트리거로 focus 복귀. 리스너는 열림/닫힘 짝으로 add/remove(중복 0). */
    var _writerTrigger = null;
    var _writerEscHandler = null;
    function toggleWriter() {
        var panel = document.getElementById('write-panel');
        if (!panel) return;
        var opening = panel.classList.contains('hidden');
        if (opening) {
            _writerTrigger = (document.activeElement && document.activeElement !== document.body) ? document.activeElement : null;
            panel.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            var tit = document.getElementById('post-tit');
            if (tit) tit.focus();
            if (_writerEscHandler) document.removeEventListener('keydown', _writerEscHandler, true);
            _writerEscHandler = function(e) {
                if (e.key !== 'Escape' && e.key !== 'Tab') return;
                // 위에 다른 모달(-modal, 예: auth)이 떠 있으면 그쪽이 우선 — Escape/Tab 모두 통과
                if (typeof _openModalEls === 'function' && _openModalEls().length > 0) return;
                if (e.key === 'Tab') { _trapTab(e, panel); return; }
                toggleWriter();
            };
            document.addEventListener('keydown', _writerEscHandler, true);   // capture: auth 등 위 모달의 Escape 소비 전에 모달 상태를 판단(이중 닫힘 방지)
        } else {
            panel.classList.add('hidden');
            if (_writerEscHandler) { document.removeEventListener('keydown', _writerEscHandler, true); _writerEscHandler = null; }
            // 다른 모달이 열려 있지 않을 때만 body scroll lock 해제
            var othersOpen = (typeof _openModalEls === 'function') && _openModalEls().length > 0;
            if (!othersOpen) document.body.style.overflow = '';
            if (_writerTrigger && document.contains(_writerTrigger)) { try { _writerTrigger.focus(); } catch (e) {} }
            _writerTrigger = null;
        }
    }

    /* ── Activity ticker (recent activity, not live presence) ──
       실제 createdAt 기준으로만 표기. 최근 7일 내 활동이 하나도 없으면 ticker 전체 숨김.
       '방금'은 실제 1분 미만일 때만(_relTime), 댓글 항목은 실제 최근 댓글 createdAt이 있을 때만.
       polling/setInterval 없음 — 피드 렌더 시점의 스냅샷. */
    var _TICKER_RECENT_MS = 7 * 24 * 60 * 60 * 1000;   // '최근 활동' 창 = 7일
    function renderActivityTicker() {
        var el = document.getElementById('activity-ticker');
        if (!el) return;

        var realPosts = (typeof posts !== 'undefined' && posts)
            ? posts.filter(function(p) { return !p.isPickShare; })
            : [];
        if (!realPosts.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }

        var now = new Date();
        var items = [];

        // 1) 최근 글 — 실제 작성 시각이 7일 이내일 때만, 실제 상대시간으로.
        //    미래 시각(clock skew) 글은 최신 후보에서 제외 — 과거 글의 티커 항목을 삼키지 않게.
        var latest = null, latestT = null;
        realPosts.forEach(function(p) {
            var t = _postTime(p);
            if (t && t <= now && (!latestT || t > latestT)) { latest = p; latestT = t; }
        });
        if (latest && latestT && (now - latestT) >= 0 && (now - latestT) < _TICKER_RECENT_MS) {
            items.push('<span class="tk-name">' + escapeHtml(latest.author || '익명') + '</span>님이 '
                + escapeHtml(_relTime(latestT) || '') + ' 글을 올렸어요');
        }

        // 2) 최근 댓글 — comment.createdAt이 실제로 7일 이내일 때만 (댓글 존재만으로 '새 댓글' 금지)
        var comPost = null, comT = null;
        realPosts.forEach(function(p) {
            (p.comments || []).forEach(function(c) {
                if (!c.createdAt) return;                    // 레거시(작성시각 없음) 제외
                var t = new Date(c.createdAt);
                if (!isNaN(t) && (!comT || t > comT)) { comT = t; comPost = p; }
            });
        });
        if (comPost && comT && (now - comT) >= 0 && (now - comT) < _TICKER_RECENT_MS) {
            items.push('<span class="tk-name">' + escapeHtml(comPost.author || '익명') + '</span>님 글에 '
                + escapeHtml(_relTime(comT) || '') + ' 댓글');
        }

        // 3) 오늘 새 글 수 — createdAt 로컬 달력 기준, 0이면 표기 생략
        var todayCount = realPosts.filter(function(p) { return _isTodayLocal(_postTime(p)); }).length;
        if (todayCount > 0) items.push('오늘 새 글 <span class="tk-name">' + todayCount + '</span>');

        if (!items.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }  // 최근 활동 없음 → 숨김

        el.classList.remove('hidden');
        el.innerHTML =
            '<span class="tk-label"><span class="tk-dot"></span>새 소식</span>' +
            '<span class="tk-sep"></span>' +
            '<span class="tk-roll">' + items.join(' <span class="tk-mid">·</span> ') + '</span>';
    }

    /* ── Community sidebar (C2 · lg+ only, read-only from existing state) ── */
    function renderCommunitySidebar() {
        var aside = document.getElementById('community-sidebar');
        if (!aside) return;

        var blocks = [];

        // ── 1. 내 Pick-tagon 요약 ──
        if (typeof currentUser !== 'undefined' && currentUser) {
            var nick    = escapeHtml((typeof getDisplayUsername === 'function' ? getDisplayUsername() : '') || '나');
            var initial = escapeHtml(((nick || '?').trim().charAt(0) || '?').toUpperCase());
            var belt    = (typeof getBeltInfo === 'function') ? getBeltInfo(state.points || 0) : { name: 'White', color: '#ECECEE' };
            var beltLbl = escapeHtml(belt.name + ' Belt');
            var pts     = (state && state.points != null) ? state.points : 0;
            var total   = (state && state.total)   ? state.total   : 0;
            // 정확도 = canonical(win/(win+lose))만. state.success/total 비율 금지. 미로드/0건 → '—'.
            var _av     = (typeof currentUserAccuracyView === 'function') ? currentUserAccuracyView() : { acc: null };
            var acc     = (_av.acc === null || _av.acc === undefined) ? '—' : (_av.acc + '%');
            blocks.push([
                '<div class="side-card me">',
                '  <div class="side-head"><span class="side-title">내 픽타곤</span></div>',
                '  <div class="side-me-row">',
                '    <div class="side-me-ava" style="border-color:' + belt.color + '">' + initial + '</div>',
                '    <div style="min-width:0">',
                '      <div class="side-me-name">' + nick + '</div>',
                '      <div class="side-me-belt" style="color:' + belt.color + '">' + beltLbl + '</div>',
                '    </div>',
                '  </div>',
                '  <div class="side-stats">',
                '    <div class="side-stat"><div class="side-stat-v">' + Number(pts).toLocaleString() + '</div><div class="side-stat-l">포인트</div></div>',
                '    <div class="side-stat"><div class="side-stat-v" id="side-me-acc">' + acc + '</div><div class="side-stat-l">정확도</div></div>',
                '    <div class="side-stat"><div class="side-stat-v">' + total + '</div><div class="side-stat-l">픽 수</div></div>',
                '  </div>',
                '</div>'
            ].join(''));
        } else {
            // 게스트 CTA — 클릭 시에만 로그인 모달(자동 모달·profile 라우팅 flash 없음)
            blocks.push([
                '<div class="side-card me">',
                '  <div class="side-head"><span class="side-title">내 픽타곤</span></div>',
                '  <p class="side-empty">로그인하면 내 포인트와 픽 기록을 볼 수 있어요.</p>',
                '  <button type="button" class="side-cta" onclick="if(typeof openAuthModal===\'function\')openAuthModal(\'profile\')">로그인 →</button>',
                '</div>'
            ].join(''));
        }

        // ── 2. 오늘의 픽 요약 ──
        var fights = (typeof _dbMatchups !== 'undefined' && _dbMatchups) ? _dbMatchups : [];
        var main = null;
        for (var i = 0; i < fights.length; i++) {
            if ((fights[i].tag || '').toUpperCase().indexOf('MAIN EVENT') !== -1) { main = fights[i]; break; }
        }
        if (!main && fights.length) main = fights[0];
        var pickHtml;
        if (main) {
            // 비율은 실제 사용자 픽 집계(eventPickCounts, get_event_pick_ratios)만 사용.
            // leftBias는 관리자 입력 추정값이라 커뮤니티 비율로 표시하지 않는다 → 집계 0표면 '아직 픽 없음' 중립.
            var ec = (typeof eventPickCounts !== 'undefined') && eventPickCounts[main.id];
            var hasVotes = !!(ec && (ec.c0 + ec.c1) > 0);
            var ev = escapeHtml(main._eventTitle || '');
            var barHtml = hasVotes
                ? (function() {
                    var lp = Math.round(ec.c0 / (ec.c0 + ec.c1) * 100), rp = 100 - lp;
                    return '<div class="side-pick-bar"><i style="width:' + lp + '%;background:#e10600"></i><i style="width:' + rp + '%;background:#2f7bf0"></i></div>'
                         + '<div class="side-pick-pct"><span style="color:#FF5D55">' + lp + '%</span><span style="color:#6FA8FF">' + rp + '%</span></div>';
                })()
                : '<div class="side-pick-bar is-empty"><i style="width:100%"></i></div>'
                + '<div class="side-pick-pct"><span class="side-pick-none">아직 픽 없음</span></div>';
            pickHtml = [
                '<div class="side-head"><span class="side-title">오늘의 픽</span>' + (ev ? '<span class="side-meta">' + ev + '</span>' : '') + '</div>',
                '<div class="side-pick-names">',
                '  <span class="side-pick-n">' + escapeHtml(main.f1.name) + '</span>',
                '  <span class="side-pick-vs">VS</span>',
                '  <span class="side-pick-n r">' + escapeHtml(main.f2.name) + '</span>',
                '</div>',
                barHtml
            ].join('');
        } else {
            pickHtml = '<div class="side-head"><span class="side-title">오늘의 픽</span></div><p class="side-empty">예정된 경기가 없어요.</p>';
        }
        blocks.push('<div class="side-card">' + pickHtml + '</div>');

        // ── 3. 반응 많은 글 — 현재 로드된 posts의 likes/댓글/조회 파생 점수(_hotScore).
        //    실시간 트렌딩/증가율 데이터가 아니므로 '트렌딩·+%'로 부르지 않는다.
        var real = (typeof posts !== 'undefined' && posts) ? posts.filter(function(p) { return !p.isPickShare; }) : [];
        var trend = real.slice().sort(function(a, b) {
            var d = _hotScore(b) - _hotScore(a);
            if (d !== 0) return d;
            var ta = _postTime(a), tb = _postTime(b);                      // 동률: createdAt desc → dbId desc
            var td = (tb ? tb.getTime() : 0) - (ta ? ta.getTime() : 0);
            if (td !== 0) return td;
            return (b.dbId || 0) - (a.dbId || 0);
        }).slice(0, 5);
        var trendHtml;
        if (trend.length) {
            trendHtml = '<div class="side-trend">' + trend.map(function(p, i) {
                var idx = posts.indexOf(p);
                var title = escapeHtml(_stripCatPrefix(p.title || '') || '(제목 없음)');
                return '<button type="button" class="side-trow" onclick="openPostDetail(' + idx + ')">'
                     + '<span class="side-trow-rank' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</span>'
                     + '<span class="side-trow-t">' + title + '</span>'
                     + '<span class="side-trow-c">🔥 ' + (p.likes || 0) + '</span>'
                     + '</button>';
            }).join('') + '</div>';
        } else {
            trendHtml = '<p class="side-empty">아직 글이 없어요.</p>';
        }
        blocks.push('<div class="side-card"><div class="side-head"><span class="side-title">반응 많은 글</span><span class="side-meta">로드된 글 기준</span></div>' + trendHtml + '</div>');

        // ── 4. 빠른 액션 (기존 함수 재사용) ──
        blocks.push([
            '<div class="side-card">',
            '  <div class="side-head"><span class="side-title">빠른 액션</span></div>',
            '  <div class="side-actions">',
            '    <button class="side-act full" onclick="toggleWriter()">✍ 글쓰기</button>',
            '    <button class="side-act" onclick="setCommunitySort(\'hot\')">🔥 인기</button>',
            '    <button class="side-act" onclick="setCommunitySort(\'latest\')">🕘 최신</button>',
            '    <button class="side-act full" onclick="navigateTo(\'matchups\')">전체 대진표 →</button>',
            '  </div>',
            '</div>'
        ].join(''));

        aside.innerHTML = blocks.join('');
        // canonical 정확도 로드 후 #side-me-acc 패치 (미로드/0건 '—' → 로드 후 정확값)
        if (typeof refreshAccuracyDisplays === 'function') refreshAccuracyDisplays();
    }

    /* ── Matchup Board ── */
    function renderMatchups(fights) {
        var container = document.getElementById('matchup-board');
        if (!container) return;
        if (!fights || fights.length === 0) { container.innerHTML = ''; return; }

        // 메인 카드 전체 노출: section==='main' 우선 → tag 기반 → 앞 3경기 fallback. 최대 8개로 제한.
        var featured = fights.filter(function(f) { return f.section === 'main'; });
        if (featured.length === 0) {
            featured = fights.filter(function(f) {
                var t = (f.tag || '').toUpperCase();
                return t.includes('MAIN EVENT') || t.includes('CO-MAIN') || t.includes('CO MAIN') || t.includes('MAIN CARD');
            });
        }
        if (featured.length === 0) featured = fights.slice(0, 3);
        if (featured.length > 8) featured = featured.slice(0, 8);
        var restCount  = fights.length - featured.length;
        var eventTitle = (fights[0] && fights[0]._eventTitle) || '';

        var cards = featured.map(function(fight) {
            // 커뮤니티 픽 % — 실제 사용자 픽 집계(eventPickCounts ← get_event_pick_ratios)만 사용.
            // leftBias(관리자 입력 추정값)는 집계가 아니므로 fallback으로 쓰지 않는다 → 0표는 중립 '아직 픽 없음'.
            var ec = (typeof eventPickCounts !== 'undefined') && eventPickCounts[fight.id];
            var hasVotes = !!(ec && (ec.c0 + ec.c1) > 0);
            var leftPct = 0, rightPct = 0;
            if (hasVotes) {
                leftPct  = Math.round(ec.c0 / (ec.c0 + ec.c1) * 100);
                rightPct = 100 - leftPct;
            }

            // Tag class — 실 tag만. 없으면 중립 '경기' 라벨.
            var tag = (fight.tag || '').toUpperCase();
            var tagCls = 'matchup-tag-bout';
            if (tag.includes('MAIN EVENT') && !tag.includes('CO')) tagCls = 'matchup-tag-main';
            else if (tag.includes('CO')) tagCls = 'matchup-tag-co';

            // Picked state — 실제 pending/settled 픽만
            var isPending  = state.pendings && state.pendings[fight.id];
            var isSettled  = state.settled  && state.settled[fight.id];
            var hasPick    = !!(isPending || isSettled);

            var f1   = escapeHtml(fight.f1.name);
            var f2   = escapeHtml(fight.f2.name);
            var rec1 = escapeHtml((fight.f1 && fight.f1.record) || '');
            var rec2 = escapeHtml((fight.f2 && fight.f2.record) || '');
            var fid  = escapeHtml(fight.id);

            var barGradient = 'linear-gradient(90deg,#e10600 ' + leftPct + '%,#2f7bf0 ' + leftPct + '%)';
            var pctHtml = hasVotes
                ? `<div class="ps-bar"><div class="ps-bar-fill" style="background:${barGradient}"></div></div>
                   <div class="ps-pct">
                       <span style="color:#FF5D55;">${leftPct}%</span>
                       <span class="ps-pct-lbl">커뮤니티 픽</span>
                       <span style="color:#6FA8FF;">${rightPct}%</span>
                   </div>`
                : `<div class="ps-bar is-empty"><div class="ps-bar-fill"></div></div>
                   <div class="ps-pct"><span class="ps-pct-none">아직 픽 없음 · 첫 픽을 남겨보세요</span></div>`;

            // 실제 button — 키보드(Enter/Space) 접근 + 해당 카드로 스크롤 이동 보존
            return `
            <button type="button" class="matchup-card ${tagCls === 'matchup-tag-main' ? 'card-main' : ''}" onclick="navigateTo('matchups'); setTimeout(function(){ var el=document.getElementById('card-${fid}'); if(el) el.scrollIntoView({behavior:'smooth',block:'center'}); },350);" aria-label="${f1} 대 ${f2} 경기로 이동">
                <div class="ps-top">
                    <span class="matchup-tag ${tagCls}">${escapeHtml(fight.tag || '경기')}</span>
                    <span class="ps-pick ${hasPick ? 'picked' : 'unpicked'}">${hasPick ? '✓ PICKED' : '미픽'}</span>
                </div>
                <div class="ps-fighters">
                    <div class="ps-f">
                        <div class="ps-name">${f1}</div>
                        ${rec1 ? `<div class="ps-rec">${rec1}</div>` : ''}
                    </div>
                    <div class="ps-vs">VS</div>
                    <div class="ps-f right">
                        <div class="ps-name">${f2}</div>
                        ${rec2 ? `<div class="ps-rec">${rec2}</div>` : ''}
                    </div>
                </div>
                ${pctHtml}
            </button>`;
        }).join('');

        var moreLabel = restCount > 0
            ? '+ ' + restCount + '경기 더 보기 → 전체 대진표'
            : '전체 대진표 →';

        container.innerHTML =
            '<div class="pick-strip-head">' +
                '<span class="pick-strip-title">🥊 오늘의 픽' + (eventTitle ? ' · ' + escapeHtml(eventTitle) : '') + '</span>' +
                '<button type="button" class="pick-strip-more" onclick="navigateTo(\'matchups\')">' + moreLabel + '</button>' +
            '</div>' +
            '<div class="pick-strip">' + cards + '</div>';
    }

    /* ── Belt tier helper (post.belt "White Belt" → "white") ──
       belt 값이 없거나 비정상이면 null → 벨트 pill 미출력 + 아바타 링 중립(합성 금지). */
    function _beltTier(beltStr) {
        if (!beltStr) return null;
        var first = String(beltStr).trim().split(' ')[0].toLowerCase();
        if (['white','blue','purple','brown','black'].indexOf(first) === -1) return null;
        return first;
    }

    /* ── Feed cards (handoff .fcard redesign) ── */
    function renderPosts(filtered) {
        var container = document.getElementById('post-list');
        if (!container) return;

        if (!filtered || filtered.length === 0) {
            // 빈 결과 — 어떤 필터 때문인지 알려준다(내 글 > 카테고리 > 시간 > 전체 없음 순)
            var _isMine = (typeof communityMyPosts !== 'undefined' && communityMyPosts
                && typeof currentUser !== 'undefined' && currentUser);
            var _emptyMsg;
            if (_isMine) _emptyMsg = '아직 작성한 글이 없습니다 · 첫 글을 남겨보세요';
            else if (typeof communityFilter !== 'undefined' && communityFilter !== 'all' && CAT_LABEL[communityFilter])
                _emptyMsg = '“' + CAT_LABEL[communityFilter].lbl + '” 카테고리에 글이 없습니다';
            else if (typeof communityTimeFilter !== 'undefined' && communityTimeFilter !== 'all')
                _emptyMsg = '선택한 기간에 작성된 글이 없습니다';
            else _emptyMsg = '표시할 게시글이 없습니다';
            container.innerHTML = `<div style="padding:28px 20px;text-align:center;font-family:'Oswald',sans-serif;font-size:13px;color:#666;text-transform:uppercase;letter-spacing:.1em;font-style:italic;">${_emptyMsg}</div>`;
            return;
        }

        var cards = filtered.map(function(p) {
            var origIdx  = posts.indexOf(p);
            // belt: 서버 값이 있을 때만 pill·링 표시(null → 중립, White 합성 금지)
            var beltTier = _beltTier(p.belt);
            var beltName = beltTier ? escapeHtml(String(p.belt).trim().split(' ')[0]) : '';
            var author   = escapeHtml(p.author || 'UNKNOWN');
            var initials = escapeHtml(((p.author || '?').trim().charAt(0) || '?').toUpperCase());
            // 작성 시각: createdAt 기반 실제 상대시간(없으면 생략)
            var rel      = _relTime(_postTime(p));
            var metaHtml = rel ? '<span class="fc-meta">· ' + escapeHtml(rel) + '</span>' : '';
            var rawTitle = p.title || '';
            var title    = escapeHtml(_stripCatPrefix(rawTitle));
            var snippet  = escapeHtml(p.content || '');
            var isLiked  = likedPostIds.has(p.dbId);
            var cntCom   = (p.comments || []).length;
            var likes    = p.likes || 0;
            // 조회수: 실제 view_count. null(미제공)이면 표시 생략 — 0 단정 금지.
            var viewsHtml = (typeof p.viewCount === 'number') ? '<span class="fc-views">👁 ' + _fmtCount(p.viewCount) + '</span>' : '';
            // '반응 많음' — 인기 정렬·사이드바와 동일한 단일 공식(_hotScore)만 사용.
            //   임계값 10 ≈ 추천 5개 상당(댓글·조회 포함). '실시간 인기/HOT'로 부르지 않음.
            var isHot    = _hotScore(p) >= 10;
            var isPinned = p.isPinned === true; // 서버 is_pinned만. 작성자 role 신호가 없어 '운영자 공지'가 아닌 '고정'으로 표기.

            // Category tag → fc-cat cat-{kind}
            var cat = _postCategory(p);
            var catCls, catLbl;
            if (p.isPickShare)        { catCls = 'cat-pick'; catLbl = '🎯 픽'; }
            else if (CAT_LABEL[cat])  { catCls = CAT_LABEL[cat].cls; catLbl = CAT_LABEL[cat].lbl; }
            else                      { catCls = CAT_LABEL.general.cls; catLbl = CAT_LABEL.general.lbl; }

            // Faction badge — 모든 유저 (p.faction = DB에서 JOIN한 faction 객체)
            var factionSrc = p.faction
                || (p.author === getDisplayUsername() && typeof currentFaction !== 'undefined' ? currentFaction : null);
            var factionBadge = (typeof getFactionBadge === 'function' && factionSrc)
                ? _safeFactionBadge(factionSrc) + ' '
                : '';

            // 카드: div onclick(마우스 편의) + 제목·스니펫은 실제 button(fc-open, Enter/Space·SR 접근).
            // 내부 컨트롤(작성자/자세히/추천)은 별도 button + stopPropagation — interactive 중첩 없음.
            // user_id는 DOM에 노출하지 않는다 — 작성자 활동은 인덱스로 posts[]에서 메모리 참조.
            return `
            <div class="fcard ${beltTier ? 'belt-card-' + beltTier : ''} ${isPinned ? 'pinned' : ''} ${isHot ? 'hot' : ''}" id="post-row-${origIdx}" onclick="openPostDetail(${origIdx})">
                <div class="fc-ava ${beltTier ? 'belt-' + beltTier : ''}">${initials}</div>
                <div class="fc-body">
                    <div class="fc-head">
                        ${isPinned ? '<span class="fc-pin">📌 고정</span>' : ''}
                        <button type="button" class="fc-user fc-user-link" onclick="event.stopPropagation(); openUserActivityByPost(${origIdx})">${factionBadge}${author}</button>
                        ${beltTier ? '<span class="fc-belt belt-' + beltTier + '">' + beltName + '</span>' : ''}
                        <span class="fc-cat ${catCls}">${catLbl}</span>
                        ${metaHtml}
                        ${isHot ? '<span class="fc-hot">🔥 반응 많음</span>' : ''}
                    </div>
                    <button type="button" class="fc-open" onclick="event.stopPropagation(); openPostDetail(${origIdx})">
                        <span class="fc-title">${title}</span>
                        <span class="fc-snippet">${snippet}</span>
                    </button>
                    <div class="fc-foot">
                        <span class="fc-react ${likes > 0 ? 'hot' : ''}">🔥 ${likes}</span>
                        <span class="fc-cmt">💬 ${cntCom}</span>
                        ${viewsHtml}
                        <button type="button" class="fc-share" onclick="event.stopPropagation(); openPostDetail(${origIdx});">자세히</button>
                        <button type="button" class="fc-rec ${isLiked ? 'on' : ''}" aria-pressed="${isLiked ? 'true' : 'false'}" onclick="event.stopPropagation(); likePost(${origIdx});">
                            ${isLiked ? '✓ 추천 완료' : '+ 추천'}
                        </button>
                    </div>
                </div>
            </div>`;
        }).join('');

        container.innerHTML = '<div class="feed-list">' + cards + '</div>';
    }

    function togglePostExpand(origIdx) { /* no-op: replaced by openPostDetail */ }

    /* ── 유저 활동 요약 모달 (표현계층 · 현재 로드된 커뮤니티 데이터만 집계) ──
       트리거: 게시글/댓글 작성자 닉네임 클릭. user_id는 DOM(data attribute)에 노출하지 않고
       posts[] 메모리에서 인덱스/commentId로 참조해 매칭 키로만 쓴다. DB/RPC 호출 없음. */
    function openUserActivityByPost(origIdx) {
        var p = (typeof posts !== 'undefined' && posts) ? posts[origIdx] : null;
        if (!p) return;
        _openUserActivity(p.userId || '', p.author || '');
    }
    function openUserActivityByComment(commentId) {
        var p = _detailPost();                       // dbId 권위값 — stale index로 다른 글 댓글 참조 금지
        if (!p) return;
        var c = (p.comments || []).find(function(x) { return x.commentId === commentId; });
        if (!c) return;
        _openUserActivity(c.userId || '', c.user || '');
    }
    function _openUserActivity(uid, nick) {
        if (!nick) return;
        _renderUserActivity(uid, nick);
        var m = document.getElementById('user-activity-modal');
        if (m) m.classList.remove('hidden');   // modal-history 레이어가 뒤로가기/닫기 동기화
    }

    function closeUserActivity() {
        var m = document.getElementById('user-activity-modal');
        if (m) m.classList.add('hidden');
    }

    function _renderUserActivity(uid, nick) {
        var body = document.getElementById('ua-body');
        if (!body) return;

        var all = (typeof posts !== 'undefined' && posts) ? posts : [];
        var byUid = !!uid;
        // 본인 글 (자동 픽 활동글 제외)
        var myPosts = all.filter(function(p) {
            if (p.isPickShare) return false;
            return byUid ? (p.userId === uid) : (p.author === nick);
        });
        // 본인 댓글 (모든 글의 댓글 순회)
        var myComments = 0;
        all.forEach(function(p) {
            (p.comments || []).forEach(function(c) {
                if (byUid ? (c.userId === uid) : (c.user === nick)) myComments++;
            });
        });
        var likesSum = myPosts.reduce(function(s, p) { return s + (p.likes || 0); }, 0);
        var recent = myPosts.slice().sort(function(a, b) {
            var ta = _postTime(a), tb = _postTime(b);
            return (tb ? tb.getTime() : 0) - (ta ? ta.getTime() : 0);
        }).slice(0, 3);

        // faction/belt 는 본인 글 중 하나에서 추론 (현재 로드 범위 내). 없으면 생략.
        var rep = myPosts.find(function(p) { return p.faction; }) || myPosts[0] || null;
        var factionBadge = (rep && rep.faction && typeof getFactionBadge === 'function')
            ? _safeFactionBadge(rep.faction) : '';
        var beltStr = rep && rep.belt ? escapeHtml(rep.belt) : '';

        var initial = escapeHtml(((nick || '?').trim().charAt(0) || '?').toUpperCase());
        var safeNick = escapeHtml(nick || '');

        var recentHtml = recent.length
            ? recent.map(function(p) {
                return '<div class="ua-recent-item">' +
                       '<span class="ua-recent-dot"></span>' +
                       '<span class="ua-recent-title">' + escapeHtml(_stripCatPrefix(p.title || '제목 없음')) + '</span>' +
                       '</div>';
              }).join('')
            : '<div class="ua-empty">현재 로드된 글 없음</div>';

        body.innerHTML =
            '<div class="ua-head">' +
                '<div class="ua-ava">' + initial + '</div>' +
                '<div class="ua-id">' +
                    '<div class="ua-nick">' + safeNick + (factionBadge ? ' ' + factionBadge : '') + '</div>' +
                    (beltStr ? '<div class="ua-belt">' + beltStr + '</div>' : '') +
                '</div>' +
            '</div>' +
            '<div class="ua-stats">' +
                '<div class="ua-stat"><span class="ua-stat-n">' + myPosts.length + '</span><span class="ua-stat-l">글</span></div>' +
                '<div class="ua-stat"><span class="ua-stat-n">' + myComments + '</span><span class="ua-stat-l">댓글</span></div>' +
                '<div class="ua-stat"><span class="ua-stat-n">' + _fmtCount(likesSum) + '</span><span class="ua-stat-l">받은 추천</span></div>' +
            '</div>' +
            '<div class="ua-section-label">최근 글</div>' +
            '<div class="ua-recent">' + recentHtml + '</div>' +
            '<div class="ua-note">※ 현재 로드된 커뮤니티 기준 집계 (전체 히스토리가 아닐 수 있어요)</div>';
    }

    var _communityMatchupsFetching = false;

    /* ── Main renderFeed ── */
    function renderFeed() {
        // 0. Activity ticker + category chip counts + sidebar (C2)
        renderActivityTicker();
        renderFilterCounts();
        renderCommunitySidebar();

        // 1. Matchup board — use DB data only; avoid legacy FIGHTS fallback
        var boardEl = document.getElementById('matchup-board');
        if (typeof _dbMatchups !== 'undefined' && _dbMatchups && _dbMatchups.length > 0) {
            renderMatchups(_dbMatchups);
        } else {
            if (boardEl) {
                boardEl.innerHTML = '<p class="text-center text-gray-500 text-sm py-8">현재 이벤트 대진표 로딩 중...</p>';
            }
            if (!_communityMatchupsFetching && typeof fetchUpcomingMatchups === 'function') {
                _communityMatchupsFetching = true;
                fetchUpcomingMatchups().then(function() {
                    _communityMatchupsFetching = false;
                    if (typeof _dbMatchups !== 'undefined' && _dbMatchups && _dbMatchups.length > 0) {
                        renderMatchups(_dbMatchups);
                    }
                });
            }
        }

        // 1b. 내 글 토글 버튼 상태 동기화 (로그인 여부 반영) — 로그아웃 시 강제 해제
        var _mineBtn = document.getElementById('cf-mine');
        var _loggedIn = (typeof currentUser !== 'undefined' && !!currentUser);
        if (!_loggedIn) communityMyPosts = false;
        if (_mineBtn) {
            _mineBtn.classList.toggle('disabled', !_loggedIn);
            _mineBtn.classList.toggle('active', communityMyPosts);
            _mineBtn.setAttribute('aria-pressed', communityMyPosts ? 'true' : 'false');
        }

        // 2. Filter by category (+ 내 글) — isPickShare (자동 픽 활동글) 제외
        var filtered = posts.filter(function(p) {
            if (p.isPickShare) return false;
            if (communityMyPosts && _loggedIn && p.userId !== currentUser.id) return false;
            if (communityFilter === 'all') return true;
            return _postCategory(p) === communityFilter;
        });

        // 3. Time filter — createdAt(원본 timestamptz) 기준. 시각 없는 레거시 행은 date 자정 fallback.
        if (communityTimeFilter !== 'all') {
            var now    = new Date();
            var cutoff = new Date(now);
            if (communityTimeFilter === 'day')   cutoff.setDate(now.getDate() - 1);
            if (communityTimeFilter === 'week')  cutoff.setDate(now.getDate() - 7);
            if (communityTimeFilter === 'month') cutoff.setDate(now.getDate() - 30);
            filtered = filtered.filter(function(p) {
                var d = _postTime(p);
                return d && d >= cutoff;
            });
        }

        // 4. Sort — posts 원본은 건드리지 않음(slice 후 정렬). 동률은 createdAt desc → dbId desc(결정적).
        filtered = filtered.slice();
        var _tieBreak = function(a, b) {
            var ta = _postTime(a), tb = _postTime(b);
            var td = (tb ? tb.getTime() : 0) - (ta ? ta.getTime() : 0);
            if (td !== 0) return td;
            return (b.dbId || 0) - (a.dbId || 0);
        };
        if (communitySortMode === 'recommend') {
            filtered.sort(function(a, b) {
                var d = (b.likes || 0) - (a.likes || 0);
                return d !== 0 ? d : _tieBreak(a, b);
            });
        } else if (communitySortMode === 'hot') {
            // 인기 = 현재 로드된 rows의 likes/댓글/조회 파생 점수(_hotScore, 결정적)
            filtered.sort(function(a, b) {
                var d = _hotScore(b) - _hotScore(a);
                return d !== 0 ? d : _tieBreak(a, b);
            });
        } else {
            filtered.sort(_tieBreak);   // 최신 = createdAt desc
        }

        // 4b. Pinned(고정) 항상 상단. pinned끼리는 최신순, 일반글은 위 정렬 순서 유지(안정 정렬).
        filtered.sort(function(a, b) {
            var ap = a.isPinned === true, bp = b.isPinned === true;
            if (ap !== bp) return ap ? -1 : 1;
            if (ap && bp) return _tieBreak(a, b);
            return 0;
        });

        renderPosts(filtered);
    }

    function likePost(i) {
        // [로그인 UX] 좋아요는 인증 필요 행동 — write/낙관적 UI 전에 중단하고 로그인 모달 유도(자동 재실행 없음).
        if (!currentUser) { if (typeof openAuthModal === 'function') { openAuthModal('community'); } else { showToast('⚠ 추천은 로그인 후 가능합니다'); } return; }
        var p = posts[i];
        if (!p) return;
        var dbId = p.dbId;
        if (likedPostIds.has(dbId)) { showToast('이미 추천한 게시글입니다'); return; }   // 서버가 단방향(UNIQUE)이라 unlike 없음
        p.likes++;
        likedPostIds.add(dbId);
        // RPC 실패 시 optimistic 증가 롤백 — likePostInDB(index.html)가 실패 콜백을 호출.
        // 요청 시점 세션(uid)을 캡처해, 계정 전환/로그아웃 후 늦게 도착한 실패가
        // 다른 세션의 likedPostIds/posts.likes를 감소시키지 않게 한다(레이스 가드).
        var myUid = currentUser.id;
        likePostInDB(dbId, function() {
            if (!currentUser || currentUser.id !== myUid) return;   // 세션 변경 → stale 실패 폐기
            if (!likedPostIds.has(dbId)) return;                    // 재조회로 서버 진실 반영됨 → 이중 롤백 금지
            var cur = posts.find(function(x) { return x.dbId === dbId; });
            if (cur && cur.likes > 0) cur.likes--;
            likedPostIds.delete(dbId);
            save();
            renderFeed();
            if (_detailPostDbId === dbId) { _syncDetailLikeBtn(); _renderDetailStats(cur); }
            showToast('⚠ 추천 반영에 실패했어요');
        });
        save();
        renderFeed();
    }

    /* ── Post Detail Modal ── */
    var _detailPostIdx    = -1;
    var _detailPostDbId   = null;
    var _detailEscHandler = null;
    var _detailTrigger    = null;   // 모달을 연 트리거 — 닫을 때 focus 복귀

    // 상세 모달의 권위 식별자는 dbId(_detailPostDbId). posts 재할당·재정렬·계정 전환으로
    // index가 stale일 수 있으므로, 좋아요/댓글/수정/삭제/고정은 반드시 이 헬퍼로
    // 현재 posts 배열에서 dbId를 재해석한 글만 다룬다(배열 index를 identity로 쓰지 않는다).
    function _detailPost() {
        if (_detailPostDbId == null || typeof posts === 'undefined' || !posts) return null;
        var p = (_detailPostIdx >= 0 && _detailPostIdx < posts.length) ? posts[_detailPostIdx] : null;
        if (p && p.dbId === _detailPostDbId) return p;
        for (var k = 0; k < posts.length; k++) {
            if (posts[k].dbId === _detailPostDbId) { _detailPostIdx = k; return posts[k]; }
        }
        return null;   // 재조회로 사라진 글(삭제 등) → 어떤 mutator도 동작하지 않음
    }

    // ── 조회수 증가 (localStorage TTL 중복 방지 + SECURITY DEFINER RPC) ──
    // TTL 6시간: 빠른 새로고침/연속 클릭으로 인한 중복 집계는 막되, 시간 간격을 둔
    // 재방문(예: 아침/저녁 재확인)은 정상 집계 → 24h는 하루 재방문을 과소집계하므로 6h 채택.
    var _VIEW_TTL_MS = 6 * 60 * 60 * 1000;
    function _shouldCountView(dbId) {
        try {
            var key  = 'picktagon_post_viewed_v1_' + dbId;
            var last = parseInt(localStorage.getItem(key) || '0', 10);
            var now  = Date.now();
            if (last && (now - last) < _VIEW_TTL_MS) return false;
            localStorage.setItem(key, String(now));
            return true;
        } catch (e) {
            return true; // localStorage 불가 → 모달 열림은 막지 않음(중복방지만 포기)
        }
    }
    // ── 상세 stats 공용 렌더 — 댓글/추천/조회 어느 경로로 갱신돼도 👁 조회수가 누락되지 않게 단일화
    function _renderDetailStats(p) {
        var statsEl = document.getElementById('pd-stats');
        if (!statsEl || !p) return;
        var txt = '🔥 ' + (p.likes || 0) + '  💬 ' + (p.comments || []).length;
        if (typeof p.viewCount === 'number') txt += '  👁 ' + _fmtCount(p.viewCount);   // null이면 생략(0 단정 금지)
        statsEl.textContent = txt;
    }
    // TTL 키는 RPC 발사 전에 기록(_shouldCountView)되므로, 실패하면 키를 해제해
    // 다음 열람 때 정상 재시도되게 한다(실패했는데 6시간 차단되는 결함 방지). 반복 재시도/polling 없음.
    function _clearViewTTL(dbId) {
        try { localStorage.removeItem('picktagon_post_viewed_v1_' + dbId); } catch (e) {}
    }
    function _incrementPostView(p) {
        if (!p || p.dbId == null || typeof sb === 'undefined' || !sb) return;
        if (!_shouldCountView(p.dbId)) return;
        sb.rpc('increment_post_view', { p_post_id: p.dbId }).then(function(res) {
            if (res.error) { console.warn('[view] increment failed:', res.error.message); _clearViewTTL(p.dbId); return; }
            var nv = res.data;
            if (typeof nv !== 'number' || nv < 0) return; // 존재하지 않는 글 등 → 재시도 무의미, TTL 유지
            p.viewCount = nv;
            // 상세 모달이 같은 글로 열려 있으면 stats 즉시 갱신
            if (_detailPostDbId === p.dbId) _renderDetailStats(p);
            // 피드 카드 + 사이드바 반영
            if (typeof renderFeed === 'function') renderFeed();
        }).catch(function() { _clearViewTTL(p.dbId); });   // 네트워크 실패 → TTL 해제
    }

    function openPostDetail(origIdx) {
        var p = posts[origIdx];
        if (!p) return;
        _detailPostIdx  = origIdx;
        _detailPostDbId = p.dbId;

        // 이전 댓글 입력 잔여 텍스트 + 답글 모드 초기화
        var comInput = document.getElementById('pd-com-input');
        if (comInput) comInput.value = '';
        clearReplyTarget();

        var rawTitle = p.title || '';
        // 카테고리 권위값 = DB p.category(_postCategory) — 피드와 동일 소스.
        // 제목 접두사 단독 판정 금지: category='general'+접두사 없음 글이 '분석'으로 오표시되던 결함 수정.
        var cat = _postCategory(p);
        var catColors = {
            analysis: '#e8000d', fighter: '#f59e0b', live: '#10b981',
            news:     '#3b82f6', humor:   '#a855f7', general: '#333'
        };

        var bar = document.getElementById('pd-cat-bar');
        if (bar) bar.style.background = catColors[cat] || '#333';

        var badge = document.getElementById('pd-cat-badge');
        if (badge) {
            if (p.isPickShare) {
                badge.className = 'post-type-tag pick'; badge.textContent = '🎯 픽';
            } else {
                var cd = CAT_LABEL[cat] || CAT_LABEL.general;
                badge.className = 'post-type-tag ' + cd.cls;
                badge.textContent = cd.lbl;
            }
        }

        var setEl = function(id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };
        setEl('pd-date',    p.date || '');
        setEl('pd-title',   _stripCatPrefix(rawTitle));
        setEl('pd-content', p.content || '');

        var authorEl = document.getElementById('pd-author');
        if (authorEl) {
            var factionSrc = p.faction
                || (p.author === getDisplayUsername() && typeof currentFaction !== 'undefined' ? currentFaction : null);
            var factionBadge = (typeof getFactionBadge === 'function' && factionSrc)
                ? _safeFactionBadge(factionSrc) + ' ' : '';
            var isSelf = p.author === getDisplayUsername();
            var safeAuthor = escapeHtml(p.author || '').replace(/'/g, "\\'");
            var battleBtn = (!isSelf && currentUser && typeof isBattleFeatureEnabled === 'function' && isBattleFeatureEnabled())
                ? `<button onclick="requestBattle('${safeAuthor}', event)"
                       style="font-family:'Oswald',sans-serif;font-size:10px;font-weight:900;font-style:italic;text-transform:uppercase;background:transparent;border:1px solid #222;color:#444;padding:2px 7px;border-radius:5px;cursor:pointer;letter-spacing:.05em;transition:color .12s,border-color .12s;"
                       onmouseover="this.style.color='#e8000d';this.style.borderColor='rgba(232,0,13,.4)'"
                       onmouseout="this.style.color='#444';this.style.borderColor='#222'">⚡ 옥타곤</button>`
                : '';
            // belt는 서버 값이 있을 때만 표시(White 합성 금지)
            authorEl.innerHTML = '✍️ ' + factionBadge + escapeHtml(p.author || 'UNKNOWN')
                + (p.belt ? ' · ' + escapeHtml(p.belt) : '') + ' ' + battleBtn;
        }

        _renderDetailComments(p.comments || []);
        _syncDetailLikeBtn();
        _renderDetailStats(p);

        // 트리거 저장(닫을 때 focus 복귀) — 열기 직전 activeElement
        _detailTrigger = (document.activeElement && document.activeElement !== document.body) ? document.activeElement : null;

        var modal = document.getElementById('post-detail-modal');
        if (modal) modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        // 초기 focus — 모달 내 유의미한 첫 컨트롤(닫기 버튼)
        var closeBtn = document.getElementById('pd-close-btn');
        if (closeBtn) closeBtn.focus();

        // 조회수 증가는 모달 열림 이후 fire-and-forget (실패해도 모달 동작에 영향 없음)
        _incrementPostView(p);

        if (_detailEscHandler) document.removeEventListener('keydown', _detailEscHandler, true);
        _detailEscHandler = function(e) {
            if (e.key !== 'Escape' && e.key !== 'Tab') return;
            // 모달 스택 최상위일 때만 처리 — 위에 auth/유저활동 모달이 떠 있으면 그쪽이 우선.
            if (typeof _topModalEl === 'function') {
                var top = _topModalEl();
                if (top && top.id !== 'post-detail-modal') return;
            }
            if (e.key === 'Tab') { var m = document.getElementById('post-detail-modal'); if (m) _trapTab(e, m); return; }
            // 답글 모드에서 입력창 Escape는 답글 취소(인라인 핸들러)가 우선 — capture라 여기서 양보해야 함
            if (_replyTargetCommentId && document.activeElement === document.getElementById('pd-com-input')) return;
            closePostDetail();
        };
        document.addEventListener('keydown', _detailEscHandler, true);   // capture: 동일 keydown에서 위 모달이 먼저 닫혀도 스택 오판 없음

        // Own-post controls
        var isOwn = !!(currentUser && p.userId && p.userId === currentUser.id);
        var isAdmin = (typeof adminUnlocked !== 'undefined' && adminUnlocked);
        var editBtn = document.getElementById('pd-edit-btn');
        var delBtn  = document.getElementById('pd-delete-btn');
        // edit: author only. delete (C3-5): author or admin.
        if (editBtn) { if (isOwn) editBtn.classList.remove('hidden'); else editBtn.classList.add('hidden'); }
        if (delBtn)  { if (isOwn || isAdmin) delBtn.classList.remove('hidden'); else delBtn.classList.add('hidden'); }
        // Admin pin/unpin control (admin 전용 — adminUnlocked는 UX 게이트, 서버 admin_required가 최종 방어)
        _syncPinBtn(p);
        var editForm = document.getElementById('pd-edit-form');
        if (editForm) editForm.classList.add('hidden');
    }

    // ── C3-2 공지 고정 (admin 전용) ──
    function _syncPinBtn(p) {
        var btn = document.getElementById('pd-pin-btn');
        if (!btn) return;
        if (typeof adminUnlocked === 'undefined' || !adminUnlocked) { btn.classList.add('hidden'); return; }
        btn.classList.remove('hidden');
        btn.textContent = (p && p.isPinned === true) ? '📌 고정 해제' : '📌 고정';
    }
    function togglePinCurrentPost() {
        if (typeof adminUnlocked === 'undefined' || !adminUnlocked) return; // UX 게이트
        var p = _detailPost();                       // dbId 권위값 — stale index로 다른 글 고정 금지
        if (!p || p.dbId == null) return;
        if (typeof sb === 'undefined' || !sb) { showToast('⚠ 연결 오류'); return; }
        var next = !(p.isPinned === true);
        var btn = document.getElementById('pd-pin-btn');
        if (btn) btn.disabled = true;
        sb.rpc('admin_set_post_pinned', { p_post_id: p.dbId, p_is_pinned: next }).then(function(res) {
            if (btn) btn.disabled = false;
            if (res.error) {
                console.warn('[pin] failed:', res.error.message);
                showToast((res.error.message || '').indexOf('admin_required') !== -1 ? '⚠ 관리자 권한 필요' : '⚠ 고정 변경 실패');
                return;
            }
            var d = res.data || {};
            p.isPinned = (d.is_pinned === true);
            _syncPinBtn(p);
            if (typeof renderFeed === 'function') renderFeed();
            showToast(p.isPinned ? '📌 게시글을 상단 고정했습니다' : '고정을 해제했습니다');
        });
    }

    function closePostDetail() {
        var modal = document.getElementById('post-detail-modal');
        if (modal) modal.classList.add('hidden');
        // 다른 모달(-modal)이 아직 열려 있으면 body scroll lock을 풀지 않는다(중첩 모달 보호)
        var othersOpen = (typeof _openModalEls === 'function') && _openModalEls().length > 0;
        if (!othersOpen) document.body.style.overflow = '';
        // 트리거로 focus 복귀 — 열림 중 renderFeed(조회수 반영 등)로 원 노드가 교체됐으면
        // 같은 글(dbId) 카드의 열기 버튼을 재탐색해 복귀한다(노드 참조는 identity가 아님).
        var _trig = _detailTrigger;
        _detailTrigger = null;
        if (_trig && document.contains(_trig)) { try { _trig.focus(); } catch (e) {} }
        else if (_detailPostDbId != null && typeof posts !== 'undefined' && posts) {
            var _ci = -1;
            for (var _k = 0; _k < posts.length; _k++) { if (posts[_k].dbId === _detailPostDbId) { _ci = _k; break; } }
            var _row = (_ci >= 0) ? document.getElementById('post-row-' + _ci) : null;
            var _btn = _row && _row.querySelector('button.fc-open');
            if (_btn) { try { _btn.focus(); } catch (e) {} }
        }
        clearReplyTarget();
        _detailPostIdx  = -1;
        _detailPostDbId = null;
        if (_detailEscHandler) {
            document.removeEventListener('keydown', _detailEscHandler, true);
            _detailEscHandler = null;
        }
        var editForm = document.getElementById('pd-edit-form');
        if (editForm) editForm.classList.add('hidden');
    }

    // 단일 댓글/답글 블록 HTML. isReply=true 면 들여쓰기 + 답글버튼 미노출.
    function _commentBlockHtml(c, isReply, isAdmin) {
        var isSelf = c.user === getDisplayUsername();
        var safeUser = escapeHtml(c.user || '').replace(/'/g, "\\'");
        var battleBtn = (!isSelf && currentUser && typeof isBattleFeatureEnabled === 'function' && isBattleFeatureEnabled())
            ? `<button onclick="requestBattle('${safeUser}', event)"
                   style="font-family:'Oswald',sans-serif;font-size:10px;font-weight:900;font-style:italic;text-transform:uppercase;background:transparent;border:1px solid #222;color:#444;padding:2px 7px;border-radius:5px;cursor:pointer;letter-spacing:.05em;transition:color .12s,border-color .12s;"
                   onmouseover="this.style.color='#e8000d';this.style.borderColor='rgba(232,0,13,.4)'"
                   onmouseout="this.style.color='#444';this.style.borderColor='#222'">⚡ 옥타곤</button>`
            : '';
        // C3-5: delete button — own comment (user_id match) or admin; legacy (no userId) admin-only.
        // Only on persisted comments (commentId present); server enforces via delete_post_comment.
        var isOwnComment = !!(currentUser && c.userId && c.userId === currentUser.id);
        var canDelete = (c.commentId != null) && (isOwnComment || isAdmin);
        var delBtn = canDelete
            ? `<button onclick="deleteDetailComment(${c.commentId})"
                   style="font-family:'Oswald',sans-serif;font-size:10px;font-weight:900;background:transparent;border:1px solid #3a1416;color:#a33;padding:2px 7px;border-radius:5px;cursor:pointer;letter-spacing:.05em;transition:color .12s,border-color .12s;"
                   onmouseover="this.style.color='#fff';this.style.borderColor='#e8000d'"
                   onmouseout="this.style.color='#a33';this.style.borderColor='#3a1416'">✕</button>`
            : '';
        // 답글 버튼 — 최상위 댓글 + 로그인 + 실제 id 있을 때만(깊이1)
        var replyBtn = (!isReply && currentUser && c.commentId != null)
            ? `<button class="pd-reply-btn" data-nick="${escapeHtml(c.user || '')}" onclick="startReply(${c.commentId}, this.dataset.nick)">↳ 답글</button>`
            : '';
        // user_id를 DOM에 노출하지 않음 — commentId로 메모리(posts[].comments)에서 참조.
        var nickHtml = (c.commentId != null)
            ? `<button type="button" class="post-comment-nick-link" onclick="openUserActivityByComment(${c.commentId})">${escapeHtml(c.user || '')}</button>`
            : `<span>${escapeHtml(c.user || '')}</span>`;
        return `<div class="post-comment-block${isReply ? ' is-reply' : ''}">
                <div class="post-comment-nick">${nickHtml}<span class="pc-actions">${replyBtn}${battleBtn}${delBtn}</span></div>
                <p class="post-comment-txt">${escapeHtml(c.text || '')}</p>
            </div>`;
    }

    function _renderDetailComments(comments) {
        var listEl = document.getElementById('pd-com-list');
        if (!listEl) return;
        var all = comments || [];
        if (all.length === 0) {
            listEl.innerHTML = '<p style="font-size:13px;color:#555;font-style:italic;text-align:center;padding:12px 0;">첫 댓글을 남겨주세요</p>';
            return;
        }
        var isAdmin = (typeof adminUnlocked !== 'undefined' && adminUnlocked);

        // 그룹핑: 최상위(parent 없음) + parent별 답글. 부모가 로드결과에 없으면(삭제됨) 고아 그룹.
        // 배열은 이미 created_at asc 정렬 → 그룹 내 답글도 asc 유지.
        var tops = [], topIds = {};
        all.forEach(function(c) { if (!c.parentCommentId) { tops.push(c); if (c.commentId != null) topIds[c.commentId] = true; } });
        var repliesByParent = {}, orphanByParent = {}, orphanOrder = [];
        all.forEach(function(c) {
            if (!c.parentCommentId) return;
            if (topIds[c.parentCommentId]) {
                (repliesByParent[c.parentCommentId] = repliesByParent[c.parentCommentId] || []).push(c);
            } else {
                if (!orphanByParent[c.parentCommentId]) { orphanByParent[c.parentCommentId] = []; orphanOrder.push(c.parentCommentId); }
                orphanByParent[c.parentCommentId].push(c);
            }
        });

        var html = '';
        tops.forEach(function(top) {
            html += _commentBlockHtml(top, false, isAdmin);
            var reps = repliesByParent[top.commentId] || [];
            if (reps.length) {
                html += '<div class="post-reply-group">' + reps.map(function(r) { return _commentBlockHtml(r, true, isAdmin); }).join('') + '</div>';
            }
        });
        // 부모가 삭제된 답글: 합성 tombstone + 답글 보존
        orphanOrder.forEach(function(pid) {
            html += '<div class="post-comment-tomb">삭제된 댓글입니다</div>'
                 + '<div class="post-reply-group">' + orphanByParent[pid].map(function(r) { return _commentBlockHtml(r, true, isAdmin); }).join('') + '</div>';
        });

        listEl.innerHTML = html;
    }

    // ── 답글(대댓글) 모드 상태 ─────────────────────────────────────────────
    var _replyTargetCommentId = null;   // 답글 대상 최상위 댓글 id (null = 최상위 댓글 작성)
    var _replyTargetNick = null;

    function startReply(commentId, nick) {
        // [로그인 UX] 답글은 인증 필요 행동 — reply 상태 변경 전에 중단하고 로그인 모달 유도.
        if (!currentUser) { if (typeof openAuthModal === 'function') { openAuthModal('community'); } else { showToast('⚠ 로그인이 필요합니다'); } return; }
        _replyTargetCommentId = commentId;
        _replyTargetNick = nick || '';
        var bar = document.getElementById('pd-reply-bar');
        var lbl = document.getElementById('pd-reply-target');
        if (lbl) lbl.textContent = '@' + _replyTargetNick + ' 에게 답글';
        if (bar) bar.classList.remove('hidden');
        var input = document.getElementById('pd-com-input');
        if (input) { input.placeholder = '@' + _replyTargetNick + ' 에게 답글...'; input.focus(); }
    }

    function clearReplyTarget() {
        _replyTargetCommentId = null;
        _replyTargetNick = null;
        var bar = document.getElementById('pd-reply-bar');
        if (bar) bar.classList.add('hidden');
        var input = document.getElementById('pd-com-input');
        if (input) input.placeholder = '의견을 남겨주세요...';
    }

    async function sendDetailComment() {
        var p = _detailPost();                       // dbId 권위값(재할당 후에도 같은 글로 재해석)
        if (!p) return;
        var input = document.getElementById('pd-com-input');
        var text  = input ? input.value.trim() : '';
        if (!text) return;
        // [로그인 UX] 상세 모달 댓글도 인증 필요 행동 — write 전에 중단하고 로그인 모달 유도.
        if (!currentUser) { if (typeof openAuthModal === 'function') { openAuthModal('community'); } else { showToast('⚠ 로그인이 필요합니다'); } return; }
        var nick   = getDisplayUsername();
        var body   = text.slice(0, 300);
        var parent = _replyTargetCommentId || null;   // 답글 대상(최상위 댓글 id), null=최상위 댓글

        var res = await addCommentToDB(p.dbId, nick, body, parent);
        if (!res.ok) return;   // 실패 토스트는 runSupabaseMutation 이 처리

        if (res.data) {
            // 서버가 확정한 행(실제 id + 깊이1 정규화된 parent) 사용 → optimistic 중복 없음
            var row = res.data;
            p.comments.push({
                user: row.user_nick || nick,
                userId: row.user_id || currentUser.id,
                text: row.content || body,
                commentId: row.id,
                parentCommentId: row.parent_comment_id || null
            });
        } else {
            // 오프라인 등 행 미반환 fallback (id 없음)
            p.comments.push({ user: nick, userId: currentUser.id, text: body, commentId: null, parentCommentId: parent });
        }

        if (input) input.value = '';
        clearReplyTarget();   // 전송 성공 후 답글 모드 해제
        save();
        _renderDetailComments(p.comments);
        _renderDetailStats(p);   // 공용 렌더 — 👁 조회수 누락 방지
    }

    // C3-5: soft delete a comment via RPC. Own comment or admin; server enforces.
    async function deleteDetailComment(commentId) {
        if (commentId == null) return;
        var p = _detailPost();                       // dbId 권위값(재할당 후에도 같은 글로 재해석)
        if (!p) return;
        if (!currentUser) return;
        if (!confirm('이 댓글을 삭제하시겠습니까?')) return;
        if (!sb) { showToast('⚠ 연결 오류'); return; }

        var res = await sb.rpc('delete_post_comment', { p_comment_id: commentId });
        if (res.error) {
            var msg = res.error.message || '';
            showToast(msg.indexOf('not_authorized') !== -1 ? '⚠ 삭제 권한이 없습니다' : '⚠ 댓글 삭제 실패');
            return;
        }

        p.comments = (p.comments || []).filter(function(c) { return c.commentId !== commentId; });
        save();
        _renderDetailComments(p.comments);
        _renderDetailStats(p);   // 공용 렌더 — 👁 조회수 누락 방지
        if (typeof renderFeed === 'function') renderFeed();
        showToast('🗑 댓글을 삭제했어요');
    }

    function likePostFromDetail() {
        var p = _detailPost();                       // dbId 권위값 — stale index로 다른 글 추천 금지
        if (!p) return;
        likePost(posts.indexOf(p));
        _syncDetailLikeBtn();
        _renderDetailStats(p);   // 공용 렌더 — 👁 조회수 누락 방지
    }

    function _syncDetailLikeBtn() {
        var p   = _detailPost();
        var btn = document.getElementById('pd-like-btn');
        if (!btn || !p) return;
        var isLiked = likedPostIds.has(p.dbId);
        btn.textContent = isLiked ? '✅ 추천' : '🔥 추천';
        if (isLiked) btn.classList.add('liked'); else btn.classList.remove('liked');
    }

    // 롤링 랭킹: 최근 10경기 기반 점수 계산
    function getRollingScore() {
        const recent = state.history
            .filter(h => h.res !== 'PENDING')
            .slice(0, 10);
        if (recent.length === 0) return 0;
        const wins = recent.filter(h => h.res === 'WIN').length;
        const acc = wins / recent.length;
        const baseScore = recent.reduce((s, h) => s + (h.res === 'WIN' ? (h.payout || 0) : 0), 0);
        return Math.round(baseScore * (0.5 + acc * 0.5));
    }

    function getBeltInfo(pts) {
        if(pts > 10000) return { name: "Black", color: "#ffffff", bg: "bg-ufcRed", text: "text-white" };
        if(pts > 5000)  return { name: "Brown", color: "#B5803A", bg: "bg-yellow-800", text: "text-white" };
        if(pts > 2000)  return { name: "Purple", color: "#8B3FE3", bg: "bg-purple-700", text: "text-white" };
        if(pts > 1000)  return { name: "Blue", color: "#1F6FEB", bg: "bg-blue-600", text: "text-white" };
        return { name: "White", color: "#ECECEE", bg: "bg-white", text: "text-black" };
    }

    /* ── Own Post Edit / Delete ── */

    function startOwnPostEdit() {
        var p = _detailPost();                       // dbId 권위값
        if (!p || !currentUser || p.userId !== currentUser.id) return;
        var titleInput   = document.getElementById('pd-edit-title');
        var contentInput = document.getElementById('pd-edit-content');
        if (titleInput)   titleInput.value   = _stripCatPrefix(p.title || '');
        if (contentInput) contentInput.value = p.content || '';
        var editForm = document.getElementById('pd-edit-form');
        if (editForm) editForm.classList.remove('hidden');
        if (titleInput) titleInput.focus();
    }

    function cancelOwnPostEdit() {
        var editForm = document.getElementById('pd-edit-form');
        if (editForm) editForm.classList.add('hidden');
    }

    async function saveOwnPostEdit() {
        var p = _detailPost();                       // dbId 권위값 — stale index로 다른 글 UPDATE 금지
        if (!p || !currentUser || p.userId !== currentUser.id) return;
        var titleInput   = document.getElementById('pd-edit-title');
        var contentInput = document.getElementById('pd-edit-content');
        var newTitle   = titleInput   ? titleInput.value.trim()   : '';
        var newContent = contentInput ? contentInput.value.trim() : '';
        if (!newTitle || !newContent) { showToast('⚠ 제목과 내용을 모두 입력하세요'); return; }

        // Preserve category prefix from original title
        var cat = _getPostCategory(p.title || '');
        var catPrefixMap = { analysis: '[분석]', fighter: '[파이터]', live: '[라이브]', news: '[뉴스]', humor: '[유머]' };
        var catPrefix  = (cat && catPrefixMap[cat]) ? catPrefixMap[cat] + ' ' : '';
        var finalTitle = (catPrefix + newTitle).slice(0, 120);

        if (!sb) { showToast('⚠ 연결 오류'); return; }
        var res = await sb.from('posts')
            .update({ title: finalTitle, content: newContent.slice(0, 2000) })
            .eq('id', p.dbId)
            .eq('user_id', currentUser.id);
        if (res.error) { showToast('⚠ 수정 실패: ' + res.error.message); return; }

        p.title   = finalTitle;
        p.content = newContent.slice(0, 2000);
        save();

        var titleEl   = document.getElementById('pd-title');
        var contentEl = document.getElementById('pd-content');
        if (titleEl)   titleEl.textContent   = _stripCatPrefix(finalTitle);
        if (contentEl) contentEl.textContent = p.content;

        cancelOwnPostEdit();
        renderFeed();
        showToast('✅ 수정되었습니다');
    }

    // C3-5: soft delete via RPC. Author or admin; server enforces (delete_post).
    async function deleteOwnPost() {
        var p = _detailPost();                       // dbId 권위값 — stale index로 다른 글 삭제 금지
        if (!p || p.dbId == null) return;
        var isOwn   = !!(currentUser && p.userId && p.userId === currentUser.id);
        var isAdmin = (typeof adminUnlocked !== 'undefined' && adminUnlocked);
        if (!currentUser || (!isOwn && !isAdmin)) return; // UX gate; server is final defense
        if (!confirm('이 게시글을 삭제하시겠습니까?')) return;

        if (!sb) { showToast('⚠ 연결 오류'); return; }
        var res = await sb.rpc('delete_post', { p_post_id: p.dbId });
        if (res.error) {
            var msg = res.error.message || '';
            showToast(msg.indexOf('not_authorized') !== -1 ? '⚠ 삭제 권한이 없습니다' : '⚠ 삭제 실패');
            return;
        }

        var idx = posts.indexOf(p);
        if (idx > -1) posts.splice(idx, 1);
        save();
        closePostDetail();
        renderFeed();
        showToast('🗑 게시글을 삭제했어요');
    }
