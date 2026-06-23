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
    const isEvents = (tab === 'events');

    evPanel?.classList.toggle('hidden', !isEvents);
    ftPanel?.classList.toggle('hidden', isEvents);
    evBtn?.classList.toggle('is-active', isEvents);
    ftBtn?.classList.toggle('is-active', !isEvents);

    try { localStorage.setItem('arch_tab', tab); } catch (e) { /* storage 비활성 무시 */ }

    if (isEvents) {
        if (archiveDB.length === 0) fetchArchive(); else renderArchive();
    } else {
        if (fighterArchiveDB.length === 0) fetchFighterArchive(); else renderFighterArchive();
    }
}

// 저장된 탭 복원(있을 때만). 최초 아카이브 진입 시 호출되며, 없으면 기본 'events' 유지.
function restoreArchiveTab() {
    var saved = null;
    try { saved = localStorage.getItem('arch_tab'); } catch (e) { saved = null; }
    if (saved === 'fighters') switchArchiveTab('fighters');
}
if (typeof window !== 'undefined') window.restoreArchiveTab = restoreArchiveTab;

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
var _ARC_PAGE = 6;
var _arcLimit = _ARC_PAGE;

var _ARC_METHOD_COLOR = {
    'KO/TKO': 'text-ufcRed border-ufcRed/40 bg-ufcRed/10',
    'SUB':    'text-purple-400 border-purple-400/40 bg-purple-400/10',
    'UD':     'text-blue-400 border-blue-400/40 bg-blue-400/10',
    'SD':     'text-yellow-400 border-yellow-400/40 bg-yellow-400/10',
    'MD':     'text-orange-400 border-orange-400/40 bg-orange-400/10',
    'DQ':     'text-gray-400 border-gray-400/40 bg-gray-400/10',
    'NC':     'text-gray-500 border-gray-500/40 bg-gray-500/10',
};

// 카드 세그먼트(메인/코메인/프렐림) 칩 — DB 저장값(tag)만 사용, 합성/가짜 데이터 없음.
//  archive_fights.tag: 'MAIN EVENT'/'CO-MAIN EVENT'/'FEATURED'/'PRELIMS'/'SPECIAL'
//  live matchups 매핑(_fetchUpcomingArchiveRows): 'MAIN EVENT'/'MAIN CARD'/'PRELIM'
function _arcSegMeta(tag) {
    var t = (tag == null ? '' : String(tag)).toUpperCase().trim();
    if (!t) return null;
    if (t.indexOf('CO-MAIN') === 0 || t.indexOf('CO MAIN') === 0) return { label: 'CO-MAIN', cls: 'arc-seg-co' };
    if (t.indexOf('MAIN EVENT') === 0 || t === 'MAIN')            return { label: 'MAIN', cls: 'arc-seg-main' };
    if (t.indexOf('PRELIM') === 0)                                return { label: 'PRELIM', cls: 'arc-seg-prelim' };
    if (t.indexOf('MAIN CARD') === 0)                             return { label: 'MAIN CARD', cls: 'arc-seg-card' };
    return { label: t, cls: 'arc-seg-other' };   // FEATURED / SPECIAL 등 — 원문 유지
}

// 승자 측 판정(영문 winner ↔ 영문 f1/f2_name 정규화 비교). 0=미정/무승부, 1=f1, 2=f2.
function _arcWinSide(f) {
    if (!f || !f.winner) return 0;
    var w = String(f.winner).toLowerCase().trim();
    if (f.f1_name && w === String(f.f1_name).toLowerCase().trim()) return 1;
    if (f.f2_name && w === String(f.f2_name).toLowerCase().trim()) return 2;
    return 0;
}

// archive_events(결과 보유) 우선 + 라이브 upcoming read-merge(중복 이름 제거). 기존 병합 규칙 유지.
function _arcCombinedEvents() {
    var up = (typeof archiveUpcomingDB !== 'undefined' ? archiveUpcomingDB : []);
    var names = new Set(archiveDB.map(function (e) { return (e.name || '').toLowerCase().trim(); }));
    return archiveDB.concat(up.filter(function (e) { return !names.has((e.name || '').toLowerCase().trim()); }));
}

// 카드 ↔ 캐노니컬 이벤트 매핑(행 칩·드로어 공용). source_event_id 최우선, 없으면 정규화제목+날짜 복합키.
// state: ok(픽 있음)/nopicks(매핑됨·픽 0)/unmapped/ambiguous/loading. 추측 연결 금지(기존 규칙 보존).
function _resolveEventRecap(name, date, srcEid) {
    var uid = _recapUid();
    if (!uid || _recapLoadedFor !== uid) return { state: 'loading', rec: null };
    if (srcEid) {
        if (Object.prototype.hasOwnProperty.call(_eventScope, srcEid)) {
            var r = _recapByEvent[srcEid] || null;
            return { state: r ? 'ok' : 'nopicks', rec: r };
        }
        return { state: 'unmapped', rec: null };
    }
    var ids = _eventByKey[_recapKey(name, date)];
    if (!ids || ids.length === 0) return { state: 'unmapped', rec: null };
    if (ids.length > 1) return { state: 'ambiguous', rec: null };
    var r2 = _recapByEvent[ids[0]] || null;
    return { state: r2 ? 'ok' : 'nopicks', rec: r2 };
}

function _arcDateLabel(d) {
    if (!d) return '날짜 미상';
    var dt = new Date(d + 'T00:00:00');
    if (isNaN(dt.getTime())) return '날짜 미상';
    return dt.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}
