/* ==============================
   HOME PAGE CONTROLLER
   의존성: state.js (state, archiveDB), admin.js (getActiveFights), supabase.js (sb)
============================== */
/* global sb, state, archiveDB, getActiveFights */

// ── Main Event & Matchup ──────────────────────────────────────────

// fetchMainEvent가 저장하는 canonical active fight count(=해당 upcoming event의 matchup 행 수).
// updateHeroStats가 정적 FIGHTS 대신 이 값을 쓴다 → Total Fights가 시드에 의존하지 않고 세션 내 안정.
var _homeActiveFightCount = null;

async function fetchMainEvent(sb) {
    var eventsResult = await sb.from('events').select('*')
        .eq('status', 'upcoming').order('event_date', { ascending: true }).limit(1);
    if (eventsResult.error) { console.warn('events fetch failed:', eventsResult.error.message); return null; }
    var event = eventsResult.data && eventsResult.data[0];
    if (!event) { _homeActiveFightCount = 0; return null; }   // upcoming 이벤트 없음 → active fights 0

    // 해당 upcoming event의 전체 matchup을 1회 조회(별도 count 요청 없음) → active count + 메인경기 선택을 동일 응답에서 처리.
    var muRes = await sb.from('matchups').select('*')
        .eq('event_id', event.id).order('sort_order', { ascending: true });
    if (muRes.error) { console.warn('matchups fetch failed:', muRes.error.message); return null; }
    var matchups = muRes.data || [];
    _homeActiveFightCount = matchups.length;   // canonical DB active count(정적 시드 미사용)

    // 메인경기 우선순위(기존 유지): a) is_main_event=true → b) 없으면 card_segment='main' 중 sort_order 최상위.
    // (쿼리가 sort_order asc 정렬이므로 filter[0]이 최상위. find도 동일 정렬 기준 첫 항목.)
    var matchup = matchups.find(function (m) { return m.is_main_event === true; })
        || matchups.filter(function (m) { return m.card_segment === 'main'; })[0]
        || null;
    if (!matchup) return null;

    return { event: event, matchup: matchup };
}

function renderFaceOffGlow(leftBias) {
    var card = document.getElementById('hero-faceoff-card');
    if (card) {
        if (leftBias > 0.65) {
            card.style.boxShadow = '0 0 32px rgba(210,10,10,0.35)';
        } else if (leftBias < 0.35) {
            card.style.boxShadow = '0 0 32px rgba(37,99,235,0.35)';
        } else {
            card.style.boxShadow = '';
        }
    }
}

// ── 날짜 전용 포맷터 ───────────────────────────────────────────────
// event_date는 V1에서 절대 시각이 아니라 "관리자가 입력한 달력 날짜"(전 이벤트 00:00 UTC placeholder).
//   따라서 시각/timezone을 만들지 않고 날짜만 정직하게 렌더한다.
//   · ISO 앞 YYYY-MM-DD만 사용, 숫자 엄격 검증 + Date.UTC round-trip(2026-02-30 등 거부)
//   · 브라우저 로컬 tz 변환 금지 → Intl formatter를 timeZone:'UTC'로 고정(어느 tz에서도 동일 결과)
//   · 결과 예: "7월 19일 일요일" / invalid·null → 빈 문자열
var _koDateOnlyFmt = null;
function _koDateFormatter() {
    if (!_koDateOnlyFmt) {
        _koDateOnlyFmt = new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'long' });
    }
    return _koDateOnlyFmt;
}
function formatEventDateOnly(raw) {
    if (!raw || typeof raw !== 'string') return { text: '', iso: '' };
    var m = raw.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return { text: '', iso: '' };
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return { text: '', iso: '' };
    var dt = new Date(Date.UTC(y, mo - 1, d));
    // round-trip 검증: 실제 존재하는 날짜만 통과(윤년/월말 반영, 2026-02-30 거부)
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== (mo - 1) || dt.getUTCDate() !== d) return { text: '', iso: '' };
    return { text: _koDateFormatter().format(dt), iso: m[1] + '-' + m[2] + '-' + m[3] };
}

