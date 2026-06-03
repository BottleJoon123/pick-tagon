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
var _dndDragIdx = null;

function _onFightDragStart(e, idx) {
    _dndDragIdx = idx;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.4';
}
function _onFightDragEnd(e) {
    e.currentTarget.style.opacity = '';
}
function _onFightDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}
function _onFightDrop(e, dropIdx) {
    e.preventDefault();
    var dragIdx = _dndDragIdx;
    _dndDragIdx = null;
    if (dragIdx === null || dragIdx === dropIdx) return;

    var fights = getActiveFights().slice();
    var moved = fights.splice(dragIdx, 1)[0];
    fights.splice(dropIdx, 0, moved);

    if (typeof _dbMatchups !== 'undefined' && fights[0] && fights[0]._fromDB) {
        _dbMatchups = fights;
    } else {
        customFights = fights;
        saveAdmin();
    }
    renderAdminFightCardList();

    if (typeof sb !== 'undefined' && sb && moved._fromDB) {
        var mainFights  = fights.filter(function(f) { return f.section === 'main'; });
        var prelimFights = fights.filter(function(f) { return f.section !== 'main'; });
        var updates = [];
        mainFights.forEach(function(f, i)  { if (f._fromDB) updates.push({ id: f.id, sort_order: i + 1 }); });
        prelimFights.forEach(function(f, i) { if (f._fromDB) updates.push({ id: f.id, sort_order: i + 1 }); });
        if (updates.length) {
            sb.rpc('admin_reorder_matchups', { p_updates: updates })
              .then(function(res) {
                  if (res.error) { showToast('⚠ 순서 저장 실패: ' + (res.error.message || res.error)); return; }
                  showToast('↕ 순서 저장됨');
              });
            return;
        }
    }
    showToast('↕ 경기 순서 변경됨');
}

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
    ['dashboard', 'fighters', 'archive', 'news', 'season', 'event', 'ufc', 'settings'].forEach(function(t) {
        var panel = document.getElementById('admin-panel-' + t);
        var tabEl = document.getElementById('admin-tab-'   + t);
        if (panel) panel.classList.add('hidden');
        if (tabEl) { tabEl.classList.remove('active-tab', 'text-ufcRed'); tabEl.classList.add('text-gray-500'); }
    });
    var activePanel = document.getElementById('admin-panel-' + tab);
    var activeTab   = document.getElementById('admin-tab-'   + tab);
    if (activePanel) activePanel.classList.remove('hidden');
    if (activeTab)   { activeTab.classList.add('active-tab'); activeTab.classList.remove('text-gray-500'); }
    if (tab === 'dashboard') renderAdminDashboard();
    if (tab === 'fighters')  renderAdminFighterList();
    if (tab === 'season')    loadAdminHallOfFameFromDB().then(renderSeasonAdminPanel);
    if (tab === 'settings')  loadGeminiKeyToUI();
    if (tab === 'ufc')       fetchEventsForBuilder();
}