function _arcPosterNum(name) {
    var m = (name || '').match(/UFC\s*(\d{2,4})/i);
    if (m) return m[1];
    if (/fight\s*night/i.test(name || '')) return 'FN';
    return ((name || '?').replace(/[^0-9A-Za-z]/g, '').slice(0, 3).toUpperCase()) || '?';
}
function _arcMainFight(ev) {
    return (ev.fights || []).find(function (f) { return f.tag === 'MAIN EVENT'; }) || (ev.fights || [])[0] || null;
}
function _arcF1(f) { return f ? (f.f1_name_ko || f.f1_name || '') : ''; }
function _arcF2(f) { return f ? (f.f2_name_ko || f.f2_name || '') : ''; }
function _arcWinnerName(f) {
    if (!f || !f.winner) return '';
    if (f.winner === f.f1_name && f.f1_name_ko) return f.f1_name_ko;
    if (f.winner === f.f2_name && f.f2_name_ko) return f.f2_name_ko;
    return f.winner;
}

// 필터 변경(검색/연도/상태/참여/정렬) → 페이지 리셋 후 렌더.
function archiveFilterChanged() { _arcLimit = _ARC_PAGE; renderArchive(); }
function archiveLoadMore() { _arcLimit += _ARC_PAGE; renderArchive(); }
if (typeof window !== 'undefined') { window.archiveFilterChanged = archiveFilterChanged; window.archiveLoadMore = archiveLoadMore; }

// <select> 내 특정 옵션 disable 토글(비로그인 시 recap 의존 정렬 옵션 잠금용).
function _arcSetOptDisabled(sel, val, disabled) {
    if (!sel || typeof sel.querySelector !== 'function') return;
    var opt = sel.querySelector('option[value="' + val + '"]');
    if (opt) opt.disabled = !!disabled;
}

function renderArchive() {
    var list = document.getElementById('archive-list');
    if (!list) return;
    var empty = document.getElementById('archive-empty');
    renderArchiveRecapBand();

    var query = ((document.getElementById('archive-search') || {}).value || '').toLowerCase().trim();
    var yearFilter = (document.getElementById('archive-filter') || {}).value || 'all';
    var statusFilter = (document.getElementById('archive-status-filter') || {}).value || 'all';
    var joinedSel = document.getElementById('archive-joined-filter');
    var sortSel = document.getElementById('archive-sort');

    var uid = _recapUid();
    var recapReady = !!(uid && _recapLoadedFor === uid);

    // 비로그인: recap 의존 컨트롤 잠금 — 참여 필터 all 리셋+disable, 정렬 accuracy/net 옵션 disable+값 리셋.
    if (joinedSel) {
        joinedSel.disabled = !uid;
        if (!uid) joinedSel.value = 'all';
    }
    if (sortSel) {
        _arcSetOptDisabled(sortSel, 'accuracy', !uid);
        _arcSetOptDisabled(sortSel, 'net', !uid);
        if (!uid && (sortSel.value === 'accuracy' || sortSel.value === 'net')) sortSel.value = 'recent';
    }

    var joinedFilter = (joinedSel || {}).value || 'all';
    var sortMode = (sortSel || {}).value || 'recent';
    // 로그인했으나 recap 미로드: 참여/accuracy/net 은 로딩 중 오표시 방지 위해 최신순/무필터로 안전 fallback.
    // (사용자 선택값 자체는 보존 — 로드 완료 후 재렌더에서 정상 적용.)
    if (!recapReady && (sortMode === 'accuracy' || sortMode === 'net')) sortMode = 'recent';
    if (!recapReady && (joinedFilter === 'joined' || joinedFilter === 'none')) joinedFilter = 'all';

    var combined = _arcCombinedEvents();
    var evCt = document.getElementById('archive-tab-events-ct');
    if (evCt) evCt.textContent = combined.length;

    function fighterHay(ev) {
        return (ev.fights || []).map(function (f) {
            return [f.f1_name, f.f2_name, f.f1_name_ko, f.f2_name_ko].join(' ');
        }).join(' ').toLowerCase();
    }
    function recOf(ev) { return _resolveEventRecap(ev.name, ev.event_date, ev.source_event_id).rec; }

    var filtered = combined.filter(function (ev) {
        var nameMatch = !query
            || (ev.name || '').toLowerCase().indexOf(query) >= 0
            || (ev.venue || '').toLowerCase().indexOf(query) >= 0
            || fighterHay(ev).indexOf(query) >= 0;
        var yearMatch = yearFilter === 'all' || (ev.event_date || '').slice(0, 4) === yearFilter;
        var statusMatch = statusFilter === 'all' || ev.status === statusFilter;
        var joinMatch = true;
        if (joinedFilter === 'joined' || joinedFilter === 'none') {
            var st = _resolveEventRecap(ev.name, ev.event_date, ev.source_event_id).state;
            joinMatch = (joinedFilter === 'joined') ? (st === 'ok') : (st === 'nopicks');
        }
        return nameMatch && yearMatch && statusMatch && joinMatch;
    });

    if (sortMode === 'accuracy') {
        filtered.sort(function (a, b) {
            var ra = recOf(a), rb = recOf(b);
            var aa = (ra && (ra.win + ra.lose) > 0) ? ra.win / (ra.win + ra.lose) : -1;
            var ab = (rb && (rb.win + rb.lose) > 0) ? rb.win / (rb.win + rb.lose) : -1;
            if (ab !== aa) return ab - aa;
            return (b.event_date || '').localeCompare(a.event_date || '');
        });
    } else if (sortMode === 'net') {
        filtered.sort(function (a, b) {
            var ra = recOf(a), rb = recOf(b);
            var na = (ra && ra.netComputable) ? ra.netSum : -Infinity;
            var nb = (rb && rb.netComputable) ? rb.netSum : -Infinity;
            if (nb !== na) return nb - na;
            return (b.event_date || '').localeCompare(a.event_date || '');
        });
    } else {
        filtered.sort(function (a, b) { return (b.event_date || '').localeCompare(a.event_date || ''); });
    }

    var lmWrap = document.getElementById('archive-loadmore-wrap');
    if (filtered.length === 0) {
        list.innerHTML = '';
        if (lmWrap) lmWrap.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        ensureArchiveRecapLoaded();
        return;
    }
    if (empty) empty.classList.add('hidden');

    var shown = filtered.slice(0, _arcLimit);
    list.innerHTML = shown.map(_arcEventRowHtml).join('');
    if (lmWrap) {
        lmWrap.innerHTML = (filtered.length > _arcLimit)
            ? '<button type="button" class="arc-loadmore" onclick="archiveLoadMore()">더 불러오기 <span class="arc-loadmore-ct">+' + Math.min(_ARC_PAGE, filtered.length - _arcLimit) + '</span></button>'
            : '';
    }

    ensureArchiveRecapLoaded();
}