// 홈 히어로 일정 — 자정 placeholder 기반 가짜 D/H/M/S 카운트다운을 구동/표시하지 않고,
//   날짜 + "시작 시각 미정" 중립 상태만 렌더한다(신뢰 가능한 starts_at 없음 → timer 미시작).
function renderHeroSchedule(rawDate) {
    // 이전 버전이 시작했을 수 있는 카운트다운 interval 정리(신규 timer는 만들지 않음).
    if (window._homeCountdownTimer) { clearInterval(window._homeCountdownTimer); window._homeCountdownTimer = null; }
    var cd = document.getElementById('hero-countdown');
    var when = document.getElementById('hero-event-when');
    var dateEl = document.getElementById('hero-event-date');
    var statusEl = document.getElementById('hero-event-timestatus');
    var fmt = formatEventDateOnly(rawDate);
    if (cd) cd.classList.add('hidden');                       // 가짜 카운트다운 숨김(레이아웃은 when 블록이 대체)
    if (when) when.classList.remove('hidden');
    if (fmt.text) {
        if (dateEl) { dateEl.textContent = fmt.text; dateEl.setAttribute('datetime', fmt.iso); }
        if (statusEl) statusEl.textContent = '시작 시각 미정';   // 실제 경기 시각 데이터 없음(추측 금지)
    } else {
        if (dateEl) { dateEl.textContent = ''; dateEl.removeAttribute('datetime'); }
        if (statusEl) statusEl.textContent = '일정 미정';
    }
}

async function initHomeData() {
    if (typeof sb === 'undefined' || !sb) return;
    try {
        var data = await fetchMainEvent(sb);
        if (typeof updateHeroStats === 'function') updateHeroStats();   // active count 확정 후 Total Fights 최종 표시
        if (!data) {
            var heroLabel = document.getElementById('hero-event-label');
            var redEl = document.getElementById('hero-red-name');
            var blueEl = document.getElementById('hero-blue-name');
            if (heroLabel) heroLabel.textContent = 'NO UPCOMING EVENT';
            if (redEl) redEl.textContent = 'TBA';
            if (blueEl) blueEl.textContent = 'TBA';
            renderHeroSchedule(null);   // upcoming 없음 → 가짜 카운트다운 숨김 + "일정 미정" 중립 상태
            return;
        }
        var { event, matchup } = data;

        var heroLabel = document.getElementById('hero-event-label');
        if (heroLabel) heroLabel.textContent = 'LIVE EVENT · ' + (event.title || '');

        var nameEl = document.getElementById('event-name-label');
        var dateEl = document.getElementById('event-date-label');
        if (nameEl) nameEl.textContent = event.title || '';
        if (dateEl) {
            // 날짜 전용·브라우저 tz 무관 렌더(기존 toLocaleDateString은 로컬 tz에 따라 하루 어긋나는 버그였음).
            //   시각/KST/UTC 문구는 표시하지 않음. (대진표 헤더는 admin.js applyEventInfo가 덮어쓸 수 있음 — 보고 참조)
            dateEl.textContent = formatEventDateOnly(event.event_date).text;
        }
        var redEl = document.getElementById('hero-red-name');
        var blueEl = document.getElementById('hero-blue-name');
        if (redEl && matchup.red_fighter_name) redEl.textContent = matchup.red_fighter_name;
        if (blueEl && matchup.blue_fighter_name) blueEl.textContent = matchup.blue_fighter_name;
        var redImg = document.getElementById('hero-red-img');
        var blueImg = document.getElementById('hero-blue-img');
        if (redImg && matchup.red_image_url) {
            redImg.style.backgroundImage = 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.85) 100%), url(' + matchup.red_image_url + ')';
            redImg.style.backgroundSize = 'cover, cover';
            redImg.style.backgroundPosition = 'top center, top center';
            redImg.style.backgroundRepeat = 'no-repeat, no-repeat';
        }
        if (blueImg && matchup.blue_image_url) {
            blueImg.style.backgroundImage = 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.85) 100%), url(' + matchup.blue_image_url + ')';
            blueImg.style.backgroundSize = 'cover, cover';
            blueImg.style.backgroundPosition = 'top center, top center';
            blueImg.style.backgroundRepeat = 'no-repeat, no-repeat';
        }
        // event_date는 자정 placeholder(시각 신뢰 불가) → 가짜 D/H/M/S 카운트다운 대신 날짜+중립 상태.
        renderHeroSchedule(event.event_date);
        var bias = matchup.left_bias != null ? Number(matchup.left_bias) : 0.5;
        renderFaceOffGlow(isNaN(bias) ? 0.5 : bias);
        // _dbMatchups가 없을 때만 ticker 갱신 (_dbMatchups 기반 renderHomeTicker가 더 풍부)
        if (typeof _dbMatchups === 'undefined' || !Array.isArray(_dbMatchups) || !_dbMatchups.length) {
            renderHomeTickerFromMainEvent(event, matchup);
        }
    } catch(e) {
        console.warn('initHomeData error:', e);
    }
}