// ── Admin Dashboard ──────────────────────────────────────────────────
function renderAdminDashboard() {
    var panel = document.getElementById('admin-panel-dashboard');
    if (!panel) return;

    if (!sb) {
        panel.innerHTML = '<div class="glass-card p-8 text-center text-gray-600 oswald-sharp text-xs italic uppercase tracking-widest rounded-2xl">DB 연결 필요</div>';
        return;
    }

    panel.innerHTML = [
        '<div class="flex items-center justify-between mb-5">',
        '  <p class="oswald-sharp text-[9px] text-gray-500 uppercase tracking-widest italic">운영 현황 · 읽기 전용</p>',
        '  <button onclick="renderAdminDashboard()" class="oswald-sharp border border-white/10 text-gray-400 hover:text-white font-black px-4 py-2 rounded-xl italic text-xs uppercase tracking-widest transition-all">↻ 새로고침</button>',
        '</div>',
        '<div id="admin-dashboard-content">',
        '  <div class="glass-card p-6 text-center text-gray-600 oswald-sharp text-xs italic uppercase tracking-widest rounded-2xl animate-pulse">로딩 중...</div>',
        '</div>'
    ].join('');

    sb.rpc('get_admin_dashboard_summary').then(function(res) {
        var content = document.getElementById('admin-dashboard-content');
        if (!content) return;

        if (res.error) {
            content.innerHTML = '<div class="glass-card p-6 text-center text-ufcRed/70 oswald-sharp text-xs italic uppercase tracking-widest rounded-2xl">⚠ RPC 오류: ' + res.error.message + '</div>';
            return;
        }

        var d = res.data;
        if (!d || !d.ok) {
            var reason = d && d.reason;
            content.innerHTML = '<div class="glass-card p-6 text-center text-gray-600 oswald-sharp text-xs italic uppercase tracking-widest rounded-2xl">' + (reason === 'admin_required' ? '⚠ 관리자 권한 필요' : '⚠ 데이터 로드 실패') + '</div>';
            return;
        }

        var ec = d.event_counts || {};
        var hf = d.health_flags || {};
        var pointsPaid7d      = d.points_paid_7d      || 0;
        var unresolvedMatchups = d.unresolved_matchups || 0;
        var unsettledEvents   = d.unsettled_events     || 0;
        var pendingPicksAlert = d.pending_picks_alert  || 0;

        // health flags 경고 strip
        var healthWarnings = [];
        if (hf.has_unresolved_matchups) healthWarnings.push('⚠ 결과 미입력 ' + unresolvedMatchups + '건');
        if (hf.has_unsettled_events)    healthWarnings.push('⚠ 정산 대기 ' + unsettledEvents + '건');
        if (hf.has_pending_picks)       healthWarnings.push('⚠ Pending ' + pendingPicksAlert + '건');
        if (hf.has_active_battles)      healthWarnings.push('ℹ 배틀 ' + (d.active_battles || 0) + '건');
        var healthStripHtml = healthWarnings.length > 0
            ? [
                '<div class="glass-card rounded-2xl px-4 py-3 mb-5 border border-amber-500/20 bg-amber-500/5 flex flex-wrap items-center gap-3">',
                '  <span class="oswald-sharp text-[9px] font-black italic uppercase tracking-widest text-amber-400 flex-shrink-0">운영 알림</span>',
                healthWarnings.map(function(w) {
                    return '<span class="oswald-sharp text-[9px] italic uppercase tracking-widest text-amber-300/80">' + w + '</span>';
                }).join(''),
                '</div>'
              ].join('')
            : '<div class="glass-card rounded-2xl px-4 py-3 mb-5 border border-green-500/10 bg-green-500/5">'
              + '<span class="oswald-sharp text-[9px] font-black italic uppercase tracking-widest text-green-400/70">✓ 운영 이상 없음</span>'
              + '</div>';

        var STATUS_CFG = [
            { key: 'upcoming',  label: 'UPCOMING',  num: 'text-emerald-400', border: 'border-emerald-500/20 bg-emerald-500/5' },
            { key: 'locked',    label: 'LOCKED',    num: 'text-amber-400',   border: 'border-amber-500/20  bg-amber-500/5'  },
            { key: 'completed', label: 'COMPLETED', num: 'text-blue-400',    border: 'border-blue-500/20   bg-blue-500/5'   },
            { key: 'settled',   label: 'SETTLED',   num: 'text-green-400',   border: 'border-green-500/20  bg-green-500/5'  },
            { key: 'archived',  label: 'ARCHIVED',  num: 'text-gray-500',    border: 'border-gray-600/20   bg-black/20'     }
        ];

        var eventCardsHtml = STATUS_CFG.map(function(cfg) {
            return [
                '<div class="glass-card rounded-2xl px-4 py-4 border ' + cfg.border + ' text-center">',
                '  <p class="oswald-sharp text-2xl lg:text-3xl font-black italic ' + cfg.num + '">' + (ec[cfg.key] || 0) + '</p>',
                '  <p class="oswald-sharp text-[8px] uppercase tracking-widest mt-1 text-gray-500">' + cfg.label + '</p>',
                '</div>'
            ].join('');
        }).join('');

        var cs = d.current_season || {};
        var auditRows = d.recent_audit_logs || [];
        var auditHtml = auditRows.length === 0
            ? '<p class="oswald-sharp text-[9px] text-gray-700 italic uppercase tracking-widest text-center py-4">기록 없음</p>'
            : auditRows.map(function(log) {
                var dt = log.created_at ? log.created_at.slice(0, 16).replace('T', ' ') : '—';
                return [
                    '<div class="flex items-center justify-between py-2.5 border-b border-white/4 last:border-0">',
                    '  <div class="flex items-center gap-3 min-w-0">',
                    '    <span class="oswald-sharp text-[9px] font-black italic text-ufcRed/80 uppercase tracking-widest flex-shrink-0">' + (log.action || '—') + '</span>',
                    '    <span class="oswald-sharp text-[9px] text-gray-600 italic uppercase hidden lg:block">' + (log.entity_table || '—') + '</span>',
                    '    <span class="oswald-sharp text-[9px] text-gray-700 truncate hidden lg:block" style="max-width:120px">' + (log.entity_id || '—') + '</span>',
                    '  </div>',
                    '  <span class="oswald-sharp text-[9px] text-gray-700 italic flex-shrink-0">' + dt + '</span>',
                    '</div>'
                ].join('');
            }).join('');

        content.innerHTML = [
            healthStripHtml,
            '<!-- 이벤트 상태 -->',
            '<div class="mb-5">',
            '  <p class="oswald-sharp text-[9px] text-gray-500 uppercase tracking-widest italic mb-3">이벤트 상태</p>',
            '  <div class="grid grid-cols-5 gap-2 lg:gap-3">' + eventCardsHtml + '</div>',
            '</div>',
            '<!-- D2: 운영 이상 감지 지표 -->',
            '<div class="grid grid-cols-3 gap-3 lg:gap-4 mb-5">',
            '  <div class="glass-card rounded-2xl p-4 lg:p-5 text-center ' + (unresolvedMatchups > 0 ? 'border border-amber-500/20 bg-amber-500/5' : '') + '">',
            '    <p class="oswald-sharp text-2xl lg:text-3xl font-black italic ' + (unresolvedMatchups > 0 ? 'text-amber-400' : 'text-green-400') + '">' + unresolvedMatchups + '</p>',
            '    <p class="oswald-sharp text-[8px] uppercase tracking-widest mt-1 text-gray-500">Unresolved</p>',
            '  </div>',
            '  <div class="glass-card rounded-2xl p-4 lg:p-5 text-center ' + (unsettledEvents > 0 ? 'border border-amber-500/20 bg-amber-500/5' : '') + '">',
            '    <p class="oswald-sharp text-2xl lg:text-3xl font-black italic ' + (unsettledEvents > 0 ? 'text-amber-400' : 'text-green-400') + '">' + unsettledEvents + '</p>',
            '    <p class="oswald-sharp text-[8px] uppercase tracking-widest mt-1 text-gray-500">Unsettled Events</p>',
            '  </div>',
            '  <div class="glass-card rounded-2xl p-4 lg:p-5 text-center">',
            '    <p class="oswald-sharp text-2xl lg:text-3xl font-black italic text-white">' + pointsPaid7d.toLocaleString() + '</p>',
            '    <p class="oswald-sharp text-[8px] uppercase tracking-widest mt-1 text-gray-500">Points (7D)</p>',
            '  </div>',
            '</div>',
            '<!-- 핵심 지표 3종 -->',
            '<div class="grid grid-cols-3 gap-3 lg:gap-4 mb-5">',
            '  <div class="glass-card rounded-2xl p-4 lg:p-5 text-center">',
            '    <p class="oswald-sharp text-2xl lg:text-3xl font-black italic text-white">' + (d.pending_picks_total || 0) + '</p>',
            '    <p class="oswald-sharp text-[8px] uppercase tracking-widest mt-1 text-gray-500">Pending Picks</p>',
            '  </div>',
            '  <div class="glass-card rounded-2xl p-4 lg:p-5 text-center">',
            '    <p class="oswald-sharp text-2xl lg:text-3xl font-black italic text-white">' + (d.active_battles || 0) + '</p>',
            '    <p class="oswald-sharp text-[8px] uppercase tracking-widest mt-1 text-gray-500">Active Battles</p>',
            '  </div>',
            '  <div class="glass-card rounded-2xl p-4 lg:p-5 text-center">',
            '    <p class="oswald-sharp text-2xl lg:text-3xl font-black italic text-white">' + (d.news_count || 0) + '</p>',
            '    <p class="oswald-sharp text-[8px] uppercase tracking-widest mt-1 text-gray-500">News Items</p>',
            '  </div>',
            '</div>',
            '<!-- 현재 시즌 -->',
            '<div class="glass-card rounded-2xl p-4 lg:p-5 mb-5">',
            '  <p class="oswald-sharp text-[9px] text-gray-500 uppercase tracking-widest italic mb-2">Current Season</p>',
            '  <div class="flex items-center justify-between">',
            '    <p class="oswald-sharp font-black italic text-lg lg:text-2xl text-white uppercase tracking-tighter">' + (cs.name || '—') + '</p>',
            '    <div class="text-right">',
            '      <p class="oswald-sharp text-[9px] text-gray-600 italic uppercase">시작: ' + (cs.start_date || '—') + '</p>',
            '      <p class="oswald-sharp text-sm font-black italic text-ufcRed">' + (cs.days_elapsed != null ? cs.days_elapsed + 'D' : '—') + '</p>',
            '    </div>',
            '  </div>',
            '</div>',
            '<!-- 최근 admin 작업 -->',
            '<div class="glass-card rounded-2xl p-4 lg:p-5">',
            '  <p class="oswald-sharp text-[9px] text-gray-500 uppercase tracking-widest italic mb-3">Recent Admin Actions</p>',
            auditHtml,
            '</div>'
        ].join('');

    }).catch(function() {
        var content = document.getElementById('admin-dashboard-content');
        if (content) content.innerHTML = '<div class="glass-card p-6 text-center text-ufcRed/70 oswald-sharp text-xs italic uppercase tracking-widest rounded-2xl">⚠ 네트워크 오류</div>';
    });
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

        return `
        <div class="glass-card rounded-2xl p-4 lg:p-6 flex items-center justify-between hover:border-ufcRed/30 transition-all">
            <div class="flex items-center gap-4 lg:gap-6 cursor-pointer group" onclick="openFighterProfileById('${f.id}')">
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

// apostrophe가 포함된 이름(예: Sean O'Malley, Da'Mon Blackshear)에서 inline JSON
// 문자열이 깨지던 문제 방지: onclick에는 fighter id만 넘기고, 여기서 fighterDB를
// 조회해 profile 객체를 구성한 뒤 openFighterProfile(객체)를 호출한다.
function openFighterProfileById(fighterId) {
    var f = Array.isArray(fighterDB)
        ? fighterDB.find(function(x) { return x && x.id === fighterId; })
        : null;
    if (!f) return;

    var displayName = f.name || f.name_en || '—';
    var record = f.record || (
        (f.wins !== undefined) ? (f.wins + '-' + f.losses + (f.draws ? '-' + f.draws : '')) : '—'
    );
    var rankLabel = f.rank === 0 ? 'CHAMP' : (f.rank ? '#' + f.rank : 'NR');
    var divLabel  = ADMIN_DIV_LABEL[f.division] || (f.division || '—').toUpperCase();

    openFighterProfile({
        id: f.id, name: displayName, name_en: f.name_en,
        record: record, height: f.height, reach: f.reach, odds: f.odds,
        rank: rankLabel, division: divLabel, style: f.style,
        stats: f.stats, image_url: f.image_url,
    });
}

// ----- FIGHTER STAT AUTO-SCORING -----

var FIGHTER_STAT_FALLBACK_BASELINES = {
    slpm:    { p05: 1.5,  p95: 7.5  },
    str_acc: { p05: 28,   p95: 62   },
    sapm:    { p05: 1.5,  p95: 6.5  },
    str_def: { p05: 45,   p95: 76   },
    td_avg:  { p05: 0.0,  p95: 4.5  },
    td_acc:  { p05: 15,   p95: 70   },
    td_def:  { p05: 40,   p95: 88   },
    sub_avg: { p05: 0.0,  p95: 2.5  },
    ko_rate: { p05: 0,    p95: 60   },
    sub_rate:{ p05: 0,    p95: 35   },
    dec_rate:{ p05: 20,   p95: 80   }
};

// Returns [striking, grappling, stamina, defense, speed] each 0–100.
// Missing raw stats are excluded from weighted average (not treated as 0).
// baselines: division-specific overrides (Step B); null = use fallback.
function computeStatsFromPerf(perf, division, baselines) {
    var bl = baselines || FIGHTER_STAT_FALLBACK_BASELINES;

    function n(val, key) {
        if (val == null || isNaN(val)) return null;
        var r = bl[key] || FIGHTER_STAT_FALLBACK_BASELINES[key];
        if (!r) return null;
        var span = r.p95 - r.p05;
        if (span <= 0) return 50;
        return Math.max(0, Math.min(100, Math.round((val - r.p05) / span * 100)));
    }

    // Inverse normalize: lower raw value = higher score (e.g. sapm)
    function ni(val, key) {
        if (val == null || isNaN(val)) return null;
        var r = bl[key] || FIGHTER_STAT_FALLBACK_BASELINES[key];
        if (!r) return null;
        var span = r.p95 - r.p05;
        if (span <= 0) return 50;
        return Math.max(0, Math.min(100, Math.round((r.p95 - val) / span * 100)));
    }

    // Weighted average ignoring null contributions
    function wa(pairs) {
        var wSum = 0, vSum = 0;
        pairs.forEach(function(p) {
            if (p[0] !== null && p[0] !== undefined && !isNaN(p[0])) {
                wSum += p[1]; vSum += p[0] * p[1];
            }
        });
        return wSum === 0 ? 50 : Math.round(vSum / wSum);
    }

    function clamp(v) { return Math.max(45, Math.min(98, v)); }
    return [
        clamp(wa([ [n(perf.slpm,   'slpm'),    0.55], [n(perf.strAcc, 'str_acc'), 0.45] ])),
        clamp(wa([ [n(perf.tdAvg,  'td_avg'),  0.45], [n(perf.tdAcc,  'td_acc'),  0.35], [n(perf.subAvg, 'sub_avg'), 0.20] ])),
        clamp(wa([ [ni(perf.sapm,  'sapm'),    0.60], [n(perf.decRate,'dec_rate'), 0.40] ])),
        clamp(wa([ [n(perf.strDef, 'str_def'), 0.60], [n(perf.tdDef,  'td_def'),  0.40] ])),
        clamp(wa([ [n(perf.slpm,   'slpm'),    0.40], [n(perf.koRate,  'ko_rate'), 0.35], [n(perf.strAcc, 'str_acc'), 0.25] ]))
    ];
}

function autoComputeFighterStats() {
    var perf = {};
    ['slpm','strAcc','sapm','strDef','tdAvg','tdAcc','tdDef','subAvg','koRate','subRate','decRate'].forEach(function(k) {
        var el = document.getElementById('fm-' + k);
        perf[k] = (el && el.value !== '') ? parseFloat(el.value) : null;
    });
    var division = (document.getElementById('fm-division') || {}).value || '';
    var computed = computeStatsFromPerf(perf, division, null);
    computed.forEach(function(val, i) {
        var slider = document.getElementById('stat-range-' + i);
        var label  = document.getElementById('stat-val-' + i);
        if (slider) slider.value = val;
        if (label)  label.textContent = val;
    });
    showToast('스탯 자동 계산 완료');
}

// ----- STATS MODIFIER PREVIEW (dry-run only, read-only) -----
var STATS_MODIFIER_AXIS_LABELS = ['Striking', 'Grappling', 'Stamina', 'Defense', 'Speed'];

// Convert RPC skip/status reason into a Korean label.
function _statsModifierReasonKo(reason, rawScore) {
    if (reason == null && rawScore == null) return '스탯 데이터 없음';
    var r = String(reason || '');
    if (r.indexOf('표본 부족') !== -1) return '표본 부족';
    if (r.indexOf('MVP 제외') !== -1) return '미구현 (MVP 이후 적용 예정)';
    if (r.indexOf('Defense: 상대 스탯 필요') !== -1) return '상대 Sig/TD 시도값 입력 필요';
    if (r.indexOf('상대 스탯 없음') !== -1) return '상대 스탯 없음 (Defense skip)';
    if (r.indexOf('경기 시간 데이터 없음') !== -1) return '경기 시간 부족 (R1 종료 경기 제외)';
    if (r.indexOf('Speed: 유효타') !== -1) return '유효타/KD 데이터 없음';
    if (r.indexOf('경기 데이터 없음') !== -1) return '유효타/TD/KD 데이터 없음';
    if (rawScore == null) return '스탯 데이터 없음';
    return r || '—';
}

function previewFighterStatsModifier() {
    var box = document.getElementById('stats-modifier-preview');
    if (!box) return;

    if (!editingFighterId) {
        box.classList.remove('hidden');
        box.innerHTML = '<div class="glass-card rounded-xl p-4 mt-2 border border-white/10 oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest text-center">기존 파이터를 수정할 때만 미리보기가 가능합니다</div>';
        return;
    }
    if (typeof sb === 'undefined' || !sb) {
        box.classList.remove('hidden');
        box.innerHTML = '<div class="glass-card rounded-xl p-4 mt-2 border border-white/10 oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest text-center">⚠ Supabase 연결 필요</div>';
        return;
    }

    box.classList.remove('hidden');
    box.innerHTML = '<div class="glass-card rounded-xl p-4 mt-2 border border-white/10 oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest text-center animate-pulse">미리보기 계산 중...</div>';

    sb.rpc('admin_preview_fighter_stats_modifier', {
        p_fighter_id: editingFighterId,
        p_dry_run: true
    }).then(function(res) {
        if (res.error) {
            box.innerHTML = '<div class="glass-card rounded-xl p-4 mt-2 border border-ufcRed/20 oswald-sharp text-[10px] text-ufcRed/70 italic uppercase tracking-widest text-center">⚠ RPC 오류: ' + escapeHtml(res.error.message || String(res.error)) + '</div>';
            return;
        }
        _renderStatsModifierPreview(box, res.data);
    }).catch(function(e) {
        box.innerHTML = '<div class="glass-card rounded-xl p-4 mt-2 border border-ufcRed/20 oswald-sharp text-[10px] text-ufcRed/70 italic uppercase tracking-widest text-center">⚠ 네트워크 오류: ' + escapeHtml(e && e.message ? e.message : String(e)) + '</div>';
    });
}

function _renderStatsModifierPreview(box, d) {
    if (!d) {
        box.innerHTML = '<div class="glass-card rounded-xl p-4 mt-2 border border-white/10 oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest text-center">반영 가능한 최근 경기 스탯 없음</div>';
        return;
    }

    // RPC response keys (d.axes is NOT returned — use applied_axes / skipped_axes / sample_count)
    var appliedAxes = Array.isArray(d.applied_axes) ? d.applied_axes : [];
    var skippedAxes = Array.isArray(d.skipped_axes) ? d.skipped_axes : [];
    var sampleCount = Array.isArray(d.sample_count) ? d.sample_count : [];
    var current     = Array.isArray(d.current_stats)  ? d.current_stats  : [];
    var baseline    = Array.isArray(d.baseline_stats) ? d.baseline_stats : [];
    var computed    = Array.isArray(d.computed_stats) ? d.computed_stats : [];
    var deltaArr    = Array.isArray(d.delta)          ? d.delta          : [];
    var inp         = d.input_summary || {};
    var axisNames   = ['striking', 'grappling', 'stamina', 'defense', 'speed'];

    // allSkipped only when no axis was actually applied
    var allSkipped = appliedAxes.length === 0;

    // operator debug: raw scores visible in console
    if (Array.isArray(d.raw_recent_scores) && d.raw_recent_scores.length) {
        console.debug('[mfs preview] raw_recent_scores:', JSON.stringify(d.raw_recent_scores));
    }

    if (d.ok === false || allSkipped) {
        var inp0 = inp;
        var hint = '';
        if (skippedAxes.length) {
            hint = '<div class="mt-2 space-y-0.5">' + skippedAxes.map(function(s) {
                var lbl = s && s.axis ? s.axis : '—';
                return '<p class="oswald-sharp text-[9px] text-gray-600 italic">' + escapeHtml(lbl) + ' — ' + escapeHtml(_statsModifierReasonKo(s && s.reason, undefined)) + '</p>';
            }).join('') + '</div>';
        }
        if (inp0.total_mfs_rows > 0) {
            box.innerHTML = '<div class="glass-card rounded-xl p-4 mt-2 border border-amber-500/20 text-center">'
                + '<p class="oswald-sharp text-[10px] text-amber-400/80 italic uppercase tracking-widest">스탯 저장됨 · 계산 가능한 축 없음</p>'
                + '<p class="oswald-sharp text-[9px] text-gray-500 italic mt-1">저장된 스탯 ' + (inp0.total_mfs_rows || 0) + '건 · 완료 경기 ' + (inp0.completed_fights || 0) + '건</p>'
                + hint
                + '<p class="oswald-sharp text-[9px] text-amber-400/60 italic mt-2">유효타격(Sig. Strikes) · 테이크다운 · 넉다운 값을 결과 입력 모달에서 추가 입력하세요</p>'
                + '</div>';
        } else {
            box.innerHTML = '<div class="glass-card rounded-xl p-4 mt-2 border border-white/10 text-center">'
                + '<p class="oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest">반영 가능한 최근 경기 스탯 없음</p>'
                + hint + '</div>';
        }
        return;
    }

    // applied_axes >= 1 — render full 5-axis table from RPC arrays
    var rowsHtml = STATS_MODIFIER_AXIS_LABELS.map(function(label, i) {
        var axisName = axisNames[i];
        var applied  = appliedAxes.indexOf(axisName) !== -1;
        var skipInfo = null;
        for (var si = 0; si < skippedAxes.length; si++) {
            if (skippedAxes[si] && skippedAxes[si].axis === axisName) { skipInfo = skippedAxes[si]; break; }
        }

        var cur  = current[i]  != null ? current[i]  : null;
        var base = baseline[i] != null ? baseline[i] : null;
        var comp = computed[i] != null ? computed[i] : null;
        var dv   = deltaArr[i] != null ? deltaArr[i] : null;
        var n    = sampleCount[i] != null ? sampleCount[i] : null;

        var deltaStr = '—';
        var deltaCls = 'text-gray-500';
        if (dv != null) {
            var dvr = Math.round(dv);
            if (dvr > 0)      { deltaStr = '+' + dvr; deltaCls = 'text-green-400'; }
            else if (dvr < 0) { deltaStr = String(dvr); deltaCls = 'text-ufcRed'; }
            else              { deltaStr = '0'; deltaCls = 'text-gray-400'; }
        }

        var reasonTxt = applied ? '적용됨' : _statsModifierReasonKo(skipInfo && skipInfo.reason, null);
        var reasonCls = applied ? 'text-green-400/70' : 'text-amber-400/70';

        return [
            '<tr class="border-b border-white/5 last:border-0">',
            '  <td class="py-1.5 pr-2 oswald-sharp text-[10px] text-white italic uppercase tracking-widest">' + escapeHtml(label) + '</td>',
            '  <td class="py-1.5 px-1 text-center oswald-sharp text-[10px] text-gray-400">'        + (cur  != null ? cur  : '—') + '</td>',
            '  <td class="py-1.5 px-1 text-center oswald-sharp text-[10px] text-gray-500">'        + (base != null ? base : '—') + '</td>',
            '  <td class="py-1.5 px-1 text-center oswald-sharp text-[10px] text-white font-black">' + (comp != null ? comp : '—') + '</td>',
            '  <td class="py-1.5 px-1 text-center oswald-sharp text-[10px] font-black ' + deltaCls + '">' + deltaStr + '</td>',
            '  <td class="py-1.5 px-1 text-center oswald-sharp text-[10px] text-gray-500">'        + (n != null ? n : '—') + '</td>',
            '  <td class="py-1.5 pl-2 oswald-sharp text-[9px] italic ' + reasonCls + '">'          + escapeHtml(reasonTxt) + '</td>',
            '</tr>'
        ].join('');
    }).join('');

    var metaHtml = [
        '<div class="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3">',
        '  <div class="text-center"><p class="oswald-sharp text-[8px] text-gray-600 uppercase tracking-widest">Rank Factor</p><p class="oswald-sharp text-[11px] text-white font-black italic">'  + (d.rank_factor != null ? d.rank_factor : '—') + '</p></div>',
        '  <div class="text-center"><p class="oswald-sharp text-[8px] text-gray-600 uppercase tracking-widest">Δ Max</p><p class="oswald-sharp text-[11px] text-white font-black italic">'         + (d.delta_max   != null ? d.delta_max   : '—') + '</p></div>',
        '  <div class="text-center"><p class="oswald-sharp text-[8px] text-gray-600 uppercase tracking-widest">Applied</p><p class="oswald-sharp text-[11px] text-green-400 font-black italic">'  + appliedAxes.length + '</p></div>',
        '  <div class="text-center"><p class="oswald-sharp text-[8px] text-gray-600 uppercase tracking-widest">Skipped</p><p class="oswald-sharp text-[11px] text-amber-400 font-black italic">'  + skippedAxes.length + '</p></div>',
        '</div>'
    ].join('');

    var appliedListHtml = appliedAxes.length
        ? '<p class="oswald-sharp text-[9px] text-green-400/70 italic mt-2">적용 축: ' + escapeHtml(appliedAxes.join(', ')) + '</p>'
        : '';
    var skippedListHtml = skippedAxes.length
        ? '<div class="mt-1 space-y-0.5">' + skippedAxes.map(function(s) {
            var lbl = s && s.axis ? s.axis : '—';
            return '<p class="oswald-sharp text-[9px] text-amber-400/60 italic">skip: ' + escapeHtml(lbl) + ' — ' + escapeHtml(_statsModifierReasonKo(s && s.reason, undefined)) + '</p>';
          }).join('') + '</div>'
        : '';

    // RPC input_summary keys: total_mfs_rows, completed_fights, used_in_calculation, fights_with_opponent
    var inputHtml = [
        '<p class="oswald-sharp text-[9px] text-gray-600 italic mt-2">',
        '입력 표본 — 저장 ' + (inp.total_mfs_rows       != null ? inp.total_mfs_rows       : '—'),
        ' · 완료 '         + (inp.completed_fights      != null ? inp.completed_fights      : '—'),
        ' · 계산사용 '     + (inp.used_in_calculation   != null ? inp.used_in_calculation   : '—'),
        ' · 상대보유 '     + (inp.fights_with_opponent  != null ? inp.fights_with_opponent  : '—'),
        '</p>'
    ].join('');

    box.innerHTML = [
        '<div class="glass-card rounded-xl p-4 mt-2 border border-white/10">',
        '  <div class="flex items-center justify-between mb-2">',
        '    <p class="oswald-sharp text-[10px] text-gray-400 font-black italic uppercase tracking-widest">능력치 보정 미리보기 <span class="text-gray-700">· DRY-RUN</span></p>',
        '    <span class="oswald-sharp text-[8px] text-gray-700 italic uppercase tracking-widest">미적용 · 읽기 전용</span>',
        '  </div>',
        '  <div class="overflow-x-auto">',
        '    <table class="w-full">',
        '      <thead><tr class="border-b border-white/10">',
        '        <th class="py-1 pr-2 text-left oswald-sharp text-[8px] text-gray-600 uppercase tracking-widest">축</th>',
        '        <th class="py-1 px-1 oswald-sharp text-[8px] text-gray-600 uppercase tracking-widest">현재</th>',
        '        <th class="py-1 px-1 oswald-sharp text-[8px] text-gray-600 uppercase tracking-widest">기준</th>',
        '        <th class="py-1 px-1 oswald-sharp text-[8px] text-gray-600 uppercase tracking-widest">계산</th>',
        '        <th class="py-1 px-1 oswald-sharp text-[8px] text-gray-600 uppercase tracking-widest">Δ</th>',
        '        <th class="py-1 px-1 oswald-sharp text-[8px] text-gray-600 uppercase tracking-widest">표본</th>',
        '        <th class="py-1 pl-2 text-left oswald-sharp text-[8px] text-gray-600 uppercase tracking-widest">사유</th>',
        '      </tr></thead>',
        '      <tbody>' + rowsHtml + '</tbody>',
        '    </table>',
        '  </div>',
        metaHtml,
        appliedListHtml,
        skippedListHtml,
        inputHtml,
        '</div>'
    ].join('');
}

function previewFighterSeedPolicyB() {
    var box = document.getElementById('seed-policy-b-preview');
    if (!box) return;

    if (!editingFighterId) {
        box.classList.remove('hidden');
        box.innerHTML = '<div class="glass-card rounded-xl p-4 mt-2 border border-white/10 oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest text-center">기존 파이터를 수정할 때만 미리보기가 가능합니다</div>';
        return;
    }
    if (typeof sb === 'undefined' || !sb) {
        box.classList.remove('hidden');
        box.innerHTML = '<div class="glass-card rounded-xl p-4 mt-2 border border-white/10 oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest text-center">⚠ Supabase 연결 필요</div>';
        return;
    }

    box.classList.remove('hidden');
    box.innerHTML = '<div class="glass-card rounded-xl p-4 mt-2 border border-emerald-500/10 oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest text-center animate-pulse">Seed B 계산 중...</div>';

    sb.rpc('admin_preview_fighter_seed_policy_b', {
        p_fighter_id: editingFighterId,
        p_limit: 1,
        p_include_samples: true
    }).then(function(res) {
        if (res.error) {
            box.innerHTML = '<div class="glass-card rounded-xl p-4 mt-2 border border-ufcRed/20 oswald-sharp text-[10px] text-ufcRed/70 italic uppercase tracking-widest text-center">⚠ RPC 오류: ' + escapeHtml(res.error.message || String(res.error)) + '</div>';
            return;
        }
        _renderSeedPolicyBPreview(box, res.data);
    }).catch(function(e) {
        box.innerHTML = '<div class="glass-card rounded-xl p-4 mt-2 border border-ufcRed/20 oswald-sharp text-[10px] text-ufcRed/70 italic uppercase tracking-widest text-center">⚠ 네트워크 오류: ' + escapeHtml(e && e.message ? e.message : String(e)) + '</div>';
    });
}

function _renderSeedPolicyBPreview(box, d) {
    if (!d || !d.ok) {
        var errMsg = (d && d.error) ? escapeHtml(String(d.error)) : '응답 없음';
        box.innerHTML = '<div class="glass-card rounded-xl p-4 mt-2 border border-ufcRed/20 oswald-sharp text-[10px] text-ufcRed/70 italic uppercase tracking-widest text-center">⚠ ' + errMsg + '</div>';
        return;
    }

    var rows = Array.isArray(d.rows) ? d.rows : [];
    var row = rows[0];
    if (!row) {
        box.innerHTML = '<div class="glass-card rounded-xl p-4 mt-2 border border-white/10 oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest text-center">해당 선수 데이터 없음</div>';
        return;
    }

    var axisLabels = ['Striking', 'Grappling', 'Stamina', 'Defense', 'Speed'];
    var cur  = Array.isArray(row.current_stats)  ? row.current_stats  : [];
    var pb   = Array.isArray(row.policy_b_stats) ? row.policy_b_stats : [];
    var delt = Array.isArray(row.delta)          ? row.delta          : [];
    var rf   = row.raw_flags || {};

    var statsRowsHtml = axisLabels.map(function(label, i) {
        var cv = cur[i]  != null ? cur[i]  : '—';
        var pv = pb[i]   != null ? pb[i]   : '—';
        var dv = delt[i] != null ? delt[i] : null;
        var deltaStr = '—', deltaCls = 'text-gray-500';
        if (dv != null) {
            if (dv > 0)      { deltaStr = '+' + dv; deltaCls = 'text-green-400'; }
            else if (dv < 0) { deltaStr = String(dv); deltaCls = 'text-ufcRed'; }
            else             { deltaStr = '0'; deltaCls = 'text-gray-400'; }
        }
        return [
            '<tr class="border-b border-white/5 last:border-0">',
            '  <td class="py-1.5 pr-2 oswald-sharp text-[10px] text-white italic uppercase tracking-widest">' + label + '</td>',
            '  <td class="py-1.5 px-2 text-center oswald-sharp text-[10px] text-gray-400">' + cv + '</td>',
            '  <td class="py-1.5 px-2 text-center oswald-sharp text-[10px] text-emerald-400 font-black">' + pv + '</td>',
            '  <td class="py-1.5 pl-2 text-center oswald-sharp text-[10px] font-black ' + deltaCls + '">' + deltaStr + '</td>',
            '</tr>'
        ].join('');
    }).join('');

    var groupColorMap = { Champion: 'text-yellow-400', Top5: 'text-orange-400', Top10: 'text-blue-400', Top15: 'text-gray-300', Unranked: 'text-gray-500' };
    var groupLabel = escapeHtml(row.group || 'Unranked');
    var groupCls   = groupColorMap[row.group] || 'text-gray-500';
    var curOvr  = row.current_overall  != null ? row.current_overall  : '—';
    var pbOvr   = row.policy_b_overall != null ? row.policy_b_overall : '—';

    var flagsHtml = [
        '<div class="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-0.5 mt-3">',
        _seedFlagLine('has_raw', rf.has_raw, 'Raw 스탯 보유'),
        _seedFlagLine('total_fights', rf.total_fights, '총 경기 수', true),
        _seedFlagLine('slpm_capped', rf.slpm_capped, 'SLpM cap 적용'),
        _seedFlagLine('no_raw_default', rf.no_raw_default, 'No-raw 기본값'),
        _seedFlagLine('fight_cap_applied', rf.fight_cap_applied, 'Fight cap 적용'),
        _seedFlagLine('flat_floor', rf.flat_floor, 'Flat floor'),
        '</div>'
    ].join('');

    var warningLines = [];
    if (rf.flat_floor)        warningLines.push('⚠ 랭킹 floor가 적용되어 축별 개성이 평평해질 수 있습니다.');
    if (rf.fight_cap_applied) warningLines.push('⚠ 표본 부족 선수라 ceiling이 제한되었습니다.');
    if (rf.slpm_capped)       warningLines.push('⚠ SLpM 극단값 cap이 적용되었습니다.');
    if (rf.no_raw_default)    warningLines.push('⚠ raw 데이터 부족으로 보수 기본값이 적용되었습니다.');

    var warningsHtml = warningLines.length
        ? '<div class="mt-3 space-y-0.5">' + warningLines.map(function(w) {
            return '<p class="oswald-sharp text-[9px] text-amber-400/70 italic">' + escapeHtml(w) + '</p>';
          }).join('') + '</div>'
        : '';

    var pbStatsJson = JSON.stringify(pb);

    box.innerHTML = [
        '<div class="glass-card rounded-xl p-4 mt-2 border border-emerald-500/15">',
        '  <div class="flex items-center justify-between mb-2">',
        '    <p class="oswald-sharp text-[10px] text-emerald-400/80 font-black italic uppercase tracking-widest">Seed B 미리보기 <span class="text-gray-700">· DRY-RUN</span></p>',
        '    <span class="oswald-sharp text-[8px] text-gray-700 italic uppercase tracking-widest">읽기 전용 · 이 버튼은 능력치를 변경하지 않습니다</span>',
        '  </div>',
        '  <div class="flex items-center gap-4 mb-3">',
        '    <div><p class="oswald-sharp text-[8px] text-gray-600 uppercase tracking-widest">Group</p><p class="oswald-sharp text-[11px] font-black italic ' + groupCls + '">' + groupLabel + '</p></div>',
        '    <div><p class="oswald-sharp text-[8px] text-gray-600 uppercase tracking-widest">Overall</p><p class="oswald-sharp text-[11px] text-gray-400 italic">' + curOvr + ' <span class="text-gray-700">→</span> <span class="text-emerald-400 font-black">' + pbOvr + '</span></p></div>',
        '  </div>',
        '  <div class="overflow-x-auto">',
        '    <table class="w-full">',
        '      <thead><tr class="border-b border-white/10">',
        '        <th class="py-1 pr-2 text-left oswald-sharp text-[8px] text-gray-600 uppercase tracking-widest">축</th>',
        '        <th class="py-1 px-2 oswald-sharp text-[8px] text-gray-600 uppercase tracking-widest">현재</th>',
        '        <th class="py-1 px-2 oswald-sharp text-[8px] text-emerald-700 uppercase tracking-widest">Seed B</th>',
        '        <th class="py-1 pl-2 oswald-sharp text-[8px] text-gray-600 uppercase tracking-widest">Δ</th>',
        '      </tr></thead>',
        '      <tbody>' + statsRowsHtml + '</tbody>',
        '    </table>',
        '  </div>',
        flagsHtml,
        warningsHtml,
        '  <div class="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">',
        '    <p class="oswald-sharp text-[8px] text-gray-700 italic">적용 시 fighters.stats 및 stats_updated_at이 갱신됩니다</p>',
        '    <button id="seed-b-apply-btn"',
        '      onclick="applyFighterSeedPolicyB(this)"',
        '      data-pb-stats=\'' + pbStatsJson + '\'',
        '      class="oswald-sharp text-[9px] font-black italic uppercase tracking-widest px-4 py-2 rounded-lg border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-400 transition">',
        '      ⚡ Seed B 단건 적용',
        '    </button>',
        '  </div>',
        '</div>'
    ].join('');
}

function applyFighterSeedPolicyB(btn) {
    if (!editingFighterId) return;
    if (typeof sb === 'undefined' || !sb) return;

    var pbStats;
    try { pbStats = JSON.parse(btn.getAttribute('data-pb-stats')); } catch(e) { return; }

    var confirmMsg = [
        '[ Seed B 단건 적용 확인 ]',
        '',
        '선수: ' + (editingFighterId),
        '적용 후 stats: ' + JSON.stringify(pbStats),
        '',
        'fighters.stats와 stats_updated_at이 변경됩니다.',
        '계속하시겠습니까?'
    ].join('\n');

    if (!window.confirm(confirmMsg)) return;

    btn.disabled = true;
    btn.textContent = '적용 중...';
    btn.className = btn.className.replace('text-emerald-400', 'text-gray-500').replace('hover:bg-emerald-500/10', '').replace('hover:border-emerald-400', '');

    sb.rpc('admin_apply_fighter_seed_policy_b', {
        p_fighter_id: editingFighterId,
        p_confirm: 'APPLY_SEED_B'
    }).then(function(res) {
        if (res.error) {
            btn.disabled = false;
            btn.textContent = '⚡ Seed B 단건 적용';
            var box = document.getElementById('seed-policy-b-preview');
            if (box) {
                var errDiv = document.createElement('p');
                errDiv.className = 'oswald-sharp text-[9px] text-ufcRed/70 italic mt-2 text-center';
                errDiv.textContent = '⚠ 적용 실패: ' + (res.error.message || String(res.error));
                btn.parentNode.appendChild(errDiv);
            }
            return;
        }
        var d = res.data;
        // 슬라이더 갱신
        if (d && Array.isArray(d.after_stats)) {
            buildStatsSliders(d.after_stats);
            // fighterDB 메모리 캐시 갱신 (모달 재개방 시 stale stats 방지)
            var _cidx = fighterDB.findIndex(function(f) { return f.id === editingFighterId; });
            if (_cidx !== -1) {
                fighterDB[_cidx].stats = d.after_stats;
                if (d.stats_updated_at) fighterDB[_cidx].stats_updated_at = d.stats_updated_at;
            }
            saveAdmin();
            _allFightersCache = [];
            if (typeof _renderFighterListFromCache === 'function') _renderFighterListFromCache();
        }
        // 버튼 → 완료 표시로 교체
        var applyRow = btn.parentNode;
        applyRow.innerHTML = [
            '<span class="oswald-sharp text-[9px] text-gray-600 italic">',
            (d && d.before_overall != null ? 'before ' + d.before_overall : ''),
            ' → ',
            (d && d.after_overall  != null ? 'after '  + d.after_overall  : ''),
            '</span>',
            '<span class="oswald-sharp text-[10px] font-black italic text-emerald-400">✅ 적용 완료</span>'
        ].join('');
    }).catch(function(e) {
        btn.disabled = false;
        btn.textContent = '⚡ Seed B 단건 적용';
        alert('네트워크 오류: ' + (e && e.message ? e.message : String(e)));
    });
}

function _seedFlagLine(key, val, label, isNumeric) {
    var display, cls;
    if (isNumeric) {
        display = val != null ? String(val) : '—';
        cls = 'text-gray-300';
    } else {
        display = val ? 'Yes' : 'No';
        cls = val ? 'text-amber-400' : 'text-gray-600';
    }
    return '<div><p class="oswald-sharp text-[8px] text-gray-600 uppercase tracking-widest">' + label + '</p>'
         + '<p class="oswald-sharp text-[10px] font-black italic ' + cls + '">' + display + '</p></div>';
}

// ─── 체급별 Seed B 미리보기 (read-only dry-run) ──────────────────────────────
// admin_preview_fighter_seed_policy_b(p_division) 만 호출. 적용 기능 없음.
function previewSeedPolicyBDivision() {
    var box = document.getElementById('seed-b-division-preview');
    if (!box) return;

    var sel = document.getElementById('seed-b-division-select');
    var division = sel ? sel.value : '';

    if (!division) {
        box.classList.remove('hidden');
        box.innerHTML = '<div class="glass-card rounded-xl p-4 border border-white/10 oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest text-center">체급을 먼저 선택하세요</div>';
        return;
    }
    if (typeof sb === 'undefined' || !sb) {
        box.classList.remove('hidden');
        box.innerHTML = '<div class="glass-card rounded-xl p-4 border border-white/10 oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest text-center">⚠ Supabase 연결 필요</div>';
        return;
    }

    box.classList.remove('hidden');
    box.innerHTML = '<div class="glass-card rounded-xl p-4 border border-emerald-500/10 oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest text-center animate-pulse">' + escapeHtml((ADMIN_DIV_LABEL[division] || division)) + ' 체급 Seed B 계산 중...</div>';

    sb.rpc('admin_preview_fighter_seed_policy_b', {
        p_division: division,
        p_limit: 999,
        p_include_samples: true
    }).then(function(res) {
        if (res.error) {
            box.innerHTML = '<div class="glass-card rounded-xl p-4 border border-ufcRed/20 oswald-sharp text-[10px] text-ufcRed/70 italic uppercase tracking-widest text-center">⚠ RPC 오류: ' + escapeHtml(res.error.message || String(res.error)) + '</div>';
            return;
        }
        _renderSeedPolicyBDivisionPreview(box, res.data, division);
    }).catch(function(e) {
        box.innerHTML = '<div class="glass-card rounded-xl p-4 border border-ufcRed/20 oswald-sharp text-[10px] text-ufcRed/70 italic uppercase tracking-widest text-center">⚠ 네트워크 오류: ' + escapeHtml(e && e.message ? e.message : String(e)) + '</div>';
    });
}

function _renderSeedPolicyBDivisionPreview(box, d, division) {
    if (!d || !d.ok) {
        var errMsg = (d && d.error) ? escapeHtml(String(d.error)) : '응답 없음';
        box.innerHTML = '<div class="glass-card rounded-xl p-4 border border-ufcRed/20 oswald-sharp text-[10px] text-ufcRed/70 italic uppercase tracking-widest text-center">⚠ ' + errMsg + '</div>';
        return;
    }

    var rows = Array.isArray(d.rows) ? d.rows : [];
    var divLabel = escapeHtml(ADMIN_DIV_LABEL[division] || division);

    if (!rows.length) {
        box.innerHTML = '<div class="glass-card rounded-xl p-4 border border-white/10 oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest text-center">' + divLabel + ' 체급 대상 선수 없음</div>';
        return;
    }

    // ── rows 기반 집계 (summary는 글로벌이므로 division counts는 rows로 직접 계산) ──
    var cnt = { total: rows.length, changed: 0, flat_floor: 0, fight_cap: 0, slpm: 0, no_raw: 0 };
    rows.forEach(function(r) {
        var rf = r.raw_flags || {};
        var ovd = (r.policy_b_overall != null && r.current_overall != null)
            ? (r.policy_b_overall - r.current_overall) : 0;
        if (Math.round(ovd * 10) !== 0) cnt.changed++;
        if (rf.flat_floor)        cnt.flat_floor++;
        if (rf.fight_cap_applied) cnt.fight_cap++;
        if (rf.slpm_capped)       cnt.slpm++;
        if (rf.no_raw_default)    cnt.no_raw++;
    });

    // ── 정렬: abs(overall delta) 큰 순 → rank 오름차순 ──
    var sorted = rows.slice().sort(function(a, b) {
        var da = Math.abs((a.policy_b_overall || 0) - (a.current_overall || 0));
        var db = Math.abs((b.policy_b_overall || 0) - (b.current_overall || 0));
        if (db !== da) return db - da;
        var ra = (a.rank == null) ? 9999 : a.rank;
        var rb = (b.rank == null) ? 9999 : b.rank;
        return ra - rb;
    });

    var groupColorMap = { Champion: 'text-yellow-400', Top5: 'text-orange-400', Top10: 'text-blue-400', Top15: 'text-gray-300', Unranked: 'text-gray-500' };

    var rowsHtml = sorted.map(function(r) {
        var rf = r.raw_flags || {};
        var cur = Array.isArray(r.current_stats)  ? r.current_stats  : [];
        var pb  = Array.isArray(r.policy_b_stats) ? r.policy_b_stats : [];
        var ovCur = r.current_overall  != null ? r.current_overall  : '—';
        var ovPb  = r.policy_b_overall != null ? r.policy_b_overall : '—';
        var ovd = (r.policy_b_overall != null && r.current_overall != null)
            ? (r.policy_b_overall - r.current_overall) : 0;
        var ovdRounded = Math.round(ovd * 10) / 10;
        var isUnchanged = Math.round(ovd * 10) === 0;
        var isBigChange = Math.abs(ovd) >= 10;

        // overall delta 표시
        var ovdStr, ovdCls;
        if (isUnchanged)      { ovdStr = '변경 없음'; ovdCls = 'text-gray-700'; }
        else if (ovdRounded > 0) { ovdStr = '+' + ovdRounded; ovdCls = isBigChange ? 'text-amber-400' : 'text-green-400'; }
        else                  { ovdStr = String(ovdRounded);  ovdCls = isBigChange ? 'text-amber-400' : 'text-ufcRed'; }

        // 카드 테두리: 큰 변경=amber, flat_floor=amber, fight_cap=blue, 그 외 기본
        var cardBorder = 'border-white/5';
        if (isBigChange || rf.flat_floor) cardBorder = 'border-amber-500/30';
        else if (rf.fight_cap_applied)    cardBorder = 'border-blue-500/20';

        var nameStr = escapeHtml(r.name_en || r.name || r.id || '—');
        var subName = (r.name && r.name_en && r.name !== r.name_en) ? escapeHtml(r.name) : '';
        var groupLabel = escapeHtml(r.group || 'Unranked');
        var groupCls = groupColorMap[r.group] || 'text-gray-500';
        var rankStr = (r.rank != null) ? ('#' + r.rank) : '—';

        // flag chips
        var chips = [];
        if (rf.flat_floor)        chips.push('<span class="oswald-sharp text-[7px] font-black italic uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">flat floor</span>');
        if (rf.fight_cap_applied) chips.push('<span class="oswald-sharp text-[7px] font-black italic uppercase tracking-widest px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400">fight cap</span>');
        if (rf.slpm_capped)       chips.push('<span class="oswald-sharp text-[7px] font-black italic uppercase tracking-widest px-1.5 py-0.5 rounded bg-gray-500/15 text-gray-400">slpm cap</span>');
        if (rf.no_raw_default)    chips.push('<span class="oswald-sharp text-[7px] font-black italic uppercase tracking-widest px-1.5 py-0.5 rounded bg-gray-500/15 text-gray-500">no raw</span>');
        var chipsHtml = chips.length ? '<div class="flex flex-wrap gap-1 mt-1">' + chips.join('') + '</div>' : '';

        var statsStr = '[' + cur.join(',') + '] <span class="text-gray-700">→</span> <span class="text-emerald-400 font-black">[' + pb.join(',') + ']</span>';

        return [
            '<div class="rounded-lg border ' + cardBorder + ' bg-black/20 px-3 py-2' + (isUnchanged ? ' opacity-50' : '') + '">',
            '  <div class="flex items-center justify-between gap-2">',
            '    <div class="min-w-0">',
            '      <p class="oswald-sharp text-[11px] font-black italic text-white truncate">' + nameStr + (subName ? ' <span class="text-[9px] text-gray-600 font-normal">' + subName + '</span>' : '') + '</p>',
            '      <p class="oswald-sharp text-[8px] uppercase tracking-widest"><span class="' + groupCls + '">' + groupLabel + '</span> <span class="text-gray-700">·</span> <span class="text-gray-600">' + rankStr + '</span></p>',
            '    </div>',
            '    <div class="text-right shrink-0">',
            '      <p class="oswald-sharp text-[10px] text-gray-400 italic">' + ovCur + ' <span class="text-gray-700">→</span> <span class="text-emerald-400 font-black">' + ovPb + '</span></p>',
            '      <p class="oswald-sharp text-[10px] font-black italic ' + ovdCls + '">' + ovdStr + '</p>',
            '    </div>',
            '  </div>',
            '  <p class="oswald-sharp text-[9px] text-gray-500 italic mt-1 whitespace-nowrap overflow-x-auto">' + statsStr + '</p>',
            chipsHtml,
            '</div>'
        ].join('');
    }).join('');

    var countPill = function(label, val, cls) {
        return '<div class="text-center px-2"><p class="oswald-sharp text-[13px] font-black italic ' + cls + '">' + val + '</p><p class="oswald-sharp text-[7px] text-gray-600 uppercase tracking-widest">' + label + '</p></div>';
    };

    box.innerHTML = [
        '<div class="glass-card rounded-xl p-4 border border-emerald-500/15">',
        '  <div class="flex items-center justify-between mb-3">',
        '    <p class="oswald-sharp text-[11px] text-emerald-400/90 font-black italic uppercase tracking-widest">' + divLabel + ' · Seed B <span class="text-gray-700">· DRY-RUN</span></p>',
        '    <span class="oswald-sharp text-[8px] text-gray-700 italic uppercase tracking-widest">읽기 전용 · 능력치 변경 없음</span>',
        '  </div>',
        '  <div class="flex flex-wrap items-center gap-1 mb-3 pb-3 border-b border-white/10">',
        countPill('전체', cnt.total, 'text-white'),
        countPill('변경', cnt.changed, cnt.changed ? 'text-emerald-400' : 'text-gray-600'),
        countPill('flat floor', cnt.flat_floor, cnt.flat_floor ? 'text-amber-400' : 'text-gray-600'),
        countPill('fight cap', cnt.fight_cap, cnt.fight_cap ? 'text-blue-400' : 'text-gray-600'),
        countPill('slpm cap', cnt.slpm, cnt.slpm ? 'text-gray-400' : 'text-gray-600'),
        countPill('no raw', cnt.no_raw, cnt.no_raw ? 'text-gray-400' : 'text-gray-600'),
        '  </div>',
        '  <div class="space-y-2 max-h-[28rem] overflow-y-auto pr-1">' + rowsHtml + '</div>',
        '  <div class="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">',
        '    <p class="oswald-sharp text-[8px] text-gray-700 italic">정렬: 변경량(overall Δ) 큰 순 · 변경 대상 <span class="text-emerald-500/80 font-black">' + cnt.changed + '</span>명 적용 예정</p>',
        (cnt.changed > 0
            ? '    <button id="seed-b-div-apply-btn" onclick="applySeedPolicyBDivision(this)" data-division="' + escapeHtml(division) + '" data-changed="' + cnt.changed + '" class="oswald-sharp text-[10px] font-black italic uppercase tracking-widest px-4 py-2 rounded-lg border border-ufcRed/50 text-ufcRed hover:bg-ufcRed/10 hover:border-ufcRed transition">⚡ 이 체급 Seed B 적용</button>'
            : '    <span class="oswald-sharp text-[9px] text-gray-600 italic uppercase tracking-widest">변경 대상 없음</span>'),
        '  </div>',
        '  <div id="seed-b-division-apply-result" class="hidden mt-3"></div>',
        '</div>'
    ].join('');
}

// ─── 체급 단위 Seed B 적용 (2단계 confirm) ─────────────────────────────────
// 단건 apply(applyFighterSeedPolicyB)와 분리. admin_apply_fighter_seed_policy_b_division 호출.
function applySeedPolicyBDivision(btn) {
    if (typeof sb === 'undefined' || !sb) { alert('⚠ Supabase 연결 필요'); return; }
    var division = btn.getAttribute('data-division');
    var changed  = parseInt(btn.getAttribute('data-changed') || '0', 10);
    if (!division) return;

    var divLabel = ADMIN_DIV_LABEL[division] || division;

    // 1차 confirm
    var c1 = [
        '[ 체급 Seed B 적용 경고 ]',
        '',
        '체급: ' + divLabel + ' (' + division + ')',
        '변경 대상: ' + changed + '명',
        '',
        '해당 체급의 변경 대상 선수 전체의 fighters.stats가 갱신됩니다.',
        '되돌리려면 audit log 기반 수동 복구가 필요합니다.',
        '',
        '계속하시겠습니까?'
    ].join('\n');
    if (!window.confirm(c1)) return;

    // 2차 prompt — 정확한 confirm 문자열 입력
    var expected = 'APPLY_SEED_B_DIVISION:' + division;
    var typed = window.prompt('최종 확인 — 아래 문자열을 정확히 입력하세요:\n\n' + expected, '');
    if (typed !== expected) {
        alert('입력이 일치하지 않아 취소되었습니다.');
        return;
    }

    btn.disabled = true;
    var origText = btn.textContent;
    btn.textContent = '적용 중...';
    btn.className = btn.className.replace('text-ufcRed', 'text-gray-500').replace('hover:bg-ufcRed/10', '').replace('hover:border-ufcRed', '');

    sb.rpc('admin_apply_fighter_seed_policy_b_division', {
        p_division: division,
        p_confirm: expected
    }).then(function(res) {
        var resBox = document.getElementById('seed-b-division-apply-result');
        if (res.error) {
            btn.disabled = false;
            btn.textContent = origText;
            if (resBox) {
                resBox.classList.remove('hidden');
                resBox.innerHTML = '<div class="glass-card rounded-xl p-3 border border-ufcRed/20 oswald-sharp text-[10px] text-ufcRed/70 italic uppercase tracking-widest text-center">⚠ 적용 실패: ' + escapeHtml(res.error.message || String(res.error)) + '</div>';
            }
            return;
        }
        var d = res.data;
        if (!d || !d.ok) {
            btn.disabled = false;
            btn.textContent = origText;
            if (resBox) {
                resBox.classList.remove('hidden');
                resBox.innerHTML = '<div class="glass-card rounded-xl p-3 border border-ufcRed/20 oswald-sharp text-[10px] text-ufcRed/70 italic uppercase tracking-widest text-center">⚠ 적용 실패: ' + escapeHtml(d && d.error ? String(d.error) : '응답 없음') + '</div>';
            }
            return;
        }

        // fighterDB 메모리 캐시 갱신 (saveFighter() 자동 호출 없음)
        var updated = Array.isArray(d.updated_fighters) ? d.updated_fighters : [];
        updated.forEach(function(u) {
            var idx = fighterDB.findIndex(function(f) { return f.id === u.id; });
            if (idx !== -1 && Array.isArray(u.after)) {
                fighterDB[idx].stats = u.after;
            }
        });
        saveAdmin();
        _allFightersCache = [];
        if (typeof _renderFighterListFromCache === 'function') _renderFighterListFromCache();

        // 버튼 → 완료 표시
        var btnRow = btn.parentNode;
        if (btnRow) {
            btnRow.innerHTML = '<span class="oswald-sharp text-[10px] font-black italic text-emerald-400 uppercase tracking-widest">✅ ' + escapeHtml(divLabel) + ' 적용 완료 · ' + (d.applied_count || 0) + '명</span>';
        }

        // 적용 결과 목록 표시
        if (resBox) {
            var listHtml = updated.map(function(u) {
                var nm = escapeHtml(u.name_en || u.name || u.id || '—');
                var bd = Array.isArray(u.before) ? '[' + u.before.join(',') + ']' : '—';
                var ad = Array.isArray(u.after)  ? '[' + u.after.join(',')  + ']' : '—';
                var bo = (u.before_overall != null) ? u.before_overall : '—';
                var ao = (u.after_overall  != null) ? u.after_overall  : '—';
                return [
                    '<div class="flex items-center justify-between gap-2 py-1 border-b border-white/5 last:border-0">',
                    '  <span class="oswald-sharp text-[10px] font-black italic text-white truncate">' + nm + '</span>',
                    '  <span class="oswald-sharp text-[9px] text-gray-500 italic whitespace-nowrap">' + bd + ' <span class="text-gray-700">→</span> <span class="text-emerald-400">' + ad + '</span> <span class="text-gray-700">·</span> ' + bo + '→' + ao + '</span>',
                    '</div>'
                ].join('');
            }).join('');
            resBox.classList.remove('hidden');
            resBox.innerHTML = [
                '<div class="glass-card rounded-xl p-3 border border-emerald-500/20">',
                '  <p class="oswald-sharp text-[10px] text-emerald-400/90 font-black italic uppercase tracking-widest mb-2">적용 완료 · 대상 ' + (d.total_in_scope||0) + ' · 변경 ' + (d.changed_count||0) + ' · 적용 ' + (d.applied_count||0) + ' · 스킵 ' + (d.skipped_count||0) + '</p>',
                '  <div class="space-y-0.5 max-h-72 overflow-y-auto pr-1">' + listHtml + '</div>',
                '</div>'
            ].join('');
        }
    }).catch(function(e) {
        btn.disabled = false;
        btn.textContent = origText;
        alert('네트워크 오류: ' + (e && e.message ? e.message : String(e)));
    });
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

    // reset stats modifier preview (avoid showing stale data from a prior fighter)
    var _smp = document.getElementById('stats-modifier-preview');
    if (_smp) { _smp.classList.add('hidden'); _smp.innerHTML = ''; }
    var _sbp = document.getElementById('seed-policy-b-preview');
    if (_sbp) { _sbp.classList.add('hidden'); _sbp.innerHTML = ''; }

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
        // performance stats — camelCase preferred, snake_case fallback for DB-fetched rows
        var perfSnakeMap = { strAcc:'str_acc', strDef:'str_def', tdAvg:'td_avg', tdAcc:'td_acc', tdDef:'td_def', subAvg:'sub_avg', koRate:'ko_rate', subRate:'sub_rate', decRate:'dec_rate' };
        ['slpm','strAcc','sapm','strDef','tdAvg','tdAcc','tdDef','subAvg','koRate','subRate','decRate'].forEach(function(k) {
            var el = document.getElementById('fm-' + k);
            if (!el) return;
            var cv = f[k]; var sk = perfSnakeMap[k]; var sv = sk ? f[sk] : undefined;
            el.value = (cv !== undefined && cv !== null) ? cv : ((sv !== undefined && sv !== null) ? sv : '');
        });
        buildRecentFightsList(f.recent || []);
    } else {
        title.textContent = '파이터 추가';
        ['fm-name','fm-name-en','fm-country','fm-rank','fm-height','fm-reach','fm-odds','fm-image'].forEach(id => document.getElementById(id).value = '');
        ['fm-wins','fm-losses','fm-draws'].forEach(id => document.getElementById(id).value = '0');
        document.getElementById('fm-style').value = 'all-around';
        buildStatsSliders(null);
        ['slpm','strAcc','sapm','strDef','tdAvg','tdAcc','tdDef','subAvg','koRate','subRate','decRate'].forEach(function(k) {
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
    const perfKeys = ['slpm','strAcc','sapm','strDef','tdAvg','tdAcc','tdDef','subAvg','koRate','subRate','decRate'];
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
    if (sb) {
        // renderAdminFighterList는 RPC 완료 후 호출 — RPC보다 select가 먼저 끝나면
        // fighterDB가 구버전으로 덮어씌워지는 race condition 방지
        sb.rpc('admin_upsert_fighter', { p_payload: {
            id: data.id, name: data.name, name_en: data.name_en,
            country: data.country, division: data.division,
            wins: data.wins, losses: data.losses, draws: data.draws,
            rank: String(data.rank), style: data.style,
            height: data.height, reach: data.reach,
            odds: String(data.odds), image_url: data.image_url,
            stats: data.stats,
            slpm: data.slpm, str_acc: data.strAcc,
            sapm: data.sapm, str_def: data.strDef,
            td_avg: data.tdAvg, td_acc: data.tdAcc,
            td_def: data.tdDef, sub_avg: data.subAvg,
            ko_rate: data.koRate, sub_rate: data.subRate, dec_rate: data.decRate
        }}).then(function(res) {
            if (res.error) {
                showToast('⚠ DB 저장 실패: ' + res.error.message);
                console.warn('파이터 DB 저장 실패:', res.error.message);
            } else {
                _allFightersCache = [];
                renderAdminFighterList();
            }
        });
    } else {
        renderAdminFighterList();
    }
    closeFighterModal();
}

function deleteFighter(fighterId) {
    const f = fighterDB.find(x => x.id === fighterId);
    if (!f) return;
    if (!confirm(`"${f.name}"을(를) 파이터 DB에서 삭제하시겠습니까?`)) return;
    if (sb) {
        sb.rpc('admin_delete_fighter', { p_fighter_id: fighterId }).then(function(res) {
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
    if (log) { log.classList.remove('hidden'); log.textContent = '[ 파이터 스탯 동기화 시작 ] ESPN API (신체정보 + KO/SUB/DEC율)...\n'; }

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
            var rec = f.record || ((f.wins !== undefined) ? (f.wins + '-' + f.losses + (f.draws > 0 ? '-' + f.draws : '')) : '?-?');
            sel.innerHTML += `<option value="${f.id}">${f.name} (${rec})</option>`;
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
        const dbDone = fight._fromDB && fight._resultStatus === 'completed';
        const settled = state.settled?.[fight.id];
        const pending = state.pendings?.[fight.id];
        const statusBadge = dbDone
            ? `<span class="oswald-sharp text-[9px] px-2 py-1 rounded-lg font-black italic uppercase text-green-400 bg-green-400/10 border border-green-400/20">✅ 완료 · ${escapeHtml(fight._resultWinner||'?')} (${escapeHtml(fight._resultMethod||'—')}) R${fight._resultRound||'?'}</span>`
            : settled
            ? `<span class="oswald-sharp text-[9px] px-2 py-1 rounded-lg font-black italic uppercase ${settled.result === 'WIN' ? 'text-green-400 bg-green-400/10 border border-green-400/20' : 'text-red-400 bg-red-400/10 border border-red-400/20'}">결과확정 · ${escapeHtml(settled.actualWinner)} (${escapeHtml(settled.actualMethod||'—')})</span>`
            : pending
            ? `<span class="oswald-sharp text-[9px] px-2 py-1 rounded-lg font-black italic uppercase text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 animate-pulse">예측 진행중</span>`
            : `<span class="oswald-sharp text-[9px] px-2 py-1 rounded-lg font-black italic uppercase text-gray-500 border border-white/10">대기중</span>`;

        return `
        <div draggable="true"
             ondragstart="_onFightDragStart(event,${idx})"
             ondragend="_onFightDragEnd(event)"
             ondragover="_onFightDragOver(event)"
             ondrop="_onFightDrop(event,${idx})"
             class="glass-card rounded-2xl p-4 lg:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:border-white/20 transition-all cursor-grab${dbDone ? ' opacity-60' : ''}">
            <div class="flex items-center gap-4">
                <span class="text-gray-600 text-base select-none" title="드래그로 순서 변경">⠿</span>
                <span class="oswald-sharp text-[8px] lg:text-xs bg-ufcRed/10 border border-ufcRed/20 text-ufcRed px-2 py-1 rounded-lg font-black italic uppercase">${fight.tag}</span>
                <div>
                    <p class="oswald-sharp font-black italic text-sm lg:text-lg text-white uppercase tracking-tighter">${fight.f1.name} <span class="text-ufcRed">VS</span> ${fight.f2.name}</p>
                    <div class="flex items-center gap-2 mt-1">${statusBadge}</div>
                </div>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
                ${!settled && !dbDone ? `<button onclick="adminSetResult('${fight.id}')" class="oswald-sharp text-[10px] bg-ufcRed hover:bg-red-700 text-white font-black px-4 py-2 rounded-xl italic uppercase tracking-widest transition flex items-center gap-1">🏆 결과 입력</button>` : ''}
                ${dbDone ? `<button onclick="editMatchupResult('${fight.id}')" class="oswald-sharp text-[10px] border border-yellow-500/30 text-yellow-500/70 hover:text-yellow-400 hover:border-yellow-400/50 px-3 py-2 rounded-xl italic uppercase tracking-widest transition">✏️ 수정</button>` : ''}
                <button onclick="openFightCardModal('${fight.id}')" class="oswald-sharp text-[10px] border border-white/10 text-gray-400 hover:text-white px-3 py-2 rounded-xl italic uppercase tracking-widest transition">수정</button>
                <button onclick="deleteFightCard('${fight.id}')" class="oswald-sharp text-[10px] border border-ufcRed/20 text-ufcRed/60 hover:text-ufcRed px-3 py-2 rounded-xl italic uppercase tracking-widest transition">삭제</button>
            </div>
        </div>`;
    }).join('');
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
let eventInfo = { name: '', date: '' };

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
    if (nameEl && eventInfo.name) nameEl.textContent = eventInfo.name;
    if (dateEl && eventInfo.date) dateEl.textContent = eventInfo.date;
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
var _builderPickSummary = null; // get_event_pick_summary RPC 캐시
var _builderQA = null;          // get_admin_event_qa RPC 캐시
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
        .select('id, title, event_date, status, picks_locked_at, settled_at, archived_at')
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
        const _scMap = { upcoming: 'text-emerald-500', locked: 'text-amber-400', completed: 'text-blue-400', settled: 'text-green-400', archived: 'text-gray-500' };
        const _slMap = { upcoming: '▶ 예정', locked: '🔒 마감', completed: '⚡ 결과완료', settled: '✅ 정산', archived: '📦 아카이브' };
        const statusBadge = `<span class="${_scMap[ev.status] || 'text-gray-500'} text-[9px]">${_slMap[ev.status] || ev.status}</span>`;
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
    _builderPickSummary = null;
    _builderQA = null;
    renderBuilderEventList();
    renderBuilderWorkspace();
    await fetchBuilderMatchups();
    await Promise.all([fetchBuilderPickSummary(), fetchBuilderQA()]);
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

async function fetchBuilderPickSummary() {
    if (!sb || !_builderState.eventId) return;
    const { data, error } = await sb.rpc('get_event_pick_summary', { p_event_id: _builderState.eventId });
    if (!error && data && data.length > 0) _builderPickSummary = data[0];
    else _builderPickSummary = null;
    renderBuilderWorkspace();
}

// ── 이벤트 lifecycle 패널 ──────────────────────────────────────────

function _renderLifecyclePanel(ev) {
    const s = ev.status;
    const statusCfg = {
        upcoming:  { cls: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',  label: '▶ OPEN' },
        locked:    { cls: 'text-amber-400 border-amber-500/30 bg-amber-500/5',        label: '🔒 LOCKED' },
        completed: { cls: 'text-blue-400 border-blue-500/30 bg-blue-500/5',           label: '⚡ COMPLETED' },
        settled:   { cls: 'text-green-400 border-green-500/30 bg-green-500/5',        label: '✅ SETTLED' },
        archived:  { cls: 'text-gray-500 border-gray-600/30 bg-gray-600/5',           label: '📦 ARCHIVED' },
    };
    const cfg = statusCfg[s] || statusCfg.upcoming;
    const eid = ev.id;
    const b = 'oswald-sharp font-black italic uppercase text-[9px] px-3 py-1.5 rounded-lg border transition-all';

    let sub = '';
    if (ev.picks_locked_at)              sub = `<span class="text-gray-600 text-[9px]">마감 ${ev.picks_locked_at.slice(0,10)}</span>`;
    else if (s === 'settled'  && ev.settled_at)  sub = `<span class="text-gray-600 text-[9px]">정산 ${ev.settled_at.slice(0,10)}</span>`;
    else if (s === 'archived' && ev.archived_at) sub = `<span class="text-gray-600 text-[9px]">아카이브 ${ev.archived_at.slice(0,10)}</span>`;

    // QA 상태 기반 정산 버튼 결정 (_builderQA null이면 기존 활성 버튼 유지)
    const _qaBlockUnresolved = _builderQA && _builderQA.all_matchups_completed === false;
    const _qaBlockPending    = _builderQA && _builderQA.total_pending_alert > 0;
    const _qaBlocked         = _qaBlockUnresolved || _qaBlockPending;
    const _qaMsg             = _qaBlockUnresolved
        ? '결과 미입력 경기 있음'
        : (_qaBlockPending ? ('pending ' + _builderQA.total_pending_alert + '건 잔류') : '');
    const _settleBtn = _qaBlocked
        ? `<button onclick="onLifecycleSettle('${eid}')" class="${b} border-gray-700 text-gray-600 cursor-not-allowed" title="${_qaMsg}">✅ 정산</button><span class="oswald-sharp text-[8px] italic text-amber-500/80">⚠ ${_qaMsg}</span>`
        : `<button onclick="onLifecycleSettle('${eid}')" class="${b} border-green-500/40 text-green-400 hover:bg-green-500/10">✅ 정산</button>`;

    let btns = '';
    if (s === 'upcoming') {
        btns = `<button onclick="onLifecycleLock('${eid}')" class="${b} border-amber-500/40 text-amber-400 hover:bg-amber-500/10">🔒 픽 마감</button>`;
    } else if (s === 'locked') {
        btns = `<button onclick="onLifecycleReopen('${eid}')" class="${b} border-white/20 text-gray-400 hover:bg-white/5 hover:text-white">🔓 재오픈</button>`;
        btns += _settleBtn;
    } else if (s === 'completed') {
        btns = _settleBtn;
    } else if (s === 'settled') {
        btns = `<button onclick="onLifecycleArchive('${eid}')" class="${b} border-gray-500/40 text-gray-400 hover:bg-gray-500/10 hover:text-white">📦 아카이브</button>`;
    }

    const divider = btns ? '<span class="text-white/10 text-xs mx-0.5">|</span>' : '';
    return `
    <div class="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-white/5">
        <span class="oswald-sharp font-black italic uppercase text-[9px] px-2.5 py-1 rounded-full border ${cfg.cls}">${cfg.label}</span>
        ${sub}${divider}${btns}
    </div>`;
}

// ── 픽 현황 패널 ──────────────────────────────────────────────────

function renderPickSummaryPanel(s) {
    if (!s) return '';
    if (s.total_picks === 0) return `
        <div class="mt-3 px-3 py-2 rounded-xl border border-white/5 bg-black/10">
            <p class="oswald-sharp text-[9px] italic uppercase text-gray-700 tracking-widest text-center">픽 없음</p>
        </div>`;
    const acc = s.accuracy !== null ? s.accuracy + '%' : '—';
    const accColor = s.accuracy !== null
        ? (s.accuracy >= 70 ? 'text-ufcRed' : s.accuracy >= 50 ? 'text-white' : 'text-gray-400')
        : 'text-gray-600';
    return `
    <div class="mt-3 rounded-xl border border-white/5 bg-black/10 px-3 py-2.5">
        <p class="oswald-sharp text-[8px] italic uppercase tracking-widest text-gray-600 mb-2">픽 현황</p>
        <div class="grid grid-cols-3 gap-2 text-center mb-2">
            <div>
                <p class="oswald-sharp text-sm font-black italic text-white">${s.total_picks}</p>
                <p class="oswald-sharp text-[8px] italic uppercase text-gray-600">총 픽</p>
            </div>
            <div>
                <p class="oswald-sharp text-sm font-black italic text-white">${s.unique_bettors}</p>
                <p class="oswald-sharp text-[8px] italic uppercase text-gray-600">참여자</p>
            </div>
            <div>
                <p class="oswald-sharp text-sm font-black italic ${accColor}">${acc}</p>
                <p class="oswald-sharp text-[8px] italic uppercase text-gray-600">적중률</p>
            </div>
        </div>
        <div class="flex justify-center gap-4 text-center">
            <div><span class="oswald-sharp text-xs font-black italic text-green-400">${s.win_picks}W</span> <span class="oswald-sharp text-[8px] italic text-gray-700">승</span></div>
            <div><span class="oswald-sharp text-xs font-black italic text-gray-400">${s.lose_picks}L</span> <span class="oswald-sharp text-[8px] italic text-gray-700">패</span></div>
            ${s.pending_picks > 0 ? `<div><span class="oswald-sharp text-xs font-black italic text-amber-400">${s.pending_picks}P</span> <span class="oswald-sharp text-[8px] italic text-gray-700">대기</span></div>` : ''}
            ${s.cancelled_picks > 0 ? `<div><span class="oswald-sharp text-xs font-black italic text-gray-600">${s.cancelled_picks}C</span> <span class="oswald-sharp text-[8px] italic text-gray-700">취소</span></div>` : ''}
        </div>
        ${s.total_paid_out > 0 ? `
        <div class="mt-2 pt-2 border-t border-white/5 flex justify-between items-center">
            <p class="oswald-sharp text-[8px] italic uppercase text-gray-600">지급 포인트</p>
            <p class="oswald-sharp text-xs font-black italic text-yellow-400">${s.total_paid_out.toLocaleString()}P</p>
        </div>` : ''}
    </div>`;
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
        const isCompleted = m.result_status === 'completed';
        return `
        <div onclick="openMatchupEditModal('${m.id}')"
             class="group cursor-pointer flex items-center gap-2 px-4 py-3 rounded-2xl border border-white/5 bg-black/20 hover:bg-white/5 hover:border-white/20 transition-all${isCompleted ? ' opacity-60' : ''}">
            <span class="oswald-sharp text-gray-600 text-[10px] italic w-4 shrink-0 text-center">${m.sort_order || '?'}</span>
            <!-- Red side -->
            <div class="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                <span class="oswald-sharp font-black italic text-xs uppercase truncate text-red-400">${escapeHtml(m.red_fighter_name || '?')}</span>
                ${m.red_image_url ? `<img src="${escapeHtml(m.red_image_url)}" class="w-7 h-7 rounded-full object-cover object-top bg-zinc-800 shrink-0 ring-1 ring-red-500/30">` : '<div class="w-7 h-7 rounded-full bg-zinc-800 shrink-0 ring-1 ring-red-500/20"></div>'}
            </div>
            <span class="oswald-sharp text-gray-600 text-[10px] italic shrink-0 px-1">vs</span>
            <!-- Blue side -->
            <div class="flex items-center gap-1.5 flex-1 min-w-0">
                ${m.blue_image_url ? `<img src="${escapeHtml(m.blue_image_url)}" class="w-7 h-7 rounded-full object-cover object-top bg-zinc-800 shrink-0 ring-1 ring-blue-500/30">` : '<div class="w-7 h-7 rounded-full bg-zinc-800 shrink-0 ring-1 ring-blue-500/20"></div>'}
                <span class="oswald-sharp font-black italic text-xs uppercase truncate text-blue-400">${escapeHtml(m.blue_fighter_name || '?')}</span>
            </div>
            ${tagLabel ? `<span class="oswald-sharp text-[8px] italic uppercase tracking-widest px-2 py-0.5 rounded-full border shrink-0 ${m.sort_order===1&&m.card_segment==='main'?'border-ufcRed/50 text-ufcRed bg-ufcRed/5':'border-white/10 text-gray-500'}">${tagLabel}</span>` : ''}
            <div class="shrink-0 flex gap-1${isCompleted ? '' : ' opacity-0 group-hover:opacity-100'} transition-opacity">
                ${isCompleted
                    ? `<span class="oswald-sharp text-[9px] px-2 py-1 rounded-lg font-black italic uppercase text-green-400 bg-green-400/10 border border-green-400/20">✅ ${escapeHtml(m.result_winner||'DRAW/NC')} R${m.result_round||'?'}</span>
                       <button onclick="event.stopPropagation(); openResultModalForEdit('${m.id}')" class="text-gray-500 hover:text-yellow-400 text-xs px-1.5 py-1 rounded-lg hover:bg-yellow-500/10" title="결과 수정">✏️</button>`
                    : `<button onclick="event.stopPropagation(); openResultModal('${m.id}')" class="text-gray-500 hover:text-yellow-400 text-xs px-1.5 py-1 rounded-lg hover:bg-yellow-500/10" title="결과 입력">🏆</button>`
                }
            </div>
        </div>`;
    };

    const renderSection = (label, fights) => !fights.length ? '' : `
        <p class="oswald-sharp text-[9px] italic uppercase tracking-widest text-gray-600 mt-4 mb-2 px-1">${label}</p>
        <div class="space-y-1.5">${fights.map(renderCard).join('')}</div>`;

    el.innerHTML = `
        <div class="mb-5">
            <div class="flex items-start justify-between gap-3">
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
            ${_renderLifecyclePanel(ev)}
            ${renderPickSummaryPanel(_builderPickSummary)}
            ${renderBuilderQAPanel(_builderQA)}
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
    const forceEl = document.getElementById('result-modal-force');
    if (forceEl) forceEl.value = 'false';
    if (modalTitle) modalTitle.textContent = `${red} vs ${blue}`;
    if (modalWinner) modalWinner.innerHTML = `
        <option value="">-- 결과 선택 --</option>
        <option value="${red}">${red} 승 (레드)</option>
        <option value="${blue}">${blue} 승 (블루)</option>
        <option value="DRAW">무승부 (DRAW)</option>
        <option value="NC">경기 취소/무효 (NC)</option>`;
    modal.classList.remove('hidden');
    _resetMfsFields();
    _populateMfsFields(matchupId);
}

