/* ==============================
   HEAD-TO-HEAD COMPARISON
   (extracted from index.html – global functions, no import/export)
   의존성: state.js (fighterDB, archiveDB, h2hRadarChart),
           admin.js (getActiveFights), utils.js (escapeHtml)
============================== */

// ── ID helpers — DOM select.value is always a string ─────────────────
// Normalise any ID to string so strict equality works regardless of
// whether f.id arrives as a string, number, UUID, or null/undefined.
function _h2hId(v) { return (v == null) ? '' : String(v); }
function _h2hSameId(a, b) { return _h2hId(a) === _h2hId(b); }

// ── Module state — source of truth for selected fighter IDs ──────────
var _h2hFighters = [];    // full loadable fighter pool
var _h2hF1Id = '';        // always a normalized string
var _h2hF2Id = '';        // always a normalized string

// Reset content back to a prompt state (used when selection changes) ──
function _showH2HPrompt() {
    var content = document.getElementById('h2h-content');
    if (!content) return;
    if (h2hRadarChart) { h2hRadarChart.destroy(); h2hRadarChart = null; }
    content.innerHTML = '<div class="text-center py-12 text-gray-600 oswald-sharp text-xs italic uppercase tracking-widest">⚔️ 두 파이터를 선택 후 "비교 분석 시작" 버튼을 눌러주세요</div>';
}

// ── Division normalization + adjacency tables ─────────────────────────
var _DIV_ORDER_M = ['flw', 'bw', 'fw', 'lw', 'ww', 'mw', 'lhw', 'hw'];
var _DIV_ORDER_W = ['w-flw', 'w-bw', 'w-fw', 'w-sw', 'w-mw'];

// Maps any known division string to its canonical code
var _DIV_NORM_MAP = {
    'flyweight':'flw', 'flw':'flw', '플라이급':'flw', '플라이웨이트':'flw',
    'bantamweight':'bw', 'bw':'bw', '밴텀급':'bw', '밴텀웨이트':'bw',
    'featherweight':'fw', 'fw':'fw', '페더급':'fw', '페더웨이트':'fw',
    'lightweight':'lw', 'lw':'lw', '라이트급':'lw', '라이트웨이트':'lw',
    'welterweight':'ww', 'ww':'ww', '웰터급':'ww', '웰터웨이트':'ww',
    'middleweight':'mw', 'mw':'mw', '미들급':'mw', '미들웨이트':'mw',
    'light heavyweight':'lhw', 'lhw':'lhw', '라이트헤비급':'lhw', '라이트헤비웨이트':'lhw',
    'heavyweight':'hw', 'hw':'hw', '헤비급':'hw', '헤비웨이트':'hw',
    "women's strawweight":'w-sw', 'w-sw':'w-sw', 'w-strawweight':'w-sw',
    "women's flyweight":'w-flw', 'w-flw':'w-flw',
    "women's bantamweight":'w-bw', 'w-bw':'w-bw',
    "women's featherweight":'w-fw', 'w-fw':'w-fw',
    "women's middleweight":'w-mw', 'w-mw':'w-mw',
};
function _normalizeH2HDivision(div) {
    if (!div) return '';
    var d = String(div).toLowerCase().trim();
    return _DIV_NORM_MAP[d] || d;
}

function _getAdjacentDivs(div) {
    var d = _normalizeH2HDivision(div);
    if (!d) return null;
    for (var o = 0; o < [_DIV_ORDER_M, _DIV_ORDER_W].length; o++) {
        var order = [_DIV_ORDER_M, _DIV_ORDER_W][o];
        var idx = order.indexOf(d);
        if (idx >= 0) {
            var set = {};
            order.slice(Math.max(0, idx - 1), idx + 2).forEach(function(v) { set[v] = true; });
            return set;
        }
    }
    return null;
}

// ── Fighter pool helpers ──────────────────────────────────────────────
function _eventFighterSet() {
    var set = {};
    getAllFightersForH2H().forEach(function(f) { set[_h2hId(f.id)] = true; });
    return set;
}