function _arcEventRowHtml(ev) {
    var isUpcoming = ev.status === 'upcoming';
    var mf = _arcMainFight(ev);
    var dateLabel = _arcDateLabel(ev.event_date);
    var num = (ev.name || '').replace(/^UFC\s*/i, '').trim() || (ev.name || '');
    var rr = _resolveEventRecap(ev.name, ev.event_date, ev.source_event_id);

    var resultHtml;
    if (isUpcoming) {
        resultHtml = '<span class="arc-chip arc-chip-next">예정</span>';
    } else if (rr.state === 'ok' && rr.rec) {
        var rec = rr.rec, settled = rec.win + rec.lose;
        var acc = settled > 0 ? Math.round(rec.win / settled * 100) : null;
        var chipCls = (acc != null && acc >= 60) ? 'arc-chip-hit' : 'arc-chip-mid';
        var netStr = rec.netComputable ? ((rec.netSum > 0 ? '+' : '') + rec.netSum + 'P') : '—';
        var netCls = !rec.netComputable ? 'arc-net-flat' : (rec.netSum > 0 ? 'arc-net-pos' : (rec.netSum < 0 ? 'arc-net-neg' : 'arc-net-flat'));
        resultHtml = '<span class="arc-chip ' + chipCls + '">' + rec.win + '/' + settled + ' 적중'
            + (acc != null ? ' · ' + acc + '%' : '') + '</span><span class="arc-net ' + netCls + '">' + netStr + '</span>';
    } else if (rr.state === 'nopicks') {
        resultHtml = '<span class="arc-chip arc-chip-none">미참여</span>';
    } else {
        resultHtml = '<span class="arc-chip arc-chip-result">결과만</span>';
    }

    var finishHtml;
    if (!isUpcoming && mf && mf.winner) {
        finishHtml = escapeHtml(_arcWinnerName(mf)) + ' 승' + (mf.method ? ' · ' + escapeHtml(mf.method) : '') + (mf.round ? ' · R' + mf.round : '');
    } else if (isUpcoming) {
        finishHtml = (ev.fights || []).length + '경기 예정';
    } else {
        finishHtml = '';
    }

    var matchup = mf
        ? '<span class="arc-mu-name">' + escapeHtml(_arcF1(mf)) + '</span><span class="arc-mu-vs">VS</span><span class="arc-mu-name">' + escapeHtml(_arcF2(mf)) + '</span>'
        : '<span class="arc-mu-name">' + escapeHtml(ev.name || '') + '</span>';

    return '<button type="button" class="arc-evrow' + (isUpcoming ? ' arc-evrow-next' : '') + '" onclick="openArchiveDetailModal(\'' + escapeHtml(String(ev.id)) + '\')">'
        + '<span class="arc-poster' + (isUpcoming ? ' arc-poster-next' : '') + '"><span class="arc-poster-ufc">UFC</span><span class="arc-poster-num">' + escapeHtml(isUpcoming ? 'NEXT' : _arcPosterNum(ev.name)) + '</span></span>'
        + '<span class="arc-evmain">'
            + '<span class="arc-evmeta"><span class="arc-numchip">' + escapeHtml(num) + '</span><span class="arc-evdate">' + escapeHtml(dateLabel) + '</span>'
                + (ev.venue ? '<span class="arc-evvenue">' + escapeHtml(ev.venue) + '</span>' : '') + '</span>'
            + '<span class="arc-mu">' + matchup + '</span>'
            + (finishHtml ? '<span class="arc-evfinish' + (isUpcoming ? ' arc-evfinish-next' : '') + '">' + finishHtml + '</span>' : '')
        + '</span>'
        + '<span class="arc-evresult">' + resultHtml + '<span class="arc-chev" aria-hidden="true">›</span></span>'
        + '</button>';
}

