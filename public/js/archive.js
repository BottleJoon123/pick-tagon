/* ==============================
   ARCHIVE SYSTEM — Supabase 연동
   (localStorage → DB 전환)
   의존성: supabase.js (sb), utils.js (showToast, escapeHtml)
============================== */

var archiveDB = [];         // { id, name, event_date, venue, source_url, status, fights: [...] }
var archiveFightRowCount = 0;
var editingArchiveId = null;
var _archiveFetching = false;   // in-flight guard
var _archiveRetryTimer = null;  // retry timer ref

var fighterArchiveDB = [];      // fighters table cache
var _fightersFetching = false;
var _ufcRankMap = {};           // lowercase name_en → rank number (0=champion)
var _currentArchiveTab = 'events'; // 'events' | 'fighters'

// ── 서브탭 전환 ───────────────────────────────────────────────────────
function switchArchiveTab(tab) {
    _currentArchiveTab = tab;

    const evPanel = document.getElementById('archive-events-panel');
    const ftPanel = document.getElementById('archive-fighters-panel');
    const evBtn   = document.getElementById('archive-tab-events');
    const ftBtn   = document.getElementById('archive-tab-fighters');

    if (tab === 'events') {
        evPanel?.classList.remove('hidden');
        ftPanel?.classList.add('hidden');
        evBtn?.classList.replace('border-transparent', 'border-ufcRed');
        evBtn?.classList.replace('text-gray-500', 'text-white');
        ftBtn?.classList.replace('border-ufcRed', 'border-transparent');
        ftBtn?.classList.replace('text-white', 'text-gray-500');
        if (archiveDB.length === 0) fetchArchive(); else renderArchive();
    } else {
        ftPanel?.classList.remove('hidden');
        evPanel?.classList.add('hidden');
        ftBtn?.classList.replace('border-transparent', 'border-ufcRed');
        ftBtn?.classList.replace('text-gray-500', 'text-white');
        evBtn?.classList.replace('border-ufcRed', 'border-transparent');
        evBtn?.classList.replace('text-white', 'text-gray-500');
        if (fighterArchiveDB.length === 0) fetchFighterArchive(); else renderFighterArchive();
    }
}

// ── DB 로딩 ───────────────────────────────────────────────────────────
async function fetchArchive() {
    if (!sb) {
        if (_archiveRetryTimer) return; // 이미 retry 예약됨
        console.warn('[fetchArchive] sb not ready, retrying in 500ms');
        _archiveRetryTimer = setTimeout(() => { _archiveRetryTimer = null; fetchArchive(); }, 500);
        return;
    }
    if (_archiveFetching) return; // 중복 호출 방지
    _archiveFetching = true;
    try {
        const { data: events, error: evErr } = await sb
            .from('archive_events')
            .select('*')
            .order('event_date', { ascending: false });

        if (evErr) throw evErr;
        if (!events || events.length === 0) {
            archiveDB = [];
            renderArchive();
            renderArchiveAdminList();
            return;
        }

        const eventIds = events.map(e => e.id);
        const { data: fights, error: fErr } = await sb
            .from('archive_fights')
            .select('*')
            .in('event_id', eventIds)
            .order('sort_order', { ascending: true });

        if (fErr) throw fErr;

        const fightsByEvent = {};
        (fights || []).forEach(f => {
            if (!fightsByEvent[f.event_id]) fightsByEvent[f.event_id] = [];
            fightsByEvent[f.event_id].push(f);
        });

        archiveDB = events.map(ev => ({
            ...ev,
            fights: fightsByEvent[ev.id] || [],
        }));

        renderArchive();
        renderArchiveAdminList();
    } catch (e) {
        console.error('[fetchArchive]', e);
        showToast('⚠ 아카이브 로드 실패: ' + e.message);
    } finally {
        _archiveFetching = false;
    }
}

// loadArchive: 최초 탭 진입 시 호출 (이전 호환성 유지)
function loadArchive() {
    fetchArchive();
}

