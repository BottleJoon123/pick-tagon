/* ==============================
   SHARED STATE
   (extracted from index.html ??global vars, no import/export)
============================== */

// 커뮤니티 포스트 (Supabase가 source-of-truth)
var posts = [];

// 배팅/예측 상태
var state = {
    points: 1000,
    total: 0,
    success: 0,
    history: [],
    pendings: {},  // { fightId: { side, match, pick, payout, betCost } }
    settled: {}    // { fightId: { result, actualWinner, payout, pick, side, resolvedAt } }
};

// 어드민
var adminUnlocked = false;

// 어드민 UI 상태
var adminGateMode = 'signin';
var editingFighterId = null;
var editingFightCardId = null;

// Fighter DB (persisted separately)
var fighterDB = [];
// Dynamic fight cards (override FIGHTS if set)
var customFights = [];

// 뉴스 캐시
var cachedNews = [];
var newsFetched = false;

// 커뮤니티 필터 상태
var communityFilter = 'all';

// 뉴스/유튜브 카테고리 상태
var currentNewsCat = 'all';

// 유튜브 영상 캐시 {query: [{id, title}]}
var ytVideoCache = {};
var activeYoutubeCardIdx = -1; // -1 = 전체, 0~N = 특정 카드만 표시

// Supabase 인스턴스 & 현재 유저
var sb = null;
var currentUser = null;
