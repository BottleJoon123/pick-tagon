/* ==============================
   ADMIN SYSTEM
   (extracted from index.html – global functions, no import/export)
   의존성: state.js (adminUnlocked, adminGateMode, editingFighterId,
           editingFightCardId, fighterDB, customFights, sb, currentUser, state)
           storage.js (save), utils.js (showToast, escapeHtml)
============================== */

var adminGateMode = 'signin';
var editingFighterId = null;
var editingFightCardId = null;

// Fighter DB (persisted separately)
var fighterDB = [];
// Dynamic fight cards (override FIGHTS if set)
var customFights = [];

function loadAdmin() {
    const f = localStorage.getItem('picktagon_fighters');
    const fc = localStorage.getItem('picktagon_custom_fights');
    if (f) fighterDB = JSON.parse(f);
    if (fc) customFights = JSON.parse(fc);
}

function saveAdmin() {
    localStorage.setItem('picktagon_fighters', JSON.stringify(fighterDB));
    localStorage.setItem('picktagon_custom_fights', JSON.stringify(customFights));
}

function getActiveFights() {
    if (typeof _dbMatchups !== 'undefined' && _dbMatchups.length > 0) return _dbMatchups;
    return customFights.length > 0 ? customFights : FIGHTS;
}

// ----- PASSWORD GATE -----
function configureAdminGate(mode) {
    adminGateMode = mode;
    var copy = document.getElementById('admin-gate-copy');
    var subcopy = document.getElementById('admin-gate-subcopy');
    var action = document.getElementById('admin-gate-action');
    if (!copy || !subcopy || !action) return;

    if (mode === 'signin') {
        copy.textContent = 'Admin tools require a signed-in account.';
        subcopy.textContent = 'Sign in with an authorized admin account to continue.';
        action.textContent = 'Sign In';
        return;
    }

    copy.textContent = 'This account does not have admin access.';
    subcopy.textContent = 'Admin privileges are controlled by your authenticated user profile.';
    action.textContent = 'Close';
}

function openAdminGate() {
    if (adminUnlocked) { navigateTo('admin'); return; }
    configureAdminGate(currentUser ? 'denied' : 'signin');
    document.getElementById('admin-gate-modal').classList.remove('hidden');
}

function closeAdminGate() {
    document.getElementById('admin-gate-modal').classList.add('hidden');
}

function handleAdminGateAction() {
    if (adminGateMode === 'signin') {
        closeAdminGate();
        document.getElementById('auth-modal').classList.remove('hidden');
        setAuthTab('login');
        return;
    }
    closeAdminGate();
}

function logoutAdmin() {
    adminUnlocked = false;
    navigateTo('home');
    showToast('🔒 어드민 로그아웃');
}

// ----- ADMIN TAB -----
function switchAdminTab(tab) {
    ['fighters', 'fights', 'archive', 'news', 'season', 'event', 'ufc', 'settings'].forEach(t => {
        document.getElementById(`admin-panel-${t}`).classList.add('hidden');
        document.getElementById(`admin-tab-${t}`).classList.remove('active-tab', 'text-ufcRed');
        document.getElementById(`admin-tab-${t}`).classList.add('text-gray-500');
    });
    document.getElementById(`admin-panel-${tab}`).classList.remove('hidden');
    document.getElementById(`admin-tab-${tab}`).classList.add('active-tab');
    document.getElementById(`admin-tab-${tab}`).classList.remove('text-gray-500');
    if (tab === 'fighters') renderAdminFighterList();
    if (tab === 'season') renderSeasonAdminPanel();
    if (tab === 'settings') { loadGeminiKeyToUI(); }
    if (tab === 'ufc') { fetchPendingEvents(); fetchApprovedEvents(); }
}

// ── Gemini API Key 관리 (어드민 설정 탭) ──
function loadGeminiKeyToUI() {
    var key = localStorage.getItem('picktagon_gemini_key') || '';
    var input = document.getElementById('admin-gemini-key-input');
    var status = document.getElementById('admin-gemini-key-status');
    if (input) input.value = key;
    if (status) {
        if (key) {
            status.textContent = '✅ API 키가 설정되어 있습니다';
            status.className = 'oswald-sharp text-[10px] mt-2 italic uppercase tracking-widest text-green-400';
        } else {
            status.textContent = '⚠ API 키가 없습니다 — 번역이 비활성화됩니다';
            status.className = 'oswald-sharp text-[10px] mt-2 italic uppercase tracking-widest text-gray-500';
        }
    }
}

function saveGeminiKey() {
    var key = (document.getElementById('admin-gemini-key-input').value || '').trim();
    if (!key) { showToast('⚠ API 키를 입력해주세요'); return; }
    localStorage.setItem('picktagon_gemini_key', key);
    loadGeminiKeyToUI();
    showToast('✅ Gemini API 키가 저장되었습니다');
}

function clearGeminiKey() {
    localStorage.removeItem('picktagon_gemini_key');
    document.getElementById('admin-gemini-key-input').value = '';
    loadGeminiKeyToUI();
    showToast('🗑 API 키가 삭제되었습니다');
}

function toggleGeminiKeyVisibility() {
    var input = document.getElementById('admin-gemini-key-input');
    var btn = document.getElementById('admin-gemini-key-toggle');
    if (input.type === 'password') { input.type = 'text'; btn.textContent = 'HIDE'; }
    else { input.type = 'password'; btn.textContent = 'SHOW'; }
}

// ----- FIGHTER DB -----
// 예측 커뮤니티 자동 공유
function autoSharePick(pick, match, payout, isUpset, fightId) {
    const name = getDisplayUsername();
    const bName = state.points <= 1000 ? "White Belt" : (state.points <= 2000 ? "Blue Belt" : (state.points <= 5000 ? "Purple Belt" : (state.points <= 10000 ? "Brown Belt" : "Black Belt")));
    const upsetTag = isUpset ? ' 🔥 [업셋픽]' : '';
    const title = `${name}의 픽: ${match.split(' vs ')[0].split(' ').pop()} vs ${match.split(' vs ')[1]?.split(' ').pop() || '?'}`;
    const content = `${pick} 승리 예측${upsetTag} · 예상 배당 ${payout}P`;

    posts.unshift({
        id: Date.now(),
        author: name,
        title,
        content,
        likes: 0,
        date: new Date().toISOString().slice(0,10).replace(/-/g,'.'),
        comments: [],
        belt: bName,
        isPickShare: true,
        fightId
    });
    save();
}