function getAllFightersForH2H() {
    // DB fighters: normalize division so adjacency filter works
    var fromDB = fighterDB.map(function(f) {
        var copy = Object.assign({}, f);
        copy._normDiv = _normalizeH2HDivision(f.division);
        return copy;
    });
    var fromFights = [];
    var nameSet = {};
    fromDB.forEach(function(f) { if (f.name) nameSet[f.name] = true; });
    getActiveFights().forEach(function(fight) {
        // fight.division is the weight class code (e.g. 'lw'); f1/f2 sub-objects have no division
        var fightDiv = _normalizeH2HDivision(fight.division);
        [fight.f1, fight.f2].forEach(function(f) {
            if (f && f.name && !nameSet[f.name]) {
                nameSet[f.name] = true;
                var entry = Object.assign({}, f, {
                    id: 'fc_' + f.name.replace(/\s/g, '_'),
                    division: fightDiv,       // inject fight-level division
                    _normDiv: fightDiv,
                });
                fromFights.push(entry);
            }
        });
    });
    return fromDB.concat(fromFights);
}

// Load full fighter list from Supabase; falls back to event fighters on error
async function _ensureH2HFighters() {
    var base = getAllFightersForH2H();
    if (_h2hFighters.length > 0) {
        // Already loaded — add any new event fighters
        base.forEach(function(f) {
            var fid = _h2hId(f.id);
            if (fid && !_h2hFighters.find(function(x) { return _h2hSameId(x.id, fid); })) {
                _h2hFighters.unshift(f);
            }
        });
        return;
    }

    _h2hFighters = base.slice();
    if (typeof sb === 'undefined' || !sb) return;

    try {
        var res = await sb.from('fighters')
            .select('id, name, name_en, division, wins, losses, draws, height, reach, ko_rate, sub_rate, dec_rate, stats, style, image_url')
            .order('name', { ascending: true });
        if (res.error || !res.data || !res.data.length) return;

        var existing = {};
        base.forEach(function(f) { if (f.name) existing[f.name.toLowerCase()] = true; });
        var extras = [];
        res.data.forEach(function(f) {
            var key = (f.name || '').toLowerCase();
            if (!existing[key]) {
                f.record = (f.wins || 0) + '-' + (f.losses || 0) + (f.draws > 0 ? '-' + f.draws : '');
                extras.push(f);
                existing[key] = true;
            }
        });
        _h2hFighters = base.concat(extras);
    } catch(e) {
        console.warn('[H2H] fighter DB load failed:', e);
    }
}

// ── Select population ─────────────────────────────────────────────────
function _populateF1Select() {
    var sel = document.getElementById('h2h-f1-select');
    if (!sel) return;
    var eSet = _eventFighterSet();
    var inEvent = _h2hFighters.filter(function(f) { return eSet[_h2hId(f.id)]; });
    var others  = _h2hFighters.filter(function(f) { return !eSet[_h2hId(f.id)]; });

    sel.innerHTML = '<option value="">🔴 파이터 1 선택</option>';
    _appendOptgroup(sel, '── 현재 이벤트 ──', inEvent, _h2hF1Id);
    _appendOptgroup(sel, '── 전체 선수 ──',   others,  _h2hF1Id);
}