// ── PUBLIC VIEW ────────────────────────────────────────────────────────
function renderArchive() {
    const list = document.getElementById('archive-list');
    const empty = document.getElementById('archive-empty');
    if (!list) return;

    const query = (document.getElementById('archive-search')?.value || '').toLowerCase();
    const yearFilter = document.getElementById('archive-filter')?.value || 'all';
    const statusFilter = document.getElementById('archive-status-filter')?.value || 'all';

    let filtered = [...archiveDB].filter(ev => {
        const nameMatch = (ev.name || '').toLowerCase().includes(query) ||
            (ev.venue || '').toLowerCase().includes(query);
        const yearMatch = yearFilter === 'all' || (ev.event_date || '').startsWith(yearFilter);
        const statusMatch = statusFilter === 'all' || ev.status === statusFilter;
        return nameMatch && yearMatch && statusMatch;
    }).sort((a, b) => (b.event_date || '').localeCompare(a.event_date || ''));

    // Update stats
    const totalFights = archiveDB.reduce((s, e) => s + (e.fights || []).length, 0);
    const koFights = archiveDB.reduce((s, e) => s + (e.fights || []).filter(f => f.method === 'KO/TKO').length, 0);
    const statEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    statEl('archive-stat-events', archiveDB.length);
    statEl('archive-stat-fights', totalFights);
    statEl('archive-stat-ko', totalFights > 0 ? Math.round(koFights / totalFights * 100) + '%' : '0%');

    if (filtered.length === 0) {
        list.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        return;
    }
    if (empty) empty.classList.add('hidden');

    const METHOD_COLOR = {
        'KO/TKO': 'text-ufcRed border-ufcRed/40 bg-ufcRed/10',
        'SUB':    'text-purple-400 border-purple-400/40 bg-purple-400/10',
        'UD':     'text-blue-400 border-blue-400/40 bg-blue-400/10',
        'SD':     'text-yellow-400 border-yellow-400/40 bg-yellow-400/10',
        'MD':     'text-orange-400 border-orange-400/40 bg-orange-400/10',
        'DQ':     'text-gray-400 border-gray-400/40 bg-gray-400/10',
        'NC':     'text-gray-500 border-gray-500/40 bg-gray-500/10',
    };

    list.innerHTML = filtered.map(ev => {
        const dateStr = ev.event_date
            ? new Date(ev.event_date + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
            : '날짜 미상';
        const mainEvent = (ev.fights || []).find(f => f.tag === 'MAIN EVENT') || ev.fights?.[0];
        const isUpcoming = ev.status === 'upcoming';

        const f1Display = fight => fight.f1_name_ko || fight.f1_name || '';
        const f2Display = fight => fight.f2_name_ko || fight.f2_name || '';
        const winnerDisplay = fight => {
            if (!fight.winner) return '';
            if (fight.winner === fight.f1_name && fight.f1_name_ko) return fight.f1_name_ko;
            if (fight.winner === fight.f2_name && fight.f2_name_ko) return fight.f2_name_ko;
            return fight.winner;
        };

        return `
        <div class="glass-card rounded-[2rem] overflow-hidden hover:border-white/20 transition-all duration-500">
            <!-- Event Header -->
            <div class="flex flex-col lg:flex-row lg:items-center justify-between px-4 lg:px-6 py-3 lg:py-4 bg-black/30 border-b border-white/5 gap-3">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="w-8 h-8 lg:w-10 lg:h-10 rounded-xl ${isUpcoming ? 'bg-green-500/10 border border-green-500/30' : 'bg-ufcRed/10 border border-ufcRed/30'} flex items-center justify-center flex-shrink-0">
                        <span class="oswald-sharp ${isUpcoming ? 'text-green-400' : 'text-ufcRed'} text-[8px] lg:text-[10px] font-black italic uppercase text-center leading-tight px-1">${isUpcoming ? 'NEXT' : (ev.name || '').replace('UFC ','').substring(0,4)}</span>
                    </div>
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 min-w-0">
                            <p class="oswald-sharp font-black italic text-sm lg:text-xl text-white uppercase tracking-tighter truncate">${escapeHtml(ev.name || '')}</p>
                            ${isUpcoming ? '<span class="oswald-sharp text-[8px] bg-green-500/10 border border-green-500/30 text-green-400 px-2 py-0.5 rounded-lg font-black italic uppercase flex-shrink-0">UPCOMING</span>' : ''}
                        </div>
                        <p class="oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest truncate">${dateStr} · ${escapeHtml(ev.venue || '—')}</p>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <span class="oswald-sharp text-[8px] lg:text-[10px] text-gray-600 italic uppercase tracking-widest">${(ev.fights || []).length}경기</span>
                    ${(ev.fights || []).length > 0 ? `
                    <button onclick="toggleArchiveDetail('${ev.id}')" id="archive-toggle-btn-${ev.id}"
                        class="oswald-sharp text-[8px] lg:text-[10px] border border-white/10 text-gray-500 hover:text-white hover:border-white/30 px-2 lg:px-3 py-1 rounded-xl italic uppercase tracking-widest transition flex items-center gap-1">
                        <span id="archive-toggle-label-${ev.id}">▼ ${isUpcoming ? '대진표 보기' : '결과 보기'}</span>
                    </button>` : ''}
                </div>
            </div>

            ${mainEvent ? `
            <!-- Main Event Highlight -->
            <div class="px-4 lg:px-6 py-3 lg:py-4 border-b border-white/5 min-w-0">
                <!-- Mobile: stacked (tag / names / result) -->
                <div class="flex items-start gap-2 min-w-0 lg:hidden">
                    <span class="oswald-sharp text-[8px] bg-ufcRed/10 border border-ufcRed/20 text-ufcRed px-2 py-1 rounded-lg font-black italic uppercase flex-shrink-0 mt-0.5">${escapeHtml(mainEvent.tag || '')}</span>
                    <div class="min-w-0 flex-1">
                        <p class="oswald-sharp text-xs font-black italic text-white uppercase tracking-tighter truncate">${escapeHtml(f1Display(mainEvent))} <span class="text-gray-600">vs</span> ${escapeHtml(f2Display(mainEvent))}</p>
                        ${!isUpcoming && mainEvent.winner ? `
                        <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span class="oswald-sharp text-[9px] font-black italic text-ufcRed uppercase">W: ${escapeHtml(winnerDisplay(mainEvent))}</span>
                            <span class="oswald-sharp text-[8px] border ${METHOD_COLOR[mainEvent.method] || 'text-gray-400 border-gray-400/40 bg-gray-400/10'} px-1.5 py-0.5 rounded-md font-black italic uppercase">${escapeHtml(mainEvent.method || '')}</span>
                        </div>` : ''}
                    </div>
                </div>
                <!-- Desktop: balanced face-off — [tag] [← f1name · f1img] [VS] [f2img · f2name →] [result] -->
                <div class="hidden lg:flex items-center gap-4">
                    <span class="oswald-sharp text-[8px] bg-ufcRed/10 border border-ufcRed/20 text-ufcRed px-2 py-1 rounded-lg font-black italic uppercase flex-shrink-0">${escapeHtml(mainEvent.tag || '')}</span>
                    <div class="flex flex-row-reverse items-center gap-2 flex-1 min-w-0">
                        ${mainEvent.f1_image_url ? `<img src="${escapeHtml(mainEvent.f1_image_url)}" class="w-9 h-9 rounded-full object-cover object-top border border-white/10 flex-shrink-0" onerror="this.style.display='none'">` : ''}
                        <span class="oswald-sharp text-base font-black italic text-white uppercase tracking-tighter truncate flex-1 min-w-0 text-right">${escapeHtml(f1Display(mainEvent))}</span>
                    </div>
                    <span class="oswald-sharp text-xs font-black italic text-gray-600 uppercase flex-shrink-0 w-8 text-center">VS</span>
                    <div class="flex items-center gap-2 flex-1 min-w-0">
                        ${mainEvent.f2_image_url ? `<img src="${escapeHtml(mainEvent.f2_image_url)}" class="w-9 h-9 rounded-full object-cover object-top border border-white/10 flex-shrink-0" onerror="this.style.display='none'">` : ''}
                        <span class="oswald-sharp text-base font-black italic text-white uppercase tracking-tighter truncate flex-1 min-w-0">${escapeHtml(f2Display(mainEvent))}</span>
                    </div>
                    <div class="w-44 flex-shrink-0 min-w-0">
                        ${!isUpcoming && mainEvent.winner ? `
                        <div class="flex items-center gap-1.5 min-w-0">
                            <span class="oswald-sharp text-sm font-black italic text-ufcRed uppercase truncate">${escapeHtml(winnerDisplay(mainEvent))}</span>
                            <span class="oswald-sharp text-[8px] border ${METHOD_COLOR[mainEvent.method] || 'text-gray-400 border-gray-400/40 bg-gray-400/10'} px-2 py-0.5 rounded-lg font-black italic uppercase flex-shrink-0">${escapeHtml(mainEvent.method || '')}</span>
                        </div>` : ''}
                    </div>
                </div>
            </div>` : ''}

            <!-- Full Results (collapsible) -->
            <div id="archive-detail-${ev.id}" class="hidden">
                <div class="divide-y divide-white/5">
                    ${(ev.fights || []).map((f, i) => `
                    <div class="px-4 lg:px-6 py-2 lg:py-2.5 hover:bg-white/2 transition">
                        <!-- Mobile: 2-line compact result -->
                        <div class="flex items-start gap-2 min-w-0 lg:hidden">
                            <span class="oswald-sharp text-[7px] text-gray-600 italic uppercase flex-shrink-0 w-4 text-center mt-0.5">${i + 1}</span>
                            <div class="min-w-0 flex-1">
                                <div class="flex items-center gap-1 min-w-0">
                                    <span class="oswald-sharp text-xs font-black italic text-white uppercase tracking-tighter truncate flex-1 min-w-0">${escapeHtml(f1Display(f))}</span>
                                    <span class="text-gray-700 text-[9px] flex-shrink-0 px-0.5">vs</span>
                                    <span class="oswald-sharp text-xs font-black italic text-white uppercase tracking-tighter truncate flex-1 min-w-0">${escapeHtml(f2Display(f))}</span>
                                </div>
                                ${!isUpcoming && f.winner ? `
                                <div class="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    <span class="oswald-sharp text-[9px] font-black italic text-ufcRed uppercase">W: ${escapeHtml(winnerDisplay(f))}</span>
                                    <span class="oswald-sharp text-[7px] border ${METHOD_COLOR[f.method] || 'text-gray-400 border-gray-400/40 bg-gray-400/10'} px-1.5 py-0.5 rounded-md font-black italic uppercase">${escapeHtml(f.method || '')}</span>
                                    ${f.round ? `<span class="oswald-sharp text-[7px] text-gray-600 italic uppercase">R${f.round}${f.fight_time ? ' ' + f.fight_time : ''}</span>` : ''}
                                </div>` : (!isUpcoming && (f.round || f.fight_time) ? `<p class="oswald-sharp text-[7px] text-gray-600 italic uppercase mt-0.5">R${f.round || '?'} ${f.fight_time || ''}</p>` : '')}
                            </div>
                        </div>
                        <!-- Desktop: balanced face-off — [#] [← f1name · f1img] [VS] [f2img · f2name →] [result] -->
                        <div class="hidden lg:flex items-center gap-2">
                            <span class="oswald-sharp text-[9px] text-gray-600 italic uppercase flex-shrink-0 w-5 text-center">${i + 1}</span>
                            <div class="flex flex-row-reverse items-center gap-1.5 flex-1 min-w-0">
                                ${f.f1_image_url ? `<img src="${escapeHtml(f.f1_image_url)}" class="w-7 h-7 rounded-full object-cover object-top border border-white/10 flex-shrink-0" onerror="this.style.display='none'">` : ''}
                                <span class="oswald-sharp text-sm font-black italic text-white uppercase tracking-tighter truncate flex-1 min-w-0 text-right">${escapeHtml(f1Display(f))}</span>
                            </div>
                            <span class="oswald-sharp text-[9px] font-black italic text-gray-600 uppercase flex-shrink-0 w-7 text-center">VS</span>
                            <div class="flex items-center gap-1.5 flex-1 min-w-0">
                                ${f.f2_image_url ? `<img src="${escapeHtml(f.f2_image_url)}" class="w-7 h-7 rounded-full object-cover object-top border border-white/10 flex-shrink-0" onerror="this.style.display='none'">` : ''}
                                <span class="oswald-sharp text-sm font-black italic text-white uppercase tracking-tighter truncate flex-1 min-w-0">${escapeHtml(f2Display(f))}</span>
                            </div>
                            <div class="w-40 flex-shrink-0 min-w-0">
                                ${!isUpcoming && f.winner ? `
                                <div class="flex items-center gap-1.5 min-w-0">
                                    <span class="oswald-sharp text-xs font-black italic text-ufcRed uppercase truncate">${escapeHtml(winnerDisplay(f))}</span>
                                    <span class="oswald-sharp text-[8px] border ${METHOD_COLOR[f.method] || 'text-gray-400 border-gray-400/40 bg-gray-400/10'} px-2 py-0.5 rounded-lg font-black italic uppercase flex-shrink-0">${escapeHtml(f.method || '')}</span>
                                </div>
                                ${f.round || f.fight_time ? `<p class="oswald-sharp text-[9px] text-gray-500 italic uppercase mt-0.5">R${f.round || '?'} ${f.fight_time || ''}</p>` : ''}` :
                                !isUpcoming && (f.round || f.fight_time) ? `<p class="oswald-sharp text-[9px] text-gray-500 italic uppercase">R${f.round || '?'} ${f.fight_time || ''}</p>` : ''}
                            </div>
                        </div>
                    </div>
                    `).join('')}
                </div>
            </div>
        </div>`;
    }).join('');
}

function toggleArchiveDetail(evId) {
    const panel = document.getElementById(`archive-detail-${evId}`);
    const label = document.getElementById(`archive-toggle-label-${evId}`);
    if (!panel || !label) return;
    const isHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    const ev = archiveDB.find(e => e.id === evId);
    const isUpcoming = ev?.status === 'upcoming';
    label.textContent = isHidden ? `▲ 접기` : `▼ ${isUpcoming ? '대진표 보기' : '결과 보기'}`;
}

// ── ADMIN ─────────────────────────────────────────────────────────────
function renderArchiveAdminList() {
    const list = document.getElementById('archive-admin-list');
    const count = document.getElementById('archive-admin-count');
    if (!list) return;
    if (count) count.textContent = archiveDB.length;

    if (archiveDB.length === 0) {
        list.innerHTML = `<div class="glass-card p-8 text-center text-gray-600 oswald-sharp text-xs italic uppercase tracking-widest rounded-2xl">등록된 아카이브가 없습니다</div>`;
        return;
    }

    const sorted = [...archiveDB].sort((a, b) => (b.event_date || '').localeCompare(a.event_date || ''));
    list.innerHTML = sorted.map(ev => `
        <div class="glass-card rounded-2xl p-4 lg:p-5 flex items-center justify-between hover:border-white/20 transition">
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-xl ${ev.status === 'upcoming' ? 'bg-green-500/10 border border-green-500/20' : 'bg-ufcRed/10 border border-ufcRed/20'} flex items-center justify-center">
                    <span class="oswald-sharp ${ev.status === 'upcoming' ? 'text-green-400' : 'text-ufcRed'} text-[8px] font-black italic">${ev.status === 'upcoming' ? 'UP' : (ev.name || '').replace('UFC ','').substring(0,4)}</span>
                </div>
                <div>
                    <p class="oswald-sharp font-black italic text-sm lg:text-lg text-white uppercase tracking-tighter">${escapeHtml(ev.name || '')}</p>
                    <p class="oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest">${ev.event_date || '—'} · ${(ev.fights || []).length}경기 · ${ev.status === 'upcoming' ? '<span class="text-green-400">UPCOMING</span>' : 'PAST'}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="openArchiveEventModal('${ev.id}')" class="oswald-sharp text-[10px] border border-white/10 text-gray-400 hover:text-white px-3 py-2 rounded-xl italic uppercase tracking-widest transition">수정</button>
                <button onclick="deleteArchiveEvent('${ev.id}')" class="oswald-sharp text-[10px] border border-ufcRed/20 text-ufcRed/60 hover:text-ufcRed px-3 py-2 rounded-xl italic uppercase tracking-widest transition">삭제</button>
            </div>
        </div>
    `).join('');
}

function openArchiveEventModal(evId) {
    // 수정 모드: 먼저 대상 확인 후 모달 열기 (Codex 지적: 모달 오픈 전 검증)
    let ev = null;
    if (evId) {
        ev = archiveDB.find(e => e.id === evId);
        if (!ev) { showToast('⚠ 이벤트를 찾을 수 없습니다'); return; }
    }

    editingArchiveId = evId || null;
    archiveFightRowCount = 0;
    document.getElementById('archive-event-modal').classList.remove('hidden');
    document.getElementById('archive-fight-rows').innerHTML = '';

    if (ev) {
        document.getElementById('archive-modal-title').textContent = '이벤트 수정';
        document.getElementById('ae-name').value = ev.name || '';
        document.getElementById('ae-date').value = ev.event_date || '';
        document.getElementById('ae-venue').value = ev.venue || '';
        document.getElementById('ae-edit-id').value = evId;
        const statusEl = document.getElementById('ae-status');
        if (statusEl) statusEl.value = ev.status || 'past';
        (ev.fights || []).forEach(f => addArchiveFightRow(f));
    } else {
        document.getElementById('archive-modal-title').textContent = '이벤트 추가';
        ['ae-name', 'ae-venue'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        document.getElementById('ae-date').value = '';
        document.getElementById('ae-edit-id').value = '';
        const statusEl = document.getElementById('ae-status');
        if (statusEl) statusEl.value = 'past';
        addArchiveFightRow();
    }
}

function closeArchiveEventModal() {
    document.getElementById('archive-event-modal').classList.add('hidden');
    editingArchiveId = null;
}

function addArchiveFightRow(prefill) {
    const idx = archiveFightRowCount++;
    const container = document.getElementById('archive-fight-rows');
    const row = document.createElement('div');
    row.id = `afr-${idx}`;
    row.dataset.fightRow = idx;   // Codex 지적: fragile selector 대신 data-* 사용
    row.className = 'p-3 rounded-xl bg-black/30 border border-white/5 space-y-2';

    const safeVal = v => escapeHtml(v || '');

    row.innerHTML = `
        <!-- Row 1: tag + fighters (EN) + winner + method + round + delete -->
        <div class="grid grid-cols-12 gap-2 items-center">
            <div class="col-span-1">
                <select id="afr-tag-${idx}" class="w-full bg-black/50 border border-white/10 rounded-lg px-1 py-2 text-white text-[9px] focus:outline-none focus:border-ufcRed">
                    <option>MAIN EVENT</option><option>CO-MAIN EVENT</option><option>FEATURED</option><option>PRELIMS</option><option>SPECIAL</option>
                </select>
            </div>
            <div class="col-span-2">
                <input id="afr-f1-${idx}" type="text" placeholder="파이터 1 (영문)" value="${safeVal(prefill?.f1_name)}"
                    class="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-2 text-white text-xs focus:outline-none focus:border-ufcRed">
            </div>
            <div class="col-span-2">
                <input id="afr-f2-${idx}" type="text" placeholder="파이터 2 (영문)" value="${safeVal(prefill?.f2_name)}"
                    class="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-2 text-white text-xs focus:outline-none focus:border-ufcRed">
            </div>
            <div class="col-span-2">
                <input id="afr-winner-${idx}" type="text" placeholder="승자 (영문)" value="${safeVal(prefill?.winner)}"
                    class="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-2 text-white text-xs focus:outline-none focus:border-ufcRed">
            </div>
            <div class="col-span-1">
                <select id="afr-method-${idx}" class="w-full bg-black/50 border border-white/10 rounded-lg px-1 py-2 text-white text-[9px] focus:outline-none focus:border-ufcRed">
                    <option>KO/TKO</option><option>SUB</option><option>UD</option><option>SD</option><option>MD</option><option>DQ</option><option>NC</option>
                </select>
            </div>
            <div class="col-span-1">
                <input id="afr-round-${idx}" type="number" min="1" max="5" placeholder="R" value="${prefill?.round || ''}"
                    class="w-full bg-black/50 border border-white/10 rounded-lg px-1 py-2 text-white text-xs focus:outline-none focus:border-ufcRed text-center">
            </div>
            <div class="col-span-2">
                <input id="afr-time-${idx}" type="text" placeholder="시간 (예: 2:30)" value="${safeVal(prefill?.fight_time)}"
                    class="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-2 text-white text-xs focus:outline-none focus:border-ufcRed">
            </div>
            <div class="col-span-1 text-center">
                <button onclick="document.getElementById('afr-${idx}').remove()" class="text-gray-600 hover:text-ufcRed transition text-sm">✕</button>
            </div>
        </div>
        <!-- Row 2: Korean names + image URLs -->
        <div class="grid grid-cols-12 gap-2 items-center">
            <div class="col-span-1 text-[8px] text-gray-600 italic uppercase text-center">KO</div>
            <div class="col-span-2">
                <input id="afr-f1ko-${idx}" type="text" placeholder="파이터 1 (한글)" value="${safeVal(prefill?.f1_name_ko)}"
                    class="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-2 text-white text-xs focus:outline-none focus:border-ufcRed">
            </div>
            <div class="col-span-2">
                <input id="afr-f2ko-${idx}" type="text" placeholder="파이터 2 (한글)" value="${safeVal(prefill?.f2_name_ko)}"
                    class="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-2 text-white text-xs focus:outline-none focus:border-ufcRed">
            </div>
            <div class="col-span-1 text-[8px] text-gray-600 italic uppercase text-center">IMG</div>
            <div class="col-span-3">
                <input id="afr-f1img-${idx}" type="url" placeholder="파이터 1 이미지 URL" value="${safeVal(prefill?.f1_image_url)}"
                    class="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-2 text-white text-[10px] focus:outline-none focus:border-ufcRed">
            </div>
            <div class="col-span-3">
                <input id="afr-f2img-${idx}" type="url" placeholder="파이터 2 이미지 URL" value="${safeVal(prefill?.f2_image_url)}"
                    class="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-2 text-white text-[10px] focus:outline-none focus:border-ufcRed">
            </div>
        </div>
    `;
    container.appendChild(row);

    if (prefill) {
        const tagEl = document.getElementById(`afr-tag-${idx}`);
        if (tagEl) tagEl.value = prefill.tag || 'MAIN EVENT';
        const methodEl = document.getElementById(`afr-method-${idx}`);
        if (methodEl) methodEl.value = prefill.method || 'UD';
    }
}

async function saveArchiveEvent() {
    const name = (document.getElementById('ae-name')?.value || '').trim();
    if (!name) { showToast('⚠ 이벤트명을 입력하세요'); return; }

    const eventDate = document.getElementById('ae-date')?.value || null;
    const venue = (document.getElementById('ae-venue')?.value || '').trim() || null;
    const status = document.getElementById('ae-status')?.value || 'past';

    // Collect fight rows (Codex 지적: data-fight-row로 fragile selector 교체)
    const fights = [];
    let sortOrder = 0;
    document.querySelectorAll('[data-fight-row]').forEach(row => {
        const idx = row.dataset.fightRow;
        const f1 = (document.getElementById(`afr-f1-${idx}`)?.value || '').trim();
        const f2 = (document.getElementById(`afr-f2-${idx}`)?.value || '').trim();
        // Codex 지적: 양쪽 파이터 모두 필수 — 한쪽만 있으면 저장 제외
        if (f1 && f2) {
            fights.push({
                tag: document.getElementById(`afr-tag-${idx}`)?.value || 'MAIN EVENT',
                f1_name: f1 || null,
                f2_name: f2 || null,
                f1_name_ko: (document.getElementById(`afr-f1ko-${idx}`)?.value || '').trim() || null,
                f2_name_ko: (document.getElementById(`afr-f2ko-${idx}`)?.value || '').trim() || null,
                f1_image_url: (document.getElementById(`afr-f1img-${idx}`)?.value || '').trim() || null,
                f2_image_url: (document.getElementById(`afr-f2img-${idx}`)?.value || '').trim() || null,
                winner: (document.getElementById(`afr-winner-${idx}`)?.value || '').trim() || null,
                method: document.getElementById(`afr-method-${idx}`)?.value || null,
                round: parseInt(document.getElementById(`afr-round-${idx}`)?.value) || null,
                fight_time: (document.getElementById(`afr-time-${idx}`)?.value || '').trim() || null,
                sort_order: sortOrder++,
            });
        }
    });

    try {
        if (editingArchiveId) {
            // UPDATE event
            const { error: evErr } = await sb
                .from('archive_events')
                .update({ name, event_date: eventDate, venue, status, updated_at: new Date().toISOString() })
                .eq('id', editingArchiveId);
            if (evErr) throw evErr;

            // DELETE existing fights + re-insert
            const { error: delErr } = await sb
                .from('archive_fights')
                .delete()
                .eq('event_id', editingArchiveId);
            if (delErr) throw delErr;

            if (fights.length > 0) {
                const { error: insErr } = await sb
                    .from('archive_fights')
                    .insert(fights.map(f => ({ ...f, event_id: editingArchiveId })));
                if (insErr) throw insErr;
            }

            showToast(`✅ ${name} 업데이트 완료`);
        } else {
            // INSERT new event
            const { data: evData, error: evErr } = await sb
                .from('archive_events')
                .insert({ name, event_date: eventDate, venue, status })
                .select('id')
                .single();
            if (evErr) throw evErr;

            if (fights.length > 0) {
                const { error: insErr } = await sb
                    .from('archive_fights')
                    .insert(fights.map(f => ({ ...f, event_id: evData.id })));
                if (insErr) throw insErr;
            }

            showToast(`📊 ${name} 아카이브 등록 완료`);
        }

        closeArchiveEventModal();
        await fetchArchive();
    } catch (e) {
        console.error('[saveArchiveEvent]', e);
        showToast('❌ 저장 실패: ' + e.message);
    }
}

async function deleteArchiveEvent(evId) {
    const ev = archiveDB.find(e => e.id === evId);
    if (!ev) return;
    if (!confirm(`"${ev.name}" 이벤트를 아카이브에서 삭제하시겠습니까?`)) return;

    try {
        const { error } = await sb.from('archive_events').delete().eq('id', evId);
        if (error) throw error;
        showToast(`🗑 ${ev.name} 삭제됨`);
        await fetchArchive();
    } catch (e) {
        console.error('[deleteArchiveEvent]', e);
        showToast('❌ 삭제 실패: ' + e.message);
    }
}

// ── Pending → Archive 연동 ────────────────────────────────────────────
// pending_events에서 approve 시 archive_events에도 추가
async function approveToArchive(_pendingId, title, dateStr, sourceUrl) {
    // Codex 지적: check-then-insert race condition → upsert(onConflict: 'name')으로 교체
    try {
        const { error } = await sb
            .from('archive_events')
            .upsert(
                { name: title, event_date: dateStr || null, source_url: sourceUrl || null, status: 'upcoming' },
                { onConflict: 'name', ignoreDuplicates: true }
            );
        if (error) console.warn('[approveToArchive] archive upsert failed:', error.message);
    } catch (e) {
        console.warn('[approveToArchive]', e);
    }
}

// ══════════════════════════════════════════════════════════════════════
//  파이터 탭
// ══════════════════════════════════════════════════════════════════════

const DIVISION_LABEL = {
    hw:  '헤비웨이트',   lhw: '라이트헤비웨이트', mw:  '미들웨이트',
    ww:  '웰터웨이트',  lw:  '라이트웨이트',     fw:  '페더웨이트',
    bw:  '밴텀웨이트',  flw: '플라이웨이트',     wmw: '여성 스트로웨이트',
    wfw: '여성 플라이웨이트', wbw: '여성 밴텀웨이트', wfe: '여성 페더웨이트',
};

// ufc_rankings 맵에서 랭크 조회 (없으면 fighters.rank 폴백)
function _getRankVal(f) {
    const key = (f.name_en || '').toLowerCase().trim();
    if (key in _ufcRankMap) return _ufcRankMap[key];
    // 성(last name) 부분 매칭 폴백
    const lastName = key.split(' ').pop();
    if (lastName && lastName.length >= 4) {
        const match = Object.keys(_ufcRankMap).find(k => k.includes(lastName));
        if (match !== undefined) return _ufcRankMap[match];
    }
    return f.rank ?? null;
}

// Maps a DB fighters row → openFighterProfile() expected shape
function _buildFighterForProfile(f) {
    const record = (f.wins || f.losses || f.draws)
        ? `${f.wins || 0}-${f.losses || 0}${f.draws ? '-' + f.draws : ''}`
        : null;
    const rv = _getRankVal(f);
    const rankLabel = rv === 0 ? 'CHAMPION' : (rv != null ? `#${rv}` : 'UNRANKED');
    const divLabel  = DIVISION_LABEL[f.division] || (f.division || '').toUpperCase();
    const stats     = Array.isArray(f.stats) ? f.stats : [50, 50, 50, 50, 50];
    const heightStr = f.height_cm ? Math.round(f.height_cm) + ' cm' : (f.height || '—');
    const reachStr  = f.reach_cm  ? Math.round(f.reach_cm)  + ' cm' : (f.reach  || '—');
    const weightStr = f.weight_kg ? Math.round(f.weight_kg) + ' kg' : '—';
    return {
        id: f.id,
        name: f.name || f.name_en || '—',
        name_en: f.name_en,
        record: record || '—',
        height: heightStr,
        reach: reachStr,
        weight: weightStr,
        ko_rate: f.ko_rate ?? null,
        sub_rate: f.sub_rate ?? null,
        dec_rate: f.dec_rate ?? null,
        odds: f.odds || null,
        rank: rankLabel,
        division: divLabel,
        style: f.style,
        stats,
        image_url: f.image_url || null,
    };
}

async function fetchFighterArchive() {
    if (!sb) { setTimeout(fetchFighterArchive, 500); return; }
    if (_fightersFetching) return;
    _fightersFetching = true;

    const listEl = document.getElementById('fighter-archive-list');
    if (listEl) listEl.innerHTML = '<p class="col-span-full text-center oswald-sharp text-gray-600 italic text-sm uppercase tracking-widest animate-pulse py-16">Loading...</p>';

    try {
        const [fightersRes, rankingsRes] = await Promise.all([
            sb.from('fighters')
              .select('id, name, name_en, division, wins, losses, draws, rank, height, reach, height_cm, weight_kg, reach_cm, ko_rate, sub_rate, dec_rate, stats, image_url, style')
              .order('division', { ascending: true })
              .order('rank', { ascending: true, nullsFirst: false })
              .limit(5000),
            sb.from('ufc_rankings').select('fighter_name, rank_position')
        ]);

        if (fightersRes.error) throw fightersRes.error;

        // ufc_rankings → 이름 소문자 키 맵 구성 (P4P 제외, 같은 이름이면 작은 값 우선)
        _ufcRankMap = {};
        (rankingsRes.data || []).forEach(row => {
            if (row.division === 'p4p') return;
            const key = (row.fighter_name || '').toLowerCase().trim();
            if (!key) return;
            const rv = row.rank_position === 'C' ? 0 : parseInt(row.rank_position, 10);
            if (isNaN(rv)) return;
            if (!(key in _ufcRankMap) || rv < _ufcRankMap[key]) _ufcRankMap[key] = rv;
        });

        fighterArchiveDB = fightersRes.data || [];
        renderFighterArchive();
    } catch (e) {
        console.error('[fetchFighterArchive]', e);
        showToast('⚠ 파이터 데이터 로드 실패: ' + e.message);
    } finally {
        _fightersFetching = false;
    }
}

function renderFighterArchive() {
    const listEl  = document.getElementById('fighter-archive-list');
    const emptyEl = document.getElementById('fighter-archive-empty');
    if (!listEl) return;

    const query   = (document.getElementById('fighter-archive-search')?.value || '').toLowerCase();
    const divFilt = document.getElementById('fighter-archive-division')?.value || 'all';

    const filtered = fighterArchiveDB.filter(f => {
        const nameMatch = (f.name || '').toLowerCase().includes(query) ||
                          (f.name_en || '').toLowerCase().includes(query);
        const divMatch  = divFilt === 'all' || f.division === divFilt;
        return nameMatch && divMatch;
    });

    // 통계
    const divSet = new Set(fighterArchiveDB.map(f => f.division).filter(Boolean));
    const statEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    statEl('fighter-stat-count', fighterArchiveDB.length);
    statEl('fighter-stat-divisions', divSet.size);

    if (filtered.length === 0) {
        listEl.innerHTML = '';
        emptyEl?.classList.remove('hidden');
        return;
    }
    emptyEl?.classList.add('hidden');

    listEl.innerHTML = filtered.map(f => {
        const displayName = f.name || f.name_en || '—';
        const engName     = (f.name !== f.name_en && f.name_en) ? f.name_en : '';
        const record      = (f.wins || f.losses || f.draws)
            ? `${f.wins || 0}-${f.losses || 0}${f.draws ? '-' + f.draws : ''}`
            : null;
        const rv2 = _getRankVal(f);
        const rankLabel   = rv2 === 0 ? 'C' : (rv2 != null ? `#${rv2}` : '—');
        const divLabel    = DIVISION_LABEL[f.division] || (f.division || '').toUpperCase();

        const STYLE_COLOR = {
            striker:    'text-red-400 border-red-400/30 bg-red-400/5',
            grappler:   'text-blue-400 border-blue-400/30 bg-blue-400/5',
            wrestler:   'text-green-400 border-green-400/30 bg-green-400/5',
            submission: 'text-purple-400 border-purple-400/30 bg-purple-400/5',
            'all-around': 'text-yellow-400 border-yellow-400/30 bg-yellow-400/5',
        };

        window._fighterCardCache = window._fighterCardCache || {};
        const cacheKey = 'fc_' + (f.id || f.name_en || Math.random().toString(36).slice(2));
        window._fighterCardCache[cacheKey] = _buildFighterForProfile(f);
        return `
        <div class="glass-card rounded-2xl overflow-hidden hover:border-white/20 hover:border-ufcRed/30 transition-all duration-300 flex flex-col cursor-pointer" onclick="openFighterProfile(window._fighterCardCache['${cacheKey}'])">
            <!-- 파이터 이미지 -->
            <div class="relative bg-gradient-to-b from-white/5 to-black/40 aspect-[3/4] flex items-end justify-center overflow-hidden">
                ${f.image_url
                    ? `<img src="${escapeHtml(f.image_url)}" alt="${escapeHtml(displayName)}"
                           class="absolute inset-0 w-full h-full object-cover object-top"
                           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
                    : ''}
                <div class="absolute inset-0 ${f.image_url ? 'hidden' : 'flex'} items-center justify-center">
                    <span class="oswald-sharp text-5xl lg:text-6xl font-black italic text-white/10 uppercase select-none">
                        ${escapeHtml((f.name_en || f.name || '?')[0])}
                    </span>
                </div>
                <!-- rank badge -->
                <div class="absolute top-2 left-2">
                    <span class="oswald-sharp text-[10px] font-black italic uppercase px-2 py-0.5 rounded-lg ${rv2 === 0 ? 'bg-yellow-500/20 border border-yellow-500/40 text-yellow-400' : 'bg-white/5 border border-white/10 text-gray-400'}">${rankLabel}</span>
                </div>
            </div>

            <!-- 파이터 정보 -->
            <div class="p-3 flex-1 flex flex-col gap-1">
                <p class="oswald-sharp font-black italic text-white uppercase tracking-tighter text-sm lg:text-base leading-tight">${escapeHtml(displayName)}</p>
                ${engName ? `<p class="oswald-sharp text-[9px] text-gray-500 italic uppercase tracking-widest truncate">${escapeHtml(engName)}</p>` : ''}
                <p class="oswald-sharp text-[9px] text-ufcRed italic uppercase tracking-widest">${escapeHtml(divLabel)}</p>
                <div class="flex items-center gap-2 mt-auto pt-2 border-t border-white/5 flex-wrap">
                    ${record ? `<span class="oswald-sharp text-[9px] text-white font-black italic">${escapeHtml(record)}</span>` : ''}
                    ${f.style ? `<span class="oswald-sharp text-[8px] border ${STYLE_COLOR[f.style] || 'text-gray-500 border-gray-500/30 bg-gray-500/5'} px-1.5 py-0.5 rounded-md italic uppercase">${escapeHtml(f.style)}</span>` : ''}
                </div>
                ${(f.height || f.reach) ? `
                <div class="flex gap-2 text-[9px] text-gray-600 oswald-sharp italic uppercase">
                    ${f.height ? `<span>키 ${escapeHtml(f.height)}</span>` : ''}
                    ${f.reach  ? `<span>리치 ${escapeHtml(f.reach)}</span>` : ''}
                </div>` : ''}
            </div>
        </div>`;
    }).join('');
}