// ── Ticker ────────────────────────────────────────────────────────

var _homeTickerSource = 'static'; // 'static' | 'news' | 'event'

async function fetchTickerKeywords() {
    if (typeof sb === 'undefined' || !sb) return [];
    try {
        var result = await sb.from('news_cache').select('title')
            .order('published_at', { ascending: false }).limit(10);
        if (result.error) return [];
        return (result.data || []).map(function(r) {
            if (!r || !r.title) return null;
            // " - 출처명" 접미사 제거
            return String(r.title).replace(/\s*[-–]\s*[^-–]+$/, '').trim();
        }).filter(function(k) { return k && k.length > 0; });
    } catch(e) { return []; }
}

function injectTickerItems(keywords, source) {
    var ticker = document.querySelector('.animate-ticker');
    if (!ticker) return;
    if (!Array.isArray(keywords) || !keywords.length) return;
    var sep = '<span class="mx-3 text-[11px] font-bold italic" style="color:var(--red)">✦</span>';
    ticker.innerHTML = keywords.map(k =>
        `<span class="barlow font-bold italic tracking-widest text-[11px] uppercase text-gray-400">${String(k).replace(/</g,'&lt;')}</span>`
    ).join(sep);
    if (source) _homeTickerSource = source;
}

function renderHomeTickerFromMainEvent(event, matchup) {
    var eventTitle = (event && event.title) ? event.title : '';
    var redName = (matchup && matchup.red_fighter_name) ? matchup.red_fighter_name : '';
    var blueName = (matchup && matchup.blue_fighter_name) ? matchup.blue_fighter_name : '';
    var items = [];
    if (eventTitle && redName && blueName) {
        items.push(eventTitle + ' · ' + redName + ' VS ' + blueName);
    } else if (redName && blueName) {
        items.push('NEXT FIGHT · ' + redName + ' VS ' + blueName);
    }
    items.push('PICK-TAGON · 픽 등록하고 포인트 적립');
    items.push('파이터 IQ 랭킹 도전 · 지금 시작하세요');
    if (items.length) injectTickerItems(items, 'event');
}

function renderHomeTicker() {
    var fights = (typeof _dbMatchups !== 'undefined' && Array.isArray(_dbMatchups)) ? _dbMatchups : [];
    var mainFight = fights.find(function(f) { return f.tag === 'MAIN EVENT'; }) || fights[0];
    var items = [];

    if (mainFight) {
        var eventTitle = mainFight._eventTitle || '';
        var redName = (mainFight.f1 && mainFight.f1.name) ? mainFight.f1.name : '';
        var blueName = (mainFight.f2 && mainFight.f2.name) ? mainFight.f2.name : '';
        if (eventTitle && redName && blueName) {
            items.push(eventTitle + ' · ' + redName + ' VS ' + blueName);
        } else if (redName && blueName) {
            items.push('NEXT FIGHT · ' + redName + ' VS ' + blueName);
        }
    }

    fights.slice(1, 4).forEach(function(f) {
        if (!f.f1 || !f.f2) return;
        var divShort = (f.division || '').replace(' CHAMPIONSHIP', '').replace("WOMEN'S", 'W').trim();
        var label = divShort
            ? divShort + ' · ' + f.f1.name + ' VS ' + f.f2.name
            : f.f1.name + ' VS ' + f.f2.name;
        items.push(label);
    });

    items.push('PICK-TAGON · 픽 등록하고 포인트 적립');
    items.push('파이터 IQ 랭킹 도전 · 지금 시작하세요');

    if (items.length) injectTickerItems(items, 'event');
}

// ── News Rendering ────────────────────────────────────────────────

function renderNewsSkeleton(count) {
    return `<div class="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
        ${Array.from({ length: count }, () => `
        <div class="glass-card rounded-2xl overflow-hidden animate-pulse">
            <div class="h-40 bg-white/10 rounded-t-2xl"></div>
            <div class="p-4">
                <div class="h-3 bg-white/10 rounded w-3/4 my-2"></div>
                <div class="h-3 bg-white/10 rounded w-1/2 my-2"></div>
            </div>
        </div>`).join('')}
    </div>`;
}