function openResultModalForEdit(matchupId) {
    openResultModal(matchupId);
    const forceEl = document.getElementById('result-modal-force');
    if (forceEl) forceEl.value = 'true';
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

    const payload = editingMatchupId ? Object.assign({}, row, { id: editingMatchupId }) : row;
    const { error: rpcErr } = await sb.rpc('admin_upsert_matchup', { p_payload: payload });
    if (rpcErr) { showToast('❌ 저장 실패: ' + (rpcErr.message || rpcErr)); return; }
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
    const { error } = await sb.rpc('admin_delete_matchup', { p_matchup_id: id });
    if (error) { showToast('❌ 삭제 실패: ' + (error.message || error)); return; }
    showToast('🗑 삭제 완료');
    closeMatchupEditModal();
    await fetchBuilderMatchups();
}

// ── 이벤트 삭제 ────────────────────────────────────────────────────

async function deleteBuilderEvent(eventId, eventTitle) {
    if (!confirm(`"${eventTitle}" 이벤트를 삭제할까요?\n(이 이벤트의 모든 대진표도 함께 삭제됩니다)`)) return;
    const { error } = await sb.rpc('admin_delete_event', { p_event_id: eventId });
    if (error) { showToast('❌ 이벤트 삭제 실패: ' + (error.message || error)); return; }
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

    const payload = {
        title,
        event_date: dateVal ? new Date(dateVal + 'T00:00:00Z').toISOString() : null,
        status: document.getElementById('new-event-status')?.value || 'upcoming',
    };
    const { data, error } = await sb.rpc('admin_upsert_event', { p_payload: payload });
    if (error) { showToast('❌ 저장 실패: ' + (error.message || error)); return; }

    showToast('✅ 이벤트 추가 완료');
    document.getElementById('add-event-modal').classList.add('hidden');
    if (titleEl) titleEl.value = '';
    if (dateEl) dateEl.value = '';
    await fetchEventsForBuilder();
    if (data?.event_id) selectBuilderEvent(data.event_id);
}

