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
        if (error) throw new Error(error.message);

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
    weightClass: '',
    cardSegment: 'main',
    sortOrder: 1,
    searchResults: [],
    _searchTimer: null,
};

var _builderEvents = [];
var _builderMatchups = [];
var _allFightersCache = [];

async function fetchEventsForBuilder() {
    const { data, error } = await sb
        .from('events')
        .select('id, title, event_date, status')
        .order('event_date', { ascending: false })
        .limit(30);
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
        return `<button onclick="selectBuilderEvent('${ev.id}')"
            class="w-full text-left px-4 py-3 rounded-xl border transition-all text-xs oswald-sharp italic uppercase tracking-widest font-black
                   ${isActive ? 'bg-ufcRed/10 border-ufcRed text-white' : 'border-white/5 text-gray-400 hover:text-white hover:border-white/20'}">
            <span class="block truncate">${escapeHtml(ev.title)}</span>
            <span class="text-[10px] font-normal not-italic normal-case tracking-normal ${isActive ? 'text-red-300' : 'text-gray-600'}">${dateLabel}</span>
        </button>`;
    }).join('');
}

async function selectBuilderEvent(eventId) {
    _builderState.eventId = eventId;
    resetBuilderForm();
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
    renderBuilderMatchupList();
}

function renderBuilderWorkspace() {
    const el = document.getElementById('builder-workspace');
    if (!el) return;
    const ev = _builderEvents.find(e => e.id === _builderState.eventId);
    if (!ev) { el.innerHTML = ''; return; }
    const dateLabel = ev.event_date ? new Date(ev.event_date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '날짜 미정';
    el.innerHTML = `
        <div class="mb-4 flex items-start justify-between gap-3">
            <div>
                <h5 class="oswald-sharp text-lg font-black italic uppercase text-white tracking-widest leading-tight">${escapeHtml(ev.title)}</h5>
                <p class="oswald-sharp text-ufcRed italic text-xs tracking-widest mt-0.5">${dateLabel}</p>
            </div>
            <button onclick="syncArchiveFighters()" class="oswald-sharp border border-blue-500/30 text-blue-400 hover:text-blue-300 font-black px-3 py-1.5 rounded-xl italic text-[10px] uppercase tracking-widest transition-all shrink-0">↻ 아카이브 동기화</button>
        </div>
        <!-- Fighter Search -->
        <div class="mb-4">
            <input id="builder-fighter-search" type="text" placeholder="파이터 이름 검색..."
                oninput="onBuilderSearch(this.value)"
                class="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-ufcRed placeholder-gray-600 transition-colors">
            <div id="builder-search-results" class="mt-1 space-y-1 max-h-48 overflow-y-auto"></div>
        </div>
        <!-- Corners -->
        <div class="grid grid-cols-2 gap-3 mb-4">
            <div id="builder-red-slot" onclick="clearBuilderCorner('red')" class="cursor-pointer border border-red-500/30 rounded-xl p-3 min-h-[80px] flex flex-col items-center justify-center text-center transition-all hover:border-red-500/60">
                <p class="oswald-sharp text-red-400 italic text-[10px] uppercase tracking-widest mb-1">🔴 RED CORNER</p>
                <p id="builder-red-name" class="oswald-sharp text-white font-black italic text-sm uppercase">—</p>
                <p id="builder-red-record" class="text-gray-500 text-[10px] mt-0.5"></p>
            </div>
            <div id="builder-blue-slot" onclick="clearBuilderCorner('blue')" class="cursor-pointer border border-blue-500/30 rounded-xl p-3 min-h-[80px] flex flex-col items-center justify-center text-center transition-all hover:border-blue-500/60">
                <p class="oswald-sharp text-blue-400 italic text-[10px] uppercase tracking-widest mb-1">🔵 BLUE CORNER</p>
                <p id="builder-blue-name" class="oswald-sharp text-white font-black italic text-sm uppercase">—</p>
                <p id="builder-blue-record" class="text-gray-500 text-[10px] mt-0.5"></p>
            </div>
        </div>
        <!-- Bout Meta -->
        <div class="grid grid-cols-3 gap-2 mb-4">
            <select id="builder-segment" onchange="_builderState.cardSegment=this.value"
                class="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-ufcRed">
                <option value="main">메인카드</option>
                <option value="prelim">프렐림</option>
            </select>
            <input id="builder-order" type="number" min="1" max="20" placeholder="순서" value="1"
                oninput="_builderState.sortOrder=parseInt(this.value)||1"
                class="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-ufcRed text-center">
            <select id="builder-weight" onchange="_builderState.weightClass=this.value"
                class="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-ufcRed">
                <option value="">체급 선택</option>
                <option value="hw">헤비급</option>
                <option value="lhw">라이트헤비급</option>
                <option value="mw">미들급</option>
                <option value="ww">웰터급</option>
                <option value="lw">라이트급</option>
                <option value="fw">페더급</option>
                <option value="bw">밴텀급</option>
                <option value="flw">플라이급</option>
                <option value="wmw">여자 스트로급</option>
                <option value="wfw">여자 플라이급</option>
                <option value="wbw">여자 밴텀급</option>
            </select>
        </div>
        <!-- Save -->
        <div class="flex gap-2">
            <button onclick="saveBuilderMatchup()"
                class="flex-1 oswald-sharp bg-ufcRed hover:bg-red-700 text-white font-black italic uppercase text-sm px-6 py-2.5 rounded-xl tracking-widest transition-all hover:shadow-[0_0_16px_rgba(232,0,13,0.4)]">
                💾 저장
            </button>
            <button onclick="resetBuilderForm()"
                class="oswald-sharp border border-white/10 text-gray-400 hover:text-white font-black italic uppercase text-sm px-4 py-2.5 rounded-xl tracking-widest transition-all">
                초기화
            </button>
        </div>
        <!-- Existing matchups -->
        <div class="mt-6 border-t border-white/5 pt-4">
            <p class="oswald-sharp text-xs italic uppercase tracking-widest text-gray-500 mb-3">등록된 대진표</p>
            <div id="builder-matchup-list" class="space-y-2"></div>
        </div>`;
}

function onBuilderSearch(query) {
    clearTimeout(_builderState._searchTimer);
    _builderState.searchQuery = query;
    if (!query.trim()) {
        document.getElementById('builder-search-results').innerHTML = '';
        return;
    }
    _builderState._searchTimer = setTimeout(() => runBuilderSearch(query), 250);
}

async function runBuilderSearch(query) {
    const resultsEl = document.getElementById('builder-search-results');
    if (!resultsEl) return;
    const q = query.trim().toLowerCase();
    if (!q) { resultsEl.innerHTML = ''; return; }

    // Use cached fighters or fetch
    if (!_allFightersCache.length) {
        const { data } = await sb.from('fighters').select('id, name, name_en, division, wins, losses, draws, image_url').limit(5000);
        _allFightersCache = data || [];
    }

    const hits = _allFightersCache.filter(f =>
        (f.name || '').toLowerCase().includes(q) ||
        (f.name_en || '').toLowerCase().includes(q)
    ).slice(0, 8);

    if (!hits.length) {
        resultsEl.innerHTML = '<p class="text-gray-600 text-xs italic py-2 px-3">검색 결과 없음</p>';
        return;
    }

    resultsEl.innerHTML = hits.map(f => `
        <div class="flex items-center gap-3 px-3 py-2 rounded-xl border border-white/5 bg-black/30 hover:border-white/20 transition-all">
            ${f.image_url ? `<img src="${escapeHtml(f.image_url)}" class="w-8 h-8 rounded-full object-cover object-top bg-zinc-800 shrink-0">` : '<div class="w-8 h-8 rounded-full bg-zinc-800 shrink-0"></div>'}
            <div class="flex-1 min-w-0">
                <p class="oswald-sharp text-white font-black italic text-xs uppercase truncate">${escapeHtml(f.name || f.name_en)}</p>
                <p class="text-gray-500 text-[10px]">${f.wins || 0}-${f.losses || 0}-${f.draws || 0}</p>
            </div>
            <div class="flex gap-1 shrink-0">
                <button onclick="setBuilderCorner('red', ${JSON.stringify(JSON.stringify(f)).slice(1,-1)})"
                    class="oswald-sharp bg-red-900/60 hover:bg-red-700 text-red-300 hover:text-white font-black italic text-[10px] px-2 py-1 rounded-lg tracking-widest transition-all">RED</button>
                <button onclick="setBuilderCorner('blue', ${JSON.stringify(JSON.stringify(f)).slice(1,-1)})"
                    class="oswald-sharp bg-blue-900/60 hover:bg-blue-700 text-blue-300 hover:text-white font-black italic text-[10px] px-2 py-1 rounded-lg tracking-widest transition-all">BLUE</button>
            </div>
        </div>
    `).join('');
}

function setBuilderCorner(corner, fighterJson) {
    const f = JSON.parse(fighterJson);
    _builderState[corner + 'Fighter'] = f;
    const nameEl = document.getElementById(`builder-${corner}-name`);
    const recordEl = document.getElementById(`builder-${corner}-record`);
    if (nameEl) nameEl.textContent = f.name || f.name_en;
    if (recordEl) recordEl.textContent = `${f.wins||0}-${f.losses||0}-${f.draws||0}`;
}

function clearBuilderCorner(corner) {
    _builderState[corner + 'Fighter'] = null;
    const nameEl = document.getElementById(`builder-${corner}-name`);
    const recordEl = document.getElementById(`builder-${corner}-record`);
    if (nameEl) nameEl.textContent = '—';
    if (recordEl) recordEl.textContent = '';
}

function resetBuilderForm() {
    _builderState.editingMatchupId = null;
    _builderState.redFighter = null;
    _builderState.blueFighter = null;
    _builderState.weightClass = '';
    _builderState.cardSegment = 'main';
    _builderState.sortOrder = 1;
    ['builder-red-name','builder-blue-name'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
    ['builder-red-record','builder-blue-record'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });
    ['builder-fighter-search','builder-search-results'].forEach(id => { const el = document.getElementById(id); if (el) el.value !== undefined ? el.value = '' : el.innerHTML = ''; });
}

async function saveBuilderMatchup() {
    const { eventId, redFighter, blueFighter, weightClass, cardSegment, sortOrder, editingMatchupId } = _builderState;
    if (!eventId) { showToast('⚠ 이벤트를 먼저 선택하세요'); return; }
    if (!redFighter || !blueFighter) { showToast('⚠ 레드/블루 코너를 모두 선택하세요'); return; }
    if (redFighter.id === blueFighter.id) { showToast('⚠ 같은 파이터를 양쪽에 선택했습니다'); return; }

    const row = {
        event_id: eventId,
        red_fighter_id: redFighter.id,
        blue_fighter_id: blueFighter.id,
        red_fighter_name: redFighter.name || redFighter.name_en,
        blue_fighter_name: blueFighter.name || blueFighter.name_en,
        red_image_url: redFighter.image_url || null,
        blue_image_url: blueFighter.image_url || null,
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
    resetBuilderForm();
    await fetchBuilderMatchups();
}

function renderBuilderMatchupList() {
    const el = document.getElementById('builder-matchup-list');
    if (!el) return;
    if (!_builderMatchups.length) {
        el.innerHTML = '<p class="text-gray-700 text-xs italic py-4 text-center">등록된 대진표 없음</p>';
        return;
    }
    const main = _builderMatchups.filter(m => m.card_segment === 'main');
    const prelim = _builderMatchups.filter(m => m.card_segment !== 'main');
    const renderGroup = (label, fights) => fights.length ? `
        <p class="oswald-sharp text-[10px] italic uppercase tracking-widest text-gray-600 mt-3 mb-1">${label}</p>
        ${fights.map(m => `
        <div class="flex items-center gap-3 px-3 py-2 rounded-xl border border-white/5 bg-black/20">
            <span class="oswald-sharp text-gray-500 text-[10px] italic w-4 shrink-0">${m.sort_order||'?'}</span>
            <p class="flex-1 oswald-sharp text-white font-black italic text-xs uppercase truncate">
                <span class="text-red-400">${escapeHtml(m.red_fighter_name||'?')}</span>
                <span class="text-gray-500 mx-1">vs</span>
                <span class="text-blue-400">${escapeHtml(m.blue_fighter_name||'?')}</span>
            </p>
            <div class="flex gap-1 shrink-0">
                <button onclick="editBuilderMatchup('${m.id}')" class="text-gray-500 hover:text-white text-[10px] px-2 py-1 rounded-lg hover:bg-white/10 transition-all">✏</button>
                <button onclick="deleteBuilderMatchup('${m.id}')" class="text-gray-500 hover:text-red-400 text-[10px] px-2 py-1 rounded-lg hover:bg-red-500/10 transition-all">🗑</button>
            </div>
        </div>`).join('')}` : '';
    el.innerHTML = renderGroup('메인카드', main) + renderGroup('프렐림', prelim);
}

async function deleteBuilderMatchup(id) {
    if (!confirm('이 대진표를 삭제할까요?')) return;
    const { error } = await sb.from('matchups').delete().eq('id', id);
    if (error) { showToast('❌ 삭제 실패: ' + error.message); return; }
    showToast('🗑 삭제 완료');
    await fetchBuilderMatchups();
}

function editBuilderMatchup(id) {
    const m = _builderMatchups.find(x => x.id === id);
    if (!m) return;
    _builderState.editingMatchupId = id;
    // Populate corners from snapshot data (fighter FK might be null for old rows)
    if (m.red_fighter_id) {
        const rf = _allFightersCache.find(f => f.id === m.red_fighter_id);
        if (rf) setBuilderCorner('red', JSON.stringify(rf));
    }
    if (m.blue_fighter_id) {
        const bf = _allFightersCache.find(f => f.id === m.blue_fighter_id);
        if (bf) setBuilderCorner('blue', JSON.stringify(bf));
    }
    const segEl = document.getElementById('builder-segment');
    const orderEl = document.getElementById('builder-order');
    const weightEl = document.getElementById('builder-weight');
    if (segEl) segEl.value = m.card_segment || 'main';
    if (orderEl) orderEl.value = m.sort_order || 1;
    if (weightEl) weightEl.value = m.weight_class || '';
    _builderState.cardSegment = m.card_segment || 'main';
    _builderState.sortOrder = m.sort_order || 1;
    _builderState.weightClass = m.weight_class || '';
    showToast('✏ 수정 모드');
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
        status: 'upcoming',
    }).select('id').single();

    if (error) { showToast('❌ 저장 실패: ' + error.message); return; }

    showToast('✅ 이벤트 추가 완료');
    document.getElementById('add-event-modal').classList.add('hidden');
    if (titleEl) titleEl.value = '';
    if (dateEl) dateEl.value = '';
    await fetchEventsForBuilder();
    if (data?.id) selectBuilderEvent(data.id);
}
