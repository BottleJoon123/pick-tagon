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
            if (k === active) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    }

    function setCommunityFilter(f) {
        communityFilter = f;
        _setFilterActive('cf-', ['all','analysis','fighter','live','news','humor'], f);
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

    function _fmtCount(n) {
        if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        return String(n);
    }

    // 카테고리별 글 수 (실데이터) → 칩 카운트
    function renderFilterCounts() {
        var realPosts = (typeof posts !== 'undefined' && posts)
            ? posts.filter(function(p) { return !p.isPickShare; })
            : [];
        var counts = { all: realPosts.length, analysis: 0, fighter: 0, live: 0, news: 0, humor: 0 };
        realPosts.forEach(function(p) {
            var c = _getPostCategory(p.title);
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

    function toggleWriter() { document.getElementById('write-panel').classList.toggle('hidden'); }

    /* ── Activity ticker (recent activity, not live presence) ── */
    function renderActivityTicker() {
        var el = document.getElementById('activity-ticker');
        if (!el) return;

        var realPosts = (typeof posts !== 'undefined' && posts)
            ? posts.filter(function(p) { return !p.isPickShare; })
            : [];
        if (!realPosts.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }

        var sorted = realPosts.slice().sort(function(a, b) {
            return (b.date || '').localeCompare(a.date || '');
        });
        var latest = sorted[0];

        // 오늘 작성된 글 수
        var now = new Date();
        var todayCount = realPosts.filter(function(p) {
            if (!p.date) return false;
            var dt = new Date(String(p.date).replace(/\./g, '-'));
            return dt.getFullYear() === now.getFullYear()
                && dt.getMonth() === now.getMonth()
                && dt.getDate() === now.getDate();
        }).length;

        var items = [];
        if (latest) {
            items.push('방금 <span class="tk-name">' + escapeHtml(latest.author || '익명') + '</span>님이 글을 올렸어요');
        }
        var withCom = sorted.find(function(p) { return (p.comments || []).length > 0; });
        if (withCom) {
            items.push('<span class="tk-name">' + escapeHtml(withCom.author || '익명') + '</span>님 글에 새 댓글');
        }
        items.push('오늘 새 글 <span class="tk-name">' + todayCount + '</span>');

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
            var success = (state && state.success) ? state.success : 0;
            var acc     = total > 0 ? (Math.round(success / total * 100) + '%') : '집계 전';
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
                '    <div class="side-stat"><div class="side-stat-v">' + acc + '</div><div class="side-stat-l">정확도</div></div>',
                '    <div class="side-stat"><div class="side-stat-v">' + total + '</div><div class="side-stat-l">픽 수</div></div>',
                '  </div>',
                '</div>'
            ].join(''));
        } else {
            blocks.push([
                '<div class="side-card me">',
                '  <div class="side-head"><span class="side-title">내 픽타곤</span></div>',
                '  <p class="side-empty">로그인하면 내 랭킹과 픽 기록을 볼 수 있어요.</p>',
                '  <button class="side-cta" onclick="navigateTo(\'profile\')">로그인 / 프로필 →</button>',
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
            var lp = 50, rp = 50;
            var ec = (typeof eventPickCounts !== 'undefined') && eventPickCounts[main.id];
            if (ec && (ec.c0 + ec.c1) > 0) { lp = Math.round(ec.c0 / (ec.c0 + ec.c1) * 100); rp = 100 - lp; }
            else if (main.leftBias != null) { lp = Math.round(main.leftBias * 100); rp = 100 - lp; }
            var ev = escapeHtml(main._eventTitle || '');
            pickHtml = [
                '<div class="side-head"><span class="side-title">오늘의 픽</span>' + (ev ? '<span class="side-meta">' + ev + '</span>' : '') + '</div>',
                '<div class="side-pick-names">',
                '  <span class="side-pick-n">' + escapeHtml(main.f1.name) + '</span>',
                '  <span class="side-pick-vs">VS</span>',
                '  <span class="side-pick-n r">' + escapeHtml(main.f2.name) + '</span>',
                '</div>',
                '<div class="side-pick-bar"><i style="width:' + lp + '%;background:#e10600"></i><i style="width:' + rp + '%;background:#2f7bf0"></i></div>',
                '<div class="side-pick-pct"><span style="color:#FF5D55">' + lp + '%</span><span style="color:#6FA8FF">' + rp + '%</span></div>'
            ].join('');
        } else {
            pickHtml = '<div class="side-head"><span class="side-title">오늘의 픽</span></div><p class="side-empty">예정된 경기가 없어요.</p>';
        }
        blocks.push('<div class="side-card">' + pickHtml + '</div>');

        // ── 3. 트렌딩 글 (likes*2 + 댓글 수 기준) ──
        var real = (typeof posts !== 'undefined' && posts) ? posts.filter(function(p) { return !p.isPickShare; }) : [];
        var trend = real.slice().sort(function(a, b) {
            return ((b.likes || 0) * 2 + (b.comments || []).length) - ((a.likes || 0) * 2 + (a.comments || []).length);
        }).slice(0, 5);
        var trendHtml;
        if (trend.length) {
            trendHtml = '<div class="side-trend">' + trend.map(function(p, i) {
                var idx = posts.indexOf(p);
                var title = escapeHtml(_stripCatPrefix(p.title || '') || '(제목 없음)');
                return '<div class="side-trow" onclick="openPostDetail(' + idx + ')">'
                     + '<span class="side-trow-rank' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</span>'
                     + '<span class="side-trow-t">' + title + '</span>'
                     + '<span class="side-trow-c">🔥 ' + (p.likes || 0) + '</span>'
                     + '</div>';
            }).join('') + '</div>';
        } else {
            trendHtml = '<p class="side-empty">아직 글이 없어요.</p>';
        }
        blocks.push('<div class="side-card"><div class="side-head"><span class="side-title">트렌딩 글</span></div>' + trendHtml + '</div>');

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
    }

    /* ── Matchup Board ── */
    function renderMatchups(fights) {
        var container = document.getElementById('matchup-board');
        if (!container) return;
        if (!fights || fights.length === 0) { container.innerHTML = ''; return; }

        // 메인/코메인 우선; 없으면 앞쪽 3경기라도 노출
        var featured = fights.filter(function(f) {
            var t = (f.tag || '').toUpperCase();
            return t.includes('MAIN EVENT') || t.includes('CO-MAIN') || t.includes('CO MAIN');
        });
        if (featured.length === 0) featured = fights.slice(0, 3);
        var restCount  = fights.length - featured.length;
        var eventTitle = (fights[0] && fights[0]._eventTitle) || '';

        var cards = featured.map(function(fight) {
            // Live pick percentages — eventPickCounts: { c0: red, c1: blue } (index.html var)
            var ec = (typeof eventPickCounts !== 'undefined') && eventPickCounts[fight.id];
            var leftPct = 50, rightPct = 50;
            if (ec && (ec.c0 + ec.c1) > 0) {
                leftPct  = Math.round(ec.c0 / (ec.c0 + ec.c1) * 100);
                rightPct = 100 - leftPct;
            } else if (fight.leftBias != null) {
                leftPct  = Math.round(fight.leftBias * 100);
                rightPct = 100 - leftPct;
            }

            // Tag class
            var tag = (fight.tag || '').toUpperCase();
            var tagCls = 'matchup-tag-bout';
            if (tag.includes('MAIN EVENT') && !tag.includes('CO')) tagCls = 'matchup-tag-main';
            else if (tag.includes('CO')) tagCls = 'matchup-tag-co';

            // Picked state
            var isPending  = state.pendings && state.pendings[fight.id];
            var isSettled  = state.settled  && state.settled[fight.id];
            var hasPick    = !!(isPending || isSettled);

            var f1   = escapeHtml(fight.f1.name);
            var f2   = escapeHtml(fight.f2.name);
            var rec1 = escapeHtml((fight.f1 && fight.f1.record) || '');
            var rec2 = escapeHtml((fight.f2 && fight.f2.record) || '');
            var fid  = escapeHtml(fight.id);

            // Two-color community-pick bar: left red → right blue (handoff colors)
            var barGradient = 'linear-gradient(90deg,#e10600 ' + leftPct + '%,#2f7bf0 ' + leftPct + '%)';

            return `
            <div class="matchup-card ${tagCls === 'matchup-tag-main' ? 'card-main' : ''}" onclick="navigateTo('matchups'); setTimeout(function(){ var el=document.getElementById('card-${fid}'); if(el) el.scrollIntoView({behavior:'smooth',block:'center'}); },350);">
                <div class="ps-top">
                    <span class="matchup-tag ${tagCls}">${escapeHtml(fight.tag || 'BOUT')}</span>
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
                <div class="ps-bar">
                    <div class="ps-bar-fill" style="background:${barGradient}"></div>
                </div>
                <div class="ps-pct">
                    <span style="color:#FF5D55;">${leftPct}%</span>
                    <span class="ps-pct-lbl">커뮤니티 픽</span>
                    <span style="color:#6FA8FF;">${rightPct}%</span>
                </div>
            </div>`;
        }).join('');

        var moreLabel = restCount > 0
            ? '+ ' + restCount + '경기 더 보기 → 전체 대진표'
            : '전체 대진표 →';

        container.innerHTML =
            '<div class="pick-strip-head">' +
                '<span class="pick-strip-title">🥊 오늘의 픽' + (eventTitle ? ' · ' + escapeHtml(eventTitle) : '') + '</span>' +
                '<button class="pick-strip-more" onclick="navigateTo(\'matchups\')">' + moreLabel + '</button>' +
            '</div>' +
            '<div class="pick-strip">' + cards + '</div>';
    }

    /* ── Belt tier helper (post.belt "White Belt" → "white") ── */
    function _beltTier(beltStr) {
        var first = (beltStr || 'White').trim().split(' ')[0].toLowerCase();
        if (['white','blue','purple','brown','black'].indexOf(first) === -1) return 'white';
        return first;
    }

    /* ── Feed cards (handoff .fcard redesign) ── */
    function renderPosts(filtered) {
        var container = document.getElementById('post-list');
        if (!container) return;

        if (!filtered || filtered.length === 0) {
            container.innerHTML = `<div style="padding:36px 20px;text-align:center;font-family:'Oswald',sans-serif;font-size:13px;color:#666;text-transform:uppercase;letter-spacing:.1em;font-style:italic;">표시할 게시글이 없습니다</div>`;
            return;
        }

        var cards = filtered.map(function(p) {
            var origIdx  = posts.indexOf(p);
            var beltRaw  = p.belt || 'White Belt';
            var beltName = escapeHtml(beltRaw.trim().split(' ')[0] || 'White');
            var beltTier = _beltTier(beltRaw);
            var author   = escapeHtml(p.author || 'UNKNOWN');
            var initials = escapeHtml(((p.author || '?').trim().charAt(0) || '?').toUpperCase());
            var date     = escapeHtml(p.date || '');
            var rawTitle = p.title || '';
            var title    = escapeHtml(_stripCatPrefix(rawTitle));
            var snippet  = escapeHtml(p.content || '');
            var isLiked  = likedPostIds.has(p.dbId);
            var cntCom   = (p.comments || []).length;
            var likes    = p.likes || 0;
            // 조회수: DB 미연동 — placeholder (Phase C3에서 view_count 연결 예정). HTML 삽입 값은 escape.
            var views    = (p.viewCount != null) ? escapeHtml(String(p.viewCount)) : '–';
            // HOT: 추천 임계값 기반 더미 규칙 (Phase C3에서 트렌딩 점수로 대체)
            var isHot    = likes >= 5;

            // Category tag → fc-cat cat-{kind}
            var cat = _getPostCategory(rawTitle);
            var catMap = {
                analysis: { cls: 'cat-analysis', lbl: '🔥 분석' },
                fighter:  { cls: 'cat-fighter',  lbl: '🗣️ 파이터' },
                live:     { cls: 'cat-live',     lbl: '🔴 라이브' },
                news:     { cls: 'cat-news',     lbl: '📰 뉴스' },
                humor:    { cls: 'cat-humor',    lbl: '😂 유머' }
            };
            var catCls, catLbl;
            if (p.isPickShare)      { catCls = 'cat-pick'; catLbl = '🎯 픽'; }
            else if (catMap[cat])   { catCls = catMap[cat].cls; catLbl = catMap[cat].lbl; }
            else                    { catCls = 'cat-post'; catLbl = '✍️ 분석'; }

            // Faction badge — 모든 유저 (p.faction = DB에서 JOIN한 faction 객체)
            var factionSrc = p.faction
                || (p.author === getDisplayUsername() && typeof currentFaction !== 'undefined' ? currentFaction : null);
            var factionBadge = (typeof getFactionBadge === 'function' && factionSrc)
                ? getFactionBadge(factionSrc) + ' '
                : '';

            return `
            <div class="fcard ${isHot ? 'hot' : ''}" id="post-row-${origIdx}" onclick="openPostDetail(${origIdx})">
                <div class="fc-ava belt-${beltTier}">${initials}</div>
                <div class="fc-body">
                    <div class="fc-head">
                        <span class="fc-user">${factionBadge}${author}</span>
                        <span class="fc-belt belt-${beltTier}">${beltName}</span>
                        <span class="fc-cat ${catCls}">${catLbl}</span>
                        <span class="fc-meta">· ${date} · 👁 ${views}</span>
                        ${isHot ? '<span class="fc-hot">🔥 HOT</span>' : ''}
                    </div>
                    <div class="fc-title">${title}</div>
                    <div class="fc-snippet">${snippet}</div>
                    <div class="fc-foot">
                        <span class="fc-react ${likes > 0 ? 'hot' : ''}">🔥 ${likes}</span>
                        <span>💬 ${cntCom}</span>
                        <span class="fc-share" onclick="event.stopPropagation(); openPostDetail(${origIdx});">자세히</span>
                        <button class="fc-rec ${isLiked ? 'on' : ''}" onclick="event.stopPropagation(); likePost(${origIdx});">
                            ${isLiked ? '✓ 추천' : '+ 추천'}
                        </button>
                    </div>
                </div>
            </div>`;
        }).join('');

        container.innerHTML = '<div class="feed-list">' + cards + '</div>';
    }

    function togglePostExpand(origIdx) { /* no-op: replaced by openPostDetail */ }

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

        // 2. Filter by category — isPickShare (자동 픽 활동글) 제외
        var filtered = posts.filter(function(p) {
            if (p.isPickShare) return false;
            if (communityFilter === 'all') return true;
            return _getPostCategory(p.title) === communityFilter;
        });

        // 3. Time filter
        if (communityTimeFilter !== 'all') {
            var now    = new Date();
            var cutoff = new Date(now);
            if (communityTimeFilter === 'day')   cutoff.setDate(now.getDate() - 1);
            if (communityTimeFilter === 'week')  cutoff.setDate(now.getDate() - 7);
            if (communityTimeFilter === 'month') cutoff.setDate(now.getDate() - 30);
            filtered = filtered.filter(function(p) {
                var d = new Date(p.date.replace(/\./g, '-'));
                return d >= cutoff;
            });
        }

        // 4. Sort
        filtered = filtered.slice();
        if (communitySortMode === 'recommend') {
            filtered.sort(function(a, b) { return (b.likes || 0) - (a.likes || 0); });
        } else if (communitySortMode === 'hot') {
            filtered.sort(function(a, b) {
                var sa = (b.likes || 0) * 2 + (b.comments ? b.comments.length : 0);
                var sb2 = (a.likes || 0) * 2 + (a.comments ? a.comments.length : 0);
                return sa - sb2;
            });
        } else {
            filtered.sort(function(a, b) {
                return (b.date || '').localeCompare(a.date || '');
            });
        }

        renderPosts(filtered);
    }

    function likePost(i) {
        if (!currentUser) { showToast('⚠ 추천은 로그인 후 가능합니다'); return; }
        var dbId = posts[i].dbId;
        if (likedPostIds.has(dbId)) { showToast('이미 추천한 게시글입니다'); return; }
        posts[i].likes++;
        likedPostIds.add(dbId);
        likePostInDB(dbId);
        save();
        renderFeed();
    }

    /* ── Post Detail Modal ── */
    var _detailPostIdx    = -1;
    var _detailPostDbId   = null;
    var _detailEscHandler = null;

    function openPostDetail(origIdx) {
        var p = posts[origIdx];
        if (!p) return;
        _detailPostIdx  = origIdx;
        _detailPostDbId = p.dbId;

        // 이전 댓글 입력 잔여 텍스트 초기화
        var comInput = document.getElementById('pd-com-input');
        if (comInput) comInput.value = '';

        var rawTitle = p.title || '';
        var cat = _getPostCategory(rawTitle);
        var catColors = {
            analysis: '#e8000d', fighter: '#f59e0b', live: '#10b981',
            news:     '#3b82f6', humor:   '#a855f7'
        };
        var catDisplay = {
            analysis: { cls: 'cat-analysis', lbl: '🔥 분석' },
            fighter:  { cls: 'cat-fighter',  lbl: '🗣️ 파이터' },
            live:     { cls: 'cat-live',      lbl: '🔴 라이브' },
            news:     { cls: 'cat-news',      lbl: '📰 뉴스' },
            humor:    { cls: 'cat-humor',     lbl: '😂 유머' }
        };

        var bar = document.getElementById('pd-cat-bar');
        if (bar) bar.style.background = catColors[cat] || '#333';

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

        var setEl = function(id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };
        setEl('pd-date',    p.date || '');
        setEl('pd-title',   _stripCatPrefix(rawTitle));
        setEl('pd-content', p.content || '');

        var authorEl = document.getElementById('pd-author');
        if (authorEl) {
            var factionSrc = p.faction
                || (p.author === getDisplayUsername() && typeof currentFaction !== 'undefined' ? currentFaction : null);
            var factionBadge = (typeof getFactionBadge === 'function' && factionSrc)
                ? getFactionBadge(factionSrc) + ' ' : '';
            var isSelf = p.author === getDisplayUsername();
            var safeAuthor = escapeHtml(p.author || '').replace(/'/g, "\\'");
            var battleBtn = (!isSelf && currentUser && typeof isBattleFeatureEnabled === 'function' && isBattleFeatureEnabled())
                ? `<button onclick="requestBattle('${safeAuthor}', event)"
                       style="font-family:'Oswald',sans-serif;font-size:10px;font-weight:900;font-style:italic;text-transform:uppercase;background:transparent;border:1px solid #222;color:#444;padding:2px 7px;border-radius:5px;cursor:pointer;letter-spacing:.05em;transition:color .12s,border-color .12s;"
                       onmouseover="this.style.color='#e8000d';this.style.borderColor='rgba(232,0,13,.4)'"
                       onmouseout="this.style.color='#444';this.style.borderColor='#222'">⚡ 옥타곤</button>`
                : '';
            authorEl.innerHTML = '✍️ ' + factionBadge + escapeHtml(p.author || 'UNKNOWN')
                + ' · ' + escapeHtml(p.belt || 'White Belt') + ' ' + battleBtn;
        }

        _renderDetailComments(p.comments || []);
        _syncDetailLikeBtn();

        var statsEl = document.getElementById('pd-stats');
        if (statsEl) statsEl.textContent = '🔥 ' + (p.likes || 0) + '  💬 ' + (p.comments || []).length;

        var modal = document.getElementById('post-detail-modal');
        if (modal) modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        if (_detailEscHandler) document.removeEventListener('keydown', _detailEscHandler);
        _detailEscHandler = function(e) { if (e.key === 'Escape') closePostDetail(); };
        document.addEventListener('keydown', _detailEscHandler);

        // Own-post controls
        var isOwn = !!(currentUser && p.userId && p.userId === currentUser.id);
        var editBtn = document.getElementById('pd-edit-btn');
        var delBtn  = document.getElementById('pd-delete-btn');
        if (editBtn) { if (isOwn) editBtn.classList.remove('hidden'); else editBtn.classList.add('hidden'); }
        if (delBtn)  { if (isOwn) delBtn.classList.remove('hidden');  else delBtn.classList.add('hidden'); }
        var editForm = document.getElementById('pd-edit-form');
        if (editForm) editForm.classList.add('hidden');
    }

    function closePostDetail() {
        var modal = document.getElementById('post-detail-modal');
        if (modal) modal.classList.add('hidden');
        document.body.style.overflow = '';
        _detailPostIdx  = -1;
        _detailPostDbId = null;
        if (_detailEscHandler) {
            document.removeEventListener('keydown', _detailEscHandler);
            _detailEscHandler = null;
        }
        var editForm = document.getElementById('pd-edit-form');
        if (editForm) editForm.classList.add('hidden');
    }

    function _renderDetailComments(comments) {
        var listEl = document.getElementById('pd-com-list');
        if (!listEl) return;
        if (!comments || comments.length === 0) {
            listEl.innerHTML = '<p style="font-size:13px;color:#555;font-style:italic;text-align:center;padding:12px 0;">첫 댓글을 남겨주세요</p>';
            return;
        }
        listEl.innerHTML = comments.map(function(c) {
            var isSelf = c.user === getDisplayUsername();
            var safeUser = escapeHtml(c.user || '').replace(/'/g, "\\'");
            var battleBtn = (!isSelf && currentUser && typeof isBattleFeatureEnabled === 'function' && isBattleFeatureEnabled())
                ? `<button onclick="requestBattle('${safeUser}', event)"
                       style="font-family:'Oswald',sans-serif;font-size:10px;font-weight:900;font-style:italic;text-transform:uppercase;background:transparent;border:1px solid #222;color:#444;padding:2px 7px;border-radius:5px;cursor:pointer;letter-spacing:.05em;transition:color .12s,border-color .12s;"
                       onmouseover="this.style.color='#e8000d';this.style.borderColor='rgba(232,0,13,.4)'"
                       onmouseout="this.style.color='#444';this.style.borderColor='#222'">⚡ 옥타곤</button>`
                : '';
            return `<div class="post-comment-block">
                <div class="post-comment-nick"><span>${escapeHtml(c.user || '')}</span>${battleBtn}</div>
                <p class="post-comment-txt">${escapeHtml(c.text || '')}</p>
            </div>`;
        }).join('');
    }

    async function sendDetailComment() {
        if (_detailPostIdx < 0) return;
        var p = posts[_detailPostIdx];
        if (!p || p.dbId !== _detailPostDbId) return;
        var input = document.getElementById('pd-com-input');
        var text  = input ? input.value.trim() : '';
        if (!text) return;
        if (!currentUser) { showToast('⚠ 댓글은 로그인 후 작성할 수 있습니다'); return; }
        var nick    = getDisplayUsername();
        var comment = { user: nick, text: text.slice(0, 300) };
        p.comments.push(comment);
        if (input) input.value = '';
        await addCommentToDB(p.dbId, nick, text.slice(0, 300));
        save();
        _renderDetailComments(p.comments);
        var statsEl = document.getElementById('pd-stats');
        if (statsEl) statsEl.textContent = '🔥 ' + (p.likes || 0) + '  💬 ' + p.comments.length;
    }

    function likePostFromDetail() {
        if (_detailPostIdx < 0) return;
        likePost(_detailPostIdx);
        _syncDetailLikeBtn();
        var p = posts[_detailPostIdx];
        if (p) {
            var statsEl = document.getElementById('pd-stats');
            if (statsEl) statsEl.textContent = '🔥 ' + (p.likes || 0) + '  💬 ' + (p.comments || []).length;
        }
    }

    function _syncDetailLikeBtn() {
        var p   = (_detailPostIdx >= 0) ? posts[_detailPostIdx] : null;
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
        var p = posts[_detailPostIdx];
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
        var p = posts[_detailPostIdx];
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

    async function deleteOwnPost() {
        var p = posts[_detailPostIdx];
        if (!p || !currentUser || p.userId !== currentUser.id) return;
        if (!confirm('이 게시글을 삭제하시겠습니까?')) return;

        if (!sb) { showToast('⚠ 연결 오류'); return; }
        var res = await sb.from('posts')
            .delete()
            .eq('id', p.dbId)
            .eq('user_id', currentUser.id);
        if (res.error) { showToast('⚠ 삭제 실패: ' + res.error.message); return; }

        var idx = posts.indexOf(p);
        if (idx > -1) posts.splice(idx, 1);
        save();
        closePostDetail();
        renderFeed();
        showToast('🗑 게시글이 삭제되었습니다');
    }