// ── 성적 회고 밴드 (기존 _recapByEvent 캐시 재사용 — 추가 쿼리 없음) ──
function renderArchiveRecapBand() {
    var band = document.getElementById('archive-recap-band');
    if (!band) return;
    var uid = _recapUid();

    var totalEvents = archiveDB.length;
    var totalFights = archiveDB.reduce(function (s, e) { return s + (e.fights || []).length; }, 0);
    var koFights = archiveDB.reduce(function (s, e) { return s + (e.fights || []).filter(function (f) { return f.method === 'KO/TKO'; }).length; }, 0);
    var koPct = totalFights > 0 ? Math.round(koFights / totalFights * 100) + '%' : '—';
    var gstats = '<div class="arc-gstats">' + _arcGStat(totalEvents, '이벤트') + _arcGStat(totalFights, '경기') + _arcGStat(koPct, 'KO/TKO') + '</div>';

    if (!uid) {
        band.innerHTML = '<div class="arc-recap arc-recap-guest"><div class="arc-recap-gtext">'
            + '<p class="arc-recap-title">아카이브 기록</p><p class="arc-recap-sub">로그인하면 내 픽 성적 회고를 볼 수 있어요.</p>'
            + '</div>' + gstats + '</div>';
        return;
    }
    if (_recapLoadedFor !== uid) {
        band.innerHTML = '<div class="arc-recap arc-recap-guest"><div class="arc-recap-gtext">'
            + '<p class="arc-recap-title">내 픽 성적 회고</p><p class="arc-recap-sub arc-recap-loading">성적 불러오는 중…</p>'
            + '</div>' + gstats + '</div>';
        return;
    }

    var eids = Object.keys(_recapByEvent);
    var win = 0, lose = 0, cancel = 0, netSum = 0, netAll = true;
    eids.forEach(function (id) {
        var r = _recapByEvent[id];
        win += r.win; lose += r.lose; cancel += r.cancel;
        if (r.netComputable) netSum += r.netSum; else netAll = false;
    });
    var settledWL = win + lose;
    var accStr = settledWL > 0 ? Math.round(win / settledWL * 100) + '%' : '—';
    var settledPicks = win + lose + cancel;
    // 손익 계산 불가 이벤트가 하나라도 있으면 누적 합계도 '—'(추측 금지).
    var netStr = (eids.length === 0) ? '—' : (netAll ? ((netSum > 0 ? '+' : '') + netSum + 'P') : '—');
    var netCls = (netAll && eids.length) ? (netSum > 0 ? 'arc-net-pos' : (netSum < 0 ? 'arc-net-neg' : '')) : '';

    band.innerHTML = '<div class="arc-recap">'
        + '<div class="arc-recap-main"><div class="arc-recap-head"><span class="arc-recap-title">내 픽 성적 회고</span><span class="arc-recap-season">2026 시즌</span></div>'
        + '<div class="arc-rtiles">'
            + _arcTile(eids.length, '참여 이벤트', '')
            + _arcTile(accStr, '평균 적중률', 'arc-tile-accent')
            + _arcTile(netStr, '누적 순손익', netCls)
            + _arcTile(settledPicks, '정산 픽', '')
        + '</div></div>'
        + '<div class="arc-recap-spark">' + _arcSparkline() + '</div>'
        + '</div>';
}

function _arcGStat(v, label) {
    return '<div class="arc-gstat"><span class="arc-gstat-v">' + escapeHtml(String(v)) + '</span><span class="arc-gstat-k">' + escapeHtml(label) + '</span></div>';
}
function _arcTile(v, label, cls) {
    return '<div class="arc-rtile"><span class="arc-rtile-v ' + (cls || '') + '">' + escapeHtml(String(v)) + '</span><span class="arc-rtile-k">' + escapeHtml(label) + '</span></div>';
}

// 적중률 추이 — 참여 이벤트를 날짜순으로 누적 적중률 폴리라인. 데이터 부족(≤1) 시 placeholder.
function _arcSparkline() {
    var pts = [];
    Object.keys(_recapByEvent).forEach(function (id) {
        var r = _recapByEvent[id];
        var d = _eventDate[id];
        if (!d || (r.win + r.lose) <= 0) return;
        pts.push({ d: String(d).slice(0, 10), win: r.win, settled: r.win + r.lose });
    });
    pts.sort(function (a, b) { return a.d.localeCompare(b.d); });
    if (pts.length < 2) {
        return '<div class="arc-spark-head"><span class="arc-spark-label">적중률 추이</span></div>'
            + '<div class="arc-spark-empty">데이터 부족</div>';
    }
    var cw = 0, cs = 0, series = [];
    pts.forEach(function (p) { cw += p.win; cs += p.settled; series.push(cw / cs * 100); });
    var W = 280, H = 88, pad = 8;
    var min = Math.min.apply(null, series), max = Math.max.apply(null, series);
    var range = (max - min) < 1 ? 1 : (max - min);
    var stepX = (W - pad * 2) / (series.length - 1);
    var coords = series.map(function (v, i) {
        return [pad + stepX * i, pad + (H - pad * 2) * (1 - (v - min) / range)];
    });
    var poly = coords.map(function (c) { return c[0].toFixed(1) + ',' + c[1].toFixed(1); }).join(' ');
    var area = 'M' + coords[0][0].toFixed(1) + ',' + (H - pad).toFixed(1)
        + ' L' + coords.map(function (c) { return c[0].toFixed(1) + ',' + c[1].toFixed(1); }).join(' L')
        + ' L' + coords[coords.length - 1][0].toFixed(1) + ',' + (H - pad).toFixed(1) + ' Z';
    var last = coords[coords.length - 1];
    var delta = Math.round(series[series.length - 1] - series[0]);
    var deltaStr = (delta > 0 ? '▲ ' + delta : (delta < 0 ? '▼ ' + Math.abs(delta) : '· 0')) + '%p';
    var deltaCls = delta > 0 ? 'arc-net-pos' : (delta < 0 ? 'arc-net-neg' : '');
    return '<div class="arc-spark-head"><span class="arc-spark-label">적중률 추이</span><span class="arc-spark-delta ' + deltaCls + '">' + deltaStr + '</span></div>'
        + '<svg class="arc-spark-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">'
        + '<defs><linearGradient id="arcSparkFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(225,6,0,0.28)"/><stop offset="100%" stop-color="rgba(225,6,0,0)"/></linearGradient></defs>'
        + '<path d="' + area + '" fill="url(#arcSparkFill)" stroke="none"/>'
        + '<polyline points="' + poly + '" fill="none" stroke="#E10600" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>'
        + '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3" fill="#E10600"/>'
        + '</svg>';
}


