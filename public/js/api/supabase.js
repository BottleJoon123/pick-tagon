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
    sb.rpc('get_faction_leaderboard')
        .then(function(res) {
            if (!res.error && res.data) {
                factions = res.data.map(function(r) {
                    return {
                        id:                      r.faction_id,
                        name:                    r.faction_name,
                        emoji_icon:              r.emoji_icon,
                        representative_fighters: r.representative_fighters,
                        total_score:             r.total_win_points,  // 기존 UI 호환
                        rank:                    r.rank,
                        member_count:            r.member_count,
                        total_win_points:        r.total_win_points,
                        win_picks:               r.win_picks,
                        total_picks:             r.total_picks,
                        accuracy:                r.accuracy
                    };
                });
                // P3: 집단 데이터 갱신 시 멤버 캐시 무효화 (stale 방지)
                factionMemberRankings = {};
                if (selectedFactionRankingId) loadFactionMemberRankings(selectedFactionRankingId);
            }
            if (typeof renderFactionRanking === 'function') renderFactionRanking();
        });
}

function loadFactionMemberRankings(factionId) {
    if (!sb || !factionId) return;
    sb.rpc('get_faction_member_rankings', { p_faction_id: factionId })
        .then(function(res) {
            factionMemberRankings[factionId] = (!res.error && res.data) ? res.data : [];
            if (selectedFactionRankingId === factionId && typeof renderFactionRanking === 'function') {
                renderFactionRanking();
            }
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
// 공개 피드 강제 새로고침. Promise(성공 true) 반환. 최신 seq+auth key 응답만 posts/likedPostIds/DOM에 적용
// → 계정 A의 늦은 응답이 B/anon 상태를 덮지 못함. force 호출은 seq를 증가시켜 이전 in-flight를 무효화한다.
function _postsAuthKey() { return (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : 'anon'; }
var _postsLoadedFor = null, _postsInflightFor = null, _postsInflightPromise = null, _postsSeq = 0;
function loadPostsFromDB() {
    if (!sb) return Promise.resolve(false);
    var mySeq = ++_postsSeq;                  // 이전 in-flight 응답 무효화(seq)
    var myKey = _postsAuthKey();
    // posts + comments + users(faction) 로드
    return sb.from('posts')
        // users embed must be disambiguated: C3-5 added posts.deleted_by FK to users,
        // so PostgREST sees two posts→users relationships. Pin the author FK explicitly.
        .select('*, post_comments(id, user_id, user_nick, content, created_at, parent_comment_id), users!posts_user_id_fkey(nickname, factions(id, name, emoji_icon))')
        .is('deleted_at', null)                  // C3-5: exclude soft-deleted posts
        .is('post_comments.deleted_at', null)    // C3-5: exclude soft-deleted comments (embedded filter)
        .order('created_at', { ascending: false })
        .limit(100)
        .then(function(res) {
            if (mySeq !== _postsSeq || myKey !== _postsAuthKey()) return false;   // 늦은/전환 응답 폐기
            if (res.error || !res.data) return false;
            var mapped = res.data.map(function(r) {
                var comments = (r.post_comments || [])
                    .sort(function(a, b) { return new Date(a.created_at) - new Date(b.created_at); })
                    .map(function(c) {
                        // 기본은 user_nick snapshot. 본인(user_id) 댓글이면 현재 닉네임으로 표시.
                        var displayUser = c.user_nick;
                        if (c.user_id && typeof currentUser !== 'undefined' && currentUser
                            && c.user_id === currentUser.id && typeof getDisplayUsername === 'function') {
                            displayUser = getDisplayUsername() || c.user_nick;
                        }
                        return { user: displayUser, userId: c.user_id || null, text: c.content, commentId: c.id, parentCommentId: c.parent_comment_id || null };
                    });
                var faction = (r.users && r.users.factions) ? r.users.factions : null;
                return {
                    id: r.id,
                    dbId: r.id,
                    userId: r.user_id,
                    author: (r.users && r.users.nickname) || r.nickname || 'UNKNOWN',
                    title: r.title || '',
                    content: r.content || '',
                    likes: r.likes || 0,
                    date: (r.created_at || '').slice(0, 10).replace(/-/g, '.'),
                    comments: comments,
                    belt: r.belt || 'White Belt',
                    isPickShare: r.is_pick_share || false,
                    faction: faction,
                    viewCount: r.view_count != null ? r.view_count : 0,
                    isPinned: r.is_pinned === true,
                    category: r.category || 'general',
                };
            });
            // 로그인: likes까지 받은 뒤 posts+likes 원자 적용(성공 처리). anon: 즉시 적용.
            if (typeof currentUser !== 'undefined' && currentUser && currentUser.id === myKey) {
                return sb.from('post_likes').select('post_id').eq('user_id', myKey)
                    .then(function(likesRes) {
                        if (mySeq !== _postsSeq || myKey !== _postsAuthKey()) return false;   // 재확인(전환 역전 방지)
                        posts = mapped; save();
                        likedPostIds = new Set((likesRes.data || []).map(function(l) { return l.post_id; }));
                        _postsLoadedFor = myKey;
                        renderFeed();
                        return true;
                    })
                    .catch(function() { return false; });
            }
            if (mySeq !== _postsSeq || myKey !== _postsAuthKey()) return false;
            posts = mapped; save();
            likedPostIds = new Set();          // anon → 좋아요 없음(이전 계정 잔상 없음)
            _postsLoadedFor = myKey;
            renderFeed();
            return true;
        });
}

// ── (perf) 공개 피드 lazy 로드 계층(auth-key 기준) ──────────────────────
// 홈 부팅·홈·타 탭에서는 조회하지 않고, community 최초 진입/계정 변경 시에만 현재 key로 1회 조회.
// 동일 key 동시 ensure는 Promise 1개 공유. 성공만 loaded. 실패 시 다음 진입 재시도.
function arePostsLoaded() { return _postsLoadedFor === _postsAuthKey(); }
function ensurePostsLoaded() {
    var key = _postsAuthKey();
    if (_postsLoadedFor === key) return;                            // 현재 key로 이미 로드 → skip(재진입 중복 0)
    if (_postsInflightFor === key && _postsInflightPromise) return; // 동일 key 로딩 중 → Promise 공유
    _postsInflightFor = key;
    var p = loadPostsFromDB();                                      // seq/key는 loadPostsFromDB 내부에서 캡처
    if (!p || typeof p.then !== 'function') { _postsInflightFor = null; return; }
    _postsInflightPromise = p.then(function() {                     // 성공 시 _postsLoadedFor는 loadPostsFromDB가 기록(성공만).
        if (_postsInflightFor === key) { _postsInflightFor = null; _postsInflightPromise = null; }
    }).catch(function() {
        if (_postsInflightFor === key) { _postsInflightFor = null; _postsInflightPromise = null; }
    });
}
// 로그인/로그아웃/계정 전환 시 호출 — lazy 캐시 무효화 + 진행 중 응답 무효화(seq) + 이전 계정 좋아요 즉시 제거.
function invalidatePostsCache() {
    _postsLoadedFor = null; _postsInflightFor = null; _postsInflightPromise = null;
    _postsSeq++;                                    // 진행 중 응답 폐기(늦은 응답 역전 방지)
    likedPostIds = new Set();                       // 이전 계정 좋아요 잔상 즉시 제거
}
// auth 확정/변경 반영 — 현재 화면이 community일 때만 현재 key로 재조회(홈/타 탭은 posts 조회 금지).
function _syncPostsForAuth() {
    if (_postsLoadedFor === _postsAuthKey()) return;
    if (typeof _currentPage !== 'undefined' && _currentPage === 'community') ensurePostsLoaded();
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
                            // [뉴스 1.5차] 신뢰 가능한 원본 발행시각 보존 → 상대시간 정확도 + dedupe 대표선택 tiebreak.
                            //   (translateNewsWithGemini 가 Object.assign spread 로 유지)
                            published_at: n.published_at,
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

    // hash/search/href 전체에서 type=recovery 감지. url 인자: createClient 전 저장한 초기 URL
    function isPasswordRecoveryRedirect(url) {
        var s = url || (window.location.href || '');
        // type=signup은 password recovery가 아님
        if (s.indexOf('type=signup') !== -1) return false;
        // type=recovery 없으면 false
        if (s.indexOf('type=recovery') === -1) return false;
        // 토큰 종류 중 하나라도 있으면 true (implicit: access_token, PKCE: code=)
        return s.indexOf('access_token') !== -1
            || s.indexOf('refresh_token') !== -1
            || s.indexOf('code=') !== -1;
    }

    function initSupabase() {
        try {
            // Supabase createClient가 URL hash를 소비하기 전에 초기 URL 저장 + recovery 판정
            var _initialAuthUrl = window.__picktagonInitialAuthUrl || window.location.href || '';
            window.__picktagonInitialAuthUrl = _initialAuthUrl;
            window.__picktagonRecoveryMode = isPasswordRecoveryRedirect(_initialAuthUrl);

            sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

            loadFactions(); // 집단 목록은 로그인 여부와 무관하게 즉시 로드
            // 로그인 상태 변경 감지
            sb.auth.onAuthStateChange(function(event, session) {
                // 비밀번호 재설정 — event 방식 (guard로 중복 방지)
                if (event === 'PASSWORD_RECOVERY') {
                    if (session && session.user) currentUser = session.user;
                    if (!window.__picktagonRecoveryModalOpened) {
                        window.__picktagonRecoveryModalOpened = true;
                        if (typeof openPasswordUpdateModal === 'function') openPasswordUpdateModal();
                    }
                    return;
                }
                // USER_UPDATED: currentUser 최신화만 (loadUserFromDB 재호출 없음)
                if (event === 'USER_UPDATED') {
                    if (session && session.user && currentUser && session.user.id === currentUser.id) {
                        currentUser = session.user;
                    }
                    return;
                }
                // TOKEN_REFRESHED 등 나머지 불필요한 이벤트는 무시
                if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return;

                // recovery hash 감지 fallback: INITIAL_SESSION/SIGNED_IN에도 modal 표시
                if (window.__picktagonRecoveryMode && session && session.user
                        && !window.__picktagonRecoveryModalOpened) {
                    currentUser = session.user;
                    window.__picktagonRecoveryModalOpened = true;
                    if (typeof openPasswordUpdateModal === 'function') openPasswordUpdateModal();
                    return;
                }

                if (session && session.user) {
                    currentUser = session.user;
                    // 아카이브 '내 픽 결과' 리캡 캐시 무효화 — 이전 계정 리캡 제거 + (아카이브 표시 중이면) 새 계정 재로드
                    if (typeof window.invalidateArchiveRecap === 'function') window.invalidateArchiveRecap();
                    // [perf/race] 실제 로그인/계정 전환(SIGNED_IN) → posts lazy 캐시·likedPostIds 즉시 무효화(이전 계정 잔상 제거).
                    //  세션 복원(INITIAL_SESSION)은 기준 상태라 무효화하지 않음(진행 중 로드 불필요 폐기 방지).
                    if (event === 'SIGNED_IN' && typeof invalidatePostsCache === 'function') invalidatePostsCache();
                    // SIGNED_IN = 실제 로그인 → 환영 토스트 표시
                    // INITIAL_SESSION = 세션 복원 (페이지 리로드) → 토스트 생략
                    loadUserFromDB(session.user.id, event === 'SIGNED_IN');
                    // [perf] posts는 홈/타 탭에서 조회 금지 — community 화면일 때만 현재 key로 재조회(신규 로그인 홈 posts 0).
                    if (typeof _syncPostsForAuth === 'function') _syncPostsForAuth();
                    document.getElementById('auth-modal').classList.add('hidden');
                    updateAuthUI();
                    if (typeof isBattleFeatureEnabled === 'function' && isBattleFeatureEnabled()) {
                        setTimeout(initOctagonListener, 600);
                    }
                } else {
                    // 로그아웃: 모든 오버레이 닫기 + 어드민 권한 초기화
                    currentUser = null;
                    adminUnlocked = false;
                    // canonical 적중률 캐시 초기화 — 이전 계정 통계가 다음 로그인 사용자에게 혼입 방지
                    if (typeof invalidateCurrentUserStats === 'function') invalidateCurrentUserStats();
                    // 사용자 전용 상태 초기화 — 로그아웃 후 이전 계정의 MY PICK/포인트/픽집계가 남거나
                    // 다음 로그인 사용자에게 혼입되지 않도록. (베팅은 로그인 필수라 비로그인 로컬 픽은 없음)
                    if (typeof state !== 'undefined') {
                        state = { points: 1000, total: 0, success: 0, history: [], pendings: {}, settled: {} };
                        if (typeof save === 'function') save();
                    }
                    if (typeof window.resetUserEventPicks === 'function') window.resetUserEventPicks();
                    // [perf] 공개 픽 비율은 matchups 화면에서만 표시 → 현재 화면이 matchups일 때만 서버 집계 복원.
                    // (홈/기타 화면의 로그아웃·비로그인 부팅에서 불필요한 get_event_pick_ratios 제거. matchups 진입 시 fetchUpcomingMatchups가 로드.)
                    // resetUserEventPicks가 바를 중립(0%)으로 먼저 갱신했으므로, 비율 응답 도착 시 정확 비율로 덮어쓴다.
                    if (typeof loadAllEventPickCounts === 'function'
                        && typeof _currentPage !== 'undefined' && _currentPage === 'matchups') {
                        loadAllEventPickCounts();
                    }
                    // [perf/race] 로그아웃(SIGNED_OUT) → posts lazy 캐시·likedPostIds 무효화. 비로그인 부팅(INITIAL_SESSION)은 기준 상태라 무효화 안 함.
                    if (event === 'SIGNED_OUT' && typeof invalidatePostsCache === 'function') invalidatePostsCache();
                    // 홈/타 탭에서는 posts 조회 금지 — community(로그아웃 화면)일 때만 anon 피드 재조회.
                    if (typeof _syncPostsForAuth === 'function') _syncPostsForAuth();
                    if (typeof closeFactionSelectModal === 'function') closeFactionSelectModal();
                    // octagon-invite-modal(z-700)도 닫기 — auth-modal(z-600)보다 위에 있어서 차단
                    var octModal = document.getElementById('octagon-invite-modal');
                    if (octModal) octModal.classList.add('hidden');
                    updateAuthUI();
                    // MY PICK 하이라이트/픽바를 비로그인 기본값으로 재렌더 (state 초기화 반영)
                    if (typeof updateAllFightCards === 'function') updateAllFightCards();
                    // [로그인 UX] 비명시적 SIGNED_OUT(세션 만료·타 탭 로그아웃) 정리 — 개인 profile 화면이었다면 공개 home으로.
                    //   auth-modal/Turnstile 자동 표시 없음(단순 화면 전환). INITIAL_SESSION(비로그인 부팅)에는 적용 안 함(불필요한 홈 이동 방지).
                    //   명시적 logoutUser도 profile→home을 수행 → 먼저 실행된 쪽이 home으로 옮기고 나머지는 _currentPage 검사로 skip(history 중복 push 0).
                    if (event === 'SIGNED_OUT' && typeof _currentPage !== 'undefined' && _currentPage === 'profile'
                        && typeof navigateTo === 'function') {
                        navigateTo('home');
                    }
                }
                // [로그인 UX] auth 확정 신호 — profile 등 인증 필요 화면이 localStorage 토큰 추정 없이
                //   공식 INITIAL_SESSION/SIGNED_* 결과로만 해소되게 한다(session/guest 처리 완료 후 set).
                //   보류된 profile 요청은 resolver가 정확히 1회 소비. SIGNED_OUT 자체로 자동 모달을 열지 않음
                //   (resolver는 pending이 있을 때만 동작하고, 픽/포인트 write 자동 재실행은 없음).
                if (typeof window !== 'undefined') {
                    window.__picktagonAuthReady = true;
                    if (typeof window.__picktagonResolvePendingProfile === 'function') window.__picktagonResolvePendingProfile();
                }
            });
            // 현재 세션 확인 — recovery hash fallback + 비로그인 auth-modal 표시
            sb.auth.getSession().then(function(res) {
                // Fallback: recovery hash 있고 세션 존재하는데 이벤트 경로에서 modal이 안 열렸으면 표시
                if (window.__picktagonRecoveryMode && res.data && res.data.session
                        && !window.__picktagonRecoveryModalOpened) {
                    window.__picktagonRecoveryModalOpened = true;
                    currentUser = res.data.session.user;
                    setTimeout(function() {
                        if (typeof openPasswordUpdateModal === 'function') openPasswordUpdateModal();
                    }, 200);
                    return;
                }
                if (!res.data || !res.data.session) {
                    adminUnlocked = false;
                    // [로그인 UX 완화] 첫 방문 자동 auth-modal(600ms hard gate) 제거 — 비로그인 공개 탐색 허용.
                    //   로그인은 실제 인증 필요 행동(픽 저장/변경·글·댓글·좋아요·프로필·관리자) 시점에만 openAuthModal()로 유도.
                    //   guest 초기화는 onAuthStateChange(INITIAL_SESSION) else-branch가 이미 처리. 서버 RLS/RPC 권한은 불변.
                    //   recovery/signup/auth callback·관리자 가드·명시적 로그인 버튼은 각자 경로로 그대로 동작.
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
        var profileResetPw = document.getElementById('profile-reset-pw-btn');
        if (profileResetPw) profileResetPw.classList.toggle('hidden', !isLoggedIn);

        // 네비 포인트 업데이트
        var pts = state.points.toLocaleString() + ' P';
        var navPts = document.getElementById('nav-points');
        var navPtsMob = document.getElementById('nav-points-mobile');
        if (navPts) navPts.textContent = pts;
        if (navPtsMob) navPtsMob.textContent = pts;

        // admin nav 표시/숨김 — adminUnlocked는 loadUserFromDB 콜백에서 확정됨
        var navAdmin = document.getElementById('nav-admin');
        var mobNavAdmin = document.getElementById('mob-nav-admin');
        if (navAdmin) navAdmin.classList.toggle('hidden', !adminUnlocked);
        if (mobNavAdmin) mobNavAdmin.classList.toggle('hidden', !adminUnlocked);
        // UFC 랭킹 동기화 버튼은 어드민 전용 (비어드민에는 숨김)
        var ufcFetchBtn = document.getElementById('btn-fetch-rankings');
        if (ufcFetchBtn) ufcFetchBtn.classList.toggle('hidden', !adminUnlocked);
    }

    function loadUserFromDB(userId, showWelcome) {
        if (!sb) return;

        // 계정 전환 시 어드민 권한 즉시 초기화 (비동기 콜백 전에)
        adminUnlocked = false;
        // canonical 적중률 캐시 무효화 — 매 로드마다 현재 사용자 기준으로 재조회(정산 반영·계정전환 stale 차단)
        if (typeof invalidateCurrentUserStats === 'function') invalidateCurrentUserStats();

        // 다른 유저 로그인 시 로컬 상태 초기화
        var storedUserId = localStorage.getItem('picktagon_current_user_id');
        if (storedUserId && storedUserId !== userId) {
            state = { points: 1000, total: 0, success: 0, history: [], pendings: {}, settled: {} };
            posts = [];
            // 사용자 전용 픽 집계(myEventPicks)·공개 비율 캐시 초기화 — 이전 계정 값 혼입 방지.
            // (resetUserEventPicks가 진행 중 응답 무효화 + 라이브바 중립화. 직후 재로딩으로 새 사용자 기준 재구성)
            if (typeof window.resetUserEventPicks === 'function') window.resetUserEventPicks();
            save();
            // 이전 계정 MY PICK을 즉시 제거 — 새 사용자 픽 응답 도착 전 A 표시가 카드에 남지 않도록.
            if (typeof updateAllFightCards === 'function') updateAllFightCards();
        }
        localStorage.setItem('picktagon_current_user_id', userId);

        // [perf] posts는 홈/타 탭에서 조회하지 않음 — auth 핸들러의 _syncPostsForAuth가 community일 때만 현재 key로 재조회.
        //  (기존 무조건 loadPostsFromDB 제거 → 로그인/세션복원 홈에서 posts 요청 0. 작성/삭제는 로컬 반영·강제 새로고침 경로가 갱신.)
        // [perf] 공개 픽 비율은 matchups 화면에서만 표시 → 로그인 시 현재 화면이 matchups일 때만 로드.
        //  (홈에서 로그인/세션복원 시 불필요한 get_event_pick_ratios 제거. matchups 진입 시 fetchUpcomingMatchups가 로드.)
        if (typeof _currentPage !== 'undefined' && _currentPage === 'matchups') loadAllEventPickCounts();
        loadMyEventPicks();
        // 현재 사용자 픽 즉시 복원 — active fights가 이미 로드된 상태(계정 전환 등)에서 새로고침 없이 MY PICK 복원.
        // active fights가 아직 없으면 loadUserPicksFromDB가 안전 return → 이후 fetchUpcomingMatchups가 다시 복원.
        if (typeof loadUserPicksFromDB === 'function') loadUserPicksFromDB();

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
                // Admin UI gate: is_admin DB 컬럼 또는 ADMIN_EMAILS 화이트리스트 (client-side)
                // 최종 보안은 DB SECURITY DEFINER RPC 레벨에서 별도 보호됨
                var userEmail = (currentUser && currentUser.email) ? currentUser.email : '';
                adminUnlocked = res.data.is_admin === true
                    || (typeof ADMIN_EMAILS !== 'undefined' && ADMIN_EMAILS.indexOf(userEmail) !== -1);
                // faction 로드
                currentFaction = res.data.factions || null;
                save();
                refreshUI();
                updateNicknameDisplay();
                if (typeof syncAvatarFromAuthMeta === 'function') syncAvatarFromAuthMeta();
                updateAuthUI();
                if (typeof updateFactionBadgeUI === 'function') updateFactionBadgeUI();
                reconcileHistoryFromDB();
                // 모바일 등에서 세션 복원 전에 프로필을 먼저 연 경우: currentUser/state 확정 후
                // 프로필 통계를 다시 렌더해 RPC 정답으로 갱신 (현재 페이지가 profile일 때만).
                if (typeof renderProfileStats === 'function' && window._currentPage === 'profile') {
                    renderProfileStats();
                }
                if (showWelcome) showToast('✅ ' + (res.data.nickname || '유저') + ' 님 환영해요!');
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
                var metaNick = (currentUser && currentUser.user_metadata && currentUser.user_metadata.nickname)
                    ? currentUser.user_metadata.nickname
                    : null;
                var nick = getNickname() || metaNick || (userEmail ? userEmail.split('@')[0] : 'PLAYER');
                createUserProfile(userId, nick);
            }
        });
    }

// ── Stats parser: JSONB array or JSON-encoded string → 5-element array | [] ──
function _parseStats(raw) {
    if (Array.isArray(raw) && raw.length === 5) return raw;
    if (typeof raw === 'string') {
        try { var p = JSON.parse(raw); if (Array.isArray(p) && p.length === 5) return p; } catch (e) {}
    }
    return [];
}

// ── DB 매치업 패칭 (Matchups 탭 진입 시 호출) ─────────────────────────
async function fetchUpcomingMatchups() {
    if (typeof sb === 'undefined' || !sb) return;
    try {
        // 전체 이벤트 1회 쿼리 (sidebar + upcoming 동시 처리)
        var allEvRes = await sb.from('events')
            .select('id, title, event_date, status, picks_locked_at')
            .order('event_date', { ascending: true });
        if (allEvRes.error || !allEvRes.data) {
            if (typeof startEventCountdown === 'function') startEventCountdown(null);
            if (typeof renderEventSidebar === 'function') renderEventSidebar();
            if (typeof renderFightCards === 'function') renderFightCards();
            return;
        }
        if (typeof _sidebarEventsCache !== 'undefined') {
            _sidebarEventsCache = allEvRes.data;
        }
        var event = allEvRes.data.find(function(e) { return e.status === 'upcoming'; });
        if (!event) {
            if (typeof startEventCountdown === 'function') startEventCountdown(null);
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
                var formattedDate = typeof formatEventDateOnly === 'function'
                    ? formatEventDateOnly(event.event_date)
                    : { text: '', iso: '' };
                dateEl.textContent = formattedDate.text || '';
            }
        }
        if (typeof startEventCountdown === 'function') startEventCountdown(event.picks_locked_at);

        var mRes = await sb.from('matchups')
            .select('id, event_id, red_fighter_id, blue_fighter_id, red_fighter_name, blue_fighter_name, red_image_url, blue_image_url, weight_class, card_segment, sort_order, is_main_event, left_bias, result_status, result_winner, result_winner_side, result_method, result_round, result_time')
            .eq('event_id', event.id)
            .order('card_segment', { ascending: true })
            .order('sort_order', { ascending: true });
        if (mRes.error || !mRes.data || !mRes.data.length) {
            if (typeof renderEventSidebar === 'function') renderEventSidebar();
            if (typeof renderFightCards === 'function') renderFightCards();
            return;
        }

        // ── Fighter lookup map (id → row, name → row) ──────────────────────────
        // fighterDB may be empty on fresh browsers (no admin session).
        // Fetch missing fighters directly so stats always render.
        var _localFighters = {};
        (typeof fighterDB !== 'undefined' ? fighterDB : []).forEach(function(f) {
            if (f.id)   _localFighters[f.id] = f;
            if (f.name) _localFighters['n:' + f.name] = f;
        });
        // fighters 테이블에 record/recent 컬럼 없음 — wins/losses/draws로 record 재구성
        var _fSelectCols = 'id,name,name_en,wins,losses,draws,height,reach,division,stats,slpm,str_acc,sapm,str_def,td_avg,td_acc,td_def,sub_avg,ko_rate,sub_rate,dec_rate';
        function _cacheFighter(f) {
            f.record = (f.wins || 0) + '-' + (f.losses || 0) + (f.draws > 0 ? '-' + f.draws : '');
            _localFighters[f.id] = f;
            if (f.name) _localFighters['n:' + f.name] = f;
            if (typeof fighterDB !== 'undefined' && !fighterDB.find(function(x) { return x.id === f.id; })) {
                fighterDB.push(f);
            }
        }
        var _missingIds = [];
        mRes.data.forEach(function(m) {
            if (m.red_fighter_id  && !_localFighters[m.red_fighter_id])  _missingIds.push(m.red_fighter_id);
            if (m.blue_fighter_id && !_localFighters[m.blue_fighter_id]) _missingIds.push(m.blue_fighter_id);
        });
        if (_missingIds.length > 0) {
            try {
                var fRes = await sb.from('fighters').select(_fSelectCols).in('id', _missingIds);
                if (fRes.data) fRes.data.forEach(_cacheFighter);
                else if (fRes.error) console.warn('[fetchUpcomingMatchups] fighter fetch by id:', fRes.error.message);
            } catch(e) { console.warn('[fetchUpcomingMatchups] fighter fetch by id:', e); }
        }
        // fighter_id가 null인 매치업 선수를 이름으로 추가 조회
        var _missingNames = [];
        mRes.data.forEach(function(m) {
            if (!m.red_fighter_id  && m.red_fighter_name  && !_localFighters['n:' + m.red_fighter_name])  _missingNames.push(m.red_fighter_name);
            if (!m.blue_fighter_id && m.blue_fighter_name && !_localFighters['n:' + m.blue_fighter_name]) _missingNames.push(m.blue_fighter_name);
        });
        if (_missingNames.length > 0) {
            try {
                var fnRes = await sb.from('fighters').select(_fSelectCols).in('name', _missingNames);
                if (fnRes.data) fnRes.data.forEach(_cacheFighter);
                else if (fnRes.error) console.warn('[fetchUpcomingMatchups] fighter fetch by name:', fnRes.error.message);
            } catch(e) { console.warn('[fetchUpcomingMatchups] fighter fetch by name:', e); }
        }

        // stat field extractor: handles both camelCase (localStorage) and snake_case (Supabase direct)
        function _fs(db, cam, sn) {
            if (!db) return 0;
            var v = (db[cam] != null) ? db[cam] : (sn && db[sn] != null ? db[sn] : 0);
            return v || 0;
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
            var _f1db = m.red_fighter_id
                ? (_localFighters[m.red_fighter_id] || _localFighters['n:' + m.red_fighter_name])
                : _localFighters['n:' + m.red_fighter_name];
            var _f2db = m.blue_fighter_id
                ? (_localFighters[m.blue_fighter_id] || _localFighters['n:' + m.blue_fighter_name])
                : _localFighters['n:' + m.blue_fighter_name];
            return {
                id: m.id,
                section: isMainCard ? 'main' : 'prelim',
                sectionLabel: isMainCard ? '메인 카드' : '프렐림',
                sectionTime: '',
                tag: tag,
                division: m.weight_class || '',
                rounds: (m.is_main_event === true || tag === 'MAIN EVENT') ? 5 : 3,
                leftBias: Number(m.left_bias) || 0.5,
                _eventId: event.id,
                _eventTitle: event.title || '',
                _fromDB: true,
                _resultStatus: m.result_status || 'scheduled',
                _resultWinner: m.result_winner || null,
                _resultWinnerSide: m.result_winner_side || null,
                _resultMethod: m.result_method || null,
                _resultRound: m.result_round || null,
                f1: {
                    id:      m.red_fighter_id || (_f1db && _f1db.id) || null,
                    name:    m.red_fighter_name || '?',
                    nameEn:  (_f1db && _f1db.name_en) || '',
                    record:  (_f1db && _f1db.record)  || '',
                    height:  (_f1db && _f1db.height)  || '',
                    reach:   (_f1db && _f1db.reach)   || '',
                    odds:    null,
                    recent:  (_f1db && Array.isArray(_f1db.recent)) ? _f1db.recent : [],
                    stats:   _parseStats(_f1db && _f1db.stats),
                    imgUrl:  m.red_image_url || '',
                    slpm:    _fs(_f1db, 'slpm',    null),
                    strAcc:  _fs(_f1db, 'strAcc',  'str_acc'),
                    sapm:    _fs(_f1db, 'sapm',    null),
                    strDef:  _fs(_f1db, 'strDef',  'str_def'),
                    tdAvg:   _fs(_f1db, 'tdAvg',   'td_avg'),
                    tdAcc:   _fs(_f1db, 'tdAcc',   'td_acc'),
                    tdDef:   _fs(_f1db, 'tdDef',   'td_def'),
                    subAvg:  _fs(_f1db, 'subAvg',  'sub_avg'),
                    koRate:  _fs(_f1db, 'koRate',  'ko_rate'),
                    subRate: _fs(_f1db, 'subRate', 'sub_rate'),
                    decRate: _fs(_f1db, 'decRate', 'dec_rate'),
                },
                f2: {
                    id:      m.blue_fighter_id || (_f2db && _f2db.id) || null,
                    name:    m.blue_fighter_name || '?',
                    nameEn:  (_f2db && _f2db.name_en) || '',
                    record:  (_f2db && _f2db.record)  || '',
                    height:  (_f2db && _f2db.height)  || '',
                    reach:   (_f2db && _f2db.reach)   || '',
                    odds:    null,
                    recent:  (_f2db && Array.isArray(_f2db.recent)) ? _f2db.recent : [],
                    stats:   _parseStats(_f2db && _f2db.stats),
                    imgUrl:  m.blue_image_url || '',
                    slpm:    _fs(_f2db, 'slpm',    null),
                    strAcc:  _fs(_f2db, 'strAcc',  'str_acc'),
                    sapm:    _fs(_f2db, 'sapm',    null),
                    strDef:  _fs(_f2db, 'strDef',  'str_def'),
                    tdAvg:   _fs(_f2db, 'tdAvg',   'td_avg'),
                    tdAcc:   _fs(_f2db, 'tdAcc',   'td_acc'),
                    tdDef:   _fs(_f2db, 'tdDef',   'td_def'),
                    subAvg:  _fs(_f2db, 'subAvg',  'sub_avg'),
                    koRate:  _fs(_f2db, 'koRate',  'ko_rate'),
                    subRate: _fs(_f2db, 'subRate', 'sub_rate'),
                    decRate: _fs(_f2db, 'decRate', 'dec_rate'),
                },
            };
        });

        if (typeof renderFightCards === 'function') renderFightCards();
        if (typeof renderHomeTicker === 'function') renderHomeTicker();
        if (typeof renderEventSidebar === 'function') renderEventSidebar();
        // [perf] 공개 픽 비율 집계는 matchups 화면에서만 필요 → 홈 티커 목적의 fetchUpcomingMatchups에서는 조회하지 않음.
        //  matchups 최초/재진입은 navigateTo가 _currentPage='matchups' 설정 후 fetchUpcomingMatchups를 호출하므로 정상 조회.
        if (typeof loadAllEventPickCounts === 'function'
            && typeof _currentPage !== 'undefined' && _currentPage === 'matchups') {
            loadAllEventPickCounts();
        }
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
var _loadUserPicksSeq = 0; // 늦은 응답/계정 전환 stale 차단용 시퀀스 토큰
async function loadUserPicksFromDB() {
    if (!sb || typeof currentUser === 'undefined' || !currentUser) return;
    try {
        var activeFights = (typeof getActiveFights === 'function') ? getActiveFights() : [];
        if (!activeFights.length) return;
        var activeFightIds = activeFights.map(function(f) { return f.id; });

        var requestedUserId = currentUser.id;    // 응답 적용 직전 사용자 일치 검사용
        var seq = ++_loadUserPicksSeq;            // 늦게 도착한 이전 요청이 최신 상태를 덮어쓰지 못하도록
        var startGen = (typeof window !== 'undefined' && window._pickStateGen) || 0; // reset/로그아웃/전환 무효화 세대
        var res = await sb.from('picks')
            .select('fight_id, pick_name, odds, bet_cost, payout, is_upset, status, actual_winner, actual_method, method, predicted_round, predicted_side, settled_at')
            .eq('user_id', requestedUserId)
            .in('fight_id', activeFightIds);

        // 계정 전환/요청 역전/리셋(로그아웃·전환) 시: 다른 계정 픽으로 현재 상태를 덮어쓰거나 지우지 않도록 무시.
        // 세대 토큰까지 검사해 '같은 사용자 로그아웃→빠른 재로그인'에서도 이전 세션 응답이 적용되지 않게 함.
        var curGen = (typeof window !== 'undefined' && window._pickStateGen) || 0;
        if (!currentUser || currentUser.id !== requestedUserId || seq !== _loadUserPicksSeq || startGen !== curGen) return;
        // 네트워크/RLS 오류 시에는 로컬 상태를 건드리지 않음(잘못 비우기 방지)
        if (res.error) { console.warn('[loadUserPicksFromDB]', res.error); return; }
        var rows = res.data || [];

        // fight_id → fight 객체 (예외적 predicted_side를 pick_name으로 방향 판별하기 위함)
        var fightById = {};
        activeFights.forEach(function(f) { fightById[f.id] = f; });

        var newPendings = {};
        var newSettled  = {};

        rows.forEach(function(pick) {
            var fid = pick.fight_id;
            if (pick.status === 'pending') {
                var f = fightById[fid];
                // 1) 방향 판별: canonical predicted_side(red→left / blue→right) 우선.
                //    기존엔 'red'가 아닌 모든 값(NULL/비정상)을 무조건 right(blue)로 처리해 잘못 표시했음.
                var side = pick.predicted_side === 'red' ? 'left'
                         : pick.predicted_side === 'blue' ? 'right'
                         : null;
                // 2) NULL/비정상 side: pick_name이 매치업 한쪽 선수와 정확히 일치할 때만 방향 복원
                if (!side) {
                    if (f && f.f1 && pick.pick_name === f.f1.name) side = 'left';
                    else if (f && f.f2 && pick.pick_name === f.f2.name) side = 'right';
                }
                if (!side) {
                    // 이름·방향 모두로 판별 불가 → 잘못된 MY PICK 표시 방지 위해 제외
                    console.warn('[loadUserPicksFromDB] predicted_side 불명 — pending 제외:', fid, pick.pick_name);
                    return;
                }
                // 3) canonical 이름 강제: 화면/state 이름은 항상 fight의 해당 side 선수명을 사용.
                //    side는 유효하나 pick_name이 어긋난 경우(예: red인데 blue 선수명) 모순 표시를 막기 위해 교정.
                //    서버 RPC 하드닝 전까지의 클라이언트 방어 — DB는 수정하지 않음(표시/state만 canonical).
                var canonical = f ? (side === 'left' ? (f.f1 && f.f1.name) : (f.f2 && f.f2.name)) : null;
                if (!canonical) {
                    console.warn('[loadUserPicksFromDB] canonical 선수명 판별 불가 — pending 제외:', fid, pick.pick_name);
                    return;
                }
                if (pick.pick_name !== canonical) {
                    console.warn('[loadUserPicksFromDB] pick_name≠canonical(side 기준 교정):', fid, pick.predicted_side, pick.pick_name, '→', canonical);
                }
                newPendings[fid] = {
                    side: side,
                    pick: canonical,
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
        reconcileHistoryFromDB();
        if (typeof updateAllFightCards === 'function') updateAllFightCards();
    } catch(e) {
        console.warn('[loadUserPicksFromDB]', e);
    }
}

// state.history 정렬: PENDING 뒤로, 정산 항목은 settledAt DESC, settledAt 없는 항목은 뒤쪽 fallback
function _sortHistory() {
    state.history.sort(function(a, b) {
        var ap = (a.res === 'PENDING');
        var bp = (b.res === 'PENDING');
        if (ap !== bp) return ap ? 1 : -1;
        if (ap) return 0; // both PENDING → preserve insertion order
        var ta = a.settledAt ? new Date(a.settledAt).getTime() : 0;
        var tb = b.settledAt ? new Date(b.settledAt).getTime() : 0;
        if (ta === 0 && tb === 0) return 0; // both legacy (no settledAt) → preserve order
        if (ta === 0) return 1;             // a is legacy → push after b
        if (tb === 0) return -1;            // b is legacy → push after a
        return tb - ta;                     // newer settledAt first
    });
}

// ── DB settled picks → state.history reconcile ────────────────────────────
// 서버 정산 후 state.history의 PENDING 항목을 WIN/LOSE/CANCEL로 업데이트.
// history 항목이 없으면 DB 기준으로 새로 생성 (cross-device/캐시 초기화 대응).
// 로그인 시 + loadUserPicksFromDB 완료 후 호출. DB write 없음.
async function reconcileHistoryFromDB() {
    if (!sb || typeof currentUser === 'undefined' || !currentUser) return;
    try {
        var res = await sb.from('picks')
            .select('fight_id, pick_name, payout, bet_cost, status, actual_winner, actual_method, settled_at')
            .eq('user_id', currentUser.id)
            .in('status', ['win', 'lose', 'cancelled'])
            .order('settled_at', { ascending: false });

        if (!res.data || !res.data.length) return;

        var changed = false;
        var newEntries = []; // { pick, dbRes } — history 항목 없는 settled picks

        res.data.forEach(function(pick) {
            var fid   = pick.fight_id;
            var dbRes = pick.status === 'win'       ? 'WIN'
                      : pick.status === 'cancelled'  ? 'CANCEL'
                      : 'LOSE';

            var entry = state.history.find(function(h) { return h.fightId === fid; });

            if (entry) {
                if (entry.res !== dbRes) {
                    entry.res = dbRes;
                    if (pick.status === 'win') entry.payout = pick.payout || 0;
                    changed = true;
                }
                // Backfill settledAt for accurate sort (old entries may not have it)
                if (!entry.settledAt && pick.settled_at) {
                    entry.settledAt = pick.settled_at;
                    changed = true;
                }
            } else {
                newEntries.push({ pick: pick, dbRes: dbRes });
            }
        });

        // 새 항목 필요 시 matchup 이름 조회 (cross-device / 캐시 초기화 대응)
        if (newEntries.length) {
            var fidList = newEntries.map(function(x) { return x.pick.fight_id; });
            var mRes = await sb.from('matchups')
                .select('id, red_fighter_name, blue_fighter_name')
                .in('id', fidList);
            var muMap = {};
            (mRes.data || []).forEach(function(m) { muMap[m.id] = m; });

            newEntries.forEach(function(x) {
                var p  = x.pick;
                var mu = muMap[p.fight_id];
                state.history.push({
                    fightId:   p.fight_id,
                    match:     mu ? (mu.red_fighter_name + ' vs ' + mu.blue_fighter_name)
                                  : (p.actual_winner ? p.actual_winner + ' bout' : 'Past Bout'),
                    pick:      p.pick_name || '',
                    payout:    p.payout || 0,
                    betCost:   p.bet_cost || 100,
                    res:       x.dbRes,
                    settledAt: p.settled_at || null
                });
                changed = true;
            });
        }

        if (!changed) return;

        _sortHistory();

        save();

        // history 동기화 완료 후: 프로필 화면이면 전체 재렌더(RPC + 폼/최근/보너스 동기화),
        // 아니면 기존 부분 렌더만 (불필요한 RPC 호출 방지).
        if (typeof renderProfileStats === 'function' && window._currentPage === 'profile') {
            renderProfileStats();
        } else {
            if (typeof renderHistoryList   === 'function') renderHistoryList();
            if (typeof renderFormChart     === 'function') renderFormChart();
            if (typeof renderProfileReport === 'function') renderProfileReport();
        }
    } catch(e) {
        console.warn('[reconcileHistoryFromDB]', e);
    }
}
