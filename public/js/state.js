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
var newsDB = [];
var editingNewsId = null;
var h2hRadarChart = null;

// 커뮤니티 필터/정렬/시간 상태
var communityFilter = 'all';   // all | post | pick
var communitySortMode = 'latest';  // latest | recommend | hot
var communityTimeFilter = 'all';   // all | day | week | month
var communityMyPosts = false;      // 내 글 모아보기 토글 (표현계층 · currentUser.id 기준 클라 필터)

// 뉴스/유튜브 카테고리 상태
var currentNewsCat = 'all';

// 유튜브 영상 캐시 {query: [{id, title}]}
var ytVideoCache = {};
// 비디오 ID별 제목 캐시 {videoId: title|null}  (oEmbed 결과)
var ytMetaCache = {};
var activeYoutubeCardIdx = 0;  // 0~N = 특정 카드; -1은 레거시 전체 로드 경로(미사용)
var _ytFromShortcut = false;   // goToYoutubeCard() 경유 시 true → 뒤로 버튼 표시

// 아카이브
var archiveDB = [];
var archiveFightRowCount = 0;
var editingArchiveId = null;

// 시즌
var mockRankings = [
    { name: "DAGESTANI_KING",   points: 18450, total: 88, success: 74 },
    { name: "OCTAGON_ORACLE",   points: 15200, total: 71, success: 58 },
    { name: "SUBMISSION_IQ",    points: 12800, total: 64, success: 51 },
    { name: "KO_PROPHET",       points: 11300, total: 60, success: 47 },
    { name: "GUARD_PASSER_99",  points: 9750,  total: 55, success: 42 },
    { name: "JITZ_WIZARD",      points: 8200,  total: 50, success: 37 },
    { name: "TAKEDOWN_HUNTER",  points: 6400,  total: 43, success: 31 },
    { name: "CLINCH_MASTER",    points: 5100,  total: 38, success: 27 },
    { name: "MMA_STRATEGIST",   points: 3800,  total: 30, success: 20 },
    { name: "FIGHT_FAN_99",     points: 2500,  total: 22, success: 13 },
    { name: "ROOKIE_FIGHTER",   points: 1700,  total: 15, success: 8  },
    { name: "NEWBIE_MMA",       points: 800,   total: 8,  success: 3  },
];

var seasonData = {
    current: { name: 'Season 1', startDate: new Date().toISOString().slice(0, 10) },
    hallOfFame: []  // array of { seasonName, endDate, top3: [{rank, name, points, accuracy, belt}] }
};

// Supabase 인스턴스 & 현재 유저
// 파이트 카드 Chart 인스턴스 { fightId: Chart }
var fightCharts = {};

// DB에서 로드한 매치업 (static FIGHTS보다 우선, customFights보다 우선)
var _dbMatchups = [];

// 뉴스 어드민 (Supabase가 source-of-truth)
var NEWS_SEED = []; // 하드코딩 제거 — Supabase news_cache가 유일한 소스

var sb = null;
var currentUser = null;

// 내가 추천한 포스트 ID 목록 (post_likes 테이블과 동기화)
var likedPostIds = new Set();

// 집단(Faction) 시스템
var factions = [];        // factions 테이블 전체 캐시 [{id, name, emoji_icon, representative_fighters, total_score}]
var currentFaction = null; // 현재 로그인 유저의 faction 객체 (null = 미선택)
var selectedFactionRankingId = null; // 현재 펼친 집단 멤버 패널 faction id
var factionMemberRankings = {};      // { [factionId]: [...members] } get_faction_member_rankings RPC 캐시
