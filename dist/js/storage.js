/* ==============================
   LOCAL STORAGE PERSISTENCE
   (extracted from index.html – global functions, no import/export)
   의존성: state.js (state, posts)
============================== */

    function findHistoryEntry(fightId) {
        return state.history.find(h => h.fightId === fightId && h.res === 'PENDING');
    }

    function save() {
        localStorage.setItem('picktagon_v3', JSON.stringify(state));
        // posts는 Supabase DB가 source-of-truth → localStorage는 캐시 전용
        localStorage.setItem('picktagon_v3_posts', JSON.stringify(posts));
    }

    function load() {
        const s = localStorage.getItem('picktagon_v3');
        const p = localStorage.getItem('picktagon_v3_posts');
        if (s) {
            const parsed = JSON.parse(s);
            if (parsed.pending && !parsed.pendings) { parsed.pendings = {}; }
            state = { ...state, ...parsed };
            if (!state.pendings) state.pendings = {};
            if (!state.settled) state.settled = {};
        }
        // 캐시가 있으면 일단 표시 (DB 로드 전 빈 화면 방지)
        if (p) posts = JSON.parse(p);
    }
