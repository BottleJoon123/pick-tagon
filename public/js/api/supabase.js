/* ==============================
   SUPABASE API LAYER
   (extracted from index.html – global functions, no import/export)
   의존성: state.js (sb, currentUser, adminUnlocked, cachedNews, newsFetched)
           index.html 내 함수들 (renderNewsGrid, translateNewsWithGemini,
           renderHomeNewsFromRSS, initOctagonListener, loadPostsFromDB,
           loadAllEventPickCounts, loadMyEventPicks, createUserProfile,
           save, refreshUI, updateNicknameDisplay, showToast, getNickname)
============================== */

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
                    // Gemini API로 영문 뉴스 번역 (API 키가 있을 경우)
                    var translated = await translateNewsWithGemini(mapped);
                    cachedNews = translated || mapped;
                    newsFetched = true;
                } else {
                    cachedNews = [];
                    newsFetched = true;
                }
                renderNewsGrid();
                renderHomeNewsFromRSS(cachedNews.slice(0, 6));
            });
    }

    function initSupabase() {
        try {
            sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            // 로그인 상태 변경 감지
            sb.auth.onAuthStateChange(function(event, session) {
                if (session && session.user) {
                    currentUser = session.user;
                    loadUserFromDB(session.user.id);
                    document.getElementById('auth-modal').classList.add('hidden');
                    updateAuthUI();
                    setTimeout(initOctagonListener, 600);
                } else {
                    // 로그아웃: 어드민 권한 반드시 초기화
                    currentUser = null;
                    adminUnlocked = false;
                    updateAuthUI();
                }
            });
            // 현재 세션 확인
            sb.auth.getSession().then(function(res) {
                if (res.data && res.data.session) {
                    currentUser = res.data.session.user;
                    loadUserFromDB(currentUser.id);
                    updateAuthUI();
                    // 페이지 로드 시 이미 로그인된 경우 옥타곤 리스너 시작
                    setTimeout(initOctagonListener, 1200);
                } else {
                    adminUnlocked = false;
                    // 로그인 안 된 상태 — 모달 표시
                    setTimeout(function() {
                        document.getElementById('auth-modal').classList.remove('hidden');
                    }, 600);
                }
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

        sb.from('users').select('*').eq('id', userId).single()
        .then(function(res) {
            if (res.data) {
                state.points = res.data.points || 1000;
                state.total = res.data.total_picks || 0;
                state.success = res.data.success_picks || 0;
                if (res.data.nickname) {
                    localStorage.setItem('picktagon_nickname', res.data.nickname);
                }
                // is_admin 체크 → 새로고침 후에도 어드민 자동 활성화
                adminUnlocked = res.data.is_admin === true || currentUser.email === 'joonbyoung@naver.com';
                save();
                refreshUI();
                updateNicknameDisplay();
                updateAuthUI();
                showToast('✅ ' + (res.data.nickname || '유저') + ' 님 환영해요!');
            } else {
                // 첫 로그인 → 프로필 생성
                var nick = getNickname() || currentUser.email.split('@')[0];
                createUserProfile(userId, nick);
            }
        });
    }
