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
    ['fighters', 'archive', 'news', 'season', 'event', 'ufc', 'settings'].forEach(t => {
        const panel = document.getElementById(`admin-panel-${t}`);
        const tabEl = document.getElementById(`admin-tab-${t}`);
        if (panel) panel.classList.add('hidden');
        if (tabEl) { tabEl.classList.remove('active-tab', 'text-ufcRed'); tabEl.classList.add('text-gray-500'); }
    });
    const activePanel = document.getElementById(`admin-panel-${tab}`);
    const activeTab = document.getElementById(`admin-tab-${tab}`);
    if (activePanel) activePanel.classList.remove('hidden');
    if (activeTab) { activeTab.classList.add('active-tab'); activeTab.classList.remove('text-gray-500'); }
    if (tab === 'fighters') renderAdminFighterList();
    if (tab === 'season') renderSeasonAdminPanel();
    if (tab === 'settings') { loadGeminiKeyToUI(); }
    if (tab === 'ufc') { fetchEventsForBuilder(); }
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
    log.textContent = '[ kr.ufc.com 활성 파이터 동기화 시작 ]\n총 ~86 페이지 (941명) 처리 예정\n비활성/은퇴 선수는 마지막 배치 후 자동 삭제됩니다.\n\n';

    const BATCH = 10; // 배치당 페이지 수
    let page = 0;
    let totalInserted = 0, totalUpdated = 0, totalScraped = 0;
    let hasMore = true;

    while (hasMore) {
        log.textContent += `→ page ${page}–${page + BATCH - 1} 처리 중...\n`;
        log.scrollTop = log.scrollHeight;
        try {
            const isLast = false; // hasMore는 응답에서 결정
            const { data, error } = await sb.functions.invoke('sync-all-fighters', {
                body: { startPage: page, batchSize: BATCH, cleanup: true },
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (error) throw new Error(error.message);

            totalInserted += data.totalInserted || 0;
            totalUpdated  += data.totalUpdated  || 0;
            totalScraped  += data.totalScraped  || 0;
            hasMore = data.hasMore ?? false;

            log.textContent += `  스크랩: ${data.totalScraped}, 신규: ${data.totalInserted}, 업데이트: ${data.totalUpdated}`;
            if (data.totalDeleted) log.textContent += `, 비활성삭제: ${data.totalDeleted}`;
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
    showToast(`✅ 동기화 완료 — 신규 ${totalInserted}명 추가 / 업데이트 ${totalUpdated}명`);
    renderAdminFighterList();
}

// ----- PURGE INACTIVE FIGHTERS -----
async function purgeInactiveFighters(dryRun = false) {
    const btn = document.getElementById('btn-purge-inactive');
    const log = document.getElementById('fighter-scrape-log');
    if (!sb) { showToast('⚠ Supabase 연결 필요'); return; }

    const sessionRes = await sb.auth.getSession();
    const session = sessionRes?.data?.session;
    if (!session?.access_token) { showToast('⚠ 어드민 로그인 필요'); return; }

    if (!dryRun && !confirm('⚠ 비활성/은퇴 파이터를 DB에서 영구 삭제합니다.\n먼저 드라이런으로 확인 후 실행하세요.\n\n계속하시겠습니까?')) return;

    if (btn) { btn.textContent = '⏳ 처리 중...'; btn.disabled = true; }
    log.classList.remove('hidden');
    log.textContent = dryRun
        ? '[ 드라이런 ] 삭제 예정 파이터 수 확인 중...\n'
        : '[ 비활성 파이터 삭제 시작 ] active roster 수집 후 삭제 실행\n';

    try {
        const { data, error } = await sb.functions.invoke('purge-inactive-fighters', {
            body: { dryRun },
            headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (error) {
            let message = error.message;
            if (error.context && typeof error.context.json === 'function') {
                try { const p = await error.context.json(); if (p?.error) message = p.error; } catch (_) {}
            }
            throw new Error(message);
        }

        if (dryRun) {
            log.textContent += `✅ 드라이런 완료\n활성 파이터: ${data.collected}명\n삭제 예정: ${data.wouldDelete}명\n\n실제 삭제하려면 "비활성 삭제 실행" 버튼을 누르세요.`;
            showToast(`드라이런: ${data.wouldDelete}명 삭제 예정`);
        } else {
            log.textContent += `✅ 완료\n활성 파이터: ${data.collected}명 유지\n삭제됨: ${data.deleted}명`;
            showToast(`✅ ${data.deleted}명 삭제 완료`);
            renderAdminFighterList();
        }
    } catch (e) {
        log.textContent += `❌ 오류: ${e.message}`;
        showToast(`❌ 오류: ${e.message}`);
    } finally {
        if (btn) { btn.textContent = '🗑 비활성 파이터 삭제'; btn.disabled = false; }
    }
}

// ----- SYNC FIGHTER STATS -----
async function syncFighterStats(options = {}) {
    const btn = document.getElementById('btn-sync-fighter-stats');
    const log = document.getElementById('fighter-scrape-log');
    if (!sb) { showToast('⚠ Supabase 연결 필요'); return; }

    const sessionRes = await sb.auth.getSession();
    const session = sessionRes?.data?.session;
    if (!session?.access_token) { showToast('⚠ 어드민 로그인 필요'); return; }

    if (btn) { btn.textContent = '⏳ 동기화 중...'; btn.disabled = true; }
    if (log) { log.classList.remove('hidden'); log.textContent = '[ 파이터 스탯 동기화 시작 ] ufcstats.com 스크래핑...\n'; }

    let totalUpdated = 0, totalErrors = 0, offset = 0;
    const isSingle = !!options.slug;

    try {
        // single slug 모드는 1회 호출, syncAll은 done될 때까지 루프
        while (true) {
            const body = isSingle
                ? { slug: options.slug }
                : { syncAll: true, division: options.division || undefined, offset, batchSize: 15 };

            const { data, error } = await sb.functions.invoke('sync-fighter-stats', {
                body,
                headers: { Authorization: `Bearer ${session.access_token}` },
            });

            if (error) {
                let msg = error.message;
                try { if (error.context) { const p = await error.context.json(); if (p?.error) msg = p.error; } } catch (_) {}
                throw new Error(msg);
            }

            totalUpdated += data.updated || 0;
            totalErrors  += (data.errors || []).length;

            const progressLine = isSingle
                ? `✅ ${(data.results||[])[0]?.name || options.slug}: stats=${JSON.stringify((data.results||[])[0]?.stats)}`
                : `배치 ${offset}~${offset + (data.processed||0) - 1} 완료 (${data.processed}/${data.total}) — 업데이트: ${data.updated}명`;
            if (log) log.textContent += progressLine + '\n';
            if (log && data.errors && data.errors.length) {
                log.textContent += '  ⚠ 오류:\n' + data.errors.slice(0, 5).map(e => '    ' + e).join('\n') + '\n';
            }

            if (isSingle || data.done) break;

            offset = data.nextOffset;
            if (btn) btn.textContent = `⏳ ${offset}/${data.total}명...`;
        }

        if (log) log.textContent += `\n✅ 완료 — 총 업데이트: ${totalUpdated}명, 오류: ${totalErrors}건`;
        showToast(`✅ 스탯 동기화 완료 — ${totalUpdated}명 업데이트`);
        renderAdminFighterList();
    } catch (e) {
        if (log) log.textContent += `❌ 오류: ${e.message}`;
        showToast(`❌ 오류: ${e.message}`);
    } finally {
        if (btn) { btn.textContent = '📊 스탯 동기화'; btn.disabled = false; }
    }
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

// ── 대진표 빌더 ──────────────────────────────────────────────────────

var _builderState = {
    eventId: null,
    editingMatchupId: null,
    redFighter: null,
    blueFighter: null,
    redPhotoOverride: '',
    bluePhotoOverride: '',
    weightClass: '',
    cardSegment: 'main',
    sortOrder: 1,
    searchResults: [],
    _searchTimer: null,
};

var _builderEvents = [];
var _builderMatchups = [];
var _allFightersCache = [];

// 매치업 편집 모달 상태
var _memState = {
    editingMatchupId: null,
    redFighter: null,
    blueFighter: null,
    redPhotoOverride: '',
    bluePhotoOverride: '',
    weightClass: '',
    cardSegment: 'main',
    sortOrder: 1,
    _searchTimer: null,
};

// ── 이벤트 목록 ────────────────────────────────────────────────────

async function fetchEventsForBuilder() {
    if (!sb) return;
    const { data, error } = await sb
        .from('events')
        .select('id, title, event_date, status')
        .order('event_date', { ascending: false })
        .limit(50);
    if (error) { showToast('이벤트 로드 실패: ' + error.message); return; }
    _builderEvents = data || [];
    renderBuilderEventList();
}

function renderBuilderEventList() {
    const el = document.getElementById('builder-event-list');
    if (!el) return;
    if (!_builderEvents.length) {
        el.innerHTML = '<p class="text-gray-600 text-xs italic py-4 text-center">이벤트 없음</p>';
        return;
    }
    el.innerHTML = _builderEvents.map(ev => {
        const dateLabel = ev.event_date ? ev.event_date.slice(0,10) : '날짜 미정';
        const isActive = _builderState.eventId === ev.id;
        const statusBadge = ev.status === 'upcoming'
            ? '<span class="text-emerald-500 text-[9px]">▶ 예정</span>'
            : '<span class="text-gray-600 text-[9px]">✓ 완료</span>';
        return `
        <div class="flex items-stretch gap-1 mb-1">
            <button onclick="selectBuilderEvent('${ev.id}')"
                class="flex-1 text-left px-3 py-2.5 rounded-xl border transition-all text-xs oswald-sharp font-black
                       ${isActive ? 'bg-ufcRed/10 border-ufcRed text-white' : 'border-white/5 text-gray-400 hover:text-white hover:border-white/20'}">
                <span class="flex items-center gap-1.5 mb-0.5">${statusBadge}</span>
                <span class="block truncate italic uppercase tracking-widest leading-tight">${escapeHtml(ev.title)}</span>
                <span class="text-[10px] font-normal not-italic normal-case tracking-normal ${isActive ? 'text-red-300' : 'text-gray-600'}">${dateLabel}</span>
            </button>
            <button onclick="deleteBuilderEvent('${ev.id}', '${escapeHtml(ev.title)}')"
                title="이벤트 삭제"
                class="shrink-0 border border-white/5 text-gray-700 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5 px-2 rounded-xl transition-all text-sm">
                🗑
            </button>
        </div>`;
    }).join('');
}

async function selectBuilderEvent(eventId) {
    _builderState.eventId = eventId;
    renderBuilderEventList();
    renderBuilderWorkspace();
    await fetchBuilderMatchups();
}

async function fetchBuilderMatchups() {
    if (!_builderState.eventId) return;
    const { data, error } = await sb
        .from('matchups')
        .select('*')
        .eq('event_id', _builderState.eventId)
        .order('sort_order', { ascending: true });
    if (error) { showToast('매치업 로드 실패: ' + error.message); return; }
    _builderMatchups = data || [];
    renderBuilderWorkspace();
}

// ── 매치업 카드 그리드 ─────────────────────────────────────────────

function renderBuilderWorkspace() {
    const el = document.getElementById('builder-workspace');
    if (!el) return;
    const ev = _builderEvents.find(e => e.id === _builderState.eventId);
    if (!ev) {
        el.innerHTML = '<div class="flex items-center justify-center h-40"><p class="oswald-sharp text-gray-700 italic text-sm uppercase tracking-widest">← 이벤트를 선택하세요</p></div>';
        return;
    }
    const dateLabel = ev.event_date ? new Date(ev.event_date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '날짜 미정';
    const main = _builderMatchups.filter(m => m.card_segment === 'main');
    const prelim = _builderMatchups.filter(m => m.card_segment !== 'main');

    const renderCard = (m) => {
        const tagLabel = m.sort_order === 1 && m.card_segment === 'main' ? 'MAIN' : m.sort_order === 2 && m.card_segment === 'main' ? 'CO-MAIN' : m.card_segment === 'prelim' ? 'PRELIM' : '';
        return `
        <div onclick="openMatchupEditModal('${m.id}')"
             class="group cursor-pointer flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/5 bg-black/20 hover:bg-white/5 hover:border-white/20 transition-all">
            <span class="oswald-sharp text-gray-600 text-[10px] italic w-4 shrink-0 text-center">${m.sort_order || '?'}</span>
            ${m.red_image_url ? `<img src="${escapeHtml(m.red_image_url)}" class="w-7 h-7 rounded-full object-cover object-top bg-zinc-800 shrink-0 ring-1 ring-red-500/30">` : '<div class="w-7 h-7 rounded-full bg-zinc-800 shrink-0 ring-1 ring-red-500/20"></div>'}
            <p class="flex-1 oswald-sharp font-black italic text-xs uppercase truncate">
                <span class="text-red-400">${escapeHtml(m.red_fighter_name || '?')}</span>
                <span class="text-gray-600 mx-1">vs</span>
                <span class="text-blue-400">${escapeHtml(m.blue_fighter_name || '?')}</span>
            </p>
            ${m.blue_image_url ? `<img src="${escapeHtml(m.blue_image_url)}" class="w-7 h-7 rounded-full object-cover object-top bg-zinc-800 shrink-0 ring-1 ring-blue-500/30">` : '<div class="w-7 h-7 rounded-full bg-zinc-800 shrink-0 ring-1 ring-blue-500/20"></div>'}
            ${tagLabel ? `<span class="oswald-sharp text-[8px] italic uppercase tracking-widest px-2 py-0.5 rounded-full border shrink-0 ${m.sort_order===1&&m.card_segment==='main'?'border-ufcRed/50 text-ufcRed bg-ufcRed/5':'border-white/10 text-gray-500'}">${tagLabel}</span>` : ''}
            <div class="shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onclick="event.stopPropagation(); openResultModal('${m.id}')" class="text-gray-500 hover:text-yellow-400 text-xs px-1.5 py-1 rounded-lg hover:bg-yellow-500/10" title="결과 입력">🏆</button>
            </div>
        </div>`;
    };

    const renderSection = (label, fights) => !fights.length ? '' : `
        <p class="oswald-sharp text-[9px] italic uppercase tracking-widest text-gray-600 mt-4 mb-2 px-1">${label}</p>
        <div class="space-y-1.5">${fights.map(renderCard).join('')}</div>`;

    el.innerHTML = `
        <div class="flex items-start justify-between gap-3 mb-5">
            <div>
                <h5 class="oswald-sharp text-base font-black italic uppercase text-white tracking-widest leading-tight">${escapeHtml(ev.title)}</h5>
                <p class="oswald-sharp text-ufcRed italic text-[10px] tracking-widest mt-0.5">${dateLabel}</p>
            </div>
            <div class="flex gap-2 shrink-0">
                <button onclick="openMatchupEditModal(null)"
                    class="oswald-sharp bg-ufcRed hover:bg-red-700 text-white font-black italic uppercase text-[10px] px-4 py-2 rounded-xl tracking-widest transition-all">
                    + 경기 추가
                </button>
            </div>
        </div>
        ${!_builderMatchups.length
            ? '<div class="flex flex-col items-center justify-center py-12 text-center"><p class="oswald-sharp text-gray-700 italic text-sm uppercase tracking-widest mb-3">등록된 경기 없음</p><button onclick="openMatchupEditModal(null)" class="oswald-sharp border border-white/10 text-gray-400 hover:text-white text-xs px-4 py-2 rounded-xl italic uppercase tracking-widest transition-all">+ 첫 번째 경기 추가</button></div>'
            : renderSection('🥊 메인카드', main) + renderSection('⚡ 프렐림', prelim)
        }`;
}

// ── 결과 입력 (매치업 카드에서 바로 진입) ──────────────────────────
function openResultModal(matchupId) {
    const fromActive = getActiveFights().find(f => f.id === matchupId);
    if (fromActive) { adminSetResult(matchupId); return; }
    const m = _builderMatchups.find(x => x.id === matchupId);
    if (!m) { showToast('⚠ 경기 정보를 찾을 수 없습니다'); return; }
    const red = escapeHtml(m.red_fighter_name || '?');
    const blue = escapeHtml(m.blue_fighter_name || '?');
    const modal = document.getElementById('result-modal');
    if (!modal) { showToast('⚠ 결과 모달을 찾을 수 없습니다'); return; }
    const modalId = document.getElementById('result-modal-fight-id');
    const modalTitle = document.getElementById('result-modal-title');
    const modalWinner = document.getElementById('result-winner-select');
    if (modalId) modalId.value = matchupId;
    if (modalTitle) modalTitle.textContent = `${red} vs ${blue}`;
    if (modalWinner) modalWinner.innerHTML = `
        <option value="">-- 승자 선택 --</option>
        <option value="${red}">${red} (레드)</option>
        <option value="${blue}">${blue} (블루)</option>`;
    modal.classList.remove('hidden');
}

// ── 매치업 편집 모달 ────────────────────────────────────────────────

function openMatchupEditModal(matchupId) {
    const modal = document.getElementById('matchup-edit-modal');
    if (!modal) return;

    // 상태 초기화
    _memState.editingMatchupId = matchupId;
    _memState.redFighter = null;
    _memState.blueFighter = null;
    _memState.redPhotoOverride = '';
    _memState.bluePhotoOverride = '';
    _memState.weightClass = '';
    _memState.cardSegment = 'main';
    _memState.sortOrder = 1;

    // UI 초기화
    const ids = ['mem-red-name','mem-blue-name'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
    ['mem-red-record','mem-blue-record'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });
    ['mem-red-photo','mem-blue-photo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const searchEl = document.getElementById('mem-search');
    const resultsEl = document.getElementById('mem-search-results');
    if (searchEl) searchEl.value = '';
    if (resultsEl) resultsEl.innerHTML = '';

    const titleEl = document.getElementById('mem-title');
    const deleteBtn = document.getElementById('mem-delete-btn');
    const segEl = document.getElementById('mem-segment');
    const orderEl = document.getElementById('mem-order');
    const weightEl = document.getElementById('mem-weight');

    if (matchupId) {
        // 수정 모드
        const m = _builderMatchups.find(x => x.id === matchupId);
        if (!m) return;
        if (titleEl) titleEl.textContent = '경기 수정';
        if (deleteBtn) deleteBtn.classList.remove('hidden');

        // 코너 이름/기록 복원
        const redNameEl = document.getElementById('mem-red-name');
        const blueNameEl = document.getElementById('mem-blue-name');
        if (redNameEl) redNameEl.textContent = m.red_fighter_name || '—';
        if (blueNameEl) blueNameEl.textContent = m.blue_fighter_name || '—';

        // 파이터 캐시에서 찾기
        if (m.red_fighter_id) {
            const rf = _allFightersCache.find(f => f.id === m.red_fighter_id);
            if (rf) { _memState.redFighter = rf; const recEl = document.getElementById('mem-red-record'); if (recEl) recEl.textContent = `${rf.wins||0}-${rf.losses||0}-${rf.draws||0}`; }
        }
        if (m.blue_fighter_id) {
            const bf = _allFightersCache.find(f => f.id === m.blue_fighter_id);
            if (bf) { _memState.blueFighter = bf; const recEl = document.getElementById('mem-blue-record'); if (recEl) recEl.textContent = `${bf.wins||0}-${bf.losses||0}-${bf.draws||0}`; }
        }

        _memState.redPhotoOverride = m.red_image_url || '';
        _memState.bluePhotoOverride = m.blue_image_url || '';
        _memState.cardSegment = m.card_segment || 'main';
        _memState.sortOrder = m.sort_order || 1;
        _memState.weightClass = m.weight_class || '';

        const rPhotoEl = document.getElementById('mem-red-photo');
        const bPhotoEl = document.getElementById('mem-blue-photo');
        if (rPhotoEl) rPhotoEl.value = m.red_image_url || '';
        if (bPhotoEl) bPhotoEl.value = m.blue_image_url || '';
        if (segEl) segEl.value = m.card_segment || 'main';
        if (orderEl) orderEl.value = m.sort_order || 1;
        if (weightEl) weightEl.value = m.weight_class || '';
    } else {
        // 추가 모드
        if (titleEl) titleEl.textContent = '경기 추가';
        if (deleteBtn) deleteBtn.classList.add('hidden');
        if (segEl) segEl.value = 'main';
        if (orderEl) orderEl.value = (_builderMatchups.length + 1);
        if (weightEl) weightEl.value = '';
        _memState.sortOrder = _builderMatchups.length + 1;
    }

    modal.classList.remove('hidden');
}

function closeMatchupEditModal() {
    const modal = document.getElementById('matchup-edit-modal');
    if (modal) modal.classList.add('hidden');
}

function onMemSearch(query) {
    clearTimeout(_memState._searchTimer);
    if (!query.trim()) {
        const el = document.getElementById('mem-search-results');
        if (el) el.innerHTML = '';
        return;
    }
    _memState._searchTimer = setTimeout(() => runMemSearch(query), 250);
}

async function runMemSearch(query) {
    const resultsEl = document.getElementById('mem-search-results');
    if (!resultsEl) return;
    const q = query.trim().toLowerCase();
    if (!q) { resultsEl.innerHTML = ''; return; }

    if (!_allFightersCache.length) {
        const { data } = await sb.from('fighters').select('id, name, name_en, division, wins, losses, draws, image_url').limit(5000);
        _allFightersCache = data || [];
    }

    const hits = _allFightersCache.filter(f =>
        (f.name || '').toLowerCase().includes(q) ||
        (f.name_en || '').toLowerCase().includes(q)
    ).slice(0, 8);

    if (!hits.length) { resultsEl.innerHTML = '<p class="text-gray-600 text-xs italic py-2 px-3">검색 결과 없음</p>'; return; }

    resultsEl.innerHTML = hits.map(f => {
        const safeJson = escapeHtml(JSON.stringify(f));
        return `
        <div class="flex items-center gap-3 px-3 py-2 rounded-xl border border-white/5 bg-black/30 hover:border-white/20 transition-all" data-fighter-json="${safeJson}">
            ${f.image_url ? `<img src="${escapeHtml(f.image_url)}" class="w-8 h-8 rounded-full object-cover object-top bg-zinc-800 shrink-0">` : '<div class="w-8 h-8 rounded-full bg-zinc-800 shrink-0"></div>'}
            <div class="flex-1 min-w-0">
                <p class="oswald-sharp text-white font-black italic text-xs uppercase truncate">${escapeHtml(f.name || f.name_en)}</p>
                <p class="text-gray-500 text-[10px]">${f.wins||0}-${f.losses||0}-${f.draws||0}</p>
            </div>
            <div class="flex gap-1 shrink-0">
                <button onclick="setMemCorner('red', this.closest('[data-fighter-json]').dataset.fighterJson)"
                    class="oswald-sharp bg-red-900/60 hover:bg-red-700 text-red-300 hover:text-white font-black italic text-[10px] px-2 py-1 rounded-lg tracking-widest transition-all">RED</button>
                <button onclick="setMemCorner('blue', this.closest('[data-fighter-json]').dataset.fighterJson)"
                    class="oswald-sharp bg-blue-900/60 hover:bg-blue-700 text-blue-300 hover:text-white font-black italic text-[10px] px-2 py-1 rounded-lg tracking-widest transition-all">BLUE</button>
            </div>
        </div>`;
    }).join('');
}

function setMemCorner(corner, fighterJson) {
    const f = JSON.parse(fighterJson);
    _memState[corner + 'Fighter'] = f;
    const nameEl = document.getElementById(`mem-${corner}-name`);
    const recordEl = document.getElementById(`mem-${corner}-record`);
    if (nameEl) nameEl.textContent = f.name || f.name_en;
    if (recordEl) recordEl.textContent = `${f.wins||0}-${f.losses||0}-${f.draws||0}`;
    // 이미지 자동입력
    const photoEl = document.getElementById(`mem-${corner}-photo`);
    if (photoEl && f.image_url) {
        photoEl.value = f.image_url;
        _memState[corner + 'PhotoOverride'] = f.image_url;
    }
    // 검색창 닫기
    const searchEl = document.getElementById('mem-search');
    const resultsEl = document.getElementById('mem-search-results');
    if (searchEl) searchEl.value = '';
    if (resultsEl) resultsEl.innerHTML = '';
}

function clearMemCorner(corner) {
    _memState[corner + 'Fighter'] = null;
    _memState[corner + 'PhotoOverride'] = '';
    const nameEl = document.getElementById(`mem-${corner}-name`);
    const recordEl = document.getElementById(`mem-${corner}-record`);
    const photoEl = document.getElementById(`mem-${corner}-photo`);
    if (nameEl) nameEl.textContent = '—';
    if (recordEl) recordEl.textContent = '';
    if (photoEl) photoEl.value = '';
}

async function saveMatchupFromModal() {
    const { editingMatchupId, redFighter, blueFighter, weightClass, cardSegment, sortOrder } = _memState;
    if (!_builderState.eventId) { showToast('⚠ 이벤트가 선택되지 않았습니다'); return; }

    // 이름만 있어도 저장 허용 (파이터 FK 없이 이름만 입력된 경우 대비)
    const redName = redFighter ? (redFighter.name || redFighter.name_en) : document.getElementById('mem-red-name')?.textContent;
    const blueName = blueFighter ? (blueFighter.name || blueFighter.name_en) : document.getElementById('mem-blue-name')?.textContent;
    if (!redName || redName === '—' || !blueName || blueName === '—') {
        showToast('⚠ 레드/블루 코너를 모두 선택하세요');
        return;
    }

    const row = {
        event_id: _builderState.eventId,
        red_fighter_id: redFighter?.id || null,
        blue_fighter_id: blueFighter?.id || null,
        red_fighter_name: redName,
        blue_fighter_name: blueName,
        red_image_url: _memState.redPhotoOverride || redFighter?.image_url || null,
        blue_image_url: _memState.bluePhotoOverride || blueFighter?.image_url || null,
        weight_class: weightClass || null,
        card_segment: cardSegment,
        sort_order: sortOrder,
        is_main_event: (cardSegment === 'main' && sortOrder === 1),
    };

    let err;
    if (editingMatchupId) {
        const res = await sb.from('matchups').update(row).eq('id', editingMatchupId);
        err = res.error;
    } else {
        const res = await sb.from('matchups').insert(row);
        err = res.error;
    }

    if (err) { showToast('❌ 저장 실패: ' + err.message); return; }
    showToast(editingMatchupId ? '✅ 매치업 수정 완료' : '✅ 매치업 추가 완료');
    closeMatchupEditModal();
    await fetchBuilderMatchups();
}

async function deleteMatchupFromModal() {
    const id = _memState.editingMatchupId;
    if (!id) return;
    const m = _builderMatchups.find(x => x.id === id);
    const label = m ? `${m.red_fighter_name} vs ${m.blue_fighter_name}` : '이 경기';
    if (!confirm(`"${label}"를 삭제할까요?`)) return;
    const { error } = await sb.from('matchups').delete().eq('id', id);
    if (error) { showToast('❌ 삭제 실패: ' + error.message); return; }
    showToast('🗑 삭제 완료');
    closeMatchupEditModal();
    await fetchBuilderMatchups();
}

// ── 이벤트 삭제 ────────────────────────────────────────────────────

async function deleteBuilderEvent(eventId, eventTitle) {
    if (!confirm(`"${eventTitle}" 이벤트를 삭제할까요?\n(이 이벤트의 모든 대진표도 함께 삭제됩니다)`)) return;
    // 매치업 먼저 삭제
    await sb.from('matchups').delete().eq('event_id', eventId);
    // 이벤트 삭제
    const { error } = await sb.from('events').delete().eq('id', eventId);
    if (error) { showToast('❌ 이벤트 삭제 실패: ' + error.message); return; }
    showToast('🗑 이벤트 삭제 완료');
    // 선택 중이던 이벤트면 워크스페이스 초기화
    if (_builderState.eventId === eventId) {
        _builderState.eventId = null;
        _builderMatchups = [];
    }
    await fetchEventsForBuilder();
    if (_builderState.eventId === null) renderBuilderWorkspace();
}

// ----- ARCHIVE SYNC -----
function syncArchiveFighters() {
    if (typeof fighterArchiveDB !== 'undefined') fighterArchiveDB = [];
    if (typeof fetchFighterArchive === 'function') {
        fetchFighterArchive();
        showToast('✅ 아카이브 파이터 목록 새로고침');
    } else {
        showToast('⚠ 아카이브 로더를 찾을 수 없습니다');
    }
}

// ----- ADD EVENT MODAL -----
function openAddEventModal() {
    const modal = document.getElementById('add-event-modal');
    if (modal) modal.classList.remove('hidden');
}

async function saveNewEvent() {
    const titleEl = document.getElementById('new-event-title');
    const dateEl = document.getElementById('new-event-date');
    const title = (titleEl?.value || '').trim();
    const dateVal = dateEl?.value || '';
    if (!title) { showToast('⚠ 이벤트 이름을 입력하세요'); return; }

    const eventDate = dateVal ? new Date(dateVal + 'T00:00:00Z').toISOString() : null;
    const { data, error } = await sb.from('events').insert({
        title,
        event_date: eventDate,
        status: document.getElementById('new-event-status')?.value || 'upcoming',
    }).select('id').single();

    if (error) { showToast('❌ 저장 실패: ' + error.message); return; }

    showToast('✅ 이벤트 추가 완료');
    document.getElementById('add-event-modal').classList.add('hidden');
    if (titleEl) titleEl.value = '';
    if (dateEl) dateEl.value = '';
    await fetchEventsForBuilder();
    if (data?.id) selectBuilderEvent(data.id);
}