// ── 이벤트 상세 드로어 (#archive-detail-modal — modal-history 자동 등록: Back/Esc/backdrop) ──
var _arcDetailEscBound = false;
function _arcDetailEsc(e) { if (e && e.key === 'Escape') closeArchiveDetailModal(); }

function openArchiveDetailModal(evId) {
    var ev = archiveDB.find(function (e) { return e.id === evId; })
        || (typeof archiveUpcomingDB !== 'undefined' ? archiveUpcomingDB.find(function (e) { return e.id === evId; }) : null);
    if (!ev) { if (typeof showToast === 'function') showToast('⚠ 이벤트를 찾을 수 없습니다'); return; }
    var modal = document.getElementById('archive-detail-modal');
    var body = document.getElementById('archive-detail-body');
    var crumb = document.getElementById('archive-detail-crumb');
    if (!modal || !body) return;
    if (crumb) crumb.textContent = ev.name || '이벤트';
    _arcOpenEvId = ev.id;
    body.innerHTML = _arcDrawerHtml(ev);
    body.scrollTop = 0;
    modal.classList.remove('hidden');                  // -modal observer가 history 엔트리 push
    document.body.style.overflow = 'hidden';
    if (!_arcDetailEscBound) { document.addEventListener('keydown', _arcDetailEsc); _arcDetailEscBound = true; }
    ensureArchiveRecapLoaded();                         // 드로어 오픈 시 stale 리캡 재검증(TTL 로직 재사용)
}

function closeArchiveDetailModal() {
    var modal = document.getElementById('archive-detail-modal');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = '';
    _arcOpenEvId = null;
    if (_arcDetailEscBound) { document.removeEventListener('keydown', _arcDetailEsc); _arcDetailEscBound = false; }
}
if (typeof window !== 'undefined') { window.openArchiveDetailModal = openArchiveDetailModal; window.closeArchiveDetailModal = closeArchiveDetailModal; }

function _arcDrawerHtml(ev) {
    var isUpcoming = ev.status === 'upcoming';
    var mf = _arcMainFight(ev);
    var dateLabel = _arcDateLabel(ev.event_date);
    var rr = _resolveEventRecap(ev.name, ev.event_date, ev.source_event_id);

    var heroResult = '';
    if (!isUpcoming && mf && mf.winner) {
        heroResult = escapeHtml(_arcWinnerName(mf)) + ' 승' + (mf.method ? ' · ' + escapeHtml(mf.method) : '')
            + (mf.round ? ' · R' + mf.round + (mf.fight_time ? ' ' + escapeHtml(mf.fight_time) : '') : '');
    }
    var heroSub = (isUpcoming ? '예정' : '종료') + ' · ' + escapeHtml(ev.venue || '장소 미상') + (heroResult ? ' · 최종 ' + heroResult : '');
    var hero = '<div class="arc-ed-hero' + (isUpcoming ? ' arc-ed-hero-next' : '') + '">'
        + '<div class="arc-ed-badges"><span class="arc-ed-badge">' + escapeHtml(ev.name || '') + (isUpcoming ? ' · 예정' : ' · 종료') + '</span><span class="arc-ed-date">' + escapeHtml(dateLabel) + '</span></div>'
        + '<div class="arc-ed-mu">' + (mf
            ? '<span class="arc-ed-name">' + escapeHtml(_arcF1(mf)) + '</span><span class="arc-ed-vs">VS</span><span class="arc-ed-name">' + escapeHtml(_arcF2(mf)) + '</span>'
            : '<span class="arc-ed-name">' + escapeHtml(ev.name || '') + '</span>') + '</div>'
        + '<div class="arc-ed-sub">' + heroSub + '</div>'
        + ((!isUpcoming && rr.state === 'ok' && rr.rec) ? _arcDrawerMyResult(rr.rec) : '')
        + '</div>';

    // 내 픽 (recap, 매핑 ok일 때만 — unmapped/ambiguous/비로그인은 섹션 생략, 추측 금지)
    var myPicks = '';
    if (!isUpcoming && rr.state === 'ok' && rr.rec) {
        myPicks = '<div class="arc-ed-section arc-ed-section-mine"><p class="arc-ed-sectitle arc-ed-sectitle-mine">경기별 내 픽 결과 ' + _recapScopeBadge(rr.rec.scope)
            + '<span class="arc-ed-seccount">' + rr.rec.fights.length + '</span></p>'
            + rr.rec.fights.map(_arcDrawerFightRow).join('') + '</div>';
    } else if (!isUpcoming && rr.state === 'nopicks') {
        myPicks = '<div class="arc-ed-section arc-ed-section-mine"><p class="arc-ed-sectitle arc-ed-sectitle-mine">경기별 내 픽 결과</p><p class="arc-ed-empty">이 이벤트에 등록한 픽이 없습니다</p></div>';
    }

    // 전체 경기 결과 (archive snapshot — 항상 안전, 방식/라운드 포함; source_event_id 없어도 표시)
    var fightCount = (ev.fights || []).length;
    var allRows = (ev.fights || []).map(function (f, i) { return _arcDrawerArchiveRow(f, i, isUpcoming); }).join('');
    var allSection = allRows
        ? '<div class="arc-ed-section"><p class="arc-ed-sectitle">' + (isUpcoming ? '대진표' : '전체 경기 결과')
            + '<span class="arc-ed-seccount">' + fightCount + '</span></p>' + allRows + '</div>'
        : '<div class="arc-ed-section"><p class="arc-ed-sectitle">' + (isUpcoming ? '대진표' : '전체 경기 결과') + '</p><p class="arc-ed-empty">등록된 경기가 없습니다</p></div>';

    return hero + myPicks + allSection;
}