// ── EVENT LIFECYCLE RPCs ──────────────────────────────────────────
// UI 연결 위치: renderBuilderWorkspace() 이벤트 헤더 버튼 영역
//   - 픽 마감/재오픈: 이벤트 선택 후 상단 액션 버튼
//   - 결과 입력: 매치업 카드 🏆 버튼 → adminSetMatchupResultWithUI() → adminSetMatchupResult() RPC 직접 호출
//   - 정산/아카이브: 이벤트 상태 뱃지 옆 버튼 (Phase 2 UI에서 추가 예정)

async function adminLockEventPicks(eventId) {
    if (!sb) return;
    const { data, error } = await sb.rpc('admin_lock_event_picks', { p_event_id: eventId });
    if (error) { showToast('❌ 픽 마감 실패: ' + (error.message || '')); return; }
    showToast(data.idempotent ? '이미 마감된 이벤트입니다' : '🔒 픽 마감 완료');
    await fetchEventsForBuilder();
    if (_builderState.eventId === eventId) await fetchBuilderMatchups();
}

async function adminReopenEventPicks(eventId) {
    if (!sb) return;
    const { data, error } = await sb.rpc('admin_reopen_event_picks', { p_event_id: eventId });
    if (error) { showToast('❌ 픽 재오픈 실패: ' + (error.message || '')); return; }
    showToast(data.idempotent ? '이미 열린 이벤트입니다' : '🔓 픽 재오픈 완료');
    await fetchEventsForBuilder();
    if (_builderState.eventId === eventId) await fetchBuilderMatchups();
}

