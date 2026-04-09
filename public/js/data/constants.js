const BET_COST = 100;

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