// Fallback pool — 5 confirmed Unsplash photos (all already used in app, Unsplash free license)
var _NEWS_FALLBACK_POOL = [
    'https://images.unsplash.com/photo-1552072092-7f9b8d63efcb?auto=format&fit=crop&q=80&w=600',
    'https://images.unsplash.com/photo-1555072956-7758afb20e8f?auto=format&fit=crop&q=80&w=600',
    'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&q=80&w=600',
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&q=80&w=600',
    'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&q=80&w=600',
];
var _NEWS_FALLBACK_IMG = _NEWS_FALLBACK_POOL[0]; // backward-compat alias

// Per-category pools ordered by relevance; idx % pool.length gives stable diversity
var _NEWS_CATEGORY_POOLS = {
    'ufc':     [
        'https://images.unsplash.com/photo-1552072092-7f9b8d63efcb?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1555072956-7758afb20e8f?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&q=80&w=600',
    ],
    'result':  [
        'https://images.unsplash.com/photo-1555072956-7758afb20e8f?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1552072092-7f9b8d63efcb?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&q=80&w=600',
    ],
    'fighter': [
        'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1555072956-7758afb20e8f?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1552072092-7f9b8d63efcb?auto=format&fit=crop&q=80&w=600',
    ],
    'event':   [
        'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1555072956-7758afb20e8f?auto=format&fit=crop&q=80&w=600',
    ],
    'ranking': [
        'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1552072092-7f9b8d63efcb?auto=format&fit=crop&q=80&w=600',
    ],
};

function getNewsCategoryImg(category, idx) {
    var pool = _NEWS_CATEGORY_POOLS[category] || _NEWS_FALLBACK_POOL;
    var i = (typeof idx === 'number' && idx >= 0) ? idx : 0;
    return pool[i % pool.length];
}

function renderNewsCards(newsItems) {
    if (!newsItems || !newsItems.length) return '<p class="col-span-3 text-center text-gray-600 oswald-sharp text-xs italic uppercase">등록된 뉴스가 없습니다</p>';
    return '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">' +
        newsItems.map(function(item, i) {
            var title = item.title || '', url = item.url || '#', source = item.source || '', date = item.date || '';
            var imgSrc = item.thumbnail_url || getNewsCategoryImg(item.category, i);
            var fbUrl = _NEWS_FALLBACK_POOL[(i + 1) % _NEWS_FALLBACK_POOL.length];
            var safeTitle = String(title).replace(/</g,'&lt;');
            var safeSource = String(source).replace(/</g,'&lt;');
            return '<a href="' + url + '" target="_blank" rel="noopener noreferrer" class="block group no-underline text-inherit">' +
                '<div class="glass-card rounded-2xl overflow-hidden border border-white/6 hover:border-white/20 transition-all duration-300 hover:scale-[1.02]">' +
                '<div class="relative overflow-hidden" style="height:170px">' +
                '<img src="' + imgSrc + '" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="this.src=\'' + fbUrl + '\'">' +
                '<div class="absolute inset-0 pointer-events-none" style="background:linear-gradient(to top,rgba(0,0,0,0.55) 0%,transparent 55%)"></div>' +
                (safeSource ? '<div class="absolute top-3 left-3 barlow text-[10px] font-bold italic tracking-widest uppercase px-2 py-1 rounded" style="background:rgba(225,6,0,0.9);color:#fff">' + safeSource + '</div>' : '') +
                '</div>' +
                '<div class="p-4">' +
                '<div class="oswald-sharp text-sm lg:text-base font-black italic uppercase text-white line-clamp-2 group-hover:text-ufcRed transition leading-snug">' + safeTitle + '</div>' +
                '<div class="barlow text-[10px] text-gray-500 italic mt-2">' + date + '</div>' +
                '</div></div></a>';
        }).join('') +
    '</div>';
}

// ── Entry Point ───────────────────────────────────────────────────

async function initHome() {
    updateHeroStats();

    // DB-driven data (non-blocking)
    initHomeData();

    // Ticker: 이벤트 데이터(로드 완료 시) → 뉴스 키워드 → static fallback
    if (typeof _dbMatchups !== 'undefined' && Array.isArray(_dbMatchups) && _dbMatchups.length > 0) {
        renderHomeTicker();
    } else {
        fetchTickerKeywords().then(function(keywords) {
            if (keywords.length && _homeTickerSource !== 'event') injectTickerItems(keywords, 'news');
            // else event ticker already rendered, or static fallback in place
        });
    }

    // 뉴스 스켈레톤은 renderHomeNews() 내부에서 처리
}