function _arcDrawerMyResult(rec) {
    var settled = rec.win + rec.lose;
    var acc = settled > 0 ? Math.round(rec.win / settled * 100) + '%' : '—';
    var netStr = rec.netComputable ? ((rec.netSum > 0 ? '+' : '') + rec.netSum + 'P') : '—';
    var netCls = !rec.netComputable ? '' : (rec.netSum > 0 ? 'arc-net-pos' : (rec.netSum < 0 ? 'arc-net-neg' : ''));
    return '<div class="arc-ed-myresult">'
        + '<div class="arc-ed-metric"><span class="arc-ed-metric-v">' + rec.win + '/' + settled + '</span><span class="arc-ed-metric-k">적중</span></div>'
        + '<div class="arc-ed-metric"><span class="arc-ed-metric-v arc-tile-accent">' + acc + '</span><span class="arc-ed-metric-k">적중률</span></div>'
        + '<div class="arc-ed-metric"><span class="arc-ed-metric-v ' + netCls + '">' + netStr + '</span><span class="arc-ed-metric-k">순손익</span></div>'
        + (rec.cancel > 0 ? '<div class="arc-ed-metric"><span class="arc-ed-metric-v">' + rec.cancel + '</span><span class="arc-ed-metric-k">취소</span></div>' : '')
        + '</div>';
}

function _arcDrawerFightRow(f) {
    var stLabel = f.status === 'win' ? '적중 ✓' : (f.status === 'lose' ? '실패 ✗' : '취소');
    var stCls = f.status === 'win' ? 'arc-fr-win' : (f.status === 'lose' ? 'arc-fr-lose' : 'arc-fr-cancel');
    var actual = f.actualWinner ? ('승자 ' + escapeHtml(f.actualWinner))
        : (f.resultStatus === 'draw' ? '무승부' : (f.resultStatus === 'no_contest' ? 'NC' : '—'));
    var hasNet = (f.status !== 'cancelled') && _recapFinite(f.net);
    var fnet = hasNet ? ((f.net > 0 ? '+' : '') + f.net + 'P') : '';
    var fnetCls = !hasNet ? '' : (f.net > 0 ? 'arc-net-pos' : (f.net < 0 ? 'arc-net-neg' : ''));
    return '<div class="arc-fr ' + stCls + '">'
        + '<span class="arc-fr-tag">' + stLabel + '</span>'
        + '<span class="arc-fr-body"><span class="arc-fr-pick">내 픽 · ' + escapeHtml(f.pick || '—') + '</span><span class="arc-fr-actual">' + actual + '</span></span>'
        + '<span class="arc-fr-net ' + fnetCls + '">' + fnet + '</span>'
        + '</div>';
}

function _arcDrawerArchiveRow(f, i, isUpcoming) {
    var seg = _arcSegMeta(f.tag);
    var segChip = seg ? '<span class="arc-afr-seg ' + seg.cls + '">' + escapeHtml(seg.label) + '</span>' : '';
    var winSide = isUpcoming ? 0 : _arcWinSide(f);   // 승자 강조용(영문 비교) — upcoming은 미정
    var n1Cls = winSide === 1 ? ' arc-afr-w' : (winSide === 2 ? ' arc-afr-l' : '');
    var n2Cls = winSide === 2 ? ' arc-afr-w' : (winSide === 1 ? ' arc-afr-l' : '');

    var method = (!isUpcoming && f.method) ? f.method : '';
    var rt = (!isUpcoming && (f.round || f.fight_time)) ? ('R' + (f.round || '?') + (f.fight_time ? ' ' + f.fight_time : '')) : '';

    var res;
    if (isUpcoming) {
        res = '<span class="arc-afr-res"><span class="arc-afr-soon">예정</span></span>';
    } else if (winSide || method || rt) {
        res = '<span class="arc-afr-res">'
            + (winSide ? '<span class="arc-afr-wtag">WIN</span>' : '')
            + (method ? '<span class="arc-afr-method ' + (_ARC_METHOD_COLOR[method] || 'text-gray-400 border-gray-400/40 bg-gray-400/10') + '">' + escapeHtml(method) + '</span>' : '')
            + (rt ? '<span class="arc-afr-rtchip">' + escapeHtml(rt) + '</span>' : '')
            + '</span>';
    } else {
        res = '<span class="arc-afr-res"><span class="arc-afr-rt">결과 없음</span></span>';
    }

    return '<div class="arc-afr">'
        + '<span class="arc-afr-idx">' + (i + 1) + '</span>'
        + '<span class="arc-afr-main">'
            + (segChip ? '<span class="arc-afr-segline">' + segChip + '</span>' : '')
            + '<span class="arc-afr-mu">'
                + '<span class="arc-afr-name' + n1Cls + '">' + escapeHtml(_arcF1(f)) + '</span>'
                + '<span class="arc-afr-vs">vs</span>'
                + '<span class="arc-afr-name' + n2Cls + '">' + escapeHtml(_arcF2(f)) + '</span>'
            + '</span>'
        + '</span>'
        + res + '</div>';
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
//  매핑(아카이브 카드 ↔ 캐노니컬 이벤트):
//    • archive_events.source_event_id 가 있으면 그것을 최우선 사용(제목/날짜 변경에 안전).
//      events 에 없으면(삭제/권한실패) 숨김 — title/date fallback 으로 추측 연결하지 않음.
//    • source_event_id 가 없을 때만 정규화제목 + event_date(YYYY-MM-DD) 복합키 fallback:
//      동일 복합키 2개+ → ambiguous(숨김), 0개 → unmapped(숨김; '픽 없음' 표기 금지),
//      1개 → 해당 event_id 집계(없으면 '매핑됨·내 픽 없음'). 집계 캐시는 event_id 기준 저장.
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
var _eventDate = {};          // event_id → event_date (스파크라인 날짜순 정렬용 — 동일 events 쿼리 재사용)
var _arcOpenEvId = null;      // 현재 열린 상세 드로어의 이벤트 id (리캡 갱신 시 재렌더용)
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
    _recapByEvent = {}; _eventByKey = {}; _eventScope = {}; _eventDate = {}; _recapLegacyExcluded = 0;
    _recapInflight = null; _recapLoadedFor = null; _recapUserId = null; _recapLoadedAt = 0;
    var list = document.getElementById('archive-list');
    if (list && list.offsetParent !== null) {
        renderArchive();                 // 아카이브가 보이는 중 → 즉시 갱신(+ tail 에서 재로드)
    } else {
        renderArchiveRecapBand();        // 숨김 → 밴드만 정리(이전 계정 리캡 제거), 재로드는 다음 진입 시
        if (list) list.innerHTML = '';
    }
    _arcRefreshOpenDrawer();             // 드로어 열려 있으면 내용 갱신(전환 후 잔존 방지)
}
if (typeof window !== 'undefined') window.invalidateArchiveRecap = invalidateArchiveRecap;

