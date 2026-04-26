/* ==============================
   SUPABASE API LAYER
   (extracted from index.html – global functions, no import/export)
   의존성: state.js (sb, currentUser, adminUnlocked, cachedNews, newsFetched, posts, factions, currentFaction)
           storage.js (save)
           utils.js (showToast, getNickname, updateNicknameDisplay)
           index.html 내 함수들 (renderNewsGrid, renderFeed,
           initOctagonListener, loadAllEventPickCounts, loadMyEventPicks,
           createUserProfile, refreshUI, openFactionSelectModal, renderFactionRanking)
============================== */

// ── Faction API ──────────────────────────────────────
function loadFactions() {
    if (!sb) return;
    sb.from('factions')
        .select('*')
        .order('total_score', { ascending: false })
        .then(function(res) {
            if (res.error || !res.data) return;
            factions = res.data;
            if (typeof renderFactionRanking === 'function') renderFactionRanking();
        });
}

function setUserFaction(factionId) {
    if (!sb || !currentUser) return Promise.resolve({ ok: false });
    return sb.from('users')
        .update({ faction_id: factionId })
        .eq('id', currentUser.id)
        .then(function(res) {
            if (res.error) return { ok: false };
            // 로컬 currentFaction 업데이트
            currentFaction = factions.find(function(f) { return f.id === factionId; }) || null;
            if (typeof updateFactionBadgeUI === 'function') updateFactionBadgeUI();
            return { ok: true };
        });
}

