/* ==============================
   COMMUNITY & SCORING LAYER
   (extracted from index.html – global functions, no import/export)
   의존성: state.js (posts, communityFilter, communitySortMode, communityTimeFilter, currentUser, state, likedPostIds, livePicks)
           storage.js (save)
           utils.js (escapeHtml, getDisplayUsername)
           index.html 내 함수들 (likePostInDB, toggleComArea, postCom, requestBattle, getActiveFights, navigateTo)
============================== */

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
        _setFilterActive('cf-', ['all','post','pick'], f);
        renderFeed();
    }

    function setCommunitySort(s) {
        communitySortMode = s;
        _setFilterActive('cs-', ['latest','recommend','hot'], s);
        renderFeed();
    }

    function setCommunityTime(t) {
        communityTimeFilter = t;
        _setFilterActive('ct-', ['all','day','week','month'], t);
        renderFeed();
    }

    function toggleWriter() { document.getElementById('write-panel').classList.toggle('hidden'); }

    /* ── Matchup Board ── */
    function renderMatchups(fights) {
        var container = document.getElementById('matchup-board');
        if (!container) return;
        if (!fights || fights.length === 0) { container.innerHTML = ''; return; }

        // 메인/코메인만 표시, 나머지는 카운트만
        var featured = fights.filter(function(f) {
            var t = (f.tag || '').toUpperCase();
            return t.includes('MAIN EVENT') || t.includes('CO-MAIN') || t.includes('CO MAIN');
        });
        var restCount = fights.length - featured.length;

        container.innerHTML = featured.map(function(fight) {
            // Live pick percentages
            var lp = (typeof livePicks !== 'undefined') && livePicks[fight.id];
            var leftPct = 50, rightPct = 50;
            if (lp && lp.total > 0) {
                leftPct  = Math.round((lp.left / lp.total) * 100);
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

            var f1  = escapeHtml(fight.f1.name);
            var f2  = escapeHtml(fight.f2.name);
            var div = escapeHtml(fight.weight || fight.division || '');
            var fid = escapeHtml(fight.id);

            return `
            <div class="matchup-card" onclick="navigateTo('matchups'); setTimeout(function(){ var el=document.getElementById('card-${fid}'); if(el) el.scrollIntoView({behavior:'smooth',block:'center'}); },350);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">
                    <span class="matchup-tag ${tagCls}">${escapeHtml(fight.tag || 'BOUT')}</span>
                    ${hasPick ? `<span style="font-family:'Oswald',sans-serif;font-size:8px;font-style:italic;font-weight:900;color:#e8000d;text-transform:uppercase;letter-spacing:.06em;">✓ PICKED</span>` : ''}
                </div>
                <div class="matchup-names">
                    <div class="matchup-fighter-name">${f1}</div>
                    <div class="matchup-vs-label">VS</div>
                    <div class="matchup-fighter-name right">${f2}</div>
                </div>
                <div class="matchup-bar-wrap">
                    <div class="matchup-bar-fill" style="width:${leftPct}%"></div>
                </div>
                <div class="matchup-pct-row">
                    <span class="${leftPct >= rightPct ? 'pct-hot' : ''}">${leftPct}%</span>
                    <span style="font-size:7px;color:#2a2a2a;letter-spacing:.05em;">커뮤니티 픽</span>
                    <span class="${rightPct > leftPct ? 'pct-hot' : ''}">${rightPct}%</span>
                </div>
                <div class="matchup-card-foot">
                    <span class="matchup-weight-lbl">${div}</span>
                    <button class="matchup-go-btn ${hasPick ? 'picked' : ''}" onclick="event.stopPropagation(); navigateTo('matchups');">
                        ${hasPick ? '✓ PICKED' : '→ PICK'}
                    </button>
                </div>
            </div>`;
        }).join('');

        // 나머지 경기 수가 있으면 "전체 대진표 보기" 버튼 추가
        if (restCount > 0) {
            container.innerHTML += `
            <div style="display:flex;align-items:center;justify-content:center;">
                <button onclick="navigateTo('matchups')"
                    style="font-family:'Oswald',sans-serif;font-size:10px;font-weight:900;font-style:italic;
                           text-transform:uppercase;letter-spacing:.1em;background:transparent;
                           border:1px solid #2a2a2a;color:#555;padding:10px 20px;border-radius:8px;
                           cursor:pointer;transition:all .15s;width:100%;"
                    onmouseover="this.style.borderColor='rgba(232,0,13,.4)';this.style.color='#e8000d';"
                    onmouseout="this.style.borderColor='#2a2a2a';this.style.color='#555';">
                    + ${restCount}경기 더 보기 → 전체 대진표
                </button>
            </div>`;
        }
    }

    /* ── Dense Post List ── */
    function renderPosts(filtered) {
        var container = document.getElementById('post-list');
        if (!container) return;

        if (!filtered || filtered.length === 0) {
            container.innerHTML = `<div style="padding:36px 20px;text-align:center;font-family:'Oswald',sans-serif;font-size:10px;color:#2e2e2e;text-transform:uppercase;letter-spacing:.1em;font-style:italic;">표시할 게시글이 없습니다</div>`;
            return;
        }

        var header = `
        <div class="post-list-head">
            <div>Type</div>
            <div>Title / Author</div>
            <div>Stats</div>
            <div class="plh-date">Date</div>
            <div class="plh-act">Action</div>
        </div>`;

        var rows = filtered.map(function(p) {
            var origIdx = posts.indexOf(p);
            var belt    = escapeHtml(p.belt || 'White Belt');
            var author  = escapeHtml(p.author || 'UNKNOWN');
            var date    = escapeHtml(p.date || '');
            var title   = escapeHtml(p.title || '');
            var content = escapeHtml(p.content || '');
            var tagCls  = p.isPickShare ? 'pick' : 'post';
            var tagLbl  = p.isPickShare ? '🎯 픽' : '✍️ 분석';
            var isLiked = likedPostIds.has(p.dbId);
            var cntCom  = (p.comments || []).length;

            // Faction badge for own posts
            var factionBadge = (typeof getFactionBadge === 'function'
                && p.author === getDisplayUsername()
                && typeof currentFaction !== 'undefined'
                && currentFaction)
                ? getFactionBadge(currentFaction) + ' '
                : '';

            // Comments HTML
            var commentsHtml = (p.comments || []).map(function(c) {
                var isSelf = c.user === getDisplayUsername();
                var battleBtn = (!isSelf && currentUser)
                    ? `<button onclick="requestBattle('${escapeHtml(c.user).replace(/'/g,"\\'")}', event)"
                           style="font-family:'Oswald',sans-serif;font-size:8px;font-weight:900;font-style:italic;text-transform:uppercase;background:transparent;border:1px solid #222;color:#444;padding:2px 7px;border-radius:5px;cursor:pointer;letter-spacing:.05em;transition:color .12s,border-color .12s;"
                           onmouseover="this.style.color='#e8000d';this.style.borderColor='rgba(232,0,13,.4)'"
                           onmouseout="this.style.color='#444';this.style.borderColor='#222'">⚡ 옥타곤</button>`
                    : '';
                return `
                <div class="post-comment-block">
                    <div class="post-comment-nick">
                        <span>${escapeHtml(c.user)}</span>
                        ${battleBtn}
                    </div>
                    <p class="post-comment-txt">${escapeHtml(c.text)}</p>
                </div>`;
            }).join('');

            return `
            <div class="post-row" id="post-row-${origIdx}" onclick="togglePostExpand(${origIdx})">
                <div><span class="post-type-tag ${tagCls}">${tagLbl}</span></div>
                <div style="min-width:0;">
                    <div class="post-row-title">${title}</div>
                    <div class="post-row-author">${factionBadge}${author} · ${belt}</div>
                </div>
                <div class="post-row-stats">
                    <span class="${(p.likes || 0) > 0 ? 'stat-hot' : ''}">🔥 ${p.likes || 0}</span>
                    <span>💬 ${cntCom}</span>
                </div>
                <div class="post-row-date">${date}</div>
                <div class="post-row-act">
                    <button onclick="event.stopPropagation(); likePost(${origIdx});"
                        class="post-act-btn ${isLiked ? 'liked' : ''}" title="${isLiked ? '이미 추천함' : '추천'}">
                        ${isLiked ? '✓' : '↑'} ${p.likes || 0}
                    </button>
                </div>
            </div>
            <div class="post-expand" id="post-expand-${origIdx}">
                <p class="post-expand-body">${content}</p>
                <div id="post-com-list-${origIdx}">${commentsHtml}</div>
                <div class="post-com-input-row">
                    <input type="text" id="com-in-${origIdx}" class="post-com-input" placeholder="의견을 남겨주세요...">
                    <button onclick="postCom(${origIdx})" class="post-com-send">SEND</button>
                </div>
            </div>`;
        }).join('');

        container.innerHTML = header + '<div>' + rows + '</div>';
    }

    function togglePostExpand(origIdx) {
        var expandEl = document.getElementById('post-expand-' + origIdx);
        var rowEl    = document.getElementById('post-row-'    + origIdx);
        if (!expandEl) return;
        var wasOpen = expandEl.classList.contains('open');
        // close all
        document.querySelectorAll('.post-expand.open').forEach(function(el) { el.classList.remove('open'); });
        document.querySelectorAll('.post-row.is-expanded').forEach(function(el) { el.classList.remove('is-expanded'); });
        if (!wasOpen) {
            expandEl.classList.add('open');
            if (rowEl) rowEl.classList.add('is-expanded');
        }
    }

    /* ── Main renderFeed ── */
    function renderFeed() {
        // 1. Matchup board
        if (typeof getActiveFights === 'function') {
            renderMatchups(getActiveFights());
        }

        // 2. Filter by type
        var filtered = posts.filter(function(p) {
            if (communityFilter === 'pick') return !!p.isPickShare;
            if (communityFilter === 'post') return !p.isPickShare;
            return true;
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
        if(pts > 10000) return { name: "Black", color: "#d20a0a", bg: "bg-ufcRed", text: "text-white" };
        if(pts > 5000)  return { name: "Brown", color: "#92400e", bg: "bg-yellow-800", text: "text-white" };
        if(pts > 2000)  return { name: "Purple", color: "#7c3aed", bg: "bg-purple-700", text: "text-white" };
        if(pts > 1000)  return { name: "Blue", color: "#2563eb", bg: "bg-blue-600", text: "text-white" };
        return { name: "White", color: "#ffffff", bg: "bg-white", text: "text-black" };
    }