// DB matchup 기본 경로: adminSetMatchupResultWithUI()(index.html)에서 호출 → admin_set_matchup_result RPC (audit log 포함)
// settle-matchup Edge Function 경로는 submitMatchupResult()에 legacy fallback으로 보존
async function adminSetMatchupResult(matchupId, winnerName, winnerSide, method, round, time, force = false) {
    if (!sb) return null;
    const { data, error } = await sb.rpc('admin_set_matchup_result', {
        p_matchup_id:  matchupId,
        p_winner_name: winnerName,
        p_winner_side: winnerSide,
        p_method:      method,
        p_round:       round,
        p_time:        time,
        p_force:       force
    });
    if (error) { showToast('❌ 결과 입력 실패: ' + (error.message || '')); return null; }
    return data;
}

// ── matchup_fight_stats helpers ──────────────────────────────────────────────

function _parseMmSs(val) {
    if (!val) return null;
    val = String(val).trim();
    if (!val) return null;
    var colon = val.indexOf(':');
    if (colon !== -1) {
        var m = parseInt(val.slice(0, colon), 10);
        var s = parseInt(val.slice(colon + 1), 10);
        if (isNaN(m) || isNaN(s) || s >= 60) return null;
        return m * 60 + s;
    }
    var n = parseInt(val, 10);
    return isNaN(n) ? null : n;
}