// [A안] posts + post_comments + 작성자 faction JOIN으로 로드 + 내 좋아요 목록 로드
function loadPostsFromDB() {
    if (!sb) return;
    // posts + comments + users(faction) 로드
    sb.from('posts')
        .select('*, post_comments(id, user_nick, content, created_at), users(factions(id, name, emoji_icon))')
        .order('created_at', { ascending: false })
        .limit(100)
        .then(function(res) {
            if (res.error || !res.data) return;
            posts = res.data.map(function(r) {
                var comments = (r.post_comments || [])
                    .sort(function(a, b) { return new Date(a.created_at) - new Date(b.created_at); })
                    .map(function(c) { return { user: c.user_nick, text: c.content }; });
                var faction = (r.users && r.users.factions) ? r.users.factions : null;
                return {
                    id: r.id,
                    dbId: r.id,
                    author: r.nickname || 'UNKNOWN',
                    title: r.title || '',
                    content: r.content || '',
                    likes: r.likes || 0,
                    date: (r.created_at || '').slice(0, 10).replace(/-/g, '.'),
                    comments: comments,
                    belt: r.belt || 'White Belt',
                    isPickShare: r.is_pick_share || false,
                    faction: faction,
                };
            });
            save();
            // 로그인 상태면 내 좋아요 목록도 로드
            if (currentUser) {
                sb.from('post_likes')
                    .select('post_id')
                    .eq('user_id', currentUser.id)
                    .then(function(likesRes) {
                        likedPostIds = new Set((likesRes.data || []).map(function(l) { return l.post_id; }));
                        renderFeed();
                    });
            } else {
                renderFeed();
            }
        });
}

    function loadNewsFromDB() {
        if (!sb) {
            cachedNews = [];
            newsFetched = true;
            renderNewsGrid();
            return;
        }
        sb.from('news_cache')
            .select('*')
            .order('published_at', { ascending: false })
            .limit(30)
            .then(async function(res) {
                var loading = document.getElementById('news-loading');
                if (loading) loading.classList.add('hidden');
                if (res.data && res.data.length > 0) {
                    var mapped = res.data.map(function(n) {
                        var d = new Date(n.published_at);
                        return {
                            title: n.title,
                            summary: n.summary,
                            url: n.url,
                            image_url: n.image_url,
                            category: n.category,
                            source: n.source,
                            date: d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getDate()).padStart(2,'0')
                        };
                    });
                    // 원문 먼저 즉시 렌더링 (논블로킹)
                    cachedNews = mapped;
                    newsFetched = true;
                    renderNewsGrid();
                    if (typeof renderHomeNews === 'function') renderHomeNews();
                    // Gemini 번역은 백그라운드에서 (5초 timeout)
                    if (typeof translateNewsWithGemini === 'function') {
                        var translatePromise = Promise.race([
                            translateNewsWithGemini(mapped),
                            new Promise(function(resolve) { setTimeout(function() { resolve(null); }, 5000); })
                        ]);
                        translatePromise.then(function(translated) {
                            if (translated) {
                                cachedNews = translated;
                                renderNewsGrid();
                                if (typeof renderHomeNews === 'function') renderHomeNews();
                            }
                        });
                    }
                } else {
                    cachedNews = [];
                    newsFetched = true;
                    renderNewsGrid();
                    if (typeof renderHomeNews === 'function') renderHomeNews();
                }
            });
    }

    function initSupabase() {
        try {
            sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            loadFactions(); // 집단 목록은 로그인 여부와 무관하게 즉시 로드
            // 로그인 상태 변경 감지
            sb.auth.onAuthStateChange(function(event, session) {
                // TOKEN_REFRESHED, USER_UPDATED 등 불필요한 이벤트는 무시
                if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return;

                if (session && session.user) {
                    currentUser = session.user;
                    loadUserFromDB(session.user.id);
                    document.getElementById('auth-modal').classList.add('hidden');
                    updateAuthUI();
                    setTimeout(initOctagonListener, 600);
                } else {
                    // 로그아웃: 모든 오버레이 닫기 + 어드민 권한 초기화
                    currentUser = null;
                    adminUnlocked = false;
                    if (typeof closeFactionSelectModal === 'function') closeFactionSelectModal();
                    // octagon-invite-modal(z-700)도 닫기 — auth-modal(z-600)보다 위에 있어서 차단
                    var octModal = document.getElementById('octagon-invite-modal');
                    if (octModal) octModal.classList.add('hidden');
                    updateAuthUI();
                }
            });
            // 현재 세션 확인 (onAuthStateChange INITIAL_SESSION 이벤트가 이미 처리하므로
            // 여기서는 비로그인 상태일 때 auth-modal 표시만 담당)
            sb.auth.getSession().then(function(res) {
                if (!res.data || !res.data.session) {
                    adminUnlocked = false;
                    // 로그인 안 된 상태 — 모달 표시
                    setTimeout(function() {
                        document.getElementById('auth-modal').classList.remove('hidden');
                    }, 600);
                }
                // 로그인 상태는 onAuthStateChange(INITIAL_SESSION)이 이미 처리
            });
        } catch(e) {
            console.warn('Supabase init failed:', e);
        }
    }

    function updateAuthUI() {
        var nickname = currentUser
            ? (getNickname() || currentUser.email.split('@')[0])
            : getNickname() || '비로그인';
        var el = document.getElementById('profile-nickname-display');
        if (el) el.textContent = nickname;

        var isLoggedIn = !!currentUser;

        // 데스크탑 버튼
        var navLogout = document.getElementById('nav-logout-btn');
        var navLogin  = document.getElementById('nav-login-btn');
        if (navLogout) navLogout.classList.toggle('hidden', !isLoggedIn);
        if (navLogin)  navLogin.classList.toggle('hidden', isLoggedIn);

        // 모바일 버튼
        var mobLogout = document.getElementById('mob-logout-btn');
        var mobLogin  = document.getElementById('mob-login-btn');
        if (mobLogout) mobLogout.classList.toggle('hidden', !isLoggedIn);
        if (mobLogin)  mobLogin.classList.toggle('hidden', isLoggedIn);

        // 프로필 내 버튼
        var profileLogout = document.getElementById('logout-btn');
        if (profileLogout) profileLogout.classList.toggle('hidden', !isLoggedIn);

        // 네비 포인트 업데이트
        var pts = state.points.toLocaleString() + ' P';
        var navPts = document.getElementById('nav-points');
        var navPtsMob = document.getElementById('nav-points-mobile');
        if (navPts) navPts.textContent = pts;
        if (navPtsMob) navPtsMob.textContent = pts;
    }

    function loadUserFromDB(userId) {
        if (!sb) return;

        // 계정 전환 시 어드민 권한 즉시 초기화 (비동기 콜백 전에)
        adminUnlocked = false;

        // 다른 유저 로그인 시 로컬 상태 초기화
        var storedUserId = localStorage.getItem('picktagon_current_user_id');
        if (storedUserId && storedUserId !== userId) {
            state = { points: 1000, total: 0, success: 0, history: [], pendings: {}, settled: {} };
            posts = [];
            save();
        }
        localStorage.setItem('picktagon_current_user_id', userId);

        // 포스트는 계정 무관하게 항상 DB에서 로드 (공유 커뮤니티)
        loadPostsFromDB();
        // 커뮤니티 픽 집계 로드
        loadAllEventPickCounts();
        loadMyEventPicks();

        var requestedUserId = userId; // stale 콜백 감지용
        sb.from('users').select('*, factions(id, name, emoji_icon)').eq('id', userId).single()
        .then(function(res) {
            // 비동기 콜백 도달 시점에 다른 유저로 전환됐으면 무시
            if (!currentUser || currentUser.id !== requestedUserId) return;

            if (res.data) {
                state.points = res.data.points || 1000;
                state.total = res.data.total_picks || 0;
                state.success = res.data.success_picks || 0;
                if (res.data.nickname) {
                    localStorage.setItem('picktagon_nickname', res.data.nickname);
                }
                // is_admin 체크 (currentUser null-safe)
                var userEmail = (currentUser && currentUser.email) ? currentUser.email : '';
                adminUnlocked = res.data.is_admin === true || userEmail === 'joonbyoung@naver.com';
                // faction 로드
                currentFaction = res.data.factions || null;
                save();
                refreshUI();
                updateNicknameDisplay();
                updateAuthUI();
                if (typeof updateFactionBadgeUI === 'function') updateFactionBadgeUI();
                showToast('✅ ' + (res.data.nickname || '유저') + ' 님 환영해요!');
                // 집단 미선택 유저 → 세션당 1회만 모달 표시 (매 페이지 로드마다 방해 방지)
                if (!res.data.faction_id && typeof openFactionSelectModal === 'function'
                    && !sessionStorage.getItem('factionModalDismissed')) {
                    setTimeout(function() {
                        if (currentUser && currentUser.id === requestedUserId) openFactionSelectModal();
                    }, 800);
                }
            } else {
                // 첫 로그인 → 프로필 생성 (currentUser null-safe)
                var userEmail = (currentUser && currentUser.email) ? currentUser.email : '';
                var nick = getNickname() || (userEmail ? userEmail.split('@')[0] : 'PLAYER');
                createUserProfile(userId, nick);
            }
        });
    }

