/* ==============================
   HOME PAGE CONTROLLER
   의존성: state.js (state, archiveDB), admin.js (getActiveFights)
============================== */

async function fetchHomeConfig() {
    return Promise.resolve({
        targetDate: '2026-04-12T00:00:00Z',
        tickerItems: [
            '🔥 KINGBOTTLE predicted Makhachev KO!',
            '📈 Poirier odds are increasing',
            '🏆 UFC 313 Main Event Confirmed'
        ]
    });
}

async function initHome() {
    const config = await fetchHomeConfig();
    startCountdown(config.targetDate);
    startDynamicTicker(config.tickerItems);
    updateHeroStats();
}

function startCountdown(targetDate) {
    const eventDate = new Date(targetDate);

    if (window._homeCountdownTimer) {
        clearInterval(window._homeCountdownTimer);
        window._homeCountdownTimer = null;
    }

    function setEl(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = String(value).padStart(2, '0');
    }

    function update() {
        if (Number.isNaN(eventDate.getTime())) {
            ['cd-d', 'cd-h', 'cd-m', 'cd-s'].forEach(id => setEl(id, 0));
            return;
        }
        const diff = eventDate.getTime() - Date.now();
        if (diff <= 0) {
            ['cd-d', 'cd-h', 'cd-m', 'cd-s'].forEach(id => setEl(id, 0));
            return;
        }
        setEl('cd-d', Math.floor(diff / 86400000));
        setEl('cd-h', Math.floor((diff % 86400000) / 3600000));
        setEl('cd-m', Math.floor((diff % 3600000) / 60000));
        setEl('cd-s', Math.floor((diff % 60000) / 1000));
    }

    update();
    window._homeCountdownTimer = setInterval(update, 1000);
}

function startDynamicTicker(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    const nodes = document.querySelectorAll('#home-ticker .ticker-scroll > div');
    if (!nodes.length) return;
    const sep = '<span class="mx-4 text-[11px] font-bold italic" style="color:var(--red)">✦</span>';
    const html = items.map(item =>
        '<span class="barlow font-bold italic tracking-widest text-[11px] text-gray-400">' +
        String(item).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') +
        '</span>'
    ).join(sep);
    nodes.forEach(node => { node.innerHTML = html; });
}

function animateCount(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const end = Number(target) || 0;
    const duration = 1200;
    const startTime = performance.now();
    function step(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(end * eased).toLocaleString();
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function updateHeroStats() {
    const activeFights = typeof getActiveFights === 'function' ? getActiveFights() : [];
    const archive = Array.isArray(archiveDB) ? archiveDB : [];
    const s = typeof state === 'object' && state ? state : {};
    const totalFights = archive.reduce((sum, e) => sum + ((e.fights || []).length), activeFights.length);
    animateCount('stat-fights', totalFights);
    animateCount('stat-picks', Number(s.total) || 0);
    animateCount('stat-pts', Number(s.points) || 0);
}