function _populateF2Select() {
    var sel = document.getElementById('h2h-f2-select');
    if (!sel) return;

    var f1 = _h2hF1Id ? _h2hFighters.find(function(f) { return _h2hSameId(f.id, _h2hF1Id); }) : null;
    var f1Div = f1 ? (f1._normDiv || _normalizeH2HDivision(f1.division)) : '';
    var adjDivs = f1Div ? _getAdjacentDivs(f1Div) : null;

    console.debug('[H2H] f1:', f1 && f1.name, '| div:', f1Div, '| adjDivs:', adjDivs);

    var pool = _h2hFighters.filter(function(f) { return !_h2hSameId(f.id, _h2hF1Id); });
    var candidates = adjDivs
        ? pool.filter(function(f) { return adjDivs[f._normDiv || _normalizeH2HDivision(f.division)]; })
        : pool;
    if (!candidates.length) candidates = pool;

    var eSet = _eventFighterSet();
    var inEvent = candidates.filter(function(f) { return eSet[_h2hId(f.id)]; });
    var others  = candidates.filter(function(f) { return !eSet[_h2hId(f.id)]; });

    var placeholder = adjDivs ? '🔵 파이터 2 선택 (같은/인접 체급)' : '🔵 파이터 2 선택';
    sel.innerHTML = '<option value="">' + placeholder + '</option>';
    _appendOptgroup(sel, '── 현재 이벤트 ──', inEvent, _h2hF2Id);
    _appendOptgroup(sel, '── 전체 선수 ──',   others,  _h2hF2Id);

    // If current _h2hF2Id is no longer in the candidate pool, clear it
    var stillValid = candidates.some(function(f) { return _h2hSameId(f.id, _h2hF2Id); });
    if (!stillValid && _h2hF2Id) {
        _h2hF2Id = '';
        sel.value = '';
    }
}

function _appendOptgroup(sel, label, fighters, selectedId) {
    if (!fighters || !fighters.length) return;
    var grp = document.createElement('optgroup');
    grp.label = label;
    fighters.forEach(function(f) {
        var opt = document.createElement('option');
        opt.value = _h2hId(f.id);         // always string
        opt.textContent = f.name || '?';
        if (_h2hSameId(f.id, selectedId)) opt.selected = true;
        grp.appendChild(opt);
    });
    sel.appendChild(grp);
}

// ── Public API ────────────────────────────────────────────────────────
async function openH2H() {
    document.getElementById('h2h-modal').classList.remove('hidden');
    document.getElementById('h2h-content').innerHTML =
        '<div class="text-center py-12 text-gray-600 oswald-sharp text-xs italic uppercase tracking-widest">선수 목록 로딩 중...</div>';

    await _ensureH2HFighters();
    _populateF1Select();
    _populateF2Select();
    _showH2HPrompt();
}

function closeH2H() {
    document.getElementById('h2h-modal').classList.add('hidden');
    if (h2hRadarChart) { h2hRadarChart.destroy(); h2hRadarChart = null; }
}

// Called by f1 select onchange
function h2hOnF1Change(val) {
    _h2hF1Id = _h2hId(val);
    if (_h2hSameId(_h2hF2Id, _h2hF1Id)) _h2hF2Id = '';
    _populateF2Select();
    // Sync _h2hF2Id from DOM in case _populateF2Select preserved a selection
    var s2 = document.getElementById('h2h-f2-select');
    if (s2) _h2hF2Id = _h2hId(s2.value);
    _showH2HPrompt();
}

// Called by f2 select onchange
function h2hOnF2Change(val) {
    _h2hF2Id = _h2hId(val);
    _showH2HPrompt();
}

// Mobile belt-and-suspenders: read DOM → update vars → render
function compareH2H(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    var s1 = document.getElementById('h2h-f1-select');
    var s2 = document.getElementById('h2h-f2-select');
    if (s1) _h2hF1Id = _h2hId(s1.value);
    if (s2) _h2hF2Id = _h2hId(s2.value);
    console.debug('[H2H] compareH2H called: f1=', _h2hF1Id, 'f2=', _h2hF2Id);
    _renderH2HContent();
}

// Backward compat alias
function renderH2H() { _renderH2HContent(); }