// ── DB 매치업 패칭 (Matchups 탭 진입 시 호출) ─────────────────────────
async function fetchUpcomingMatchups() {
    if (typeof sb === 'undefined' || !sb) return;
    try {
        // 전체 이벤트 1회 쿼리 (sidebar + upcoming 동시 처리)
        var allEvRes = await sb.from('events')
            .select('id, title, event_date, status')
            .order('event_date', { ascending: true });
        if (allEvRes.error || !allEvRes.data) {
            if (typeof renderEventSidebar === 'function') renderEventSidebar();
            if (typeof renderFightCards === 'function') renderFightCards();
            return;
        }
        if (typeof _sidebarEventsCache !== 'undefined') {
            _sidebarEventsCache = allEvRes.data;
        }
        var event = allEvRes.data.find(function(e) { return e.status === 'upcoming'; });
        if (!event) {
            if (typeof renderEventSidebar === 'function') renderEventSidebar();
            if (typeof renderFightCards === 'function') renderFightCards();
            return;
        }

        // 이벤트 헤더 DB에서 자동 반영
        if (event.title) {
            var nameEl = document.getElementById('event-name-label');
            if (nameEl) nameEl.textContent = event.title;
        }
        if (event.event_date) {
            var dateEl = document.getElementById('event-date-label');
            if (dateEl) {
                var d = new Date(event.event_date);
                var formatted = d.toLocaleDateString('ko-KR', {year:'numeric', month:'long', day:'numeric', weekday:'short'}).toUpperCase();
                dateEl.textContent = formatted;
            }
        }

        var mRes = await sb.from('matchups')
            .select('id, event_id, red_fighter_name, blue_fighter_name, red_image_url, blue_image_url, weight_class, card_segment, sort_order, is_main_event, left_bias, result_status, result_winner, result_winner_side, result_method, result_round, result_time')
            .eq('event_id', event.id)
            .order('sort_order', { ascending: true });
        if (mRes.error || !mRes.data || !mRes.data.length) {
            if (typeof renderEventSidebar === 'function') renderEventSidebar();
            if (typeof renderFightCards === 'function') renderFightCards();
            return;
        }

        // 메인카드 순서별 태그 부여 (sort_order 기준)
        var mainCardRank = 0;
        _dbMatchups = mRes.data.map(function(m) {
            var isMainCard = m.card_segment === 'main';
            var tag = '';
            if (isMainCard) {
                mainCardRank++;
                if (mainCardRank === 1) tag = 'MAIN EVENT';
                else if (mainCardRank === 2) tag = 'CO-MAIN EVENT';
            } else {
                tag = 'PRELIMS';
            }
            return {
                id: m.id,
                section: isMainCard ? 'main' : 'prelim',
                sectionLabel: isMainCard ? '메인 카드' : '프렐림',
                sectionTime: '',
                tag: tag,
                division: m.weight_class || '',
                rounds: isMainCard ? 5 : 3,
                leftBias: Number(m.left_bias) || 0.5,
                _eventId: event.id,
                _eventTitle: event.title || '',
                _fromDB: true,
                _resultStatus: m.result_status || 'scheduled',
                _resultWinner: m.result_winner || null,
                _resultWinnerSide: m.result_winner_side || null,
                _resultMethod: m.result_method || null,
                _resultRound: m.result_round || null,
                f1: { name: m.red_fighter_name || '?', nameEn: '', record: '', odds: null, recent: [], stats: [], imgUrl: m.red_image_url || '' },
                f2: { name: m.blue_fighter_name || '?', nameEn: '', record: '', odds: null, recent: [], stats: [], imgUrl: m.blue_image_url || '' },
            };
        });

        if (typeof renderFightCards === 'function') renderFightCards();
        if (typeof renderEventSidebar === 'function') renderEventSidebar();
        // 로그인 유저이면 DB에서 픽 상태 복원 (서버 정산 결과 반영)
        if (typeof currentUser !== 'undefined' && currentUser && typeof loadUserPicksFromDB === 'function') {
            loadUserPicksFromDB();
        }
    } catch(e) {
        console.warn('[fetchUpcomingMatchups]', e);
    }
}

