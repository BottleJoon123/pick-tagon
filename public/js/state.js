/* ==============================
   SHARED STATE
   (extracted from index.html – global vars, no import/export)
============================== */

// 베팅/픽 상태
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

// 뉴스 캐시
var cachedNews = [];
var newsFetched = false;

// 유튜브 영상 캐시 {query: [{id, title}]}
var ytVideoCache = {};
var activeYoutubeCardIdx = -1; // -1 = 전체, 0~N = 특정 카드만 표시

// Supabase 인스턴스 & 현재 유저
var sb = null;
var currentUser = null;
