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
        renderFeed();
    }

    function setCommunityTime(t) {
        communityTimeFilter = t;
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

            var f1  = escapeHtml(fight.f1.name);
            var f2  = escapeHtml(fight.f2.name);
            var div = escapeHtml(fight.weight || fight.division || '');
            var fid = escapeHtml(fight.id);

            // Two-color bar gradient: left=red, right=blue
            var barGradient = 'linear-gradient(90deg,#e8000d ' + leftPct + '%,#2563eb ' + leftPct + '%)';
            var leftColor  = leftPct >= rightPct ? '#e8000d' : '#666';
            var rightColor = rightPct > leftPct  ? '#2563eb' : '#666';

            return `
            <div class="matchup-card ${tagCls === 'matchup-tag-main' ? 'card-main' : ''}" onclick="navigateTo('matchups'); setTimeout(function(){ var el=document.getElementById('card-${fid}'); if(el) el.scrollIntoView({behavior:'smooth',block:'center'}); },350);">
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
                    <div class="matchup-bar-fill" style="background:${barGradient}"></div>
                </div>
                <div class="matchup-pct-row">
                    <span style="color:${leftColor};font-weight:900;">${leftPct}%</span>
                    <span style="font-size:7px;color:#2a2a2a;letter-spacing:.05em;">커뮤니티 픽</span>
                    <span style="color:${rightColor};font-weight:900;">${rightPct}%</span>
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
            container.innerHTML = `<div style="padding:36px 20px;text-align:center;font-family:'Oswald',sans-serif;font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.1em;font-style:italic;">표시할 게시글이 없습니다</div>`;
            return;
        }

        var header = `
        <div class="post-list-head">
            <div>Type</div>
            <div>Title / Author</div>
            <div class="plh-stats">Stats</div>
            <div class="plh-date">Date</div>
            <div class="plh-act">Action</div>
        </div>`;

        var rows = filtered.map(function(p) {
            var origIdx = posts.indexOf(p);
            var belt    = escapeHtml(p.belt || 'White Belt');
            var author  = escapeHtml(p.author || 'UNKNOWN');
            var date    = escapeHtml(p.date || '');
            var rawTitle = p.title || '';
            var title   = escapeHtml(_stripCatPrefix(rawTitle));
            var isLiked = likedPostIds.has(p.dbId);
            var cntCom  = (p.comments || []).length;

            // Category tag
            var cat = _getPostCategory(rawTitle);
            var catDisplay = {
                analysis: { cls: 'cat-analysis', lbl: '🔥 분석' },
                fighter:  { cls: 'cat-fighter',  lbl: '🗣️ 파이터' },
                live:     { cls: 'cat-live',      lbl: '🔴 라이브' },
                news:     { cls: 'cat-news',      lbl: '📰 뉴스' },
                humor:    { cls: 'cat-humor',     lbl: '😂 유머' }
            };
            var tagCls, tagLbl;
            if (p.isPickShare) {
                tagCls = 'pick'; tagLbl = '🎯 픽';
            } else if (catDisplay[cat]) {
                tagCls = catDisplay[cat].cls; tagLbl = catDisplay[cat].lbl;
            } else {
                tagCls = 'post'; tagLbl = '✍️ 분석';
            }

            // Faction badge — 모든 유저 (p.faction = DB에서 JOIN한 faction 객체)
            var factionSrc = p.faction
                || (p.author === getDisplayUsername() && typeof currentFaction !== 'undefined' ? currentFaction : null);
            var factionBadge = (typeof getFactionBadge === 'function' && factionSrc)
                ? getFactionBadge(factionSrc) + ' '
                : '';

            return `
            <div class="post-row" id="post-row-${origIdx}" onclick="openPostDetail(${origIdx})">
                <div><span class="post-type-tag ${tagCls}">${tagLbl}</span></div>
                <div style="min-width:0;">
                    <div class="post-row-title">${title}</div>
                    <div class="post-row-author">${factionBadge}${author} · ${belt}</div>
                    <div class="post-row-mobile-meta">
                        <span>${date}</span>
                        <span>🔥 ${p.likes || 0}</span>
                        <span>💬 ${cntCom}</span>
                    </div>
                </div>
                <div class="post-row-stats">
                    <span class="${(p.likes || 0) > 0 ? 'stat-hot' : ''}">🔥 ${p.likes || 0}</span>
                    <span>💬 ${cntCom}</span>
                </div>
                <div class="post-row-date">${date}</div>
                <div class="post-row-act">
                    <button onclick="event.stopPropagation(); likePost(${origIdx});"
                        class="post-act-btn ${isLiked ? 'liked' : ''}" title="${isLiked ? '이미 추천함' : '추천'}">
                        ${isLiked ? '✅ 추천' : '🔥 추천'}
                    </button>
                </div>
            </div>`;
        }).join('');

        container.innerHTML = header + '<div>' + rows + '</div>';
    }

    function togglePostExpand(origIdx) { /* no-op: replaced by openPostDetail */ }

    var _communityMatchupsFetching = false;

    /* ── Main renderFeed ── */
    function renderFeed() {
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
            var battleBtn = (!isSelf && currentUser)
                ? `<button onclick="requestBattle('${safeAuthor}', event)"
                       style="font-family:'Oswald',sans-serif;font-size:8px;font-weight:900;font-style:italic;text-transform:uppercase;background:transparent;border:1px solid #222;color:#444;padding:2px 7px;border-radius:5px;cursor:pointer;letter-spacing:.05em;transition:color .12s,border-color .12s;"
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
            listEl.innerHTML = '<p style="font-size:10px;color:#333;font-style:italic;text-align:center;padding:12px 0;">첫 댓글을 남겨주세요</p>';
            return;
        }
        listEl.innerHTML = comments.map(function(c) {
            var isSelf = c.user === getDisplayUsername();
            var safeUser = escapeHtml(c.user || '').replace(/'/g, "\\'");
            var battleBtn = (!isSelf && currentUser)
                ? `<button onclick="requestBattle('${safeUser}', event)"
                       style="font-family:'Oswald',sans-serif;font-size:8px;font-weight:900;font-style:italic;text-transform:uppercase;background:transparent;border:1px solid #222;color:#444;padding:2px 7px;border-radius:5px;cursor:pointer;letter-spacing:.05em;transition:color .12s,border-color .12s;"
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