// ── Countdown ────────────────────────────────────────────────────

function startCountdown(targetDate) {
    var eventDate = new Date(targetDate);
    if (window._homeCountdownTimer) {
        clearInterval(window._homeCountdownTimer);
        window._homeCountdownTimer = null;
    }
    function setEl(id, v) { var el = document.getElementById(id); if (el) el.textContent = String(v).padStart(2,'0'); }
    function update() {
        var diff = eventDate.getTime() - Date.now();
        if (isNaN(diff) || diff <= 0) { ['cd-d','cd-h','cd-m','cd-s'].forEach(id => setEl(id, 0)); return; }
        setEl('cd-d', Math.floor(diff / 86400000));
        setEl('cd-h', Math.floor((diff % 86400000) / 3600000));
        setEl('cd-m', Math.floor((diff % 3600000) / 60000));
        setEl('cd-s', Math.floor((diff % 60000) / 1000));
    }
    update();
    window._homeCountdownTimer = setInterval(update, 1000);
}

// ── Stats ─────────────────────────────────────────────────────────
// [perf/Stage 4B-P0] 단일 공유 rAF 루프로 fights/picks/points를 같은 프레임에 배치 갱신.
//   기존: 3개 animateCount가 각자 rAF 루프 → 폭이 커지는 숫자 텍스트 변경이 프레임마다 개별 리플로우.
//   개선: 한 프레임에 함께 갱신 + 시작을 idle까지 지연(부팅 크리티컬 레이아웃과 경쟁 회피).
//         idle 미지원/과다 지연 시 rAF·setTimeout fallback(timeout 300ms). 같은 id 새 목표 = 이전 generation 무효화.
var _statTargets = {};   // id -> { el, from, to, t0 }
var _statRAF = 0;        // 활성 rAF 핸들(0 = 미실행)
var _statIdle = 0;       // 대기 중 idle/timeout 핸들(0 = 없음)
var _STAT_DUR = 1200;

function _statStep(now) {
    _statRAF = 0;
    var ids = Object.keys(_statTargets), alive = false;
    for (var i = 0; i < ids.length; i++) {
        var t = _statTargets[ids[i]];
        if (!t.el) { delete _statTargets[ids[i]]; continue; }
        if (!t.t0) t.t0 = now;
        var p = Math.min((now - t.t0) / _STAT_DUR, 1), ease = 1 - Math.pow(1 - p, 3);
        t.el.textContent = Math.round(t.from + (t.to - t.from) * ease).toLocaleString();
        if (p >= 1) delete _statTargets[ids[i]]; else alive = true;
    }
    if (alive) _statRAF = requestAnimationFrame(_statStep);
}

function _statSchedule() {
    if (_statRAF || _statIdle) return;   // 이미 예약됨(중복 루프 방지)
    var start = function () {
        _statIdle = 0;
        if (!_statRAF && Object.keys(_statTargets).length) _statRAF = requestAnimationFrame(_statStep);
    };
    if (typeof requestIdleCallback === 'function') _statIdle = requestIdleCallback(start, { timeout: 300 });  // idle 대기, 300ms 초과 시 강제 실행
    else _statIdle = setTimeout(start, 0);   // 미지원 브라우저 → 다음 틱
}

function animateCount(id, target) {
    var el = document.getElementById(id);
    if (!el) return;
    var to = Number(target) || 0;
    var cur = String(el.textContent || '').replace(/[^0-9.\-]/g, '');   // '—'/빈값 → 0
    var from = cur === '' ? 0 : (Number(cur) || 0);
    if (from === to) { el.textContent = to.toLocaleString(); delete _statTargets[id]; return; }  // 변화 없음 → 즉시 확정(불필요 리플로우 0)
    _statTargets[id] = { el: el, from: from, to: to, t0: 0 };   // 같은 id 덮어쓰기 = 이전 generation 무효화, 현재 표시값에서 이어서 애니
    _statSchedule();
}

