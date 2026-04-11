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
    ['fighters', 'fights', 'archive', 'news', 'season', 'event', 'settings'].forEach(t => {
        document.getElementById(`admin-panel-${t}`).classList.add('hidden');
        document.getElementById(`admin-tab-${t}`).classList.remove('active-tab', 'text-ufcRed');
        document.getElementById(`admin-tab-${t}`).classList.add('text-gray-500');
    });
    document.getElementById(`admin-panel-${tab}`).classList.remove('hidden');
    document.getElementById(`admin-tab-${tab}`).classList.add('active-tab');
    document.getElementById(`admin-tab-${tab}`).classList.remove('text-gray-500');
    if (tab === 'season') renderSeasonAdminPanel();
    if (tab === 'settings') { loadGeminiKeyToUI(); }
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

function renderAdminFighterList() {
    const list = document.getElementById('fighter-db-list');
    const count = document.getElementById('fighter-count');
    if (!list) return;

    // Supabase fighters 테이블에서 동기화 (DB가 진실의 원천)
    if (sb) {
        sb.from('fighters').select('*').order('name', { ascending: true })
        .then(function(res) {
            if (res.data && res.data.length > 0) {
                res.data.forEach(function(f) {
                    const existing = fighterDB.find(x => x.id === f.id);
                    if (!existing) fighterDB.push(f);
                    else Object.assign(existing, f);
                });
                saveAdmin();
            }
            _renderFighterListUI(list, count);
        });
        return;
    }
    _renderFighterListUI(list, count);
}

function _renderFighterListUI(list, count) {
    const query = (document.getElementById('fighter-search-input')?.value || '').toLowerCase();
    const filtered = fighterDB.filter(f =>
        !query ||
        f.name.toLowerCase().includes(query) ||
        (f.name_en || '').toLowerCase().includes(query) ||
        (f.division || '').toLowerCase().includes(query) ||
        (f.rank || '').toLowerCase().includes(query)
    );
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
        const styleCls = STYLE_COLORS[f.style] || STYLE_COLORS['all-around'];
        const styleLabel = STYLE_LABELS[f.style] || STYLE_LABELS['all-around'];
        const avatar = f.image_url
            ? `<img src="${f.image_url}" class="w-10 h-10 lg:w-12 lg:h-12 rounded-full object-cover border border-ufcRed/30" onerror="this.style.display='none'">`
            : `<div class="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-ufcRed/10 border border-ufcRed/30 flex items-center justify-center oswald-sharp text-ufcRed font-black italic text-xs lg:text-sm">${f.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</div>`;
        return `
        <div class="glass-card rounded-2xl p-4 lg:p-6 flex items-center justify-between hover:border-ufcRed/30 transition-all">
            <div class="flex items-center gap-4 lg:gap-6 cursor-pointer group" onclick="openFighterProfile(${JSON.stringify(f).replace(/"/g,'&quot;')})">
                ${avatar}
                <div>
                    <div class="flex items-center gap-2 mb-0.5">
                        <p class="oswald-sharp font-black italic text-sm lg:text-xl text-white uppercase tracking-tighter group-hover:text-ufcRed transition">${f.name}</p>
                        <span class="oswald-sharp text-[8px] border ${styleCls} px-1.5 py-0.5 rounded-md font-black italic uppercase hidden lg:inline">${styleLabel}</span>
                    </div>
                    <p class="oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest">${f.division} · ${f.record} · ${f.rank}${f.country ? ' · ' + f.country : ''}</p>
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
        document.getElementById('fm-rank').value = f.rank;
        document.getElementById('fm-style').value = f.style || 'all-around';
        document.getElementById('fm-height').value = f.height;
        document.getElementById('fm-reach').value = f.reach;
        document.getElementById('fm-odds').value = f.odds;
        document.getElementById('fm-division').value = f.division;
        document.getElementById('fm-image').value = f.image_url || '';
        buildStatsSliders(f.stats);
    } else {
        title.textContent = '파이터 추가';
        ['fm-name','fm-name-en','fm-country','fm-rank','fm-height','fm-reach','fm-odds','fm-image'].forEach(id => document.getElementById(id).value = '');
        ['fm-wins','fm-losses','fm-draws'].forEach(id => document.getElementById(id).value = '0');
        document.getElementById('fm-style').value = 'all-around';
        buildStatsSliders(null);
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
        stats
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
