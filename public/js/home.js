/* ==============================
   HOME PAGE CONTROLLER
   의존성: state.js (state, archiveDB), admin.js (getActiveFights), supabase.js (sb)
============================== */
/* global sb, state, archiveDB, getActiveFights */

// ── Main Event & Matchup ──────────────────────────────────────────

async function fetchMainEvent(sb) {
    var eventsResult = await sb.from('events').select('*')
        .eq('status', 'upcoming').order('event_date', { ascending: true }).limit(1);
    if (eventsResult.error) { console.warn('events fetch failed:', eventsResult.error.message); return null; }
    var event = eventsResult.data && eventsResult.data[0];
    if (!event) return null;

    var matchupResult = await sb.from('matchups').select('*')
        .eq('event_id', event.id).eq('is_main_event', true).limit(1);
    if (matchupResult.error) { console.warn('matchups fetch failed:', matchupResult.error.message); return null; }
    var matchup = matchupResult.data && matchupResult.data[0];
    if (!matchup) return null;

    return { event, matchup };
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

async function initHomeData() {
    if (typeof sb === 'undefined' || !sb) return;
    try {
        var data = await fetchMainEvent(sb);
        if (!data) return;
        var { event, matchup } = data;

        var nameEl = document.getElementById('event-name-label');
        var dateEl = document.getElementById('event-date-label');
        if (nameEl) nameEl.textContent = event.title || '';
        if (dateEl) {
            var d = new Date(event.event_date);
            dateEl.textContent = isNaN(d.getTime()) ? '' :
                d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' }).toUpperCase();
        }
        var redEl = document.getElementById('hero-red-name');
        var blueEl = document.getElementById('hero-blue-name');
        if (redEl && matchup.red_fighter_name) redEl.textContent = matchup.red_fighter_name;
        if (blueEl && matchup.blue_fighter_name) blueEl.textContent = matchup.blue_fighter_name;
        startCountdown(event.event_date);
        renderFaceOffGlow(Number(matchup.left_bias) || 0.5);
    } catch(e) {
        console.warn('initHomeData error:', e);
    }
}

// ── Ticker ────────────────────────────────────────────────────────

async function fetchTickerKeywords() {
    if (typeof sb === 'undefined' || !sb) return [];
    try {
        var result = await sb.from('news').select('keyword')
            .order('created_at', { ascending: false }).limit(10);
        if (result.error) return [];
        return (result.data || []).map(r => r && r.keyword).filter(k => k && String(k).trim());
    } catch(e) { return []; }
}

function injectTickerItems(keywords) {
    var ticker = document.querySelector('.animate-ticker');
    if (!ticker) return;
    if (!Array.isArray(keywords) || !keywords.length) return;
    var sep = '<span class="mx-3 text-[11px] font-bold italic" style="color:var(--red)">✦</span>';
    ticker.innerHTML = keywords.map(k =>
        `<span class="barlow font-bold italic tracking-widest text-[11px] uppercase text-gray-400">${String(k).replace(/</g,'&lt;')}</span>`
    ).join(sep);
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

function renderNewsCards(newsItems) {
    if (!newsItems || !newsItems.length) return '<p class="col-span-3 text-center text-gray-600 oswald-sharp text-xs italic uppercase">등록된 뉴스가 없습니다</p>';
    return `<div class="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5">
        ${newsItems.map(({ title, url, thumbnail_url, source, date }) => `
        <a href="${url}" target="_blank" rel="noopener noreferrer" class="block group">
            <div class="glass-card rounded-2xl overflow-hidden hover:border-white/20 transition border border-white/[0.06]">
                <img src="${thumbnail_url || ''}" class="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-500" onerror="this.style.display='none'">
                <div class="p-4">
                    <div class="oswald-sharp text-sm font-black italic uppercase text-white line-clamp-2 group-hover:text-ufcRed transition">${title}</div>
                    <div class="barlow text-[9px] text-gray-600 italic mt-2">${source || ''} ${date ? '· ' + date : ''}</div>
                </div>
            </div>
        </a>`).join('')}
    </div>`;
}

// ── Entry Point ───────────────────────────────────────────────────

async function initHome() {
    updateHeroStats();

    // DB-driven data (non-blocking)
    initHomeData();

    // Ticker: DB keywords → fallback to static
    fetchTickerKeywords().then(keywords => {
        if (keywords.length) injectTickerItems(keywords);
        // else static HTML already in place
    });

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

function animateCount(id, target) {
    var el = document.getElementById(id);
    if (!el) return;
    var end = Number(target) || 0, dur = 1200, t0 = performance.now();
    function step(now) {
        var p = Math.min((now - t0) / dur, 1), ease = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(end * ease).toLocaleString();
        if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function updateHeroStats() {
    var activeFights = typeof getActiveFights === 'function' ? getActiveFights() : [];
    var archive = Array.isArray(archiveDB) ? archiveDB : [];
    var s = typeof state === 'object' && state ? state : {};
    var totalFights = archive.reduce((sum, e) => sum + (e.fights || []).length, activeFights.length);
    animateCount('stat-fights', totalFights);
    animateCount('stat-picks', Number(s.total) || 0);
    animateCount('stat-pts', Number(s.points) || 0);
}