// ── Core render (try/catch so template literal errors don't silently swallow) ──
function _renderH2HContent() {
    var content = document.getElementById('h2h-content');
    if (!content) return;

    if (!_h2hF1Id || !_h2hF2Id) {
        content.innerHTML = '<div class="text-center py-12 text-gray-600 oswald-sharp text-xs italic uppercase tracking-widest">두 파이터를 선택하면 비교 분석이 시작됩니다</div>';
        return;
    }
    if (_h2hSameId(_h2hF1Id, _h2hF2Id)) {
        content.innerHTML = '<div class="text-center py-12 text-gray-500 oswald-sharp text-xs italic uppercase tracking-widest">같은 파이터를 선택했어요 — 다른 파이터를 선택해주세요</div>';
        return;
    }

    var f1 = _h2hFighters.find(function(f) { return _h2hSameId(f.id, _h2hF1Id); });
    var f2 = _h2hFighters.find(function(f) { return _h2hSameId(f.id, _h2hF2Id); });
    console.debug('[H2H] render: f1=', _h2hF1Id, f1 && f1.name, '| f2=', _h2hF2Id, f2 && f2.name, '| pool:', _h2hFighters.length);
    if (!f1 || !f2) {
        content.innerHTML = '<div class="text-center py-12 text-gray-600 oswald-sharp text-xs italic uppercase tracking-widest">선수 정보를 찾지 못했어요. 다시 선택해 주세요.<br><span class="text-gray-700 text-[10px]">(f1=' + _h2hF1Id + ' f2=' + _h2hF2Id + ')</span></div>';
        return;
    }

    try {
        _doRenderH2H(content, f1, f2);
    } catch(e) {
        console.error('[H2H] render failed:', e);
        content.innerHTML = '<div class="text-center py-12 text-gray-600 oswald-sharp text-xs italic uppercase tracking-widest">비교 분석을 불러오지 못했어요. 다시 선택해 주세요.</div>';
    }
}