function _readMfsField(side, suffix) {
    var el = document.getElementById('mfs-' + side + '-' + suffix);
    if (!el || el.value.trim() === '') return null;
    var n = parseInt(el.value, 10);
    return isNaN(n) ? null : n;
}

function _readMfsSide(side) {
    var ctrlEl = document.getElementById('mfs-' + side + '-ctrl');
    var ctrl   = (ctrlEl && ctrlEl.value.trim()) ? _parseMmSs(ctrlEl.value.trim()) : null;
    return {
        total_att:  _readMfsField(side, 'total-att'),
        total_land: _readMfsField(side, 'total-land'),
        sig_att:    _readMfsField(side, 'sig-att'),
        sig_land:   _readMfsField(side, 'sig-land'),
        td_att:     _readMfsField(side, 'td-att'),
        td_land:    _readMfsField(side, 'td-land'),
        sub_att:    _readMfsField(side, 'sub-att'),
        kd:         _readMfsField(side, 'kd'),
        ctrl:       ctrl
    };
}

function _mfsIsEmpty(d) {
    return Object.keys(d).every(function(k) { return d[k] === null; });
}

function _mfsHasAnyInput() {
    return !_mfsIsEmpty(_readMfsSide('red')) || !_mfsIsEmpty(_readMfsSide('blue'));
}