// 캐시가 TTL 이내면 즉시 재사용. 만료(stale)면 기존 리캡을 유지한 채 재검증(성공 응답만 새 캐시로 교체).
// 렌더는 하지 않음(호출부 renderArchive 가 렌더 소유 — 재귀 루프 방지). 비로그인 시 picks 쿼리 0건.
function ensureArchiveRecapLoaded() {
    var uid = _recapUid();
    if (!uid) return;                                   // 비로그인 → 로드 안 함(picks 쿼리 0건 보장)
    var fresh = (_recapLoadedFor === uid) && ((Date.now() - _recapLoadedAt) < _RECAP_TTL_MS);
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
            var byKey = {}, scope = {}, date = {};
            events.forEach(function (e) {
                (byKey[_recapKey(e.title, e.event_date)] = byKey[_recapKey(e.title, e.event_date)] || []).push(e.id);
                scope[e.id] = e.record_scope || null;
                date[e.id] = e.event_date || null;     // 스파크라인 날짜순 정렬용(동일 events 쿼리 재사용)
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
            return { byEvent: byEvent, byKey: byKey, scope: scope, date: date, legacy: legacy };
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
    _eventDate = result.date;
    _recapLegacyExcluded = result.legacy;
    _recapLoadedFor = uid;
    _recapLoadedAt = Date.now();                  // 성공 로드 시각 기록(TTL 기준)
    renderArchiveRecapSections();                 // 성공 적용 → 밴드/행/드로어 재렌더(루프 가드: tail ensure 는 fresh)
}

// 리캡 캐시 적용 훅(성공 로드/무효화 시 호출) — 이벤트 뷰 재렌더 + 열린 드로어 갱신.
// (구 placeholder 인라인 방식 대체: 행 칩·회고 밴드는 renderArchive 가, 경기별 상세는 드로어가 소유.
//  매핑 ok/nopicks/unmapped/ambiguous 구분은 _resolveEventRecap 에 그대로 보존.)
function renderArchiveRecapSections() {
    if (document.getElementById('archive-list')) renderArchive();
    _arcRefreshOpenDrawer();
}

// 열린 상세 드로어가 있으면 현재 캐시로 본문 재렌더(리캡 늦은 로드/계정 전환 반영).
function _arcRefreshOpenDrawer() {
    var modal = document.getElementById('archive-detail-modal');
    if (!modal || modal.classList.contains('hidden') || !_arcOpenEvId) return;
    var body = document.getElementById('archive-detail-body');
    var ev = archiveDB.find(function (e) { return e.id === _arcOpenEvId; })
        || (typeof archiveUpcomingDB !== 'undefined' ? archiveUpcomingDB.find(function (e) { return e.id === _arcOpenEvId; }) : null);
    if (body && ev) body.innerHTML = _arcDrawerHtml(ev);
}

function _recapScopeBadge(scope) {
    if (scope === 'fantasy') return '<span class="oswald-sharp text-[7px] bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-300 px-1.5 py-0.5 rounded italic uppercase">판타지</span>';
    if (scope === 'official') return '<span class="oswald-sharp text-[7px] bg-sky-500/10 border border-sky-500/30 text-sky-300 px-1.5 py-0.5 rounded italic uppercase">공식</span>';
    if (scope === 'exhibition') return '<span class="oswald-sharp text-[7px] bg-amber-500/10 border border-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded italic uppercase">시범경기</span>';
    return '';
}

// (구 인라인 리캡 행 _recapSectionHtml / toggleArchiveRecapDetail 은 상세 드로어로 이관·제거됨.
//  경기별 내 픽 렌더는 _arcDrawerFightRow, 요약은 _arcDrawerMyResult 이 담당.)

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

function _fighterDisplayName(f) { return f.name || f.name_en || '—'; }
function _fighterRecord(f) {
    if (!(f.wins || f.losses || f.draws)) return null;
    return (f.wins || 0) + '-' + (f.losses || 0) + (f.draws ? '-' + f.draws : '');
}
function _fighterWinRate(f) {
    var t = (f.wins || 0) + (f.losses || 0) + (f.draws || 0);
    return t > 0 ? (f.wins || 0) / t : -1;
}
// 정렬용 랭크키: 0=챔프(최상), N=#N, 비랭커=9999(하단). 공식 _getDivisionRank 재사용(fighters.rank 미사용).
function _fighterRankKey(f) { var r = _getDivisionRank(f); return (r == null) ? 9999 : r; }

var _ARC_FSTYLE_COLOR = {
    striker:      'text-red-400 border-red-400/30 bg-red-400/5',
    grappler:     'text-blue-400 border-blue-400/30 bg-blue-400/5',
    wrestler:     'text-green-400 border-green-400/30 bg-green-400/5',
    submission:   'text-purple-400 border-purple-400/30 bg-purple-400/5',
    'all-around': 'text-yellow-400 border-yellow-400/30 bg-yellow-400/5'
};

function renderFighterArchive() {
    var listEl  = document.getElementById('fighter-archive-list');
    var emptyEl = document.getElementById('fighter-archive-empty');
    if (!listEl) return;

    var query   = ((document.getElementById('fighter-archive-search') || {}).value || '').toLowerCase().trim();
    var divFilt = (document.getElementById('fighter-archive-division') || {}).value || 'all';
    var sortMode = (document.getElementById('fighter-archive-sort') || {}).value || 'rank';

    var filtered = fighterArchiveDB.filter(function (f) {
        var nameMatch = !query
            || (f.name || '').toLowerCase().indexOf(query) >= 0
            || (f.name_en || '').toLowerCase().indexOf(query) >= 0
            || (f.nickname || '').toLowerCase().indexOf(query) >= 0;
        var divMatch = divFilt === 'all' || f.division === divFilt;
        return nameMatch && divMatch;
    });

    function byName(a, b) { return _fighterDisplayName(a).localeCompare(_fighterDisplayName(b), 'ko'); }
    if (sortMode === 'name') {
        filtered.sort(byName);
    } else if (sortMode === 'wins') {
        filtered.sort(function (a, b) { return ((b.wins || 0) - (a.wins || 0)) || byName(a, b); });
    } else if (sortMode === 'winrate') {
        filtered.sort(function (a, b) { return (_fighterWinRate(b) - _fighterWinRate(a)) || ((b.wins || 0) - (a.wins || 0)) || byName(a, b); });
    } else { // 'rank': 챔프·랭커 우선, 비랭커 하단, 동순위 이름순
        filtered.sort(function (a, b) { return (_fighterRankKey(a) - _fighterRankKey(b)) || byName(a, b); });
    }

    // 통계(실데이터): 파이터 수 / 체급 수 / 랭커 수. 소유/컬렉션 개념 없음.
    var divSet = new Set(fighterArchiveDB.map(function (f) { return f.division; }).filter(Boolean));
    var rankedCount = fighterArchiveDB.reduce(function (s, f) { return s + (_getDivisionRank(f) != null ? 1 : 0); }, 0);
    var statEl = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = v; };
    statEl('fighter-stat-count', fighterArchiveDB.length);
    statEl('fighter-stat-divisions', divSet.size);
    statEl('fighter-stat-ranked', rankedCount);
    var ftCt = document.getElementById('archive-tab-fighters-ct');
    if (ftCt) ftCt.textContent = fighterArchiveDB.length;

    if (filtered.length === 0) {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');

    window._fighterCardCache = {};   // 매 렌더 초기화 — onclick 키는 현재 렌더 인덱스 기준(따옴표 안전)
    listEl.innerHTML = filtered.map(_arcFighterCardHtml).join('');
}

function _arcFighterCardHtml(f, i) {
    var displayName = _fighterDisplayName(f);
    var subName = (f.name_en && f.name_en !== f.name) ? f.name_en : '';
    var record = _fighterRecord(f);
    var divLabel = DIVISION_LABEL[f.division] || (f.division || '').toUpperCase();
    var rv = _getDivisionRank(f);                // 0=champ, N=#N, null=비랭커(칩 숨김)
    var firstLetter = escapeHtml((f.name_en || f.name || '?').charAt(0) || '?');

    var cacheKey = 'fc_' + i;                     // 인덱스 키: 따옴표/특수문자 안전, 매 렌더 유니크
    window._fighterCardCache[cacheKey] = _buildFighterForProfile(f);

    var rankChip = (rv === 0)
        ? '<span class="arc-rankchip arc-rankchip-champ">CHAMP</span>'
        : (rv != null ? '<span class="arc-rankchip">#' + rv + '</span>' : '');

    // 이미지 없거나 onerror 시 안전 placeholder(모노그램)만 — fake portrait 생성 안 함.
    var imgHtml = f.image_url
        ? '<img class="arc-fimg" src="' + escapeHtml(f.image_url) + '" alt="' + escapeHtml(displayName) + '" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">'
        : '';
    var ph = '<span class="arc-fph"' + (f.image_url ? ' style="display:none"' : '') + '>' + firstLetter + '</span>';

    return '<button type="button" class="arc-fcard" onclick="openFighterProfile(window._fighterCardCache[\'' + cacheKey + '\'])">'
        + '<span class="arc-fport">' + imgHtml + ph + rankChip + '</span>'
        + '<span class="arc-fbody">'
            + '<span class="arc-fname">' + escapeHtml(displayName) + '</span>'
            + (subName ? '<span class="arc-fsub">' + escapeHtml(subName) + '</span>' : '')
            + '<span class="arc-fmeta"><span class="arc-fdiv">' + escapeHtml(divLabel) + '</span>'
                + (record ? '<span class="arc-frec">' + escapeHtml(record) + '</span>' : '') + '</span>'
            + (f.style ? '<span class="arc-fstyle ' + (_ARC_FSTYLE_COLOR[f.style] || 'text-gray-500 border-gray-500/30 bg-gray-500/5') + '">' + escapeHtml(f.style) + '</span>' : '')
        + '</span>'
        + '</button>';
}
