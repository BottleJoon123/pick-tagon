/* ==============================
   ARCHIVE SYSTEM — Supabase 연동
   (localStorage → DB 전환)
   의존성: supabase.js (sb), utils.js (showToast, escapeHtml)
============================== */

var archiveDB = [];         // { id, name, event_date, venue, source_url, status, fights: [...] }
var archiveFightRowCount = 0;
var editingArchiveId = null;

// ── DB 로딩 ───────────────────────────────────────────────────────────
async function fetchArchive() {
    if (!sb) { console.warn('[fetchArchive] sb not ready, retrying in 500ms'); setTimeout(fetchArchive, 500); return; }
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
            <div class="flex flex-col lg:flex-row lg:items-center justify-between px-6 lg:px-10 py-5 lg:py-7 bg-black/30 border-b border-white/5 gap-3">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 lg:w-14 lg:h-14 rounded-2xl ${isUpcoming ? 'bg-green-500/10 border border-green-500/30' : 'bg-ufcRed/10 border border-ufcRed/30'} flex items-center justify-center flex-shrink-0">
                        <span class="oswald-sharp ${isUpcoming ? 'text-green-400' : 'text-ufcRed'} text-[8px] lg:text-[10px] font-black italic uppercase text-center leading-tight px-1">${isUpcoming ? 'NEXT' : (ev.name || '').replace('UFC ','').substring(0,4)}</span>
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <p class="oswald-sharp font-black italic text-lg lg:text-3xl text-white uppercase tracking-tighter">${escapeHtml(ev.name || '')}</p>
                            ${isUpcoming ? '<span class="oswald-sharp text-[8px] bg-green-500/10 border border-green-500/30 text-green-400 px-2 py-0.5 rounded-lg font-black italic uppercase">UPCOMING</span>' : ''}
                        </div>
                        <p class="oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest">${dateStr} · ${escapeHtml(ev.venue || '—')}</p>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <span class="oswald-sharp text-[8px] lg:text-[10px] text-gray-600 italic uppercase tracking-widest">${(ev.fights || []).length}경기</span>
                    ${(ev.fights || []).length > 0 ? `
                    <button onclick="toggleArchiveDetail('${ev.id}')" id="archive-toggle-btn-${ev.id}"
                        class="oswald-sharp text-[8px] lg:text-xs border border-white/10 text-gray-500 hover:text-white hover:border-white/30 px-3 lg:px-4 py-1 lg:py-2 rounded-xl italic uppercase tracking-widest transition flex items-center gap-1">
                        <span id="archive-toggle-label-${ev.id}">▼ ${isUpcoming ? '대진표 보기' : '결과 보기'}</span>
                    </button>` : ''}
                </div>
            </div>

            ${mainEvent ? `
            <!-- Main Event Highlight -->
            <div class="px-6 lg:px-10 py-5 lg:py-6 border-b border-white/5 flex items-center justify-between gap-4">
                <div class="flex items-center gap-3 flex-wrap">
                    <span class="oswald-sharp text-[8px] bg-ufcRed/10 border border-ufcRed/20 text-ufcRed px-2 py-1 rounded-lg font-black italic uppercase">${escapeHtml(mainEvent.tag || '')}</span>
                    ${mainEvent.f1_image_url ? `<img src="${escapeHtml(mainEvent.f1_image_url)}" class="w-8 h-8 rounded-full object-cover border border-white/10" onerror="this.style.display='none'">` : ''}
                    <span class="oswald-sharp text-sm lg:text-xl font-black italic text-white uppercase tracking-tighter">${escapeHtml(f1Display(mainEvent))} <span class="text-gray-600">vs</span> ${escapeHtml(f2Display(mainEvent))}</span>
                    ${mainEvent.f2_image_url ? `<img src="${escapeHtml(mainEvent.f2_image_url)}" class="w-8 h-8 rounded-full object-cover border border-white/10" onerror="this.style.display='none'">` : ''}
                </div>
                ${!isUpcoming && mainEvent.winner ? `
                <div class="flex items-center gap-2 flex-shrink-0">
                    <span class="oswald-sharp text-[10px] lg:text-sm font-black italic text-ufcRed uppercase">W: ${escapeHtml(winnerDisplay(mainEvent))}</span>
                    <span class="oswald-sharp text-[8px] border ${METHOD_COLOR[mainEvent.method] || 'text-gray-400 border-gray-400/40 bg-gray-400/10'} px-2 py-1 rounded-lg font-black italic uppercase">${escapeHtml(mainEvent.method || '')}</span>
                </div>` : ''}
            </div>` : ''}

            <!-- Full Results (collapsible) -->
            <div id="archive-detail-${ev.id}" class="hidden">
                <div class="divide-y divide-white/5">
                    ${(ev.fights || []).map((f, i) => `
                    <div class="px-6 lg:px-10 py-4 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition">
                        <div class="flex items-center gap-3 min-w-0">
                            <span class="oswald-sharp text-[7px] lg:text-[9px] text-gray-600 italic uppercase tracking-widest flex-shrink-0 w-5 lg:w-8 text-center">${i + 1}</span>
                            <div class="flex items-center gap-2">
                                ${f.f1_image_url ? `<img src="${escapeHtml(f.f1_image_url)}" class="w-7 h-7 rounded-full object-cover border border-white/10 flex-shrink-0" onerror="this.style.display='none'">` : ''}
                                <div class="min-w-0">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="oswald-sharp text-xs lg:text-base font-black italic text-white uppercase tracking-tighter truncate">${escapeHtml(f1Display(f))}</span>
                                        <span class="text-gray-700 text-[10px]">vs</span>
                                        <span class="oswald-sharp text-xs lg:text-base font-black italic text-white uppercase tracking-tighter truncate">${escapeHtml(f2Display(f))}</span>
                                    </div>
                                    ${!isUpcoming ? `<p class="oswald-sharp text-[8px] lg:text-[10px] text-gray-600 italic uppercase tracking-widest mt-0.5">R${f.round || '?'} ${f.fight_time || ''}</p>` : ''}
                                </div>
                                ${f.f2_image_url ? `<img src="${escapeHtml(f.f2_image_url)}" class="w-7 h-7 rounded-full object-cover border border-white/10 flex-shrink-0" onerror="this.style.display='none'">` : ''}
                            </div>
                        </div>
                        ${!isUpcoming && f.winner ? `
                        <div class="flex items-center gap-2 flex-shrink-0">
                            <div class="text-right">
                                <p class="oswald-sharp text-[9px] lg:text-xs font-black italic text-ufcRed uppercase">${escapeHtml(winnerDisplay(f))}</p>
                                <p class="oswald-sharp text-[7px] lg:text-[9px] text-gray-600 italic uppercase tracking-widest">WINNER</p>
                            </div>
                            <span class="oswald-sharp text-[8px] border ${METHOD_COLOR[f.method] || 'text-gray-400 border-gray-400/40 bg-gray-400/10'} px-2 py-1 rounded-lg font-black italic uppercase">${escapeHtml(f.method || '')}</span>
                        </div>` : ''}
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
    editingArchiveId = evId || null;
    archiveFightRowCount = 0;
    document.getElementById('archive-event-modal').classList.remove('hidden');
    document.getElementById('archive-fight-rows').innerHTML = '';

    if (evId) {
        const ev = archiveDB.find(e => e.id === evId);
        if (!ev) return;
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

    // Collect fight rows
    const fights = [];
    let sortOrder = 0;
    document.querySelectorAll('[id^="afr-"]:not([id*="-f1"]):not([id*="-f2"]):not([id*="-winner"]):not([id*="-method"]):not([id*="-round"]):not([id*="-tag"]):not([id*="-time"]):not([id*="-img"]):not([id*="-ko"])').forEach(row => {
        const idx = row.id.replace('afr-', '');
        const f1 = (document.getElementById(`afr-f1-${idx}`)?.value || '').trim();
        const f2 = (document.getElementById(`afr-f2-${idx}`)?.value || '').trim();
        if (f1 || f2) {
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
    try {
        const { data: existing } = await sb
            .from('archive_events')
            .select('id')
            .eq('name', title)
            .maybeSingle();

        if (!existing) {
            const { error } = await sb
                .from('archive_events')
                .insert({ name: title, event_date: dateStr || null, source_url: sourceUrl || null, status: 'upcoming' });
            if (error) console.warn('[approveToArchive] archive insert failed:', error.message);
        }
    } catch (e) {
        console.warn('[approveToArchive]', e);
    }
}