function _mfsValidateLandLteAtt(d, label) {
    if (d.total_land !== null && d.total_att !== null && d.total_land > d.total_att) {
        showToast('⚠ [' + label + '] 총 타격 성공이 시도보다 많습니다'); return false;
    }
    if (d.sig_land !== null && d.sig_att !== null && d.sig_land > d.sig_att) {
        showToast('⚠ [' + label + '] 유효 타격 성공이 시도보다 많습니다'); return false;
    }
    if (d.td_land !== null && d.td_att !== null && d.td_land > d.td_att) {
        showToast('⚠ [' + label + '] 테이크다운 성공이 시도보다 많습니다'); return false;
    }
    return true;
}

function _resetMfsFields() {
    ['red', 'blue'].forEach(function(side) {
        ['total-att','total-land','sig-att','sig-land','td-att','td-land','sub-att','kd','ctrl'].forEach(function(f) {
            var el = document.getElementById('mfs-' + side + '-' + f);
            if (el) el.value = '';
        });
    });
    var section = document.getElementById('mfs-section');
    var arrow   = document.getElementById('mfs-arrow');
    if (section) section.classList.add('hidden');
    if (arrow)   arrow.textContent = '▶';
}

function _secsToMmSs(secs) {
    var n = parseInt(secs, 10);
    if (isNaN(n) || n < 0) return '';
    return Math.floor(n / 60) + ':' + (n % 60 < 10 ? '0' : '') + (n % 60);
}

async function _populateMfsFields(matchupId) {
    if (!matchupId || typeof sb === 'undefined' || !sb) return;
    try {
        var res = await sb
            .from('matchup_fight_stats')
            .select('side,total_strikes_att,total_strikes_land,sig_strikes_att,sig_strikes_land,td_att,td_land,sub_att,knockdowns,ctrl_time_sec')
            .eq('matchup_id', matchupId);
        if (!res || !res.data || !res.data.length) return;
        var hasData = false;
        res.data.forEach(function(row) {
            var s = row.side;
            function setF(suffix, val) {
                var el = document.getElementById('mfs-' + s + '-' + suffix);
                if (el && val != null) { el.value = val; hasData = true; }
            }
            setF('total-att',  row.total_strikes_att);
            setF('total-land', row.total_strikes_land);
            setF('sig-att',    row.sig_strikes_att);
            setF('sig-land',   row.sig_strikes_land);
            setF('td-att',     row.td_att);
            setF('td-land',    row.td_land);
            setF('sub-att',    row.sub_att);
            setF('kd',         row.knockdowns);
            var ctrlEl = document.getElementById('mfs-' + s + '-ctrl');
            if (ctrlEl && row.ctrl_time_sec != null) { ctrlEl.value = _secsToMmSs(row.ctrl_time_sec); hasData = true; }
        });
        if (hasData) {
            var sec = document.getElementById('mfs-section');
            var arr = document.getElementById('mfs-arrow');
            if (sec) sec.classList.remove('hidden');
            if (arr) arr.textContent = '▼';
        }
    } catch (e) {
        console.warn('[mfs] 기존 스탯 불러오기 실패:', e);
    }
}

// fighter_id가 NULL인 matchup row에 대해 이름으로 fighters.id를 찾는 fallback.
// 반환값: id 문자열 | null(못 찾음) | '__DUPLICATE__'(동명이인/중복 후보)

// 악센트 제거 + 공백/하이픈/점/특수문자 제거 + lowercase
function _normalizeName(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z]/g, '').toLowerCase();
}

// 공백 구분 우선, 없으면 CamelCase 분할 ("DanielSantos" → ["Daniel","Santos"])
function _splitNameTokens(rawName) {
    var s = (rawName || '').trim();
    var parts = s.split(/\s+/).filter(Boolean);
    if (parts.length > 1) return parts;
    var camel = s.replace(/([A-Z][a-z]*)/g, ' $1').trim().split(/\s+/).filter(Boolean);
    return camel.length > 1 ? camel : [s];
}

async function _resolveFighterId(fighterId, fighterName) {
    if (fighterId) return fighterId;
    var name = (fighterName || '').trim();
    if (!name) return null;

    // Step 1: exact ilike (name, then name_en)
    var res1 = await sb.from('fighters').select('id, name, name_en').ilike('name', name);
    var rows = (res1 && res1.data) ? res1.data : [];
    if (rows.length === 0) {
        var res2 = await sb.from('fighters').select('id, name, name_en').ilike('name_en', name);
        rows = (res2 && res2.data) ? res2.data : [];
    }
    if (rows.length === 1) {
        console.debug('[mfs] resolved_by: name_exact', rows[0].id);
        return rows[0].id;
    }
    if (rows.length > 1) return '__DUPLICATE__';

    // Step 2: normalized match — 공백 없음/CamelCase/표기 차이 처리
    // 예: "DanielSantos" → normalize "danielsantos" == normalize("Daniel Santos")
    var normInput = _normalizeName(name);
    if (!normInput) return null;

    var tokens = _splitNameTokens(name);
    var hint = tokens[tokens.length - 1] || tokens[0]; // 성(last token)으로 후보 검색
    if (hint.length < 3 && tokens.length > 1) hint = tokens[0];

    var cands = [];
    var rc1 = await sb.from('fighters').select('id, name, name_en').ilike('name', '%' + hint + '%');
    if (rc1 && rc1.data) cands = cands.concat(rc1.data);
    var rc2 = await sb.from('fighters').select('id, name, name_en').ilike('name_en', '%' + hint + '%');
    if (rc2 && rc2.data) cands = cands.concat(rc2.data);

    // id 기준 중복 제거
    var seen = {};
    cands = cands.filter(function(c) { if (seen[c.id]) return false; seen[c.id] = true; return true; });

    // normalized exact match만 허용 (fuzzy includes 자동 선택 금지)
    var matched = cands.filter(function(c) {
        return _normalizeName(c.name) === normInput || _normalizeName(c.name_en) === normInput;
    });

    if (matched.length === 1) {
        console.debug('[mfs] resolved_by: normalized_name', matched[0].id);
        return matched[0].id;
    }
    if (matched.length > 1) return '__DUPLICATE__';
    return null;
}

