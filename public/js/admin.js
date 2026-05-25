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