function _doRenderH2H(content, f1, f2) {
    var stats1 = _getDisplayStats(f1);
    var stats2 = _getDisplayStats(f2);
    var STAT_LABELS = ['Striking', 'Grappling', 'Stamina', 'Defense', 'Speed'];

    var totalAdv1 = stats1.reduce(function(s, v, i) { return s + (v > stats2[i] ? 1 : 0); }, 0);
    var totalAdv2 = stats2.reduce(function(s, v, i) { return s + (v > stats1[i] ? 1 : 0); }, 0);
    var overallAdv = totalAdv1 > totalAdv2 ? f1.name : (totalAdv2 > totalAdv1 ? f2.name : 'EVEN');

    var h2hRecords = [];
    try { h2hRecords = findH2HRecords(f1.name, f2.name); } catch(e) { console.warn('[H2H] h2hRecords:', e); }

    var styleAnalysis = { f1Style: '—', f1Icon: '⚔️', f2Style: '—', f2Icon: '⚔️', keyMatchup: '—', prediction: '—' };
    try { styleAnalysis = analyzeStyleMatchup(stats1, stats2, f1.name, f2.name); } catch(e) { console.warn('[H2H] styleAnalysis:', e); }

    var rank1 = null, rank2 = null;
    try { rank1 = findUFCRank(f1.name); } catch(e) {}
    try { rank2 = findUFCRank(f2.name); } catch(e) {}

    var sides = [
        { f: f1, col: 'ufcRed',  side: 'RED',  rank: rank1 },
        { f: f2, col: 'ufcBlue', side: 'BLUE', rank: rank2 }
    ];

    var fighterCardsHtml = sides.map(function(item) {
        var f = item.f, col = item.col, side = item.side, rank = item.rank;
        return '<div class="glass-card rounded-2xl p-4 lg:p-6 border border-' + col + '/20 text-center">' +
            '<span class="oswald-sharp text-[8px] text-' + col + ' font-black italic uppercase tracking-widest">' + side + ' CORNER</span>' +
            '<h4 class="oswald-sharp text-base lg:text-2xl font-black italic text-white uppercase tracking-tighter mt-2 mb-1 leading-tight">' + (f.name || '?') + '</h4>' +
            '<p class="oswald-sharp text-[10px] text-gray-500 italic uppercase">' + (f.record || '—') + '</p>' +
            (rank ? '<div class="mt-2 inline-block oswald-sharp text-[9px] bg-white/5 border border-white/10 px-2 py-1 rounded-lg font-black italic text-gray-400 uppercase">' + rank.label + '</div>' : '') +
            '<div class="grid grid-cols-2 gap-2 mt-3 text-left">' +
                '<div><p class="oswald-sharp text-[8px] text-gray-600 uppercase">신장</p><p class="oswald-sharp text-sm font-black italic text-white">' + (f.height || '—') + '</p></div>' +
                '<div><p class="oswald-sharp text-[8px] text-gray-600 uppercase">리치</p><p class="oswald-sharp text-sm font-black italic text-white">' + (f.reach || '—') + '</p></div>' +
            '</div>' +
        '</div>';
    }).join('');

    var statBarsHtml = STAT_LABELS.map(function(label, i) {
        var v1 = stats1[i] || 0, v2 = stats2[i] || 0;
        var total = v1 + v2;
        var pct1 = total > 0 ? Math.round(v1 / total * 100) : 50;
        var pct2 = 100 - pct1;
        var adv = v1 > v2 ? 'left' : v2 > v1 ? 'right' : 'even';
        return '<div>' +
            '<div class="flex justify-between items-center mb-1">' +
                '<span class="oswald-sharp text-xs font-black italic ' + (adv === 'left' ? 'text-ufcRed' : 'text-gray-400') + '">' + v1 + '</span>' +
                '<span class="oswald-sharp text-[9px] text-gray-500 italic uppercase tracking-widest">' + label + '</span>' +
                '<span class="oswald-sharp text-xs font-black italic ' + (adv === 'right' ? 'text-ufcBlue' : 'text-gray-400') + '">' + v2 + '</span>' +
            '</div>' +
            '<div class="flex h-2.5 rounded-full overflow-hidden gap-px">' +
                '<div class="h-full rounded-l-full transition-all duration-700" style="width:' + pct1 + '%; background:' + (adv === 'left' ? '#E10600' : 'rgba(255,255,255,0.12)') + '"></div>' +
                '<div class="h-full rounded-r-full transition-all duration-700" style="width:' + pct2 + '%; background:' + (adv === 'right' ? '#3b82f6' : 'rgba(255,255,255,0.12)') + '"></div>' +
            '</div>' +
        '</div>';
    }).join('');

    var f1Last = (f1.name || '').split(' ').pop();
    var f2Last = (f2.name || '').split(' ').pop();

    var h2hRecordsHtml;
    if (!h2hRecords.length) {
        h2hRecordsHtml = '<p class="oswald-sharp text-xs text-gray-700 italic uppercase text-center py-3">공식 맞대결 기록 없음</p>';
    } else {
        var rows = h2hRecords.map(function(r) {
            var w1 = r.winner && r.winner.toLowerCase().includes(f1Last.toLowerCase());
            return '<div class="py-2 border-b border-white/5 last:border-0">' +
                '<p class="oswald-sharp text-[9px] text-gray-600 italic uppercase truncate mb-1">' + (r.event || '') + '</p>' +
                '<div class="flex items-center justify-between">' +
                    '<div class="flex items-center gap-2">' +
                        '<span class="oswald-sharp text-xs font-black italic ' + (w1 ? 'text-ufcRed' : 'text-gray-400') + '">' + f1Last + '</span>' +
                        '<span class="text-gray-700 text-[9px]">vs</span>' +
                        '<span class="oswald-sharp text-xs font-black italic ' + (!w1 ? 'text-ufcBlue' : 'text-gray-400') + '">' + f2Last + '</span>' +
                    '</div>' +
                    '<span class="oswald-sharp text-[8px] border border-white/10 text-gray-500 px-2 py-0.5 rounded-lg font-black italic uppercase">' + (r.method || '') + ' R' + (r.round || '') + '</span>' +
                '</div>' +
            '</div>';
        }).join('');
        var w1count = h2hRecords.filter(function(r) { return r.winner && r.winner.toLowerCase().includes(f1Last.toLowerCase()); }).length;
        h2hRecordsHtml = '<div class="space-y-3">' + rows +
            '<div class="flex justify-around pt-3">' +
                '<div class="text-center"><p class="oswald-sharp text-2xl font-black italic text-ufcRed">' + w1count + '</p><p class="oswald-sharp text-[9px] text-gray-600 italic uppercase">' + f1Last + ' 승</p></div>' +
                '<div class="text-center self-center oswald-sharp text-gray-600 font-black italic">VS</div>' +
                '<div class="text-center"><p class="oswald-sharp text-2xl font-black italic text-ufcBlue">' + (h2hRecords.length - w1count) + '</p><p class="oswald-sharp text-[9px] text-gray-600 italic uppercase">' + f2Last + ' 승</p></div>' +
            '</div>' +
        '</div>';
    }

    content.innerHTML =
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">' + fighterCardsHtml + '</div>' +
        '<div class="glass-card rounded-2xl p-5 lg:p-7 mb-6 border ' + (h2hRecords.length > 0 ? 'border-yellow-500/20 bg-yellow-500/[0.03]' : 'border-white/5') + '">' +
            '<p class="oswald-sharp text-[9px] text-gray-500 uppercase tracking-[0.3em] font-black italic mb-4">⚔️ 직접 맞대결</p>' +
            h2hRecordsHtml +
        '</div>' +
        '<div class="glass-card rounded-2xl p-5 lg:p-7 mb-6 border border-white/5">' +
            '<p class="oswald-sharp text-[9px] text-gray-500 uppercase tracking-[0.3em] font-black italic mb-4">🔍 스탯 기반 관전 포인트</p>' +
            '<div class="grid grid-cols-3 gap-3 mb-4">' +
                '<div class="text-center p-3 rounded-xl bg-black/30 border border-white/5"><p class="text-xl mb-1">' + styleAnalysis.f1Icon + '</p><p class="oswald-sharp text-[9px] text-gray-500 italic uppercase mb-1">' + f1Last + '</p><p class="oswald-sharp text-xs font-black italic text-ufcRed uppercase">' + styleAnalysis.f1Style + '</p></div>' +
                '<div class="text-center p-3 rounded-xl bg-ufcRed/5 border border-ufcRed/20 flex items-center justify-center"><div><p class="oswald-sharp text-[8px] text-gray-500 italic uppercase mb-1">키 매치업</p><p class="oswald-sharp text-xs font-black italic text-white uppercase leading-tight">' + styleAnalysis.keyMatchup + '</p></div></div>' +
                '<div class="text-center p-3 rounded-xl bg-black/30 border border-white/5"><p class="text-xl mb-1">' + styleAnalysis.f2Icon + '</p><p class="oswald-sharp text-[9px] text-gray-500 italic uppercase mb-1">' + f2Last + '</p><p class="oswald-sharp text-xs font-black italic text-ufcBlue uppercase">' + styleAnalysis.f2Style + '</p></div>' +
            '</div>' +
            '<div class="p-3 rounded-xl bg-black/20 border border-white/5"><p class="text-gray-300 text-xs italic leading-relaxed">' + styleAnalysis.prediction + '</p></div>' +
        '</div>' +
        '<div class="mb-6 space-y-3">' +
            '<p class="oswald-sharp text-[9px] text-gray-500 uppercase tracking-[0.3em] font-black italic">스탯 비교</p>' +
            statBarsHtml +
        '</div>' +
        '<div class="mb-6">' +
            '<p class="oswald-sharp text-[9px] text-gray-500 uppercase tracking-[0.3em] font-black italic mb-4">레이더 분석</p>' +
            '<div class="relative mx-auto" style="max-width:300px; height:240px"><canvas id="h2h-radar-canvas"></canvas></div>' +
            '<div class="flex justify-center gap-6 mt-3">' +
                '<div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-ufcRed"></div><span class="oswald-sharp text-[10px] text-gray-400 italic uppercase">' + f1Last + '</span></div>' +
                '<div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-ufcBlue"></div><span class="oswald-sharp text-[10px] text-gray-400 italic uppercase">' + f2Last + '</span></div>' +
            '</div>' +
        '</div>' +
        '<div class="glass-card rounded-2xl p-6 text-center border ' + (overallAdv === 'EVEN' ? 'border-white/10' : 'border-ufcRed/20') + '" style="' + (overallAdv !== 'EVEN' ? 'background:rgba(225,6,0,0.05)' : '') + '">' +
            '<p class="oswald-sharp text-[9px] text-gray-500 uppercase tracking-widest italic mb-2">스탯 우위 종합</p>' +
            '<p class="oswald-sharp text-2xl lg:text-3xl font-black italic text-white uppercase tracking-tighter">' + (overallAdv === 'EVEN' ? '⚖️ EVEN' : '🏆 ' + overallAdv) + '</p>' +
            '<p class="oswald-sharp text-xs text-gray-500 italic mt-2 uppercase">' + totalAdv1 + '개 항목 우위 vs ' + totalAdv2 + '개 항목 우위</p>' +
        '</div>';

    // 레이더 차트
    setTimeout(function() {
        if (h2hRadarChart) { h2hRadarChart.destroy(); h2hRadarChart = null; }
        var canvas = document.getElementById('h2h-radar-canvas');
        if (!canvas || typeof Chart === 'undefined') return;
        try {
            h2hRadarChart = new Chart(canvas.getContext('2d'), {
                type: 'radar',
                data: {
                    labels: STAT_LABELS,
                    datasets: [
                        { label: f1.name, data: stats1, fill: true, backgroundColor: 'rgba(225,6,0,0.25)', borderColor: '#E10600', pointBackgroundColor: '#E10600', pointRadius: 4, borderWidth: 2 },
                        { label: f2.name, data: stats2, fill: true, backgroundColor: 'rgba(59,130,246,0.25)', borderColor: '#3b82f6', pointBackgroundColor: '#3b82f6', pointRadius: 4, borderWidth: 2 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: { r: { min: 0, max: 100, ticks: { display: false }, grid: { color: 'rgba(255,255,255,0.07)' }, angleLines: { color: 'rgba(255,255,255,0.07)' }, pointLabels: { color: '#9ca3af', font: { family: 'Oswald', size: 10, weight: '700', style: 'italic' } } } },
                    plugins: { legend: { display: false } }
                }
            });
        } catch(chartErr) { console.warn('[H2H] chart error:', chartErr); }
    }, 80);
}

// ── Stats helper ──────────────────────────────────────────────────────
function _getDisplayStats(f) {
    var s = f && f.stats;
    return (Array.isArray(s) && s.length === 5) ? s : [75, 75, 75, 75, 75];
}

// ── Archive-based matchup records ─────────────────────────────────────
function findH2HRecords(name1, name2) {
    var records = [];
    var seen = {};   // dedupe key: event+f1+f2+method+round
    var archive = (typeof archiveDB !== 'undefined' && archiveDB) ? archiveDB : [];

    var n1 = (name1 || '').toLowerCase().trim();
    var n2 = (name2 || '').toLowerCase().trim();
    if (!n1 || !n2) return [];

    archive.forEach(function(ev) {
        (ev.fights || []).forEach(function(fight) {
            var f1n = (fight.f1 || '').toLowerCase().trim();
            var f2n = (fight.f2 || '').toLowerCase().trim();

            // 정방향: f1=name1, f2=name2
            var fwd = (f1n === n1 && f2n === n2);
            // 역방향: f1=name2, f2=name1
            var rev = (f1n === n2 && f2n === n1);

            if (!fwd && !rev) return;

            var key = [ev.name, fight.f1, fight.f2, fight.method, fight.round].join('|');
            if (seen[key]) return;
            seen[key] = true;

            // winner를 name1 기준으로 정규화
            var winnerRaw = (fight.winner || '').toLowerCase().trim();
            var winner = winnerRaw === n1 ? name1 : winnerRaw === n2 ? name2 : (fight.winner || '');

            records.push({
                event: ev.name,
                date: ev.date,
                winner: winner,
                method: fight.method || '',
                round: fight.round || '',
                time: fight.time || ''
            });
        });
    });

    return records.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
}

// ── Style matchup analysis ────────────────────────────────────────────
function analyzeStyleMatchup(s1, s2, name1, name2) {
    var str1 = s1[0]||75, grp1 = s1[1]||75, stm1 = s1[2]||75, def1 = s1[3]||75, spd1 = s1[4]||75;
    var str2 = s2[0]||75, grp2 = s2[1]||75, stm2 = s2[2]||75, def2 = s2[3]||75, spd2 = s2[4]||75;
    var STAT_NAMES = ['Striking', 'Grappling', 'Stamina', 'Defense', 'Speed'];
    var vals1 = [str1, grp1, stm1, def1, spd1];
    var vals2 = [str2, grp2, stm2, def2, spd2];

    var n1 = (name1 || '').split(' ').pop();
    var n2 = (name2 || '').split(' ').pop();

    // 각 스탯에서 누가 우세한지 파악
    var adv1 = [], adv2 = [];
    STAT_NAMES.forEach(function(label, i) {
        var diff = vals1[i] - vals2[i];
        if (diff >= 5) adv1.push(label);
        else if (diff <= -5) adv2.push(label);
    });

    // 스타일 레이블
    function getStyle(str, grp, spd) {
        if (grp > str + 10) return { label: '그래플러', icon: '🤼' };
        if (str > grp + 15) return { label: '스트라이커', icon: '👊' };
        if (spd > 88)       return { label: '스피드 파이터', icon: '⚡' };
        return { label: '올라운더', icon: '⚔️' };
    }
    var st1 = getStyle(str1, grp1, spd1);
    var st2 = getStyle(str2, grp2, spd2);

    // 관전 포인트 텍스트 생성
    var lines = [];
    if (adv1.length > 0) lines.push(n1 + '는 ' + adv1.join('/') + ' 스탯에서 우위.');
    if (adv2.length > 0) lines.push(n2 + '는 ' + adv2.join('/') + ' 스탯에서 우위.');
    if (adv1.length === 0 && adv2.length === 0) lines.push('두 선수의 스탯이 전반적으로 균형 잡혀 있습니다.');

    // 핵심 변수: 가장 큰 차이 스탯 찾기
    var keyMatchup = '균형 대결';
    var maxDiff = 0;
    var keyIdx = -1;
    STAT_NAMES.forEach(function(_, i) {
        var d = Math.abs(vals1[i] - vals2[i]);
        if (d > maxDiff) { maxDiff = d; keyIdx = i; }
    });

    if (keyIdx >= 0 && maxDiff >= 5) {
        var keyLabel = STAT_NAMES[keyIdx];
        var keyAdvName = vals1[keyIdx] > vals2[keyIdx] ? n1 : n2;
        keyMatchup = keyLabel + ' 격차';
        lines.push('핵심 변수: ' + keyAdvName + '의 ' + keyLabel + ' 우위(' + Math.abs(vals1[keyIdx] - vals2[keyIdx]) + '점 차)가 경기 흐름을 좌우할 가능성이 높습니다.');
    }

    var prediction = lines.join(' ');

    return {
        f1Style: st1.label, f1Icon: st1.icon,
        f2Style: st2.label, f2Icon: st2.icon,
        keyMatchup: keyMatchup,
        prediction: prediction
    };
}

// ── UFC ranking lookup (safe against undefined globals) ───────────────
function findUFCRank(name) {
    var rankings  = (typeof ufcRankingsDB !== 'undefined' && ufcRankingsDB)  ? ufcRankingsDB  : {};
    var divisions = (typeof UFC_DIVISIONS  !== 'undefined' && UFC_DIVISIONS)  ? UFC_DIVISIONS  : [];
    var nameLower = (name || '').toLowerCase();
    var lastName  = nameLower.split(' ').pop();
    var entries   = Object.entries(rankings);
    for (var i = 0; i < entries.length; i++) {
        var divId = entries[i][0], divData = entries[i][1];
        if (divData.champion && (divData.champion.name || '').toLowerCase().includes(lastName)) {
            var di = divisions.find(function(d) { return d.id === divId; });
            return { label: '🏆 ' + (di ? di.label : '') + ' 챔피언', divId: divId };
        }
        var found = (divData.fighters || []).find(function(f) { return (f.name || '').toLowerCase().includes(lastName); });
        if (found) {
            var di2 = divisions.find(function(d) { return d.id === divId; });
            return { label: '#' + found.rank + ' ' + (di2 ? di2.label : ''), divId: divId, rank: found.rank };
        }
    }
    return null;
}