// ── Total Fights: archive 전체 payload를 홈에서 재로드하지 않고 경량 count만 사용 ──
// 우선순위: archiveDB(이미 로드된 전체 payload) 합계 > localStorage 캐시 count > (없으면) 경량 HEAD count.
// 표시값 = archive_fights 총계 + 현재 active fights → 방문 순서와 무관하게 동일.
var _AF_COUNT_KEY = 'picktagon_archive_fight_count_v1';
var _AF_COUNT_TTL_MS = 6 * 60 * 60 * 1000;   // 6h — 신선하면 요청 0, 만료 시 백그라운드 재검증
var _afCountInflight = null;

function _afReadCache() {
    try { var o = JSON.parse(localStorage.getItem(_AF_COUNT_KEY) || 'null'); return (o && typeof o.count === 'number' && typeof o.ts === 'number') ? o : null; } catch (e) { return null; }
}
function _afWriteCache(count) {
    try { localStorage.setItem(_AF_COUNT_KEY, JSON.stringify({ count: count, ts: Date.now() })); } catch (e) { /* storage 비활성 무시 */ }
}
// archiveDB(전체 payload)가 로드됐으면 그 합계(+캐시 최신화), 아니면 캐시 count, 둘 다 없으면 null.
function _archiveFightCount() {
    if (typeof archiveDB !== 'undefined' && Array.isArray(archiveDB) && archiveDB.length) {
        var sum = archiveDB.reduce(function (s, e) { return s + ((e.fights || []).length); }, 0);
        _afWriteCache(sum);
        return sum;
    }
    var c = _afReadCache();
    return c ? c.count : null;
}
// 경량 HEAD count(행 payload 미수신). archiveDB 로드/신선 캐시면 요청 0. in-flight 공유. 실패 시 마지막 캐시 유지.
function _ensureArchiveFightCount(onDone) {
    if (typeof archiveDB !== 'undefined' && Array.isArray(archiveDB) && archiveDB.length) { if (onDone) onDone(); return; }
    var cached = _afReadCache();
    if (cached && (Date.now() - cached.ts) < _AF_COUNT_TTL_MS) { if (onDone) onDone(); return; }   // 신선 → 요청 0
    if (_afCountInflight) { if (onDone) _afCountInflight.then(onDone); return; }                    // in-flight 공유
    if (typeof sb === 'undefined' || !sb) { if (onDone) onDone(); return; }
    _afCountInflight = sb.from('archive_fights').select('*', { count: 'exact', head: true }).then(function (res) {
        _afCountInflight = null;
        if (!res.error && typeof res.count === 'number') _afWriteCache(res.count);   // 성공만 갱신(실패 시 기존 캐시 유지)
    }).catch(function () { _afCountInflight = null; });
    if (onDone) _afCountInflight.then(onDone);
}

// active fight count: _dbMatchups 로드 시 그 길이 → 아니면 fetchMainEvent가 저장한 _homeActiveFightCount → 없으면 null.
// 정적 FIGHTS/customFights는 Total Fights 계산에 사용하지 않는다(시드 의존 금지 → 방문 순서·로드 시점 무관 동일값).
function _homeActiveCount() {
    if (typeof _dbMatchups !== 'undefined' && Array.isArray(_dbMatchups) && _dbMatchups.length) return _dbMatchups.length;
    if (typeof _homeActiveFightCount === 'number') return _homeActiveFightCount;
    return null;
}

function updateHeroStats() {
    var s = typeof state === 'object' && state ? state : {};
    var archCount = _archiveFightCount();               // archiveDB 합계 or 캐시 or null
    var activeCount = _homeActiveCount();               // DB matchup 개수(정적 시드 미사용) or null
    var shown = (archCount == null || activeCount == null) ? null : (archCount + activeCount);
    var statEl = document.getElementById('stat-fights');
    if (shown == null) {
        if (statEl) statEl.textContent = '—';           // archive/active 중 미확정 → 잘못된 중간 숫자 대신 —
    } else {
        animateCount('stat-fights', shown);
    }
    animateCount('stat-picks', Number(s.total) || 0);
    animateCount('stat-pts', Number(s.points) || 0);
    // 백그라운드 archive count 로드(요청 0~1) 후 archive+active 총계로 최종 재표시(값 바뀔 때만 재애니).
    _ensureArchiveFightCount(function () {
        var c = _archiveFightCount(), a = _homeActiveCount();
        if (c == null || a == null) return;
        var target = c + a;
        if (target !== shown) animateCount('stat-fights', target);
    });
}