// ── 현재 이벤트의 픽 상태를 DB에서 복원 ─────────────────────────────────
// 서버 정산 후 state.pendings/settled를 DB picks 테이블 기준으로 재구성.
// 로그인 시 + 결과 입력 후 호출.
async function loadUserPicksFromDB() {
    if (!sb || typeof currentUser === 'undefined' || !currentUser) return;
    try {
        var activeFights = (typeof getActiveFights === 'function') ? getActiveFights() : [];
        if (!activeFights.length) return;
        var activeFightIds = activeFights.map(function(f) { return f.id; });

        var res = await sb.from('picks')
            .select('fight_id, pick_name, odds, bet_cost, payout, is_upset, status, actual_winner, actual_method, method, predicted_round, predicted_side, settled_at')
            .eq('user_id', currentUser.id)
            .in('fight_id', activeFightIds);

        if (!res.data || !res.data.length) return;

        var newPendings = {};
        var newSettled  = {};

        res.data.forEach(function(pick) {
            var fid = pick.fight_id;
            if (pick.status === 'pending') {
                var side = pick.predicted_side === 'red' ? 'left' : 'right';
                newPendings[fid] = {
                    side: side,
                    pick: pick.pick_name,
                    payout: pick.payout || 0,
                    fightId: fid,
                    betCost: pick.bet_cost || (typeof BET_COST !== 'undefined' ? BET_COST : 100),
                    odds: pick.odds || 1.5,
                    isUpset: pick.is_upset || false,
                    method: pick.method || null,
                    methodBonus: 0
                };
            } else if (pick.status === 'win' || pick.status === 'lose') {
                newSettled[fid] = {
                    result: pick.status === 'win' ? 'WIN' : 'LOSE',
                    actualWinner: pick.actual_winner || '',
                    actualMethod: pick.actual_method || '',
                    payout: pick.payout || 0,
                    pick: pick.pick_name,
                    resolvedAt: pick.settled_at || new Date().toISOString()
                };
            }
        });

        // 현재 이벤트의 fight ID 범위에서만 교체
        activeFightIds.forEach(function(fid) {
            delete state.pendings[fid];
            delete state.settled[fid];
        });
        Object.assign(state.pendings, newPendings);
        Object.assign(state.settled,  newSettled);
        save();
        if (typeof updateAllFightCards === 'function') updateAllFightCards();
    } catch(e) {
        console.warn('[loadUserPicksFromDB]', e);
    }
}