const STYLE_LABELS = { striker:'스트라이커 🥊', grappler:'그래플러 🤼', wrestler:'레슬러 💪', submission:'서브미션 🔒', 'all-around':'올라운더 ⭐' };
const STYLE_COLORS = { striker:'text-red-400 border-red-400/30', grappler:'text-blue-400 border-blue-400/30', wrestler:'text-green-400 border-green-400/30', submission:'text-purple-400 border-purple-400/30', 'all-around':'text-yellow-400 border-yellow-400/30' };
const ADMIN_DIV_LABEL = {
    hw:'헤비웨이트', lhw:'라이트헤비웨이트', mw:'미들웨이트', ww:'웰터웨이트',
    lw:'라이트웨이트', fw:'페더웨이트', bw:'밴텀웨이트', flw:'플라이웨이트',
    wmw:'여성 스트로웨이트', wfw:'여성 플라이웨이트', wbw:'여성 밴텀웨이트', wfe:'여성 페더웨이트',
};

function renderAdminFighterList() {
    const list = document.getElementById('fighter-db-list');
    const count = document.getElementById('fighter-count');
    if (!list) return;

    if (sb) {
        list.innerHTML = '<div class="glass-card p-6 text-center text-gray-600 oswald-sharp text-xs italic uppercase tracking-widest rounded-2xl animate-pulse">로딩 중...</div>';
        // Always fetch fresh from Supabase — DB is source of truth
        sb.from('fighters').select('*')
            .order('division').order('rank', { ascending: true, nullsFirst: false })
            .then(function(res) {
                if (res.data) {
                    fighterDB = res.data;
                    saveAdmin();
                }
                _renderFighterListUI(list, count);
            });
        return;
    }
    _renderFighterListUI(list, count);
}

// Called by search/filter inputs (no Supabase re-fetch, just re-render from cache)
function _renderFighterListFromCache() {
    const list = document.getElementById('fighter-db-list');
    const count = document.getElementById('fighter-count');
    if (list && count) _renderFighterListUI(list, count);
}