async function saveMatchupFightStats(matchupId) {
    if (!matchupId || !sb) { showToast('⚠ 연결 오류'); return; }

    var red  = _readMfsSide('red');
    var blue = _readMfsSide('blue');
    var redEmpty  = _mfsIsEmpty(red);
    var blueEmpty = _mfsIsEmpty(blue);

    if (redEmpty && blueEmpty) { showToast('💡 입력된 스탯이 없습니다'); return; }

    if (!_mfsValidateLandLteAtt(red,  'Red'))  return;
    if (!_mfsValidateLandLteAtt(blue, 'Blue')) return;

    // 미리보기 RPC는 matchup_fight_stats.fighter_id로 경기를 찾으므로,
    // 저장 시 해당 코너의 fighter_id를 반드시 전달해야 한다 (없으면 NULL → preview에서 매칭 불가).
    //
    // 결과 입력 모달은 Fight Card 리스트(_dbMatchups) / Builder(_builderMatchups) 등
    // 여러 탭에서 열릴 수 있다. _builderMatchups만 보면 다른 탭에서 열었을 때 비어 있어
    // fighter_id가 NULL로 저장된다. 따라서 다단계로 조회한다:
    //   1) _builderMatchups (Builder 탭에서 열린 경우)
    //   2) matchups 테이블 직접 조회 (가장 신뢰 가능한 source of truth)
    // (_dbMatchups의 매핑된 객체는 red_fighter_id/blue_fighter_id를 보관하지 않으므로 제외)
    var redFighterId  = null;
    var blueFighterId = null;

    var _bm = (typeof _builderMatchups !== 'undefined' && Array.isArray(_builderMatchups))
        ? _builderMatchups.find(function(x) { return x.id === matchupId; })
        : null;
    if (_bm) {
        redFighterId  = _bm.red_fighter_id  || null;
        blueFighterId = _bm.blue_fighter_id || null;
    }

    // fighter_id를 아직 못 찾았으면 matchups 테이블에서 직접 조회 (탭 무관 신뢰 경로)
    // 일부 row는 red_fighter_id/blue_fighter_id가 NULL이므로 name 컬럼도 함께 가져와
    // 이름 기반 fallback 조회(_resolveFighterId)에 사용한다.
    var _mData = null;
    if ((!redEmpty && !redFighterId) || (!blueEmpty && !blueFighterId)) {
        try {
            var _mRes = await sb
                .from('matchups')
                .select('red_fighter_id, blue_fighter_id, red_fighter_name, blue_fighter_name')
                .eq('id', matchupId)
                .maybeSingle();
            if (_mRes && _mRes.data) {
                _mData = _mRes.data;
                if (!redFighterId)  redFighterId  = _mRes.data.red_fighter_id  || null;
                if (!blueFighterId) blueFighterId = _mRes.data.blue_fighter_id || null;
            }
        } catch (e) {
            console.warn('[stats] matchup fighter_id 조회 실패:', e);
        }
    }

    // 여전히 fighter_id가 없으면 이름으로 fighters 테이블에서 fallback 조회
    var _redViaName  = false;
    var _blueViaName = false;
    if (!redEmpty && !redFighterId && _mData) {
        var _rid = await _resolveFighterId(null, _mData.red_fighter_name);
        if (_rid && _rid !== '__DUPLICATE__') { redFighterId = _rid; _redViaName = true; }
        else if (_rid === '__DUPLICATE__') { redFighterId = '__DUPLICATE__'; }
    }
    if (!blueEmpty && !blueFighterId && _mData) {
        var _bid = await _resolveFighterId(null, _mData.blue_fighter_name);
        if (_bid && _bid !== '__DUPLICATE__') { blueFighterId = _bid; _blueViaName = true; }
        else if (_bid === '__DUPLICATE__') { blueFighterId = '__DUPLICATE__'; }
    }

    // 동명이인/중복 후보 — ID 확정 불가
    if (redFighterId === '__DUPLICATE__') {
        showToast('⚠ 레드 코너 중복 선수 후보가 있어 자동 선택 불가합니다. 대진 관리에서 선수를 다시 선택해 주세요.');
        return;
    }
    if (blueFighterId === '__DUPLICATE__') {
        showToast('⚠ 블루 코너 중복 선수 후보가 있어 자동 선택 불가합니다. 대진 관리에서 선수를 다시 선택해 주세요.');
        return;
    }

    // fighter_id가 없으면 저장 차단 — NULL row가 생기면 preview RPC가 경기를 못 찾는다.
    if ((!redEmpty && !redFighterId) || (!blueEmpty && !blueFighterId)) {
        showToast('⚠ 레드/블루 코너 선수 ID를 찾지 못했습니다. 대진 관리에서 선수를 다시 선택해 주세요.');
        return;
    }

    // 이름으로 찾은 경우 matchups에 backfill (실패해도 stats 저장은 계속 진행)
    if (_redViaName || _blueViaName) {
        try {
            var updates = {};
            if (_redViaName  && redFighterId)  updates.red_fighter_id  = redFighterId;
            if (_blueViaName && blueFighterId) updates.blue_fighter_id = blueFighterId;
            if (Object.keys(updates).length > 0) {
                await sb.from('matchups').update(updates).eq('id', matchupId);
            }
        } catch (e) {
            console.warn('[stats] matchups backfill 실패:', e);
        }
    }

    showToast('⏳ 스탯 저장 중...');

    var tasks = [];
    if (!redEmpty) {
        tasks.push(sb.rpc('admin_upsert_matchup_fight_stats', {
            p_matchup_id:         matchupId,
            p_side:               'red',
            p_fighter_id:         redFighterId,
            p_total_strikes_att:  red.total_att,
            p_total_strikes_land: red.total_land,
            p_sig_strikes_att:    red.sig_att,
            p_sig_strikes_land:   red.sig_land,
            p_td_att:             red.td_att,
            p_td_land:            red.td_land,
            p_sub_att:            red.sub_att,
            p_knockdowns:         red.kd,
            p_ctrl_time_sec:      red.ctrl
        }).then(function(r) { return Object.assign({ _side: 'red' }, r); }));
    }
    if (!blueEmpty) {
        tasks.push(sb.rpc('admin_upsert_matchup_fight_stats', {
            p_matchup_id:         matchupId,
            p_side:               'blue',
            p_fighter_id:         blueFighterId,
            p_total_strikes_att:  blue.total_att,
            p_total_strikes_land: blue.total_land,
            p_sig_strikes_att:    blue.sig_att,
            p_sig_strikes_land:   blue.sig_land,
            p_td_att:             blue.td_att,
            p_td_land:            blue.td_land,
            p_sub_att:            blue.sub_att,
            p_knockdowns:         blue.kd,
            p_ctrl_time_sec:      blue.ctrl
        }).then(function(r) { return Object.assign({ _side: 'blue' }, r); }));
    }

    var results = await Promise.all(tasks);
    var errors  = results.filter(function(r) { return r.error; });

    if (errors.length) {
        var msg = errors.map(function(r) {
            return '[' + r._side + '] ' + (r.error.message || r.error);
        }).join(' / ');
        showToast('❌ 스탯 저장 실패: ' + msg);
    } else {
        results.forEach(function(r) {
            console.debug('[stats] saved', {
                side: r._side,
                fighter_id: r._side === 'red' ? redFighterId : blueFighterId,
                matchup_id: matchupId,
                via_name_lookup: r._side === 'red' ? _redViaName : _blueViaName
            });
        });
        showToast('✅ 스탯 저장 완료. 결과 확정은 다시 누르지 않아도 됩니다.');
    }
}

async function adminSettleEvent(eventId) {
    if (!sb) return;
    const { data, error } = await sb.rpc('admin_settle_event', { p_event_id: eventId });
    if (error) {
        const msg = error.message || '';
        if (msg.includes('event_has_unresolved_matchups')) showToast('⚠️ 결과 미입력 경기가 있습니다. 모든 경기 결과를 먼저 입력하세요.');
        else if (msg.includes('event_not_completable'))    showToast('⚠️ 아직 정산 불가한 이벤트입니다 (상태: ' + msg.split('status is ')[1] + ')');
        else showToast('❌ 이벤트 정산 실패: ' + msg);
        return;
    }
    showToast(data.idempotent
        ? '이미 정산된 이벤트입니다'
        : `✅ 이벤트 정산 완료${data.cancelled_pending_picks ? ' (미결 픽 ' + data.cancelled_pending_picks + '건 환급)' : ''}`
    );
    await fetchEventsForBuilder();
}

async function adminArchiveEvent(eventId) {
    if (!sb) return;
    const { data, error } = await sb.rpc('admin_archive_event', { p_event_id: eventId });
    if (error) {
        const msg = error.message || '';
        if (msg.includes('event_not_settled')) showToast('⚠️ 정산 완료 후 아카이브 가능합니다 (adminSettleEvent 먼저 호출)');
        else showToast('❌ 이벤트 아카이브 실패: ' + msg);
        return;
    }
    showToast(data.idempotent ? '이미 아카이브된 이벤트입니다' : '📦 이벤트 아카이브 완료');
    await fetchEventsForBuilder();
}

// ── LIFECYCLE UI WRAPPERS (confirm + RPC 호출) ────────────────────
// renderBuilderWorkspace 내 버튼 onclick에서 호출

async function onLifecycleLock(eventId) {
    if (!confirm('이 이벤트의 예측 등록을 마감할까요?')) return;
    await adminLockEventPicks(eventId);
    // adminLockEventPicks → fetchEventsForBuilder + fetchBuilderMatchups → renderBuilderWorkspace
}

async function onLifecycleReopen(eventId) {
    if (!confirm('이 이벤트의 예측 등록을 다시 열까요?')) return;
    await adminReopenEventPicks(eventId);
    // adminReopenEventPicks → fetchEventsForBuilder + fetchBuilderMatchups → renderBuilderWorkspace
}

async function onLifecycleSettle(eventId) {
    // QA guard: 결과 미입력 또는 pending 잔류 시 RPC 호출 없이 차단
    if (_builderQA && _builderQA.all_matchups_completed === false) {
        showToast('⚠ 결과 미입력 경기가 있습니다. QA 패널에서 확인하세요.');
        return;
    }
    if (_builderQA && _builderQA.total_pending_alert > 0) {
        showToast('⚠ pending 픽 ' + _builderQA.total_pending_alert + '건 잔류. 정산 전 확인이 필요합니다.');
        return;
    }
    if (!confirm('모든 경기 결과 입력을 확인했나요?\n이벤트를 정산할까요?')) return;
    await adminSettleEvent(eventId);
    await Promise.all([fetchBuilderPickSummary(), fetchBuilderQA()]);
    renderBuilderWorkspace();  // adminSettleEvent는 fetchBuilderMatchups를 호출하지 않으므로 직접 갱신
}

async function onLifecycleArchive(eventId) {
    if (!confirm('정산 완료 이벤트를 아카이브할까요?')) return;
    await adminArchiveEvent(eventId);
    renderBuilderWorkspace();  // adminArchiveEvent는 fetchBuilderMatchups를 호출하지 않으므로 직접 갱신
}

// ── 이벤트 QA 패널 ─────────────────────────────────────────────────

async function fetchBuilderQA() {
    if (!sb || !_builderState.eventId) return;
    const { data, error } = await sb.rpc('get_admin_event_qa', { p_event_id: _builderState.eventId });
    if (!error && data && data.ok) {
        _builderQA = data;
    } else {
        _builderQA = null;
    }
    renderBuilderWorkspace();
}

function renderBuilderQAPanel(qa) {
    if (!qa) return '';

    const allDone = qa.all_matchups_completed;
    const pendingAlert = qa.total_pending_alert || 0;
    const matchups = qa.matchups || [];

    if (!matchups.length) return '';

    // 상태 배너
    let statusBanner = '';
    if (pendingAlert > 0) {
        statusBanner = `
        <div class="flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/5 mb-2">
            <span class="text-amber-400 text-xs">⚠</span>
            <p class="oswald-sharp text-[9px] italic uppercase tracking-widest text-amber-400 font-black">pending 픽 ${pendingAlert}건 잔류 — settle-matchup 재확인 필요</p>
        </div>`;
    } else if (!allDone) {
        statusBanner = `
        <div class="flex items-center gap-2 px-3 py-2 rounded-xl border border-blue-500/20 bg-blue-500/5 mb-2">
            <span class="text-blue-400 text-xs">ℹ</span>
            <p class="oswald-sharp text-[9px] italic uppercase tracking-widest text-blue-400">결과 미입력 경기 있음 — 정산 전 모든 경기 결과 입력 필요</p>
        </div>`;
    } else {
        statusBanner = `
        <div class="flex items-center gap-2 px-3 py-2 rounded-xl border border-green-500/20 bg-green-500/5 mb-2">
            <span class="text-green-400 text-xs">✅</span>
            <p class="oswald-sharp text-[9px] italic uppercase tracking-widest text-green-400 font-black">모든 경기 결과 입력 완료 — 정산 가능</p>
        </div>`;
    }

    // 매치업 QA 행
    const rows = matchups.map(function(m) {
        const totalSidePicks = (m.red_picks || 0) + (m.blue_picks || 0);
        const redPct = totalSidePicks > 0 ? Math.round((m.red_picks / totalSidePicks) * 100) : 0;
        const bluePct = totalSidePicks > 0 ? (100 - redPct) : 0;

        const resultDone = m.result_status && m.result_status !== 'scheduled';
        const resultBadge = resultDone
            ? `<span class="oswald-sharp text-[8px] font-black italic uppercase text-green-400">✅ ${escapeHtml(m.result_winner || 'DRAW/NC')}</span>`
            : `<span class="oswald-sharp text-[8px] italic uppercase text-gray-600">미입력</span>`;

        const pendingBadge = m.pending_picks > 0
            ? `<span class="oswald-sharp text-[8px] font-black italic text-amber-400">P${m.pending_picks}</span>`
            : '';

        return `
        <div class="grid grid-cols-[1fr_auto_auto] items-start gap-2 px-2 py-2 border-b border-white/5 last:border-0">
            <div class="min-w-0">
                <p class="oswald-sharp text-[9px] font-black italic uppercase truncate">
                    <span class="text-red-400">${escapeHtml(m.red_name || '?')}</span>
                    <span class="text-gray-600 mx-0.5">vs</span>
                    <span class="text-blue-400">${escapeHtml(m.blue_name || '?')}</span>
                </p>
                <div class="flex items-center gap-1 mt-1">
                    <div class="flex h-1 rounded-full overflow-hidden w-16 bg-white/5">
                        <div class="bg-red-500/60 h-full" style="width:${redPct}%"></div>
                        <div class="bg-blue-500/60 h-full" style="width:${bluePct}%"></div>
                    </div>
                    <span class="oswald-sharp text-[8px] text-red-400/70">${redPct}%</span>
                    <span class="oswald-sharp text-[8px] text-gray-700">/</span>
                    <span class="oswald-sharp text-[8px] text-blue-400/70">${bluePct}%</span>
                </div>
            </div>
            <div class="text-right shrink-0">
                ${resultBadge}
            </div>
            <div class="flex gap-1 items-center shrink-0">
                ${m.win_picks > 0 ? `<span class="oswald-sharp text-[8px] italic text-green-400">W${m.win_picks}</span>` : ''}
                ${m.lose_picks > 0 ? `<span class="oswald-sharp text-[8px] italic text-gray-500">L${m.lose_picks}</span>` : ''}
                ${pendingBadge}
                ${m.cancelled_picks > 0 ? `<span class="oswald-sharp text-[8px] italic text-gray-700">C${m.cancelled_picks}</span>` : ''}
            </div>
        </div>`;
    }).join('');

    return `
    <div class="mt-3 rounded-xl border border-white/5 bg-black/10 px-3 py-2.5">
        <p class="oswald-sharp text-[8px] italic uppercase tracking-widest text-gray-600 mb-2">결과 QA</p>
        ${statusBanner}
        <div>${rows}</div>
    </div>`;
}
