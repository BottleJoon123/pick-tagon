/* ==============================
   ARCHIVE SYSTEM — Supabase 연동
   (localStorage → DB 전환)
   의존성: supabase.js (sb), utils.js (showToast, escapeHtml)
============================== */

var archiveDB = [];         // { id, name, event_date, venue, source_url, status, fights: [...] } — archive_events (admin CRUD source)
var archiveUpcomingDB = []; // display-only: live `events`(status=upcoming) mapped to archive shape (read-merge, no DB write)
var archiveFightRowCount = 0;
var editingArchiveId = null;
var _archiveFetching = false;   // in-flight guard
var _archiveRetryTimer = null;  // retry timer ref

var fighterArchiveDB = [];      // fighters table cache
var _fightersFetching = false;
var _ufcRankMap = {};           // normName → { divisionCode: rank }  (0=champion, P4P 포함)
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

// ── 라이브 events(upcoming) → archive 표시용 행 (read-only merge, DB write 없음) ──
async function _fetchUpcomingArchiveRows() {
    try {
        const { data: evs, error } = await sb
            .from('events')
            .select('id, title, event_date, venue, status')
            .eq('status', 'upcoming')
            .order('event_date', { ascending: true });
        if (error || !evs || !evs.length) return [];

        const ids = evs.map(e => e.id);
        const { data: mus } = await sb
            .from('matchups')
            .select('event_id, red_fighter_name, blue_fighter_name, red_image_url, blue_image_url, is_main_event, card_segment, sort_order')
            .in('event_id', ids)
            .order('sort_order', { ascending: true });

        const byEvent = {};
        (mus || []).forEach(m => { (byEvent[m.event_id] = byEvent[m.event_id] || []).push(m); });

        return evs.map(ev => {
            const fights = (byEvent[ev.id] || []).map((m, i) => ({
                f1_name: m.red_fighter_name || '',
                f2_name: m.blue_fighter_name || '',
                f1_name_ko: '', f2_name_ko: '',
                f1_image_url: m.red_image_url || '',
                f2_image_url: m.blue_image_url || '',
                tag: (m.is_main_event === true || (m.card_segment === 'main' && i === 0)) ? 'MAIN EVENT'
                     : (m.card_segment === 'main' ? 'MAIN CARD' : 'PRELIM'),
                winner: null, method: null, round: null, fight_time: null,
                sort_order: m.sort_order
            }));
            return {
                id: 'evt-' + ev.id,                 // 표시 전용 id (admin archive CRUD와 분리)
                name: ev.title || '',
                event_date: ev.event_date ? String(ev.event_date).slice(0, 10) : null,
                venue: ev.venue || '',
                status: 'upcoming',
                fights,
                _source: 'events'
            };
        });
    } catch (e) {
        console.warn('[_fetchUpcomingArchiveRows]', e);
        return [];
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
        // archive_events(수동/과거)와 라이브 events(upcoming)를 병렬 로드.
        // events→archive read-merge는 DB write 없이 "예정" 필터에 라이브 예정 이벤트를 노출하기 위함.
        const [evRes, upcomingRows] = await Promise.all([
            sb.from('archive_events').select('*').order('event_date', { ascending: false }),
            _fetchUpcomingArchiveRows()   // never throws — returns [] on failure
        ]);
        archiveUpcomingDB = upcomingRows || [];

        const { data: events, error: evErr } = evRes;

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

    // archive_events(과거/수동) + 라이브 events(upcoming) 병합 표시.
    // 같은 이름이 양쪽에 있으면 archive_events(수동/결과 보유)를 우선(중복 제거).
    const _upcoming = (typeof archiveUpcomingDB !== 'undefined' ? archiveUpcomingDB : []);
    const _archiveNames = new Set(archiveDB.map(e => (e.name || '').toLowerCase().trim()));
    const _combined = archiveDB.concat(
        _upcoming.filter(e => !_archiveNames.has((e.name || '').toLowerCase().trim()))
    );

    let filtered = _combined.filter(ev => {
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
                ${!isUpcoming ? `<div data-archive-recap="${escapeHtml(ev.name || '')}" data-recap-date="${escapeHtml((ev.event_date || '').slice(0, 10))}" data-recap-evid="${escapeHtml(String(ev.id))}" class="archive-myrecap hidden"></div>` : ''}
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

    // 내 픽 결과 리캡: 방금 생성된 placeholder를 현재 상태로 채우고, 로그인 시 지연 로드.
    renderArchiveRecapSections();
    ensureArchiveRecapLoaded();
}

function toggleArchiveDetail(evId) {
    const panel = document.getElementById(`archive-detail-${evId}`);
    const label = document.getElementById(`archive-toggle-label-${evId}`);
    if (!panel || !label) return;
    const isHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    const ev = archiveDB.find(e => e.id === evId)
        || (typeof archiveUpcomingDB !== 'undefined' ? archiveUpcomingDB.find(e => e.id === evId) : null);
    const isUpcoming = ev?.status === 'upcoming';
    label.textContent = isHidden ? `▲ 접기` : `▼ ${isUpcoming ? '대진표 보기' : '결과 보기'}`;
    // 상세를 펼칠 때(TTL 만료 시) 리캡 재검증 — 기존 리캡은 유지하고 성공 응답만 교체.
    if (isHidden && typeof ensureArchiveRecapLoaded === 'function') ensureArchiveRecapLoaded();
}

// ══════════════════════════════════════════════════════════════════════
//  내 픽 결과 리캡 (로그인 사용자, read-only) — 1차 보강
//
//  데이터 원천(모두 기존 안전 read 경로):
//    picks(matchup_id, status, pick_name, bet_cost, settled_payout)
//      ⨝ matchups(event_id, result_winner, result_status, sort_order)
//      ⨝ events(id, title, event_date, record_scope) — events는 전체 조회.
//  RLS picks_select_own(auth.uid()=user_id) → 본인 픽만(비로그인 0행). user_id는 UI 미노출.
//
//  매핑(아카이브 카드 ↔ 캐노니컬 이벤트): 정규화제목 + event_date(YYYY-MM-DD) 복합키.
//    동일 복합키 2개+ → ambiguous(리캡 숨김). 0개 → unmapped(숨김; '픽 없음' 표기 금지).
//    1개 → 해당 event_id 집계(없으면 '매핑됨·내 픽 없음'). 집계 캐시는 event_id 기준 저장.
//
//  순손익(추측 금지): place_pick -bet_cost, settle win +settled_payout, lose 0, cancelled(draw/nc) 환급.
//    픽당 = cancelled ? 0 : (settled_payout - bet_cost), 단 win/lose는 bet_cost·settled_payout이
//    모두 유효 finite 일 때만. 한 경기라도 계산 불가면 그 경기 손익 숨김 + 이벤트 합계 '손익 —'.
//    NULL/비정상을 0으로 강제하지 않음. 승패/취소 집계는 손익 계산 가능 여부와 분리.
//  레거시: matchup_id=NULL 픽은 추측 연결하지 않고 제외(내부 카운트만, UI 미노출).
//  대용량: picks·events는 range pagination 전수 조회, matchups는 .in() 100개 chunk.
//    (N+1 아님 — 쿼리 수가 데이터 크기에 비례하는 제한된 batch로만 증가.)
//  record_scope(공식/판타지)는 배지로만 표기, 승패/손익 계산에 미사용.
// ══════════════════════════════════════════════════════════════════════
var _recapByEvent = {};       // event_id → { eventId, scope, win, lose, cancel, netSum, netComputable, fights:[] }
var _eventByKey = {};         // normTitle|date → [event_id, ...] (복합키 → 이벤트; 모호 판정용)
var _eventScope = {};         // event_id → record_scope
var _recapLegacyExcluded = 0; // matchup_id=NULL 등 제외된 픽 수 (내부 집계, UI 미노출)
var _recapUserId = null;
var _recapGen = 0;
var _recapInflight = null;
var _recapLoadedFor = null;
var _recapLoadedAt = 0;       // 성공 로드 시각(ms) — TTL revalidation 기준
var _RECAP_TTL_MS = 60000;    // 캐시 신선도 TTL 60초

function _recapNorm(s) { return (s || '').toLowerCase().trim().replace(/\s+/g, ' '); }
function _recapDateKey(d) { return (d == null ? '' : String(d)).slice(0, 10); }
function _recapKey(title, date) { return _recapNorm(title) + '|' + _recapDateKey(date); }
function _recapUid() { return (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null; }
function _recapFinite(n) { return typeof n === 'number' && isFinite(n); }

// 로그인/로그아웃/계정 전환/정산 성공 시 호출 — 캐시·진행 중 응답 무효화 후 재렌더(+필요 시 재로드).
function invalidateArchiveRecap() {
    _recapGen++;
    _recapByEvent = {}; _eventByKey = {}; _eventScope = {}; _recapLegacyExcluded = 0;
    _recapInflight = null; _recapLoadedFor = null; _recapUserId = null; _recapLoadedAt = 0;
    renderArchiveRecapSections();   // 즉시 화면 정리(비로그인/전환 직후 이전 계정 리캡 제거)
    // 아카이브가 현재 렌더되어 있을 때만 즉시 재로드(페이지 로드/세션 복원 시 불필요한 선요청 방지).
    if (document.querySelector('[data-archive-recap]')) ensureArchiveRecapLoaded();
}
if (typeof window !== 'undefined') window.invalidateArchiveRecap = invalidateArchiveRecap;

// 캐시가 TTL 이내면 즉시 재사용. 만료(stale)면 기존 리캡을 유지한 채 재검증(성공 응답만 새 캐시로 교체).
function ensureArchiveRecapLoaded() {
    var uid = _recapUid();
    if (!uid) return;                                   // 비로그인 → 로드 안 함(섹션 숨김)
    var fresh = (_recapLoadedFor === uid) && ((Date.now() - _recapLoadedAt) < _RECAP_TTL_MS);
    renderArchiveRecapSections();                       // 보유 캐시 즉시 표시(미로드면 숨김, stale면 기존 유지)
    if (fresh) return;                                  // 신선 → 재조회 불필요
    if (_recapInflight && _recapUserId === uid) return; // 이미 (재)검증 중 → 공유(중복 요청 방지)
    _loadArchiveRecap(uid);                             // 미로드 또는 TTL 만료 → (재)조회
}

// range 기반 전수 조회 — 단일 기본 limit 의존 금지(오래된 데이터 조용한 누락 방지).
async function _recapFetchAllPaged(makeQuery) {
    var PAGE = 1000, from = 0, all = [];
    for (;;) {
        var r = await makeQuery(from, from + PAGE - 1);
        if (r.error) return null;
        var rows = r.data || [];
        all = all.concat(rows);
        if (rows.length < PAGE) break;
        from += PAGE;
    }
    return all;
}

// matchup id .in() 100개 chunk 조회 — 큰 id 목록에서도 누락 없이 전수.
async function _recapFetchMatchupsChunked(ids) {
    var CHUNK = 100, out = [];
    for (var i = 0; i < ids.length; i += CHUNK) {
        var slice = ids.slice(i, i + CHUNK);
        var r = await sb.from('matchups')
            .select('id, event_id, result_winner, result_status, sort_order')
            .in('id', slice);
        if (r.error) return null;
        out = out.concat(r.data || []);
    }
    return out;
}

async function _loadArchiveRecap(uid) {
    if (!sb) return;
    var myGen = _recapGen;
    _recapUserId = uid;
    var p = (async function () {
        try {
            // 1) 전체 events → 복합키 인덱스(매핑 가능·모호 판정) + scope. (픽 유무와 무관하게 먼저 확정.)
            var events = await _recapFetchAllPaged(function (a, b) {
                return sb.from('events')
                    .select('id, title, event_date, record_scope')
                    .order('id', { ascending: true }).range(a, b);
            });
            if (events === null) return null;
            var byKey = {}, scope = {};
            events.forEach(function (e) {
                (byKey[_recapKey(e.title, e.event_date)] = byKey[_recapKey(e.title, e.event_date)] || []).push(e.id);
                scope[e.id] = e.record_scope || null;
            });
            // 2) 본인 settled picks 전수(pagination).
            var picksRaw = await _recapFetchAllPaged(function (a, b) {
                return sb.from('picks')
                    .select('matchup_id, pick_name, status, bet_cost, settled_payout')
                    .eq('user_id', uid).in('status', ['win', 'lose', 'cancelled'])
                    .order('id', { ascending: true }).range(a, b);
            });
            if (picksRaw === null) return null;
            // 3) 레거시 제외: matchup_id 없는 픽은 추측 연결하지 않고 제외(카운트만).
            var legacy = 0;
            var picks = picksRaw.filter(function (x) { if (!x.matchup_id) { legacy++; return false; } return true; });
            var byEvent = {};
            if (picks.length) {
                var mids = Array.from(new Set(picks.map(function (x) { return x.matchup_id; })));
                var matchups = await _recapFetchMatchupsChunked(mids);
                if (matchups === null) return null;
                var mById = {}; matchups.forEach(function (m) { mById[m.id] = m; });
                picks.forEach(function (x) {
                    var m = mById[x.matchup_id]; if (!m || !m.event_id) return;
                    var eid = m.event_id;
                    var rec = byEvent[eid] || (byEvent[eid] = {
                        eventId: eid, scope: scope[eid] || null,
                        win: 0, lose: 0, cancel: 0, netSum: 0, netComputable: true, fights: []
                    });
                    if (x.status === 'win') rec.win++;
                    else if (x.status === 'lose') rec.lose++;
                    else rec.cancel++;
                    // 손익: cancelled=0 확정. win/lose는 bet_cost·settled_payout 모두 유효 finite 일 때만 계산.
                    var fnet = null;
                    if (x.status === 'cancelled') fnet = 0;
                    else if (_recapFinite(x.bet_cost) && _recapFinite(x.settled_payout)) fnet = x.settled_payout - x.bet_cost;
                    if (fnet === null) rec.netComputable = false; else rec.netSum += fnet;
                    rec.fights.push({
                        pick: x.pick_name || '', actualWinner: m.result_winner || null,
                        resultStatus: m.result_status || null, status: x.status,
                        net: fnet, sort: (m.sort_order == null ? 999 : m.sort_order)
                    });
                });
                Object.keys(byEvent).forEach(function (eid) {
                    byEvent[eid].fights.sort(function (a, b) { return a.sort - b.sort; });
                });
            }
            return { byEvent: byEvent, byKey: byKey, scope: scope, legacy: legacy };
        } catch (e) { return null; }
    })();
    _recapInflight = p;
    var result = await p;
    // 늦은 응답/세대/계정 가드 — 무효화됐거나 사용자가 바뀌면 적용하지 않음(UI 오염 방지).
    if (myGen !== _recapGen) return;
    if (_recapUid() !== uid) return;
    if (_recapInflight === p) _recapInflight = null;
    if (result === null) return;                 // 실패 → 기존 캐시 유지(지우지 않음), 다음 동작에서 재시도
    _recapByEvent = result.byEvent;
    _eventByKey = result.byKey;
    _eventScope = result.scope;
    _recapLegacyExcluded = result.legacy;
    _recapLoadedFor = uid;
    _recapLoadedAt = Date.now();                  // 성공 로드 시각 기록(TTL 기준)
    renderArchiveRecapSections();
}

// 모든 리캡 placeholder를 현재 캐시/로그인 상태로 채운다. 카드(제목+날짜) → 복합키 → event_id 해석.
function renderArchiveRecapSections() {
    var uid = _recapUid();
    var loaded = (uid && _recapLoadedFor === uid);
    var nodes = document.querySelectorAll('[data-archive-recap]');
    for (var i = 0; i < nodes.length; i++) {
        var ph = nodes[i];
        if (!uid || !loaded) { ph.innerHTML = ''; ph.classList.add('hidden'); ph.removeAttribute('data-recap-state'); continue; }
        var name = ph.getAttribute('data-archive-recap');
        var date = ph.getAttribute('data-recap-date') || '';
        var evId = ph.getAttribute('data-recap-evid');
        var ids = _eventByKey[_recapKey(name, date)];
        var state, rec = null;
        if (!ids || ids.length === 0) state = 'unmapped';        // 캐노니컬 이벤트 미매핑
        else if (ids.length > 1) state = 'ambiguous';           // 복합키 충돌 → 모호
        else { rec = _recapByEvent[ids[0]] || null; state = rec ? 'ok' : 'nopicks'; }
        ph.setAttribute('data-recap-state', state);             // QA/디버그용(식별정보 없음)
        // 매핑 실패/모호는 숨김('등록한 픽이 없습니다'로 오표기 금지). 매핑됨·픽없음만 empty state.
        if (state === 'unmapped' || state === 'ambiguous') { ph.innerHTML = ''; ph.classList.add('hidden'); continue; }
        ph.innerHTML = _recapSectionHtml(rec, evId, state);
        ph.classList.remove('hidden');
    }
}

function _recapScopeBadge(scope) {
    if (scope === 'fantasy') return '<span class="oswald-sharp text-[7px] bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-300 px-1.5 py-0.5 rounded italic uppercase">판타지</span>';
    if (scope === 'official') return '<span class="oswald-sharp text-[7px] bg-sky-500/10 border border-sky-500/30 text-sky-300 px-1.5 py-0.5 rounded italic uppercase">공식</span>';
    if (scope === 'exhibition') return '<span class="oswald-sharp text-[7px] bg-amber-500/10 border border-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded italic uppercase">시범경기</span>';
    return '';
}

function _recapSectionHtml(rec, evId, state) {
    // 매핑 성공 + 본인 픽 0건: compact empty state (매핑 실패/모호와 구분 — 이쪽만 '픽 없음' 표기).
    if (state === 'nopicks' || !rec) {
        return `<div class="px-4 lg:px-6 py-2.5 bg-black/20 border-b border-white/5">
            <p class="oswald-sharp text-[10px] text-gray-600 italic uppercase tracking-widest">내 픽 결과 · 이 이벤트에 등록한 픽이 없습니다</p>
        </div>`;
    }
    var settled = rec.win + rec.lose;
    var accStr = settled > 0 ? Math.round(rec.win / settled * 100) + '%' : '—';
    // 손익 합계: 모든 win/lose 계산 가능할 때만 숫자, 하나라도 불가면 '—'(추측 금지).
    var netStr = rec.netComputable ? ((rec.netSum > 0 ? '+' : '') + rec.netSum + 'P') : '—';
    var netColor = !rec.netComputable ? 'text-gray-400' : (rec.netSum > 0 ? 'text-green-400' : (rec.netSum < 0 ? 'text-ufcRed' : 'text-gray-400'));
    var rows = rec.fights.map(function (f) {
        var stLabel = f.status === 'win' ? '적중' : (f.status === 'lose' ? '실패' : '취소');
        var stColor = f.status === 'win' ? 'text-green-400 border-green-400/40 bg-green-400/10'
                    : f.status === 'lose' ? 'text-ufcRed border-ufcRed/40 bg-ufcRed/10'
                    : 'text-gray-400 border-gray-500/40 bg-gray-500/10';
        var actual = f.actualWinner ? ('승자 ' + escapeHtml(f.actualWinner))
                   : (f.resultStatus === 'draw' ? '무승부' : (f.resultStatus === 'no_contest' ? 'NC' : '—'));
        // 경기별 손익: cancelled 또는 계산 불가면 표시하지 않음(0으로 강제하지 않음).
        var hasNet = (f.status !== 'cancelled') && _recapFinite(f.net);
        var fnet = hasNet ? ((f.net > 0 ? '+' : '') + f.net + 'P') : '';
        var fnetColor = !hasNet ? 'text-gray-500' : (f.net > 0 ? 'text-green-400' : (f.net < 0 ? 'text-ufcRed' : 'text-gray-500'));
        return `<div class="flex items-center gap-2 py-1 min-w-0">
            <span class="oswald-sharp text-[8px] border ${stColor} px-1.5 py-0.5 rounded font-black italic uppercase flex-shrink-0 w-9 text-center">${stLabel}</span>
            <span class="oswald-sharp text-[10px] text-white italic uppercase tracking-tight truncate flex-1 min-w-0">${escapeHtml(f.pick)}</span>
            <span class="oswald-sharp text-[9px] text-gray-500 italic uppercase tracking-tight truncate flex-1 min-w-0">${actual}</span>
            <span class="oswald-sharp text-[9px] font-black italic ${fnetColor} flex-shrink-0 w-12 text-right">${fnet}</span>
        </div>`;
    }).join('');
    return `<div class="px-4 lg:px-6 py-2.5 bg-black/20 border-b border-white/5">
        <!-- 요약 (항상 표시) -->
        <div class="flex items-center gap-2 flex-wrap">
            <span class="oswald-sharp text-[10px] font-black italic text-white uppercase tracking-widest">내 픽 결과</span>
            ${_recapScopeBadge(rec.scope)}
            <span class="oswald-sharp text-[9px] text-green-400 font-black italic uppercase">적중 ${rec.win}</span>
            <span class="oswald-sharp text-[9px] text-ufcRed font-black italic uppercase">실패 ${rec.lose}</span>
            ${rec.cancel > 0 ? `<span class="oswald-sharp text-[9px] text-gray-500 font-black italic uppercase">취소 ${rec.cancel}</span>` : ''}
            <span class="oswald-sharp text-[9px] text-gray-400 font-black italic uppercase">적중률 ${accStr}</span>
            <span class="oswald-sharp text-[9px] ${netColor} font-black italic uppercase">손익 ${netStr}</span>
            <button onclick="toggleArchiveRecapDetail('${escapeHtml(String(evId))}')" id="archive-myrecap-btn-${escapeHtml(String(evId))}"
                class="oswald-sharp text-[8px] border border-white/10 text-gray-500 hover:text-white px-2 py-0.5 rounded italic uppercase tracking-widest transition ml-auto flex-shrink-0">▼ ${rec.fights.length}경기</button>
        </div>
        <!-- 경기별 상세 (펼치기) -->
        <div id="archive-myrecap-rows-${escapeHtml(String(evId))}" class="hidden mt-1.5 divide-y divide-white/5">${rows}</div>
    </div>`;
}

function toggleArchiveRecapDetail(evId) {
    var rows = document.getElementById('archive-myrecap-rows-' + evId);
    var btn = document.getElementById('archive-myrecap-btn-' + evId);
    if (!rows) return;
    var isHidden = rows.classList.contains('hidden');
    rows.classList.toggle('hidden');
    if (btn) btn.textContent = isHidden ? '▲ 접기' : ('▼ ' + rows.children.length + '경기');
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
    catchweight: '캐치웨이트',
};

// fighters.division 코드 → ufc_rankings.division 코드 (여성 체급 표기 차이 보정)
const _F2R_DIV = { hw:'hw', lhw:'lhw', mw:'mw', ww:'ww', lw:'lw', fw:'fw', bw:'bw', flw:'flw', wbw:'w-bw', wfw:'w-flw', wmw:'w-sw' };

// 현재 체급(fighters.division)에 한해서만 공식 순위 반환. 교차체급/비랭크면 null.
// 이름은 exact normalized(name_en 우선)만 사용 — last-word 부분매칭 금지(동성이인 오염 방지).
// fighters.rank 단일값은 사용하지 않음(체급 정보가 없어 잘못된 "체급 #N"을 만든다).
function _getDivisionRank(f) {
    const key = (f.name_en || f.name || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const rows = _ufcRankMap[key];
    if (!rows) return null;
    const rdiv = _F2R_DIV[f.division];
    if (!rdiv) return null;
    return (rdiv in rows) ? rows[rdiv] : null;
}

// Maps a DB fighters row → openFighterProfile() expected shape.
// 랭크는 프로필 모달에서 ufc_rankings(division+rank_position) 기준으로 재계산하므로
// 여기서 잘못된 fighters.rank를 넣지 않는다(rank: null). 합성 stats fallback도 주입하지 않는다.
function _buildFighterForProfile(f) {
    const record = (f.wins || f.losses || f.draws)
        ? `${f.wins || 0}-${f.losses || 0}${f.draws ? '-' + f.draws : ''}`
        : null;
    const divLabel  = DIVISION_LABEL[f.division] || (f.division || '').toUpperCase();
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
        rank: null,           // 프로필 모달이 ufc_rankings로 재계산
        division: divLabel,
        style: f.style,
        stats: Array.isArray(f.stats) ? f.stats : null,  // 유효치 없으면 null → 레이더 empty state
        image_url: f.image_url || null,
        nickname: f.nickname || null,
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
              .select('id, name, name_en, division, wins, losses, draws, rank, height, reach, height_cm, weight_kg, reach_cm, ko_rate, sub_rate, dec_rate, stats, image_url, style, nickname')
              .order('division', { ascending: true })
              .order('rank', { ascending: true, nullsFirst: false })
              .limit(5000),
            sb.from('ufc_rankings').select('division, fighter_name, rank_position')
        ]);

        if (fightersRes.error) throw fightersRes.error;

        // ufc_rankings → 이름키 division-scoped 맵: { normName: { divisionCode: rankInt|0 } }
        // exact normalized 이름만 사용. 카드/프로필 모두 체급을 함께 판정한다.
        _ufcRankMap = {};
        (rankingsRes.data || []).forEach(row => {
            const key = (row.fighter_name || '').toLowerCase().trim().replace(/\s+/g, ' ');
            if (!key) return;
            const rv = String(row.rank_position).toUpperCase() === 'C'
                ? 0
                : parseInt(String(row.rank_position).replace(/[^0-9]/g, ''), 10);
            if (isNaN(rv)) return;
            (_ufcRankMap[key] = _ufcRankMap[key] || {})[row.division] = rv;
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
        // 카드 배지는 현재 체급에서 랭크된 경우만 표시(교차체급/비랭크면 '—'). fighters.rank 미사용.
        const rv2 = _getDivisionRank(f);
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