function _renderFighterListUI(list, count) {
    const query  = (document.getElementById('fighter-search-input')?.value || '').toLowerCase();
    const divFil = (document.getElementById('fighter-div-filter')?.value || '');

    const filtered = fighterDB.filter(f => {
        const nameOk = !query ||
            (f.name || '').toLowerCase().includes(query) ||
            (f.name_en || '').toLowerCase().includes(query);
        const divOk = !divFil || f.division === divFil;
        return nameOk && divOk;
    });
    count.textContent = fighterDB.length;

    if (fighterDB.length === 0) {
        list.innerHTML = `<div class="glass-card p-8 text-center text-gray-600 oswald-sharp text-xs italic uppercase tracking-widest rounded-2xl">등록된 파이터가 없습니다 — 파이터를 추가하세요</div>`;
        return;
    }
    if (filtered.length === 0) {
        list.innerHTML = `<div class="glass-card p-8 text-center text-gray-600 oswald-sharp text-xs italic uppercase tracking-widest rounded-2xl">검색 결과가 없습니다</div>`;
        return;
    }

    list.innerHTML = filtered.map(f => {
        const styleCls   = STYLE_COLORS[f.style] || STYLE_COLORS['all-around'];
        const styleLabel = STYLE_LABELS[f.style] || STYLE_LABELS['all-around'];
        const record     = f.record || (
            (f.wins !== undefined) ? `${f.wins}-${f.losses}${f.draws ? '-'+f.draws : ''}` : '—'
        );
        const rankLabel  = f.rank === 0 ? 'CHAMP' : (f.rank ? `#${f.rank}` : 'NR');
        const divLabel   = ADMIN_DIV_LABEL[f.division] || (f.division || '—').toUpperCase();
        const displayName = f.name || f.name_en || '—';
        const avatar = f.image_url
            ? `<img src="${f.image_url}" class="w-10 h-10 lg:w-12 lg:h-12 rounded-full object-cover border border-ufcRed/30 flex-shrink-0" onerror="this.style.display='none'">`
            : `<div class="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-ufcRed/10 border border-ufcRed/30 flex-shrink-0 flex items-center justify-center oswald-sharp text-ufcRed font-black italic text-xs">${(f.name_en || f.name || '?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</div>`;

        const profileData = JSON.stringify({
            id: f.id, name: displayName, name_en: f.name_en,
            record, height: f.height, reach: f.reach, odds: f.odds,
            rank: rankLabel, division: divLabel, style: f.style,
            stats: f.stats, image_url: f.image_url,
        }).replace(/"/g,'&quot;');

        return `
        <div class="glass-card rounded-2xl p-4 lg:p-6 flex items-center justify-between hover:border-ufcRed/30 transition-all">
            <div class="flex items-center gap-4 lg:gap-6 cursor-pointer group" onclick="openFighterProfile('${profileData}')">
                ${avatar}
                <div>
                    <div class="flex items-center gap-2 mb-0.5">
                        <p class="oswald-sharp font-black italic text-sm lg:text-xl text-white uppercase tracking-tighter group-hover:text-ufcRed transition">${escapeHtml(displayName)}</p>
                        <span class="oswald-sharp text-[8px] border ${styleCls} px-1.5 py-0.5 rounded-md font-black italic uppercase hidden lg:inline">${styleLabel}</span>
                    </div>
                    <p class="oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest">${escapeHtml(divLabel)} · ${escapeHtml(record)} · ${rankLabel}${f.country ? ' · ' + escapeHtml(f.country) : ''}</p>
                </div>
            </div>
            <div class="flex items-center gap-2 lg:gap-3">
                <button onclick="openFighterModal('${f.id}')" class="oswald-sharp text-[10px] lg:text-xs border border-white/10 text-gray-400 hover:text-white hover:border-white/30 px-3 lg:px-4 py-2 rounded-xl italic uppercase tracking-widest transition">수정</button>
                <button onclick="deleteFighter('${f.id}')" class="oswald-sharp text-[10px] lg:text-xs border border-ufcRed/20 text-ufcRed/60 hover:text-ufcRed hover:border-ufcRed px-3 lg:px-4 py-2 rounded-xl italic uppercase tracking-widest transition">삭제</button>
            </div>
        </div>`;
    }).join('');
}

function buildStatsSliders(stats) {
    const container = document.getElementById('stats-sliders');
    container.innerHTML = STAT_LABELS.map((label, i) => `
        <div>
            <div class="flex justify-between mb-1">
                <label class="oswald-sharp text-[10px] text-gray-500 uppercase tracking-widest italic">${label}</label>
                <span id="stat-val-${i}" class="oswald-sharp text-[10px] text-white font-black italic">${stats ? stats[i] : 75}</span>
            </div>
            <input type="range" class="stat-slider" id="stat-range-${i}" min="0" max="100" value="${stats ? stats[i] : 75}"
                oninput="document.getElementById('stat-val-${i}').textContent = this.value">
        </div>
    `).join('');
}

function openFighterModal(fighterId) {
    editingFighterId = fighterId || null;
    const modal = document.getElementById('fighter-modal');
    const title = document.getElementById('fighter-modal-title');
    modal.classList.remove('hidden');

    if (fighterId) {
        const f = fighterDB.find(x => x.id === fighterId);
        if (!f) return;
        title.textContent = '파이터 수정';
        document.getElementById('fm-name').value = f.name;
        document.getElementById('fm-name-en').value = f.name_en || '';
        document.getElementById('fm-country').value = f.country || '';
        // W/L/D — 기존 record 문자열에서 파싱
        const wm = (f.record || '').match(/(\d+)W/); const lm = (f.record || '').match(/(\d+)L/); const dm = (f.record || '').match(/(\d+)D/);
        document.getElementById('fm-wins').value = f.wins !== undefined ? f.wins : (wm ? wm[1] : 0);
        document.getElementById('fm-losses').value = f.losses !== undefined ? f.losses : (lm ? lm[1] : 0);
        document.getElementById('fm-draws').value = f.draws !== undefined ? f.draws : (dm ? dm[1] : 0);
        document.getElementById('fm-rank').value = (f.rank !== null && f.rank !== undefined) ? f.rank : '';
        document.getElementById('fm-style').value = f.style || 'all-around';
        document.getElementById('fm-height').value = f.height;
        document.getElementById('fm-reach').value = f.reach;
        document.getElementById('fm-odds').value = f.odds;
        document.getElementById('fm-division').value = f.division;
        document.getElementById('fm-image').value = f.image_url || '';
        buildStatsSliders(f.stats);
        // performance stats
        ['slpm','strAcc','tdAvg','subAvg','koRate','subRate','decRate'].forEach(function(k) {
            var el = document.getElementById('fm-' + k);
            if (el) el.value = (f[k] !== undefined && f[k] !== null) ? f[k] : '';
        });
        buildRecentFightsList(f.recent || []);
    } else {
        title.textContent = '파이터 추가';
        ['fm-name','fm-name-en','fm-country','fm-rank','fm-height','fm-reach','fm-odds','fm-image'].forEach(id => document.getElementById(id).value = '');
        ['fm-wins','fm-losses','fm-draws'].forEach(id => document.getElementById(id).value = '0');
        document.getElementById('fm-style').value = 'all-around';
        buildStatsSliders(null);
        ['slpm','strAcc','tdAvg','subAvg','koRate','subRate','decRate'].forEach(function(k) {
            var el = document.getElementById('fm-' + k);
            if (el) el.value = '';
        });
        buildRecentFightsList([]);
    }
}

function closeFighterModal() {
    document.getElementById('fighter-modal').classList.add('hidden');
    editingFighterId = null;
}

function saveFighter() {
    const name = document.getElementById('fm-name').value.trim();
    if (!name) { showToast('⚠ 선수명을 입력하세요'); return; }

    const wins = parseInt(document.getElementById('fm-wins').value) || 0;
    const losses = parseInt(document.getElementById('fm-losses').value) || 0;
    const draws = parseInt(document.getElementById('fm-draws').value) || 0;
    const record = draws > 0 ? `${wins}W ${losses}L ${draws}D` : `${wins}W ${losses}L`;

    const stats = STAT_LABELS.map((_, i) => parseInt(document.getElementById(`stat-range-${i}`).value));
    const perfKeys = ['slpm','strAcc','tdAvg','subAvg','koRate','subRate','decRate'];
    const perfStats = {};
    perfKeys.forEach(function(k) {
        var el = document.getElementById('fm-' + k);
        if (el && el.value !== '') perfStats[k] = parseFloat(el.value);
    });
    const data = {
        id: editingFighterId || ('f_' + Date.now()),
        name,
        name_en: document.getElementById('fm-name-en').value.trim(),
        country: document.getElementById('fm-country').value.trim(),
        wins, losses, draws, record,
        rank: document.getElementById('fm-rank').value || '#NR',
        style: document.getElementById('fm-style').value || 'all-around',
        height: document.getElementById('fm-height').value || '—',
        reach: document.getElementById('fm-reach').value || '—',
        odds: parseFloat(document.getElementById('fm-odds').value) || 1.50,
        division: document.getElementById('fm-division').value,
        image_url: document.getElementById('fm-image').value.trim(),
        stats,
        ...perfStats,
        recent: getRecentFightsFromUI()
    };

    if (editingFighterId) {
        const idx = fighterDB.findIndex(x => x.id === editingFighterId);
        if (idx !== -1) fighterDB[idx] = data;
        showToast(`✅ ${name} 정보 업데이트 완료`);
    } else {
        fighterDB.push(data);
        showToast(`🥊 ${name} 등록 완료`);
    }

    saveAdmin();
    // Supabase fighters 테이블에 동기화
    if (sb) {
        sb.from('fighters').upsert({
            id: data.id, name: data.name, name_en: data.name_en,
            country: data.country, division: data.division,
            wins: data.wins, losses: data.losses, draws: data.draws,
            rank: data.rank, style: data.style,
            height: data.height, reach: data.reach,
            odds: data.odds, image_url: data.image_url,
            stats: data.stats,
            slpm: data.slpm, str_acc: data.strAcc,
            td_avg: data.tdAvg, sub_avg: data.subAvg,
            ko_rate: data.koRate, sub_rate: data.subRate, dec_rate: data.decRate,
            recent: data.recent,
            updated_at: new Date().toISOString()
        }, { onConflict: 'id' }).then(function(res) {
            if (res.error) console.warn('파이터 DB 저장 실패:', res.error.message);
        });
    }
    closeFighterModal();
    renderAdminFighterList();
}

function deleteFighter(fighterId) {
    const f = fighterDB.find(x => x.id === fighterId);
    if (!f) return;
    if (!confirm(`"${f.name}"을(를) 파이터 DB에서 삭제하시겠습니까?`)) return;
    if (sb) {
        sb.from('fighters').delete().eq('id', fighterId).then(function(res) {
            if (res.error) console.warn('파이터 DB 삭제 실패:', res.error.message);
        });
    }
    fighterDB = fighterDB.filter(x => x.id !== fighterId);
    saveAdmin();
    renderAdminFighterList();
    showToast(`🗑 ${f.name} 삭제됨`);
}

// ----- FIGHTER STATS SCRAPER -----
async function scrapeFighterStats() {
    const btn = document.getElementById('fighter-scrape-btn');
    const log = document.getElementById('fighter-scrape-log');
    if (!sb) { showToast('⚠ Supabase 연결 필요'); return; }

    const sessionRes = await sb.auth.getSession();
    const session = sessionRes?.data?.session;
    if (!session?.access_token) { showToast('⚠ 어드민 로그인 필요'); return; }

    btn.textContent = '⏳ 크롤링 중...';
    btn.disabled = true;
    log.classList.remove('hidden');
    log.textContent = '[ UFCStats 크롤링 시작 ]\n';

    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    let updated = 0, skipped = 0;

    for (const letter of letters) {
        log.textContent += `→ ${letter.toUpperCase()} 처리 중...\n`;
        log.scrollTop = log.scrollHeight;
        try {
            const { data, error } = await sb.functions.invoke('scrape-fighter-records', {
                body: { letter },
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (error) throw new Error(error.message);
            updated += data.updated || 0;
            skipped += data.skipped || 0;
            log.textContent += `  ${data.updated || 0}명 업데이트, ${data.skipped || 0}명 스킵\n`;
        } catch (e) {
            log.textContent += `  오류: ${e.message}\n`;
        }
        await new Promise(r => setTimeout(r, 300)); // rate limit
    }

    log.textContent += `\n[ 완료 ] 총 ${updated}명 업데이트, ${skipped}명 스킵\n`;
    btn.textContent = '🕷 스탯 크롤링';
    btn.disabled = false;
    showToast(`✅ 크롤링 완료 — ${updated}명 업데이트`);
    renderAdminFighterList();
}

// ----- SYNC ALL FIGHTERS (kr.ufc.com) -----
async function syncAllFighters() {
    const btn = document.getElementById('btn-sync-all-fighters');
    const log = document.getElementById('fighter-scrape-log');
    if (!sb) { showToast('⚠ Supabase 연결 필요'); return; }

    const sessionRes = await sb.auth.getSession();
    const session = sessionRes?.data?.session;
    if (!session?.access_token) { showToast('⚠ 어드민 로그인 필요'); return; }

    btn.textContent = '⏳ 동기화 중...';
    btn.disabled = true;
    log.classList.remove('hidden');
    log.textContent = '[ kr.ufc.com 전체 파이터 동기화 시작 ]\n총 ~285 페이지 (3,129명) 처리 예정\n\n';

    const BATCH = 10; // 배치당 페이지 수
    let page = 0;
    let totalInserted = 0, totalUpdated = 0, totalScraped = 0;
    let hasMore = true;

    while (hasMore) {
        log.textContent += `→ page ${page}–${page + BATCH - 1} 처리 중...\n`;
        log.scrollTop = log.scrollHeight;
        try {
            const { data, error } = await sb.functions.invoke('sync-all-fighters', {
                body: { startPage: page, batchSize: BATCH },
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (error) throw new Error(error.message);

            totalInserted += data.totalInserted || 0;
            totalUpdated  += data.totalUpdated  || 0;
            totalScraped  += data.totalScraped  || 0;
            hasMore = data.hasMore ?? false;

            log.textContent += `  스크랩: ${data.totalScraped}, 신규: ${data.totalInserted}, 업데이트: ${data.totalUpdated}`;
            if (data.errors?.length) log.textContent += `, 오류: ${data.errors.join(' | ')}`;
            log.textContent += '\n';
        } catch (e) {
            log.textContent += `  오류: ${e.message}\n`;
            hasMore = false;
        }
        log.scrollTop = log.scrollHeight;
        page += BATCH;
        if (hasMore) await new Promise(r => setTimeout(r, 500));
    }

    log.textContent += `\n[ 완료 ] 스크랩: ${totalScraped}명 | 신규: ${totalInserted}명 | 업데이트: ${totalUpdated}명\n`;
    btn.textContent = '🌐 전체 파이터 동기화';
    btn.disabled = false;
    showToast(`✅ 동기화 완료 — 신규 ${totalInserted}명 추가`);
    renderAdminFighterList();
}

// ----- RECENT FIGHTS MANAGER -----
function buildRecentFightsList(recentArr) {
    var list = document.getElementById('recent-fights-list');
    if (!list) return;
    list.innerHTML = '';
    (recentArr || []).slice(0, 5).forEach(function(r) {
        list.appendChild(_makeRecentFightRow(r));
    });
}

function addRecentFightRow(data) {
    var list = document.getElementById('recent-fights-list');
    if (!list) return;
    if (list.children.length >= 5) { showToast('⚠ 최대 5경기까지 입력 가능합니다'); return; }
    list.appendChild(_makeRecentFightRow(data || {}));
}

function _makeRecentFightRow(r) {
    var row = document.createElement('div');
    row.className = 'recent-fight-row flex items-center gap-2 p-2 rounded-xl border border-white/10';
    row.style.background = 'rgba(0,0,0,0.4)';
    row.innerHTML = `
        <select class="rf-result bg-black/60 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-ufcRed flex-shrink-0 w-14">
            <option value="W" ${r.r==='W'?'selected':''}>W</option>
            <option value="L" ${r.r==='L'?'selected':''}>L</option>
        </select>
        <input class="rf-opp flex-1 min-w-0 bg-black/60 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-ufcRed" placeholder="상대선수" value="${r.opp||''}">
        <input class="rf-method w-20 bg-black/60 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-ufcRed" placeholder="방식" value="${r.method||''}">
        <input class="rf-event w-20 bg-black/60 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-ufcRed" placeholder="이벤트" value="${r.event||''}">
        <button onclick="this.closest('.recent-fight-row').remove()" class="flex-shrink-0 text-gray-600 hover:text-ufcRed transition text-base leading-none">✕</button>
    `;
    return row;
}

function getRecentFightsFromUI() {
    var rows = document.querySelectorAll('#recent-fights-list .recent-fight-row');
    var result = [];
    rows.forEach(function(row) {
        var r = row.querySelector('.rf-result') ? row.querySelector('.rf-result').value : 'W';
        var opp = row.querySelector('.rf-opp') ? row.querySelector('.rf-opp').value.trim() : '';
        var method = row.querySelector('.rf-method') ? row.querySelector('.rf-method').value.trim() : '';
        var event = row.querySelector('.rf-event') ? row.querySelector('.rf-event').value.trim() : '';
        if (opp) result.push({ r, opp, method, event });
    });
    return result;
}

// ----- FIGHT CARDS -----
function populateFighterSelects() {
    ['fc-f1-select', 'fc-f2-select'].forEach(id => {
        const sel = document.getElementById(id);
        sel.innerHTML = '<option value="">-- 등록된 파이터 선택 --</option>';
        fighterDB.forEach(f => {
            sel.innerHTML += `<option value="${f.id}">${f.name} (${f.record})</option>`;
        });
    });
}

function autoFillFighter(corner) {
    const selId = corner === 'f1' ? 'fc-f1-select' : 'fc-f2-select';
    const nameId = corner === 'f1' ? 'fc-f1-name' : 'fc-f2-name';
    const oddsId = corner === 'f1' ? 'fc-f1-odds' : 'fc-f2-odds';
    const imgId  = corner === 'f1' ? 'fc-f1-img'  : 'fc-f2-img';
    const fighterId = document.getElementById(selId).value;
    if (!fighterId) return;
    const f = fighterDB.find(x => x.id === fighterId);
    if (!f) return;
    document.getElementById(nameId).value = f.name;
    document.getElementById(oddsId).value = f.odds;
    if (f.image_url) document.getElementById(imgId).value = f.image_url;
}

function renderAdminFightCardList() {
    const list = document.getElementById('fight-card-admin-list');
    const count = document.getElementById('fight-card-count');
    if (!list) return;
    const fights = getActiveFights();
    count.textContent = fights.length;

    if (fights.length === 0) {
        list.innerHTML = `<div class="glass-card p-8 text-center text-gray-600 oswald-sharp text-xs italic uppercase tracking-widest rounded-2xl">등록된 경기가 없습니다</div>`;
        return;
    }

    list.innerHTML = fights.map((fight, idx) => {
        const settled = state.settled?.[fight.id];
        const pending = state.pendings?.[fight.id];
        const statusBadge = settled
            ? `<span class="oswald-sharp text-[9px] px-2 py-1 rounded-lg font-black italic uppercase ${settled.result === 'WIN' ? 'text-green-400 bg-green-400/10 border border-green-400/20' : 'text-red-400 bg-red-400/10 border border-red-400/20'}">결과확정 · ${escapeHtml(settled.actualWinner)} (${escapeHtml(settled.actualMethod||'—')})</span>`
            : pending
            ? `<span class="oswald-sharp text-[9px] px-2 py-1 rounded-lg font-black italic uppercase text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 animate-pulse">예측 진행중</span>`
            : `<span class="oswald-sharp text-[9px] px-2 py-1 rounded-lg font-black italic uppercase text-gray-500 border border-white/10">대기중</span>`;

        return `
        <div class="glass-card rounded-2xl p-4 lg:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:border-white/20 transition-all">
            <div class="flex items-center gap-4">
                <span class="oswald-sharp text-[8px] lg:text-xs bg-ufcRed/10 border border-ufcRed/20 text-ufcRed px-2 py-1 rounded-lg font-black italic uppercase">${fight.tag}</span>
                <div>
                    <p class="oswald-sharp font-black italic text-sm lg:text-lg text-white uppercase tracking-tighter">${fight.f1.name} <span class="text-ufcRed">VS</span> ${fight.f2.name}</p>
                    <div class="flex items-center gap-2 mt-1">${statusBadge}</div>
                </div>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
                ${!settled ? `<button onclick="adminSetResult('${fight.id}')" class="oswald-sharp text-[10px] bg-ufcRed hover:bg-red-700 text-white font-black px-4 py-2 rounded-xl italic uppercase tracking-widest transition flex items-center gap-1">🏆 결과 입력</button>` : ''}
                <button onclick="moveFight(${idx}, -1)" class="text-gray-600 hover:text-white transition px-2 text-xs" title="위로">▲</button>
                <button onclick="moveFight(${idx}, 1)" class="text-gray-600 hover:text-white transition px-2 text-xs" title="아래로">▼</button>
                <button onclick="openFightCardModal('${fight.id}')" class="oswald-sharp text-[10px] border border-white/10 text-gray-400 hover:text-white px-3 py-2 rounded-xl italic uppercase tracking-widest transition">수정</button>
                <button onclick="deleteFightCard('${fight.id}')" class="oswald-sharp text-[10px] border border-ufcRed/20 text-ufcRed/60 hover:text-ufcRed px-3 py-2 rounded-xl italic uppercase tracking-widest transition">삭제</button>
            </div>
        </div>`;
    }).join('');
}

function moveFight(idx, dir) {
    const fights = [...getActiveFights()];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= fights.length) return;
    [fights[idx], fights[newIdx]] = [fights[newIdx], fights[idx]];
    customFights = fights;
    saveAdmin();
    renderAdminFightCardList();
    showToast('↕ 경기 순서 변경됨');
}

function openFightCardModal(fightId) {
    editingFightCardId = fightId || null;
    populateFighterSelects();
    const modal = document.getElementById('fight-card-modal');
    const title = document.getElementById('fight-card-modal-title');
    modal.classList.remove('hidden');

    if (fightId) {
        const fight = getActiveFights().find(f => f.id === fightId);
        if (!fight) return;
        title.textContent = '경기 수정';
        document.getElementById('fc-tag').value = fight.tag;
        document.getElementById('fc-division').value = fight.division;
        document.getElementById('fc-f1-name').value = fight.f1.name;
        document.getElementById('fc-f1-odds').value = fight.f1.odds;
        document.getElementById('fc-f2-name').value = fight.f2.name;
        document.getElementById('fc-f2-odds').value = fight.f2.odds;
        document.getElementById('fc-bias').value = fight.leftBias;
        document.getElementById('fc-f1-img').value = fight.f1.imgUrl || fight.f1.image_url || '';
        document.getElementById('fc-f2-img').value = fight.f2.imgUrl || fight.f2.image_url || '';
        document.getElementById('fc-section-label').value = fight.sectionLabel || '메인 카드';
        document.getElementById('fc-section-time').value = fight.sectionTime || '';
        document.getElementById('fc-edit-id').value = fightId;
    } else {
        title.textContent = '경기 추가';
        ['fc-f1-name','fc-f1-odds','fc-f2-name','fc-f2-odds','fc-bias','fc-f1-img','fc-f2-img','fc-section-time'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('fc-section-label').value = '메인 카드';
        document.getElementById('fc-edit-id').value = '';
    }
}

function closeFightCardModal() {
    document.getElementById('fight-card-modal').classList.add('hidden');
    editingFightCardId = null;
}

function getFighterDataForCard(corner) {
    const selId = corner === 'f1' ? 'fc-f1-select' : 'fc-f2-select';
    const nameId = corner === 'f1' ? 'fc-f1-name' : 'fc-f2-name';
    const oddsId = corner === 'f1' ? 'fc-f1-odds' : 'fc-f2-odds';

    const fighterId = document.getElementById(selId).value;
    const name = document.getElementById(nameId).value.trim();
    const odds = parseFloat(document.getElementById(oddsId).value) || (corner === 'f1' ? 1.50 : 2.00);

    if (fighterId) {
        const dbFighter = fighterDB.find(f => f.id === fighterId);
        if (dbFighter) return { ...dbFighter, odds };
    }
    return { name, record: '—', height: '—', reach: '—', rank: '—', stats: [75,75,75,75,75], odds };
}

function saveFightCard() {
    const f1name = document.getElementById('fc-f1-name').value.trim();
    const f2name = document.getElementById('fc-f2-name').value.trim();
    if (!f1name || !f2name) { showToast('⚠ 파이터 이름을 입력하세요'); return; }

    const f1 = getFighterDataForCard('f1');
    const f2 = getFighterDataForCard('f2');

    // 이미지 URL은 개별 파이터 객체에 주입
    f1.imgUrl = document.getElementById('fc-f1-img').value.trim() || f1.image_url || '';
    f2.imgUrl = document.getElementById('fc-f2-img').value.trim() || f2.image_url || '';

    const newFight = {
        id: editingFightCardId || ('fc_' + Date.now()),
        tag: document.getElementById('fc-tag').value,
        division: document.getElementById('fc-division').value,
        sectionLabel: document.getElementById('fc-section-label').value || '메인 카드',
        sectionTime: document.getElementById('fc-section-time').value.trim(),
        f1, f2,
        leftBias: parseFloat(document.getElementById('fc-bias').value) || 0.55
    };

    let fights = [...getActiveFights()];
    if (editingFightCardId) {
        const idx = fights.findIndex(f => f.id === editingFightCardId);
        if (idx !== -1) fights[idx] = newFight;
        showToast(`✅ ${f1.name} vs ${f2.name} 수정 완료`);
    } else {
        fights.push(newFight);
        showToast(`🥊 ${f1.name} vs ${f2.name} 등록 완료`);
    }

    customFights = fights;
    saveAdmin();
    closeFightCardModal();
    renderAdminFightCardList();
}

function deleteFightCard(fightId) {
    const fight = getActiveFights().find(f => f.id === fightId);
    if (!fight) return;
    if (!confirm(`"${fight.f1.name} vs ${fight.f2.name}" 경기를 삭제하시겠습니까?`)) return;
    customFights = getActiveFights().filter(f => f.id !== fightId);
    saveAdmin();
    renderAdminFightCardList();
    showToast(`🗑 경기 삭제됨`);
}

// ----- EVENT INFO -----
let eventInfo = { name: 'UFC 327', date: 'SAT · APR 12, 2026 · KASEYA CENTER, MIAMI' };

function loadEventInfo() {
    const e = localStorage.getItem('picktagon_event');
    if (e) eventInfo = JSON.parse(e);
}

function loadEventInfoInputs() {
    document.getElementById('admin-event-name').value = eventInfo.name;
    document.getElementById('admin-event-date').value = eventInfo.date;
}

function saveEventInfo() {
    eventInfo.name = document.getElementById('admin-event-name').value.trim() || 'UFC 313';
    eventInfo.date = document.getElementById('admin-event-date').value.trim();
    localStorage.setItem('picktagon_event', JSON.stringify(eventInfo));
    showToast('✅ 이벤트 정보 저장 완료');
}

function applyEventInfo() {
    const nameEl = document.getElementById('event-name-label');
    const dateEl = document.getElementById('event-date-label');
    if (nameEl) nameEl.textContent = eventInfo.name;
    if (dateEl) dateEl.textContent = eventInfo.date;
}

// ── UFC 이벤트 대기열 관리 ──────────────────────────────────────────

async function fetchPendingEvents() {
    const container = document.getElementById('ufc-queue-list');
    if (!container) return;

    container.innerHTML = '<p class="oswald-sharp text-gray-600 italic text-sm uppercase tracking-widest animate-pulse py-8 text-center">Loading...</p>';

    const { data, error } = await sb
        .from('pending_events')
        .select('*')
        .eq('status', 'pending')
        .order('event_date', { ascending: true });

    if (error) {
        container.innerHTML = `<p class="text-red-400 text-sm py-4">오류: ${escapeHtml(error.message)}</p>`;
        return;
    }

    renderPendingEventsList(data || []);
}

function renderPendingEventsList(events) {
    const container = document.getElementById('ufc-queue-list');
    if (!container) return;

    const countEl = document.getElementById('ufc-queue-count');
    if (countEl) countEl.textContent = events.length;

    if (!events.length) {
        container.innerHTML = `
            <div class="text-center py-16">
                <p class="oswald-sharp text-gray-600 italic text-xl uppercase tracking-widest">대기 중인 이벤트 없음</p>
                <p class="text-gray-700 text-xs mt-2">크롤러 실행 후 다시 확인하세요</p>
            </div>`;
        return;
    }

    container.innerHTML = events.map(ev => `
        <div class="glass-card rounded-2xl px-5 py-4 flex items-center gap-4 border border-white/5 hover:border-ufcRed/20 transition-all">
            <div class="flex-1 min-w-0">
                <p class="oswald-sharp text-white font-black italic uppercase text-sm lg:text-base leading-tight">${escapeHtml(ev.title)}</p>
                <p class="oswald-sharp text-ufcRed italic text-xs mt-1 tracking-widest">${ev.event_date || '날짜 미정'}</p>
                ${ev.source_url ? `<a href="${escapeHtml(ev.source_url)}" target="_blank" rel="noopener noreferrer" class="text-gray-600 text-[10px] hover:text-gray-400 transition-colors truncate block mt-0.5">${escapeHtml(ev.source_url)}</a>` : ''}
            </div>
            <div class="flex gap-2 shrink-0">
                <button onclick="approveEvent('${ev.id}', ${JSON.stringify(ev.title).replace(/"/g,'&quot;')}, ${JSON.stringify(ev.event_date || '').replace(/"/g,'&quot;')}, ${JSON.stringify(ev.source_url || '').replace(/"/g,'&quot;')})"
                    class="oswald-sharp bg-ufcRed text-white font-black italic uppercase text-[11px] px-4 py-2 rounded-xl tracking-widest hover:shadow-[0_0_16px_rgba(232,0,13,0.5)] transition-all">
                    APPROVE
                </button>
                <button onclick="rejectPendingEvent('${ev.id}')"
                    class="oswald-sharp bg-zinc-800 text-gray-400 font-black italic uppercase text-[11px] px-4 py-2 rounded-xl tracking-widest hover:bg-zinc-700 hover:text-white transition-all">
                    REJECT
                </button>
            </div>
        </div>
    `).join('');
}

async function approveEvent(id, title, dateStr, sourceUrl) {
    const cleanTitle = (title || '').replace(/\s+/g, ' ').trim();
    if (!confirm(`"${cleanTitle}" 이벤트를 승인할까요?`)) return;

    // events 테이블 INSERT (pending_events.event_date는 'YYYY-MM-DD' TEXT)
    const eventDate = dateStr ? new Date(dateStr + 'T00:00:00Z').toISOString() : null;
    const { error: insertErr } = await sb
        .from('events')
        .insert({ title: cleanTitle, event_date: eventDate, status: 'upcoming', source_url: sourceUrl || null });

    if (insertErr) {
        showToast('❌ events INSERT 실패: ' + insertErr.message);
        return;
    }

    // pending_events status → 'approved'
    const { error: updateErr } = await sb
        .from('pending_events')
        .update({ status: 'approved' })
        .eq('id', id);

    if (updateErr) {
        showToast('⚠ pending UPDATE 실패: ' + updateErr.message);
        return;
    }

    // archive_events에도 upcoming으로 추가 (archive.js 함수)
    if (typeof approveToArchive === 'function') {
        await approveToArchive(id, cleanTitle, dateStr, sourceUrl);
    }

    showToast('✅ 이벤트 승인 완료: ' + title);
    fetchPendingEvents();
    fetchApprovedEvents();
}

// ── 승인된 이벤트 + 대진표 크롤링 ───────────────────────────────────

async function fetchApprovedEvents() {
    const container = document.getElementById('ufc-approved-list');
    if (!container) return;

    container.innerHTML = '<p class="oswald-sharp text-gray-600 italic text-sm uppercase tracking-widest animate-pulse py-6 text-center">Loading...</p>';

    const { data, error } = await sb
        .from('events')
        .select('id, title, event_date, source_url, status')
        .eq('status', 'upcoming')
        .order('event_date', { ascending: true });

    if (error) {
        container.innerHTML = `<p class="text-red-400 text-sm py-4">오류: ${escapeHtml(error.message)}</p>`;
        return;
    }

    renderApprovedEventsList(data || []);
}

function renderApprovedEventsList(events) {
    const container = document.getElementById('ufc-approved-list');
    if (!container) return;

    const countEl = document.getElementById('ufc-approved-count');
    if (countEl) countEl.textContent = events.length;

    if (!events.length) {
        container.innerHTML = `
            <div class="text-center py-10">
                <p class="oswald-sharp text-gray-700 italic text-base uppercase tracking-widest">승인된 이벤트 없음</p>
                <p class="text-gray-700 text-xs mt-1">대기열에서 이벤트를 승인하세요</p>
            </div>`;
        return;
    }

    container.innerHTML = events.map(ev => {
        const dateLabel = ev.event_date
            ? new Date(ev.event_date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
            : '날짜 미정';
        const hasUrl = !!ev.source_url;

        return `
        <div class="glass-card rounded-2xl px-5 py-4 border border-white/5 hover:border-emerald-500/20 transition-all" id="approved-row-${ev.id}">
            <div class="flex items-center gap-4">
                <div class="flex-1 min-w-0">
                    <p class="oswald-sharp text-white font-black italic uppercase text-sm leading-tight">${escapeHtml(ev.title)}</p>
                    <p class="oswald-sharp text-emerald-400 italic text-xs mt-1 tracking-widest">${dateLabel}</p>
                </div>
                <div class="flex gap-2 shrink-0">
                    <button onclick="crawlMatchups('${ev.id}', ${JSON.stringify(ev.source_url || '').replace(/"/g,'&quot;')})"
                        ${hasUrl ? '' : 'disabled'}
                        class="oswald-sharp font-black italic uppercase text-[11px] px-4 py-2 rounded-xl tracking-widest transition-all
                               ${hasUrl
                                   ? 'bg-emerald-600 text-white hover:bg-emerald-500 hover:shadow-[0_0_14px_rgba(52,211,153,0.4)]'
                                   : 'bg-zinc-800 text-gray-600 cursor-not-allowed'}">
                        대진표 크롤링
                    </button>
                </div>
            </div>
            ${!hasUrl ? `
            <div class="mt-3 flex gap-2 items-center">
                <input type="text" id="url-input-${ev.id}" placeholder="Sherdog URL 직접 입력 (예: https://www.sherdog.com/events/...)"
                    class="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500 placeholder-gray-700">
                <button onclick="crawlMatchupsWithInput('${ev.id}')"
                    class="oswald-sharp bg-emerald-600 text-white font-black italic uppercase text-[11px] px-4 py-2 rounded-xl tracking-widest hover:bg-emerald-500 transition-all shrink-0">
                    GO
                </button>
            </div>` : ''}
        </div>`;
    }).join('');
}

async function crawlMatchups(eventId, sourceUrl) {
    if (!sourceUrl) { showToast('⚠ source_url이 없습니다'); return; }

    const btn = document.querySelector(`#approved-row-${eventId} button`);
    if (btn) { btn.disabled = true; btn.textContent = '크롤링 중...'; }

    try {
        const sessionRes = await sb.auth.getSession();
        const session = sessionRes && sessionRes.data ? sessionRes.data.session : null;
        if (!session || !session.access_token) throw new Error('Admin session not ready. Please sign in again.');

        const { data, error } = await sb.functions.invoke('scrape-matchups', {
            body: { event_id: eventId, source_url: sourceUrl },
            headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (error) {
            let message = error.message;
            if (error.context && typeof error.context.json === 'function') {
                try {
                    const payload = await error.context.json();
                    if (payload && payload.error) message = payload.error;
                } catch (_) {}
            }
            throw new Error(message);
        }
        if (!data.success) throw new Error(data.error || '파싱 실패');

        showToast(`✅ ${data.inserted}개의 매치업이 로드되었습니다!`);
        _dbMatchups = [];
        if (typeof fetchUpcomingMatchups === 'function') fetchUpcomingMatchups();
        fetchApprovedEvents();
    } catch (e) {
        showToast('❌ 크롤링 실패: ' + e.message);
        if (btn) { btn.disabled = false; btn.textContent = '대진표 크롤링'; }
    }
}

async function crawlMatchupsWithInput(eventId) {
    const input = document.getElementById(`url-input-${eventId}`);
    const sourceUrl = input ? input.value.trim() : '';
    console.log('[crawlMatchupsWithInput] eventId:', eventId, 'sourceUrl:', sourceUrl);
    if (!sourceUrl) { showToast('⚠ URL을 입력해주세요'); return; }
    await crawlMatchups(eventId, sourceUrl);
}

async function runUfcCrawler() {
    const btn = document.getElementById('btn-run-crawler');
    if (btn) { btn.disabled = true; btn.textContent = '실행 중...'; }
    try {
        const sessionRes = await sb.auth.getSession();
        const session = sessionRes && sessionRes.data ? sessionRes.data.session : null;
        if (!session || !session.access_token) throw new Error('Admin session not ready. Please sign in again.');

        const { data, error } = await sb.functions.invoke('ufc-crawler', {
            body: {},
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        console.log('[runUfcCrawler] data:', data, 'error:', error);
        if (error) {
            let message = error.message;
            if (error.context && typeof error.context.json === 'function') {
                try {
                    const payload = await error.context.json();
                    if (payload && payload.error) message = payload.error;
                } catch (_) {}
            }
            throw new Error(message);
        }
        const count = data?.inserted ?? data?.count ?? '?';
        showToast(`✅ 크롤러 완료 — ${count}개 이벤트 수집`);
        fetchPendingEvents();
    } catch (e) {
        console.error('[runUfcCrawler]', e);
        showToast('❌ 크롤러 실패: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🕷 크롤러 실행'; }
    }
}

async function rejectPendingEvent(id) {
    if (!confirm('이 이벤트를 거절(Reject) 처리할까요?')) return;

    const { error } = await sb
        .from('pending_events')
        .update({ status: 'rejected' })
        .eq('id', id);

    if (error) { showToast('❌ 거절 처리 실패: ' + error.message); return; }
    showToast('🗑 이벤트 거절 처리 완료');
    fetchPendingEvents();
}
