const BET_COST = 100;

const STAT_LABELS = ['Striking', 'Grappling', 'Stamina', 'Defense', 'Speed'];
const STAT_COLORS = ['#E10600', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7'];

const BET_METHOD_CONFIG = {
    'KO/TKO': { key:'ko', sel:'bs-sel-ko',  bonus: 0.3, label:'🥊 KO/TKO 예측 · +30% 보너스' },
    'SUB':    { key:'sub', sel:'bs-sel-sub', bonus: 0.5, label:'🤼 서브미션 예측 · +50% 보너스' },
    'UD':     { key:'ud',  sel:'bs-sel-ud',  bonus: 0,   label:'📋 판정 예측 · 기본 배당' },
    'ANY':    { key:'any', sel:'bs-sel-any', bonus: 0,   label:'🎲 방식 무관' },
};

const FIGHT_METHOD_TEXT_CLASS = {
    'KO/TKO': 'text-ufcRed',
    'SUB': 'text-purple-400',
    'UD': 'text-blue-400',
    'SD': 'text-yellow-400',
    'MD': 'text-orange-400',
    'DQ': 'text-gray-400',
    'NC': 'text-gray-500',
};

const UFC_DIVISION_SHORT_LABELS = {
    p4p: 'P4P',
    flw: '플라이급',
    bw: '밴텀급',
    fw: '페더급',
    lw: '라이트급',
    ww: '웰터급',
    mw: '미들급',
    lhw: '라이트헤비급',
    hw: '헤비급',
    'w-sw': '여자 스트로우',
    'w-flw': '여자 플라이',
    'w-bw': '여자 밴텀',
};

const UFC_DIVISION_FULL_LABELS = {
    flw: '플라이급',
    bw: '밴텀급',
    fw: '페더급',
    lw: '라이트급',
    ww: '웰터급',
    mw: '미들급',
    lhw: '라이트헤비급',
    hw: '헤비급',
    'w-sw': '여자 스트로우',
    'w-flw': '여자 플라이급',
    'w-bw': '여자 밴텀급',
};

const UFC_DIVISION_NAME_MAP = {
    "Men's Pound-for-Pound Top Rank": 'p4p',
    'Flyweight': 'flw',
    'Bantamweight': 'bw',
    'Featherweight': 'fw',
    'Lightweight': 'lw',
    'Welterweight': 'ww',
    'Middleweight': 'mw',
    'Light Heavyweight': 'lhw',
    'Heavyweight': 'hw',
    "Women's Pound-for-Pound Top Rank": 'w-p4p',
    "Women's Strawweight": 'w-sw',
    "Women's Flyweight": 'w-flw',
    "Women's Bantamweight": 'w-bw',
};

const UFC_TREND_TEXT_CLASS = {
    '↑': 'text-green-400',
    '↓': 'text-red-400',
    '→': 'text-gray-500',
};

const NEWS_CATEGORY_KEYWORDS = {
    ufc: ['ufc', 'mma', '격투기', '옥타곤', '얼티밋', '파이팅 챔피언십'],
    fighter: ['선수', '파이터', '챔피언', '랭커', '도전자'],
    result: ['결과', '승리', '패배', 'ko', '서브미션', '판정', '타이틀'],
    ranking: ['랭킹', '순위', '랭크'],
    event: ['이벤트', '대회', '카드', '경기 예정'],
};

const MMA_NEWS_KEYWORDS = [
    'ufc', 'mma', '격투기', '파이터', '옥타곤', '무에타이', '주짓수', '이종격투기',
    '챔피언십', '타이틀전', '파이트', '프로하츠카', '울버그', '최두호', '정다운', '코리안',
];

const NEWS_CATEGORY_BAR_CLASS = {
    ufc: 'bg-ufcRed',
    fighter: 'bg-blue-600',
    event: 'bg-purple-600',
    result: 'bg-green-600',
    ranking: 'bg-yellow-500',
};

const NEWS_CATEGORY_BAR_COLOR = {
    ufc: '#E10600',
    fighter: '#2563eb',
    event: '#9333ea',
    result: '#16a34a',
    ranking: '#eab308',
};

const NEWS_CATEGORY_BADGE_CLASS = {
    ufc: 'bg-ufcRed/15 text-ufcRed',
    fighter: 'bg-blue-600/15 text-blue-400',
    event: 'bg-purple-600/15 text-purple-400',
    result: 'bg-green-600/15 text-green-400',
    ranking: 'bg-yellow-500/15 text-yellow-400',
};

const NEWS_CATEGORY_LABEL = {
    ufc: 'UFC',
    fighter: '선수',
    event: '이벤트',
    result: '결과',
    ranking: '랭킹',
};

const UNSPLASH_DEFAULTS = {
    'NEWS':     'https://images.unsplash.com/photo-1552072092-7f9b8d63efcb?auto=format&fit=crop&q=80',
    'RANKING':  'https://images.unsplash.com/photo-1590556409324-aa1d726e5c3c?auto=format&fit=crop&q=80',
    'UPDATE':   'https://images.unsplash.com/photo-1517438476312-10d79c67750d?auto=format&fit=crop&q=80',
    'ANALYSIS': 'https://images.unsplash.com/photo-1549719386-74fd245e5060?auto=format&fit=crop&q=80',
    'EVENT':    'https://images.unsplash.com/photo-1602827114580-a7e6ea9c6e5c?auto=format&fit=crop&q=80',
    'EXCLUSIVE':'https://images.unsplash.com/photo-1547347298-4074fc3086f0?auto=format&fit=crop&q=80',
    'BREAKING': 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&q=80',
};

var NEWS_CATS = [
    { id:'all', label:'전체', icon:'📰' },
    { id:'ufc', label:'UFC', icon:'🏆' },
    { id:'fighter', label:'선수', icon:'🥊' },
    { id:'event', label:'이벤트', icon:'📅' },
    { id:'result', label:'결과', icon:'🏅' },
    { id:'ranking', label:'랭킹', icon:'📊' },
    { id:'youtube', label:'유튜브', icon:'🎬' },
];

var YOUTUBE_CARDS = [
    { title: 'UFC 최신 하이라이트', desc: '최신 UFC 경기 하이라이트 영상 모음', query: 'UFC 하이라이트', color: 'from-red-900/60 to-red-800/30', icon: '🥊' },
    { title: 'UFC 한국어 분석/리뷰', desc: '국내 유튜버들의 UFC 심층 분석 영상', query: 'UFC 분석 리뷰', color: 'from-blue-900/60 to-blue-800/30', icon: '🎙️' },
    { title: 'MMA 격투기 뉴스', desc: '최신 MMA 격투기 소식과 이슈', query: 'MMA 격투기 뉴스', color: 'from-purple-900/60 to-purple-800/30', icon: '📰' },
    { title: '선수 인터뷰 & 기자회견', desc: 'UFC 선수들의 인터뷰 및 프레스 컨퍼런스', query: 'UFC 선수 인터뷰 기자회견', color: 'from-yellow-900/60 to-yellow-800/30', icon: '🎤' },
    { title: 'UFC 경기 프리뷰', desc: '다가오는 UFC 경기 예측 및 프리뷰', query: 'UFC 경기 프리뷰 예측', color: 'from-green-900/60 to-green-800/30', icon: '🔮' },
    { title: '넘버원 한국 격투기', desc: '한국 선수들의 MMA 경기 및 소식', query: '한국 MMA 격투기 선수', color: 'from-orange-900/60 to-orange-800/30', icon: '🇰🇷' },
];

/* UFC rankings static seed data (Phase 9C extraction from index.html). */
const UFC_DIVISIONS = [
    { id: 'p4p',  label: 'P4P 남자', icon: '👑' },
    { id: 'hw',   label: '헤비급',   icon: '🏔' },
    { id: 'lhw',  label: '라이트헤비급', icon: '⚡' },
    { id: 'mw',   label: '미들급',   icon: '🔥' },
    { id: 'ww',   label: '웰터급',   icon: '💥' },
    { id: 'lw',   label: '라이트급', icon: '🌊' },
    { id: 'fw',   label: '페더급',   icon: '🦅' },
    { id: 'bw',   label: '밴텀급',   icon: '⚔️' },
    { id: 'flw',  label: '플라이급', icon: '🎯' },
    { id: 'w-sw', label: '여자 스트로급', icon: '🌸' },
    { id: 'w-flw',label: '여자 플라이급', icon: '💫' },
    { id: 'w-bw', label: '여자 밴텀급', icon: '🔱' },
];

// 시드 랭킹 데이터
const UFC_RANKINGS_SEED = {
    p4p: {
        champion: null,
        fighters: [
            { rank:1,  name:'이슬람 마카체프',    nation:'🇷🇺', record:'26-1',  height:'178cm', reach:'179cm', division:'라이트급',   odds:1.45, stats:[80,98,95,90,85], trend:'↑' },
            { rank:2,  name:'존 존스',          nation:'🇺🇸', record:'27-1',  height:'193cm', reach:'215cm', division:'헤비급',     odds:1.30, stats:[88,85,92,95,80], trend:'→' },
            { rank:3,  name:'알렉스 페레이라',   nation:'🇧🇷', record:'11-2',  height:'193cm', reach:'203cm', division:'라이트헤비급', odds:1.55, stats:[95,70,85,78,88], trend:'↑' },
            { rank:4,  name:'드라이커스 두 플레시',nation:'🇿🇦',record:'22-4',  height:'183cm', reach:'188cm', division:'미들급',     odds:1.65, stats:[78,85,88,82,80], trend:'↑' },
            { rank:5,  name:'일리야 토푸리아',     nation:'🇬🇪', record:'16-0',  height:'183cm', reach:'182cm', division:'라이트급',   odds:1.80, stats:[90,72,85,88,92], trend:'↑' },
            { rank:6,  name:'장웨일리',          nation:'🇨🇳', record:'25-3',  height:'163cm', reach:'165cm', division:'여자 스트로급', odds:1.35, stats:[92,72,90,88,95], trend:'→' },
            { rank:7,  name:'메랍 드발리쉬빌리', nation:'🇬🇪', record:'19-4',  height:'175cm', reach:'178cm', division:'밴텀급',     odds:1.90, stats:[75,92,95,80,78], trend:'↑' },
            { rank:8,  name:'아레나 로드리게스', nation:'🇧🇷', record:'16-3',  height:'165cm', reach:'168cm', division:'여자 플라이급', odds:2.00, stats:[85,70,88,82,90], trend:'↑' },
            { rank:9,  name:'알렉산더 볼카노프스키',nation:'🇦🇺',record:'26-4', height:'168cm', reach:'182cm', division:'페더급',     odds:2.10, stats:[85,78,90,85,92], trend:'↓' },
            { rank:10, name:'맥스 할로웨이',     nation:'🇺🇸', record:'25-8',  height:'180cm', reach:'175cm', division:'페더급',     odds:2.20, stats:[88,68,92,80,95], trend:'→' },
        ]
    },
    lw: {
        champion: { name:'일리야 토푸리아', name_en:'Ilia Topuria', nation:'🇬🇪', record:'16-0', height:'183cm', reach:'182cm', stats:[90,72,85,88,92] },
        fighters: [
            { rank:1,  name:'더스틴 포이리에',   nation:'🇺🇸', record:'30-8',  height:'175cm', reach:'183cm', trend:'→', stats:[95,70,90,80,92] },
            { rank:2,  name:'아르만 차를라비',    nation:'🇰🇿', record:'15-1',  height:'173cm', reach:'175cm', trend:'↑', stats:[85,82,88,80,88] },
            { rank:3,  name:'저스틴 게이치',      nation:'🇺🇸', record:'25-5',  height:'180cm', reach:'178cm', trend:'→', stats:[92,65,85,75,90] },
            { rank:4,  name:'베닐 다리우시',      nation:'🇺🇸', record:'17-5',  height:'178cm', reach:'183cm', trend:'↑', stats:[82,80,85,82,85] },
            { rank:5,  name:'무리크 벅체갈리',    nation:'🇰🇿', record:'17-1',  height:'177cm', reach:'175cm', trend:'↑', stats:[85,78,88,80,85] },
            { rank:6,  name:'마테우스 가미니',    nation:'🇧🇷', record:'20-3',  height:'177cm', reach:'176cm', trend:'↑', stats:[80,75,85,78,82] },
            { rank:7,  name:'패디 핌블렛',        nation:'🇬🇧', record:'23-3',  height:'175cm', reach:'178cm', trend:'↑', stats:[82,78,85,75,85] },
            { rank:8,  name:'마이클 챈들러',      nation:'🇺🇸', record:'23-8',  height:'175cm', reach:'173cm', trend:'↓', stats:[88,70,82,72,90] },
            { rank:9,  name:'드랜 포토',          nation:'🇬🇧', record:'22-5',  height:'183cm', reach:'193cm', trend:'→', stats:[78,72,85,82,80] },
            { rank:10, name:'오마르 모리스',      nation:'🇲🇦', record:'20-2',  height:'177cm', reach:'178cm', trend:'↑', stats:[80,78,85,80,82] },
        ]
    },
    mw: {
        champion: { name:'드라이커스 두 플레시', nation:'🇿🇦', record:'22-4', height:'183cm', reach:'188cm', stats:[78,85,88,82,80] },
        fighters: [
            { rank:1,  name:'로버트 휘태커',     nation:'🇦🇺', record:'25-7',  height:'184cm', reach:'185cm', trend:'→', stats:[88,80,85,85,88] },
            { rank:2,  name:'이즈 아데산야',     nation:'🇳🇿', record:'24-5',  height:'193cm', reach:'203cm', trend:'↓', stats:[92,65,88,82,95] },
            { rank:3,  name:'숀 스트릭랜드',     nation:'🇺🇸', record:'30-6',  height:'185cm', reach:'193cm', trend:'↑', stats:[85,80,90,85,85] },
            { rank:4,  name:'카마루 우스만',     nation:'🇳🇬', record:'20-4',  height:'183cm', reach:'193cm', trend:'↓', stats:[80,90,85,85,80] },
            { rank:5,  name:'안소니 헤르난데스', nation:'🇺🇸', record:'14-1',  height:'180cm', reach:'185cm', trend:'↑', stats:[85,75,85,80,88] },
        ]
    },
    ww: {
        champion: { name:'벨랄 무하마드', nation:'🇺🇸', record:'24-3', height:'180cm', reach:'193cm', stats:[80,88,90,85,80] },
        fighters: [
            { rank:1,  name:'샤비어 에드워즈',   nation:'🇬🇧', record:'17-0',  height:'178cm', reach:'183cm', trend:'↑', stats:[88,80,88,85,90] },
            { rank:2,  name:'레온 에드워즈',     nation:'🇬🇧', record:'22-4',  height:'183cm', reach:'188cm', trend:'↓', stats:[85,80,88,88,88] },
            { rank:3,  name:'숀 브래디',         nation:'🇺🇸', record:'17-1',  height:'175cm', reach:'180cm', trend:'↑', stats:[78,88,90,82,80] },
            { rank:4,  name:'콜비 코빙턴',       nation:'🇺🇸', record:'18-4',  height:'178cm', reach:'183cm', trend:'→', stats:[75,90,92,82,78] },
            { rank:5,  name:'질베르 번스',       nation:'🇧🇷', record:'22-6',  height:'178cm', reach:'183cm', trend:'→', stats:[75,90,82,78,78] },
        ]
    },
    hw: {
        champion: { name:'존 존스', nation:'🇺🇸', record:'27-1', height:'193cm', reach:'215cm', stats:[88,85,92,95,80] },
        fighters: [
            { rank:1,  name:'스티페 미오치치',   nation:'🇺🇸', record:'20-5',  height:'193cm', reach:'203cm', trend:'→', stats:[85,80,88,85,82] },
            { rank:2,  name:'톰 아스피날',       nation:'🇬🇧', record:'15-3',  height:'196cm', reach:'206cm', trend:'↑', stats:[88,82,85,82,88] },
            { rank:3,  name:'세르게이 파블로비치', nation:'🇷🇺',record:'18-2',  height:'190cm', reach:'198cm', trend:'↑', stats:[92,72,85,80,88] },
            { rank:4,  name:'알렉세이 올레이닉', nation:'🇷🇺', record:'59-17', height:'190cm', reach:'193cm', trend:'↓', stats:[70,95,78,72,72] },
            { rank:5,  name:'알리스타르 오버림', nation:'🇳🇱', record:'47-20', height:'193cm', reach:'196cm', trend:'↓', stats:[88,80,80,72,85] },
        ]
    },
    lhw: {
        champion: { name:'알렉스 페레이라', nation:'🇧🇷', record:'11-2', height:'193cm', reach:'203cm', stats:[95,70,85,78,88] },
        fighters: [
            { rank:1,  name:'지리 프로하스카',   nation:'🇨🇿', record:'30-4',  height:'193cm', reach:'201cm', trend:'↑', stats:[90,78,85,75,88] },
            { rank:2,  name:'마고메드 안칼라예프',nation:'🇷🇺', record:'20-2',  height:'185cm', reach:'193cm', trend:'↑', stats:[88,82,88,85,85] },
            { rank:3,  name:'자말 힐',           nation:'🇺🇸', record:'13-5',  height:'193cm', reach:'203cm', trend:'↓', stats:[85,75,85,78,88] },
            { rank:4,  name:'알렉산더 라키치',   nation:'🇦🇹', record:'15-5',  height:'188cm', reach:'198cm', trend:'↓', stats:[85,72,82,78,85] },
            { rank:5,  name:'안토니 스미스',     nation:'🇺🇸', record:'38-20', height:'193cm', reach:'203cm', trend:'→', stats:[80,78,80,75,82] },
        ]
    },
    fw: {
        champion: { name:'알렉산더 볼카노프스키', name_en:'Alexander Volkanovski', nation:'🇦🇺', record:'26-4', height:'168cm', reach:'182cm', stats:[85,78,90,85,92] },
        fighters: [
            { rank:1,  name:'알렉산더 볼카노프스키',nation:'🇦🇺',record:'26-4', height:'168cm', reach:'182cm', trend:'↓', stats:[85,78,90,85,92] },
            { rank:2,  name:'디에고 로페스',     nation:'🇲🇽', record:'24-6',  height:'175cm', reach:'182cm', trend:'↑', stats:[88,72,85,80,90] },
            { rank:3,  name:'맥스 할로웨이',     nation:'🇺🇸', record:'25-8',  height:'180cm', reach:'175cm', trend:'→', stats:[88,68,92,80,95] },
            { rank:4,  name:'야이르 로드리게스', nation:'🇲🇽', record:'16-4',  height:'178cm', reach:'183cm', trend:'→', stats:[90,68,78,72,92] },
            { rank:5,  name:'조슈아 반데르아',   nation:'🇿🇦', record:'24-5',  height:'178cm', reach:'183cm', trend:'↑', stats:[85,75,88,82,88] },
        ]
    },
    bw: {
        champion: { name:'메랍 드발리쉬빌리', nation:'🇬🇪', record:'19-4', height:'175cm', reach:'178cm', stats:[75,92,95,80,78] },
        fighters: [
            { rank:1,  name:'우마르 누르마고메도프',nation:'🇷🇺',record:'17-0', height:'178cm', reach:'180cm', trend:'↑', stats:[82,90,90,85,82] },
            { rank:2,  name:'코리 샌드헤이건',   nation:'🇺🇸', record:'17-5',  height:'180cm', reach:'180cm', trend:'→', stats:[85,72,88,80,88] },
            { rank:3,  name:'숀 오말리',         nation:'🇺🇸', record:'18-2',  height:'180cm', reach:'182cm', trend:'→', stats:[90,65,82,75,90] },
            { rank:4,  name:'페트르 얀',         nation:'🇷🇺', record:'19-5',  height:'175cm', reach:'178cm', trend:'↓', stats:[85,72,85,80,88] },
            { rank:5,  name:'스터링 반배링턴',   nation:'🇺🇸', record:'23-6',  height:'175cm', reach:'178cm', trend:'→', stats:[80,82,88,80,82] },
        ]
    },
    flw: {
        champion: { name:'알렉상드르 팬토하', nation:'🇧🇷', record:'28-5', height:'168cm', reach:'168cm', stats:[85,85,90,82,88] },
        fighters: [
            { rank:1,  name:'브랜든 로이발',     nation:'🇺🇸', record:'17-7',  height:'170cm', reach:'170cm', trend:'↑', stats:[85,80,88,80,88] },
            { rank:2,  name:'마넬 케이프',       nation:'🇦🇴', record:'18-6',  height:'165cm', reach:'168cm', trend:'↑', stats:[88,72,82,78,90] },
            { rank:3,  name:'타츠로 타이라',     nation:'🇯🇵', record:'16-0',  height:'167cm', reach:'168cm', trend:'↑', stats:[80,85,88,82,85] },
            { rank:4,  name:'카이 카라-프랑스',  nation:'🇳🇿', record:'24-8',  height:'165cm', reach:'163cm', trend:'↓', stats:[90,72,82,78,90] },
            { rank:5,  name:'마테우스 니콜라우', nation:'🇧🇷', record:'22-4',  height:'170cm', reach:'173cm', trend:'↑', stats:[82,80,85,80,85] },
        ]
    },
    'w-sw': {
        champion: { name:'장웨일리', nation:'🇨🇳', record:'25-3', height:'163cm', reach:'165cm', stats:[92,72,90,88,95] },
        fighters: [
            { rank:1,  name:'카롤리나 코발키비츠',nation:'🇵🇱', record:'16-3', height:'162cm', reach:'162cm', trend:'↑', stats:[80,65,80,75,88] },
            { rank:2,  name:'타티아나 수아레스',  nation:'🇺🇸', record:'10-0',  height:'163cm', reach:'163cm', trend:'↑', stats:[75,90,85,82,80] },
            { rank:3,  name:'얀시 메데이로스',    nation:'🇧🇷', record:'18-5',  height:'163cm', reach:'163cm', trend:'↓', stats:[82,72,82,78,85] },
            { rank:4,  name:'클레우데스 탈로',    nation:'🇹🇴', record:'11-1',  height:'165cm', reach:'165cm', trend:'↑', stats:[80,75,85,80,82] },
            { rank:5,  name:'안쥬엘라 힐',        nation:'🇺🇸', record:'8-2',   height:'163cm', reach:'163cm', trend:'↑', stats:[82,70,82,78,85] },
        ]
    },
    'w-flw': {
        champion: { name:'아레나 로드리게스', nation:'🇧🇷', record:'16-3', height:'165cm', reach:'168cm', stats:[85,70,88,82,90] },
        fighters: [
            { rank:1,  name:'마나온 포노',        nation:'🇫🇷', record:'10-1',  height:'168cm', reach:'168cm', trend:'↑', stats:[82,70,85,80,85] },
            { rank:2,  name:'에린 블랑샤르',      nation:'🇨🇦', record:'15-5',  height:'168cm', reach:'168cm', trend:'↓', stats:[80,72,82,78,82] },
            { rank:3,  name:'케이틀린 차이아노프',nation:'🇺🇸', record:'7-2',   height:'165cm', reach:'163cm', trend:'↑', stats:[80,68,82,78,85] },
            { rank:4,  name:'앤드리아 리',        nation:'🇺🇸', record:'14-4',  height:'163cm', reach:'163cm', trend:'→', stats:[78,72,80,78,80] },
            { rank:5,  name:'티아 두지아크',      nation:'🇦🇺', record:'12-3',  height:'165cm', reach:'165cm', trend:'↑', stats:[80,68,82,78,82] },
        ]
    },
    'w-bw': {
        champion: null,
        fighters: [
            { rank:1,  name:'쥬리아나 페냐',      nation:'🇺🇸', record:'12-5',  height:'168cm', reach:'163cm', trend:'→', stats:[78,82,80,78,80] },
            { rank:2,  name:'라켈 페닝턴',        nation:'🇺🇸', record:'14-9',  height:'163cm', reach:'163cm', trend:'→', stats:[75,72,80,75,78] },
            { rank:3,  name:'야스민 루시',        nation:'🇧🇷', record:'16-5',  height:'170cm', reach:'170cm', trend:'↑', stats:[80,70,82,78,82] },
            { rank:4,  name:'카일라 해리슨',      nation:'🇺🇸', record:'18-2',  height:'170cm', reach:'175cm', trend:'↑', stats:[78,75,82,78,80] },
            { rank:5,  name:'마리아나 모라에스',  nation:'🇧🇷', record:'22-11', height:'163cm', reach:'163cm', trend:'↓', stats:[75,72,78,75,78] },
        ]
    },
};
