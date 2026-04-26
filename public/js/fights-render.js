/* ==============================
   FIGHT CARD RENDERING
   (extracted from index.html – global functions, no import/export)
   의존성: state.js (state, adminUnlocked, customFights), constants.js (BET_COST, FIGHTS),
           admin.js (getActiveFights), utils.js (escapeHtml)
============================== */

// ── Fight Card Cache (onclick safe-bridge) ───────────────────────
var _fightCardCache = {};

function openPickSlipFromCard(fightId) {
    var fight = _fightCardCache[fightId];
    if (!fight) return;
    var f1Last = fight.f1.name.split(' ').pop();
    var f2Last = fight.f2.name.split(' ').pop();
    openPickSlip(fightId, f1Last + ' vs ' + f2Last, fight.f1.name, fight.f1.odds || 1.9, fight.f2.name, fight.f2.odds || 1.9);
}

// ── Dot Form Helper ──────────────────────────────────────────────
function renderDotForm(recent) {
    if (!recent || !recent.length) return '';
    return recent.slice(0, 5).map(r =>
        `<div class="w-2 h-2 rounded-full flex-shrink-0 ${r.r === 'W' ? 'bg-green-500' : 'bg-red-500'}"></div>`
    ).join('');
}

// ── Section Header ────────────────────────────────────────────────
function renderSectionHeader(fight, idx) {
    const sectionColors = {
        '메인 카드': 'border-ufcRed text-ufcRed',
        '프렐림': 'border-yellow-500 text-yellow-500',
        '얼리 프렐림': 'border-gray-500 text-gray-500'
    };
    const c = sectionColors[fight.sectionLabel] || 'border-white/30 text-gray-400';
    return `<div class="flex items-center gap-4 mb-4 ${idx > 0 ? 'mt-10' : ''}">
        <div class="border-l-4 ${c} pl-3">
            <div class="oswald-sharp text-xs font-black italic uppercase tracking-[0.25em]">${fight.sectionLabel}</div>
            ${fight.sectionTime ? `<div class="oswald-sharp text-[10px] text-gray-600 italic">${fight.sectionTime}</div>` : ''}
        </div>
        <div class="flex-1 h-px bg-white/5"></div>
    </div>`;
}

// ── Tale of the Tape (Stats Overlay content) ──────────────────────
function renderTaleOfTapeHTML(fight) {
    return `
    <div class="flex items-center justify-between mb-4 pt-2">
        <span class="oswald-sharp text-xs font-black italic uppercase text-ufcRed truncate max-w-[38%]">${fight.f1.name}</span>
        <span class="oswald-sharp text-[8px] font-black italic uppercase tracking-widest text-gray-400 flex-shrink-0 px-2">TALE OF THE TAPE</span>
        <span class="oswald-sharp text-xs font-black italic uppercase text-ufcBlue truncate max-w-[38%] text-right">${fight.f2.name}</span>
    </div>
    <div class="grid grid-cols-2 gap-2 mb-4">
        <div class="rounded-xl p-3 text-center" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1)">
            <p class="oswald-sharp text-[8px] text-gray-400 uppercase tracking-widest mb-1">Record</p>
            <p class="oswald-sharp text-sm font-black italic text-white">${fight.f1.record}</p>
            <div class="flex justify-center gap-1 mt-2">${renderDotForm(fight.f1.recent)}</div>
        </div>
        <div class="rounded-xl p-3 text-center" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1)">
            <p class="oswald-sharp text-[8px] text-gray-400 uppercase tracking-widest mb-1">Record</p>
            <p class="oswald-sharp text-sm font-black italic text-white">${fight.f2.record}</p>
            <div class="flex justify-center gap-1 mt-2">${renderDotForm(fight.f2.recent)}</div>
        </div>
    </div>
    ${renderStatBarsHTML(fight)}`;
}

// ── Hero Card (Main / Co-Main: idx 0 or 1) ───────────────────────
function renderHeroCard(fight, idx) {
    const isMain = idx === 0;
    const tagColor = isMain ? 'bg-ufcRed text-white' : 'bg-white/10 text-white border border-white/20';
    const bias = fight.leftBias || 0.5;
    const redA = (Math.max(0, bias - 0.5) * 2 * 0.5).toFixed(2);
    const blueA = (Math.max(0, 0.5 - bias) * 2 * 0.5).toFixed(2);
    const glowStyle = `box-shadow: 0 0 48px rgba(210,10,10,${redA}), 0 0 48px rgba(37,99,235,${blueA}); cursor:pointer;`;
    const f1Last = fight.f1.name.split(' ').pop();
    const f2Last = fight.f2.name.split(' ').pop();
    const f1Img = fight.f1.imgUrl || '';
    const f2Img = fight.f2.imgUrl || '';
    const f1BgStyle = f1Img
        ? `background-image:url('${f1Img}'); background-size:cover; background-position:60% top;`
        : 'background:linear-gradient(135deg,#1a0000,#0a0a0a);';
    const f2BgStyle = f2Img
        ? `background-image:url('${f2Img}'); background-size:cover; background-position:40% top;`
        : 'background:linear-gradient(225deg,#00001a,#0a0a0a);';

    _fightCardCache[fight.id] = fight;
    return `
    <div id="card-${fight.id}" onclick="if(event.target.closest('button,[data-no-pick]')) return; openPickSlipFromCard('${fight.id}')" class="glass-card ${isMain ? 'rounded-[2.5rem] lg:rounded-[4rem]' : 'rounded-[2rem] lg:rounded-[3rem]'} overflow-hidden transition-all duration-500" style="${glowStyle}">
        <!-- Card Header -->
        <div class="flex items-center justify-between px-5 lg:px-10 py-3 lg:py-4 border-b border-white/10 bg-black/30">
            <div class="flex items-center gap-3">
                <span class="oswald-sharp text-[8px] lg:text-xs font-black italic uppercase tracking-widest px-3 py-1 rounded-full ${tagColor}">${fight.tag}</span>
                <span class="oswald-sharp text-[8px] lg:text-xs text-gray-500 font-black italic tracking-widest uppercase">${fight.division}</span>
            </div>
            <div class="flex items-center gap-2 lg:gap-3">
                <button onclick="toggleStatsOverlay('${fight.id}')"
                    class="oswald-sharp text-[8px] lg:text-[10px] text-gray-400 hover:text-white transition font-black italic uppercase tracking-widest border border-white/15 px-2.5 py-1 rounded-full">ℹ️ STATS</button>
                <button onclick="toggleAnalysis('${fight.id}')" id="analysis-btn-${fight.id}"
                    class="oswald-sharp text-[8px] lg:text-xs text-gray-500 hover:text-ufcRed transition font-black italic uppercase tracking-widest flex items-center gap-1">
                    <span id="analysis-btn-label-${fight.id}">▼ ANALYSIS</span>
                </button>
            </div>
        </div>

        <!-- Community Pick Bar -->
        <div class="px-5 lg:px-10 py-4 bg-black/20 border-b border-white/5">
            <div class="flex items-center justify-between mb-2">
                <span id="live-pct-l-${fight.id}" class="barlow text-sm font-black italic text-red-400 uppercase">${f1Last} 0%</span>
                <span class="barlow text-[10px] font-bold italic text-gray-600 uppercase tracking-widest">커뮤니티 픽</span>
                <span id="live-pct-r-${fight.id}" class="barlow text-sm font-black italic text-blue-400 uppercase">${f2Last} 0%</span>
            </div>
            <div id="live-bar-${fight.id}" class="h-3 rounded-full overflow-hidden flex bg-white/5">
                <div class="live-bar-left h-full rounded-l-full transition-all duration-700" style="width:50%; background:var(--red)"></div>
                <div class="live-bar-right h-full rounded-r-full transition-all duration-700" style="width:50%; background:#2563eb"></div>
            </div>
            <div id="live-total-${fight.id}" class="barlow text-[10px] font-bold italic text-gray-600 uppercase tracking-widest text-center mt-1.5"></div>
        </div>

        <!-- Hero Face-off Area -->
        <div class="relative overflow-hidden" style="min-height:${isMain ? '380px' : '320px'}">
            <!-- F1 Background -->
            <div class="absolute inset-y-0 left-0 w-1/2"
                style="${f1BgStyle} -webkit-mask-image:linear-gradient(to right,rgba(0,0,0,0.95) 30%,transparent 100%); mask-image:linear-gradient(to right,rgba(0,0,0,0.95) 30%,transparent 100%);"></div>
            <!-- F2 Background -->
            <div class="absolute inset-y-0 right-0 w-1/2"
                style="${f2BgStyle} -webkit-mask-image:linear-gradient(to left,rgba(0,0,0,0.95) 30%,transparent 100%); mask-image:linear-gradient(to left,rgba(0,0,0,0.95) 30%,transparent 100%);"></div>
            <!-- Bottom Fade -->
            <div class="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none" style="background:linear-gradient(to top,#0a0a0a 0%,transparent 100%);"></div>
            <!-- VS Center -->
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div class="flex flex-col items-center">
                    <div style="width:1px; height:${isMain ? '64px' : '52px'}; background:linear-gradient(to bottom, transparent, rgba(210,10,10,0.7));"></div>
                    <div class="${isMain ? 'w-14 h-14' : 'w-11 h-11'} rounded-full flex items-center justify-center flex-shrink-0"
                        style="background:rgba(8,8,8,0.92); border:1.5px solid rgba(210,10,10,0.55); box-shadow:0 0 28px rgba(210,10,10,0.4), inset 0 0 12px rgba(210,10,10,0.1);">
                        <span class="oswald-sharp ${isMain ? 'text-xl' : 'text-base'} font-black italic text-white leading-none tracking-tighter">VS</span>
                    </div>
                    <div style="width:1px; height:${isMain ? '64px' : '52px'}; background:linear-gradient(to top, transparent, rgba(210,10,10,0.7));"></div>
                </div>
            </div>
            <!-- F1 Info (bottom-left) -->
            <div class="absolute bottom-0 left-0 w-[48%] p-4 lg:p-6 z-20">
                <div class="flex gap-1 mb-1.5">${renderDotForm(fight.f1.recent)}</div>
                <h4 data-no-pick="1" onclick="openFighterProfile(${JSON.stringify(fight.f1).replace(/\"/g, '&quot;')})"
                    class="oswald-sharp ${isMain ? 'text-xl lg:text-3xl' : 'text-lg lg:text-2xl'} font-black italic uppercase tracking-tighter leading-tight text-white cursor-pointer hover:text-ufcRed transition mb-1">${fight.f1.name}</h4>
                ${fight.f1.odds ? `<p class="oswald-sharp text-xs text-ufcRed italic font-bold tracking-widest mb-3">ODDS ${fight.f1.odds} &nbsp;·&nbsp; +${Math.round(fight.f1.odds * 100)}P</p>` : '<p class="oswald-sharp text-[9px] text-ufcRed italic font-bold tracking-widest mb-3">TAP TO PICK ›</p>'}
            </div>
            <!-- F2 Info (bottom-right) -->
            <div class="absolute bottom-0 right-0 w-[48%] p-4 lg:p-6 z-20 text-right">
                <div class="flex gap-1 mb-1.5 justify-end">${renderDotForm(fight.f2.recent)}</div>
                <h4 data-no-pick="1" onclick="openFighterProfile(${JSON.stringify(fight.f2).replace(/\"/g, '&quot;')})"
                    class="oswald-sharp ${isMain ? 'text-xl lg:text-3xl' : 'text-lg lg:text-2xl'} font-black italic uppercase tracking-tighter leading-tight text-white cursor-pointer hover:text-ufcBlue transition mb-1">${fight.f2.name}</h4>
                ${fight.f2.odds ? `<p class="oswald-sharp text-xs text-ufcBlue italic font-bold tracking-widest mb-3">ODDS ${fight.f2.odds} &nbsp;·&nbsp; +${Math.round(fight.f2.odds * 100)}P</p>` : '<p class="oswald-sharp text-[9px] text-ufcBlue italic font-bold tracking-widest mb-3">TAP TO PICK ›</p>'}
            </div>
        </div>

        <!-- Stats Overlay (Tale of the Tape) — covers entire card -->
        <div id="stats-overlay-${fight.id}" data-no-pick="1" class="hidden relative z-40 border-t border-white/10" style="background:#0d0d0d;">
            <div class="flex items-center justify-between px-5 py-3 border-b border-white/10">
                <span class="oswald-sharp text-[9px] font-black italic uppercase tracking-widest text-gray-400">📊 TALE OF THE TAPE</span>
                <button onclick="toggleStatsOverlay('${fight.id}')"
                    class="oswald-sharp text-[9px] text-gray-400 hover:text-white border border-white/20 px-3 py-1.5 rounded-full transition">✕ CLOSE</button>
            </div>
            <div class="p-5 lg:p-8">
                ${renderTaleOfTapeHTML(fight)}
            </div>
        </div>

        <!-- Analysis Section (collapsible, 4 tabs) -->
        <div id="analysis-${fight.id}" data-no-pick="1" class="hidden border-t border-white/10 bg-black/20">
            <div class="flex border-b border-white/10 bg-black/30">
                <button onclick="switchAnalysisTab('${fight.id}','radar')" id="atab-radar-${fight.id}"
                    class="oswald-sharp text-[10px] lg:text-xs font-black italic uppercase tracking-widest px-4 lg:px-6 py-3 text-ufcRed border-b-2 border-ufcRed transition">차트</button>
                <button onclick="switchAnalysisTab('${fight.id}','stats')" id="atab-stats-${fight.id}"
                    class="oswald-sharp text-[10px] lg:text-xs font-black italic uppercase tracking-widest px-4 lg:px-6 py-3 text-gray-500 border-b-2 border-transparent hover:text-gray-300 transition">스탯</button>
                <button onclick="switchAnalysisTab('${fight.id}','insight')" id="atab-insight-${fight.id}"
                    class="oswald-sharp text-[10px] lg:text-xs font-black italic uppercase tracking-widest px-4 lg:px-6 py-3 text-gray-500 border-b-2 border-transparent hover:text-gray-300 transition">분석</button>
                <button onclick="switchAnalysisTab('${fight.id}','recent')" id="atab-recent-${fight.id}"
                    class="oswald-sharp text-[10px] lg:text-xs font-black italic uppercase tracking-widest px-4 lg:px-6 py-3 text-gray-500 border-b-2 border-transparent hover:text-gray-300 transition">최근전적</button>
            </div>
            <div id="atab-content-radar-${fight.id}" class="p-6 lg:p-10">
                <div class="text-center mb-4">
                    <span class="oswald-sharp text-gray-500 text-[10px] lg:text-sm tracking-[0.3em] font-black italic uppercase">Fighter Stat Comparison</span>
                </div>
                <div class="relative mx-auto w-full max-w-md" style="height:260px">
                    <canvas id="radar-${fight.id}"></canvas>
                </div>
                <div class="flex justify-center gap-6 mt-4">
                    <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-ufcRed"></div><span class="oswald-sharp text-[10px] text-gray-400 italic uppercase">${f1Last}</span></div>
                    <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-ufcBlue"></div><span class="oswald-sharp text-[10px] text-gray-400 italic uppercase">${f2Last}</span></div>
                </div>
            </div>
            <div id="atab-content-stats-${fight.id}" class="hidden p-6 lg:p-10">${renderStatBarsHTML(fight)}</div>
            <div id="atab-content-insight-${fight.id}" class="hidden p-6 lg:p-10">${renderInsightHTML(fight)}</div>
            <div id="atab-content-recent-${fight.id}" class="hidden p-6 lg:p-10">${renderRecentHTML(fight)}</div>
        </div>

        <!-- Settled Badge -->
        <div id="settled-${fight.id}" class="hidden border-t border-white/10 py-4 lg:py-6 text-center">
            <span id="settled-text-${fight.id}" class="oswald-sharp text-sm lg:text-xl font-black italic uppercase tracking-widest"></span>
        </div>
    </div>`;
}

// ── Compact Strip Row (Prelims: idx >= 2) ─────────────────────────
function renderStripRow(fight) {
    const glow = fight.leftBias > 0.65
        ? 'border-ufcRed/20 shadow-[0_0_20px_rgba(210,10,10,0.1)]'
        : fight.leftBias < 0.35
        ? 'border-ufcBlue/20 shadow-[0_0_20px_rgba(59,130,246,0.1)]'
        : 'border-white/[0.06]';
    const f1Last = fight.f1.name.split(' ').pop();
    const f2Last = fight.f2.name.split(' ').pop();
    const divShort = fight.division.replace(' CHAMPIONSHIP', '').replace("WOMEN'S", 'W').trim();

    const f1Img = fight.f1.imgUrl || '';
    const f2Img = fight.f2.imgUrl || '';

    _fightCardCache[fight.id] = fight;
    return `
    <div id="card-${fight.id}" onclick="openPickSlipFromCard('${fight.id}')" class="glass-card rounded-2xl overflow-hidden transition-all duration-300 border ${glow} cursor-pointer">
        <!-- Thin community pick bar at top -->
        <div id="live-bar-${fight.id}" class="h-1 flex w-full bg-white/5">
            <div class="live-bar-left h-full transition-all duration-700" style="width:50%; background:var(--red)"></div>
            <div class="live-bar-right h-full transition-all duration-700" style="width:50%; background:#2563eb"></div>
        </div>
        <!-- Main strip row -->
        <div class="flex items-center gap-2 lg:gap-3 px-3 lg:px-4 py-2.5">
            <!-- Tag + Division label -->
            <div class="hidden sm:flex flex-col items-start gap-0.5 min-w-[52px] flex-shrink-0">
                <span class="oswald-sharp text-[7px] font-black italic uppercase tracking-widest px-2 py-0.5 rounded-full bg-black/50 text-gray-500 border border-white/10 truncate">${fight.tag}</span>
                <span class="oswald-sharp text-[7px] text-gray-700 italic truncate max-w-[56px]">${divShort}</span>
            </div>
            <!-- F1 Thumbnail -->
            ${f1Img ? `<div class="flex-shrink-0 w-10 h-14 rounded-lg overflow-hidden border border-white/10" style="background-image:url('${f1Img}');background-size:cover;background-position:center 10%;"></div>` : ''}
            <!-- Fighter 1 -->
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                    <span class="oswald-sharp text-xs lg:text-sm font-black italic uppercase text-white truncate">${fight.f1.name}</span>
                    <div class="flex gap-0.5 flex-shrink-0">${renderDotForm(fight.f1.recent)}</div>
                </div>
                <div class="flex items-center gap-1.5 mt-0.5">
                    ${fight.f1.odds ? `<span class="oswald-sharp text-[9px] text-ufcRed italic font-bold">×${fight.f1.odds}</span>` : ''}
                    <span id="live-pct-l-${fight.id}" class="oswald-sharp text-[8px] text-gray-500 italic"></span>
                </div>
            </div>
            <!-- VS -->
            <div class="flex-shrink-0 px-1">
                <span class="oswald-sharp text-[10px] font-black italic text-gray-700">VS</span>
            </div>
            <!-- Fighter 2 -->
            <div class="flex-1 min-w-0 text-right">
                <div class="flex items-center justify-end gap-1.5">
                    <div class="flex gap-0.5 flex-shrink-0">${renderDotForm(fight.f2.recent)}</div>
                    <span class="oswald-sharp text-xs lg:text-sm font-black italic uppercase text-white truncate">${fight.f2.name}</span>
                </div>
                <div class="flex items-center justify-end gap-1.5 mt-0.5">
                    <span id="live-pct-r-${fight.id}" class="oswald-sharp text-[8px] text-gray-500 italic"></span>
                    ${fight.f2.odds ? `<span class="oswald-sharp text-[9px] text-ufcBlue italic font-bold">×${fight.f2.odds}</span>` : ''}
                </div>
            </div>
            <!-- F2 Thumbnail -->
            ${f2Img ? `<div class="flex-shrink-0 w-10 h-14 rounded-lg overflow-hidden border border-white/10" style="background-image:url('${f2Img}');background-size:cover;background-position:center 10%;"></div>` : ''}
            <div id="live-total-${fight.id}" class="hidden"></div>
        </div>
        <!-- Settled Badge (compact) -->
        <div id="settled-${fight.id}" class="hidden border-t border-white/10 py-2 px-4 text-center bg-black/20">
            <span id="settled-text-${fight.id}" class="oswald-sharp text-xs font-black italic uppercase tracking-widest"></span>
        </div>
    </div>`;
}

// ── Main Render Function ──────────────────────────────────────────
function renderFightCards() {
    const container = document.getElementById('fight-cards-container');
    if (!container) return;

    _fightCardCache = {};
    const fights = getActiveFights();

    // DB 데이터 없으면 skeleton 표시 후 fetch 트리거
    if (!fights.length && typeof fetchUpcomingMatchups === 'function') {
        container.innerHTML = `<div class="space-y-3">
            ${Array(3).fill('<div class="glass-card rounded-2xl h-24 animate-pulse" style="background:rgba(255,255,255,0.03)"></div>').join('')}
            <p class="oswald-sharp text-gray-700 italic text-xs uppercase tracking-widest text-center pt-2">대진표 로딩 중...</p>
        </div>`;
        fetchUpcomingMatchups();
        return;
    }

    let _lastSection = null;
    let _html = '';

    fights.forEach((fight, idx) => {
        // Section header
        if (fight.sectionLabel && fight.sectionLabel !== _lastSection) {
            _lastSection = fight.sectionLabel;
            _html += renderSectionHeader(fight, idx);
        }
        // Layout: Hero for 메인 카드, Strip for prelims
        if (fight.sectionLabel === '메인 카드') {
            _html += renderHeroCard(fight, idx);
        } else {
            _html += renderStripRow(fight, idx);
        }
    });

    container.innerHTML = _html;
    updateAllFightCards();
    updateEventTotalPicks();
    if (typeof loadAllEventPickCounts === 'function') loadAllEventPickCounts();
}

/* ── 분석 탭 헬퍼 함수 ── */
function renderStatBarsHTML(fight) {
    const f1 = fight.f1, f2 = fight.f2;
    if (!f1.slpm && !f1.strAcc) return '<p class="text-center text-gray-600 text-sm italic oswald-sharp">스탯 데이터 없음</p>';
    const bar = (label, v1, v2, fmt) => {
        const mx = Math.max(v1, v2, 0.01);
        const p1 = Math.round(v1 / mx * 100), p2 = Math.round(v2 / mx * 100);
        return `<div class="mb-5">
            <div class="oswald-sharp text-[10px] text-gray-400 uppercase tracking-widest text-center mb-2">${label}</div>
            <div class="flex items-center gap-3">
                <span class="oswald-sharp text-sm font-black italic text-ufcRed w-12 text-right">${fmt(v1)}</span>
                <div class="flex-1 flex gap-1">
                    <div class="flex-1 h-2 bg-white/5 rounded-full overflow-hidden flex justify-end"><div class="h-full bg-ufcRed rounded-full transition-all" style="width:${p1}%"></div></div>
                    <div class="flex-1 h-2 bg-white/5 rounded-full overflow-hidden"><div class="h-full bg-ufcBlue rounded-full transition-all" style="width:${p2}%"></div></div>
                </div>
                <span class="oswald-sharp text-sm font-black italic text-ufcBlue w-12">${fmt(v2)}</span>
            </div>
        </div>`;
    };
    return `<div class="flex justify-between mb-5 oswald-sharp text-xs font-black italic uppercase">
        <span class="text-ufcRed">${f1.name.split(' ').slice(-1)[0]}</span>
        <span class="text-ufcBlue">${f2.name.split(' ').slice(-1)[0]}</span>
    </div>
    ${bar('스트라이크/분 (SLpM)', f1.slpm || 0, f2.slpm || 0, v => v.toFixed(1))}
    ${bar('타격 정확도', f1.strAcc || 0, f2.strAcc || 0, v => v + '%')}
    ${bar('테이크다운/15분', f1.tdAvg || 0, f2.tdAvg || 0, v => v.toFixed(2))}
    ${bar('서브미션 시도/15분', f1.subAvg || 0, f2.subAvg || 0, v => v.toFixed(2))}`;
}

function renderInsightHTML(fight) {
    const f1 = fight.f1, f2 = fight.f2;
    if (!f1.koRate && !f1.subRate) return '<p class="text-center text-gray-600 text-sm italic oswald-sharp">데이터 없음</p>';
    const ring = (pct, label, borderCls, textCls) =>
        `<div class="text-center">
            <div class="w-14 h-14 rounded-full border-2 ${borderCls} bg-white/5 flex flex-col items-center justify-center mx-auto mb-1">
                <span class="oswald-sharp text-sm font-black italic ${textCls}">${pct || 0}%</span>
            </div>
            <span class="oswald-sharp text-[9px] text-gray-600 italic">${label}</span>
        </div>`;
    const card = (f, nameCls) =>
        `<div class="text-center">
            <div class="oswald-sharp text-xs font-black italic uppercase mb-4 ${nameCls}">${f.name}</div>
            <div class="flex justify-center gap-4 mb-2">
                ${ring(f.koRate, 'KO/TKO', 'border-ufcRed', 'text-ufcRed')}
                ${ring(f.subRate, '서브미션', 'border-green-500', 'text-green-400')}
                ${ring(f.decRate, '판정', 'border-ufcBlue', 'text-ufcBlue')}
            </div>
            <div class="oswald-sharp text-[10px] text-gray-600 italic">승리 방법 비율</div>
        </div>`;
    return `<div class="grid grid-cols-2 gap-6">${card(f1, 'text-ufcRed')}${card(f2, 'text-ufcBlue')}</div>`;
}

function renderRecentHTML(fight) {
    const f1 = fight.f1, f2 = fight.f2;
    if (!f1.recent && !f2.recent) return '<p class="text-center text-gray-600 text-sm italic oswald-sharp">전적 데이터 없음</p>';
    const col = (f, nameCls) =>
        `<div>
            <div class="oswald-sharp text-xs font-black italic uppercase mb-3 pb-2 border-b border-white/10 ${nameCls}">${f.name}</div>
            ${(f.recent || []).map(r => `
            <div class="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                <div class="w-6 h-6 rounded flex items-center justify-center text-[10px] font-black oswald-sharp ${r.r === 'W' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">${r.r}</div>
                <div class="flex-1 min-w-0">
                    <div class="oswald-sharp text-xs font-bold text-white truncate">${r.opp}</div>
                    <div class="oswald-sharp text-[10px] text-gray-600 italic truncate">${r.method} · ${r.event}</div>
                </div>
            </div>`).join('')}
        </div>`;
    return `<div class="grid grid-cols-2 gap-4">${col(f1, 'text-ufcRed')}${col(f2, 'text-ufcBlue')}</div>`;
}

function switchAnalysisTab(fightId, tab) {
    ['radar', 'stats', 'insight', 'recent'].forEach(t => {
        const btn = document.getElementById(`atab-${t}-${fightId}`);
        const content = document.getElementById(`atab-content-${t}-${fightId}`);
        if (!btn || !content) return;
        const active = t === tab;
        btn.classList.toggle('text-ufcRed', active);
        btn.classList.toggle('border-ufcRed', active);
        btn.classList.toggle('text-gray-500', !active);
        btn.classList.toggle('border-transparent', !active);
        content.classList.toggle('hidden', !active);
    });
    if (tab === 'radar') setTimeout(() => initRadarChart(fightId), 100);
}

function toggleAnalysis(fightId) {
    const panel = document.getElementById(`analysis-${fightId}`);
    const btnLabel = document.getElementById(`analysis-btn-label-${fightId}`);
    if (!panel) return;
    const isHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    if (btnLabel) btnLabel.textContent = isHidden ? '▲ ANALYSIS' : '▼ ANALYSIS';
    if (isHidden) switchAnalysisTab(fightId, 'radar');
}

function toggleStatsOverlay(fightId) {
    const overlay = document.getElementById(`stats-overlay-${fightId}`);
    if (overlay) overlay.classList.toggle('hidden');
}

function updateEventTotalPicks() {
    const total = Object.keys(state.pendings).length;
    const el = document.getElementById('event-total-picks');
    if (el) el.textContent = total;
}

function updateAllFightCards() {
    getActiveFights().forEach(fight => {
        const pending = state.pendings[fight.id];
        const settled = state.settled?.[fight.id];
        const btn1 = document.getElementById(`bet-btn-f1-${fight.id}`);
        const btn2 = document.getElementById(`bet-btn-f2-${fight.id}`);
        const settledDiv = document.getElementById(`settled-${fight.id}`);
        const settledText = document.getElementById(`settled-text-${fight.id}`);

        if (btn1) { btn1.disabled = false; btn1.classList.remove('opacity-40', 'cursor-not-allowed'); }
        if (btn2) { btn2.disabled = false; btn2.classList.remove('opacity-40', 'cursor-not-allowed'); }
        if (settledDiv) { settledDiv.classList.add('hidden'); settledDiv.style.background = ''; }

        if (pending) {
            if (btn1) { btn1.disabled = true; btn1.classList.add('opacity-40', 'cursor-not-allowed'); }
            if (btn2) { btn2.disabled = true; btn2.classList.add('opacity-40', 'cursor-not-allowed'); }
            return;
        }

        if (settled && settledDiv && settledText) {
            if (btn1) { btn1.disabled = true; btn1.classList.add('opacity-40', 'cursor-not-allowed'); }
            if (btn2) { btn2.disabled = true; btn2.classList.add('opacity-40', 'cursor-not-allowed'); }
            settledDiv.classList.remove('hidden');
            if (settled.result === 'WIN') {
                const bonusTags = [];
                if (settled.hadMethodBonus) bonusTags.push('<span class="text-yellow-400">🎯방식</span>');
                if (settled.hadRoundBonus) bonusTags.push('<span class="text-yellow-300">⏱라운드</span>');
                if (settled.hadUpsetBonus) bonusTags.push('<span class="text-orange-400">🔥업셋</span>');
                const bonusHtml = bonusTags.length ? ' · ' + bonusTags.join(' ') : '';
                settledText.innerHTML = `<span class="text-ufcRed">★ WIN +${settled.payout}P · ${escapeHtml(settled.actualWinner)} (${escapeHtml(settled.actualMethod || '—')}) ★</span>${bonusHtml}`;
                settledDiv.style.background = 'rgba(210,10,10,0.08)';
            } else {
                settledText.innerHTML = `<span class="text-gray-400">✗ LOSE · 승자: ${escapeHtml(settled.actualWinner)} (${escapeHtml(settled.actualMethod || '—')})</span>`;
            }
        }
    });
}

/* [📊 Radar Chart] */
function initRadarChart(fightId) {
    const fight = getActiveFights().find(f => f.id === fightId);
    if (!fight) return;
    const canvas = document.getElementById(`radar-${fightId}`);
    if (!canvas) return;

    if (fightCharts[fightId]) fightCharts[fightId].destroy();

    const ctx = canvas.getContext('2d');
    fightCharts[fightId] = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['타격', '레슬링', '서브미션', '방어', '피니시'],
            datasets: [
                {
                    label: fight.f1.name,
                    data: fight.f1.stats,
                    fill: true,
                    backgroundColor: 'rgba(210, 10, 10, 0.35)',
                    borderColor: '#d20a0a',
                    pointBackgroundColor: '#d20a0a',
                    pointBorderColor: '#fff',
                },
                {
                    label: fight.f2.name,
                    data: fight.f2.stats,
                    fill: true,
                    backgroundColor: 'rgba(59, 130, 246, 0.35)',
                    borderColor: '#3b82f6',
                    pointBackgroundColor: '#3b82f6',
                    pointBorderColor: '#fff',
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: 'rgba(255,255,255,0.1)' },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    pointLabels: { color: '#aaa', font: { family: 'Oswald', size: 10, style: 'italic' } },
                    ticks: { display: false, stepSize: 20 },
                    suggestedMin: 50,
                    suggestedMax: 100
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function openPickSlip(fightId, match, f1Name, f1Odds, f2Name, f2Odds) {
    const cost = typeof BET_COST !== 'undefined' ? BET_COST : 100;
    if (!currentUser) {
        showToast('⚠ 베팅은 로그인 후 가능합니다');
        return;
    }
    if (typeof state !== 'undefined' && state.points < cost) {
        showToast('⚠️ 포인트 부족 (' + cost + 'P 필요)');
        return;
    }
    if (typeof state !== 'undefined' && state.pendings && state.pendings[fightId]) {
        showToast('⚠️ 이미 이 경기에 예측을 등록했습니다');
        return;
    }
    if (typeof state !== 'undefined' && state.settled && state.settled[fightId]) {
        showToast('⚠️ 이미 결과가 확정된 경기입니다');
        return;
    }

    const matchTitleEl = document.getElementById('bs-match-title');
    const stepLabelEl = document.getElementById('bs-step-label');
    const pickStepEl = document.getElementById('bs-pick-step');
    const confirmStepEl = document.getElementById('bs-confirm-step');
    const backdropEl = document.getElementById('bet-slip-backdrop');
    const panelEl = document.getElementById('bet-slip-panel');
    const leftPickBtn = document.getElementById('bs-pick-f1');
    const rightPickBtn = document.getElementById('bs-pick-f2');
    const safeF1Odds = Number(f1Odds) > 0 ? Number(f1Odds) : 2.0;
    const safeF2Odds = Number(f2Odds) > 0 ? Number(f2Odds) : 2.0;

    if (stepLabelEl) stepLabelEl.textContent = 'FIGHTER SELECT';
    if (matchTitleEl) matchTitleEl.textContent = match;
    if (pickStepEl) pickStepEl.classList.remove('hidden');
    if (confirmStepEl) confirmStepEl.classList.add('hidden');

    if (leftPickBtn) {
        leftPickBtn.textContent = `${f1Name}  +${Math.round(100 * safeF1Odds)}P`;
        leftPickBtn.onclick = function() {
            selectPickFighter('left', fightId, match, f1Name, safeF1Odds);
        };
    }
    if (rightPickBtn) {
        rightPickBtn.textContent = `${f2Name}  +${Math.round(100 * safeF2Odds)}P`;
        rightPickBtn.onclick = function() {
            selectPickFighter('right', fightId, match, f2Name, safeF2Odds);
        };
    }

    if (backdropEl) backdropEl.classList.add('bs-open');
    requestAnimationFrame(function() {
        if (panelEl) panelEl.classList.add('bs-open');
    });
}

function selectPickFighter(side, fightId, match, name, odds) {
    const safeOdds = Number(odds) > 0 ? Number(odds) : 2.0;
    const pickStepEl = document.getElementById('bs-pick-step');
    const confirmStepEl = document.getElementById('bs-confirm-step');
    const matchTitleEl = document.getElementById('bs-match-title');
    const pickNameEl = document.getElementById('bs-pick-name');
    const payoutEl = document.getElementById('bs-payout');
    const statusMsgEl = document.getElementById('bs-status-msg');
    const confirmBtn = document.getElementById('bs-confirm-btn');

    if (pickStepEl) pickStepEl.classList.add('hidden');
    if (confirmStepEl) confirmStepEl.classList.remove('hidden');
    const stepLabelEl2 = document.getElementById('bs-step-label');
    if (stepLabelEl2) stepLabelEl2.textContent = 'PICK CONFIRMATION';
    if (matchTitleEl) matchTitleEl.textContent = match;
    if (pickNameEl) pickNameEl.textContent = name;
    if (payoutEl) payoutEl.textContent = '+' + Math.round(100 * safeOdds) + 'P';
    if (statusMsgEl) statusMsgEl.textContent = '';
    if (confirmBtn) {
        const cost = typeof BET_COST !== 'undefined' ? BET_COST : 100;
        confirmBtn.textContent = '✓ CONFIRM PICK — ' + cost + 'P';
        confirmBtn.disabled = false;
    }

    ['ko', 'sub', 'ud', 'any'].forEach(function(key) {
        const btn = document.getElementById('bs-mb-' + key);
        if (btn) btn.className = btn.className.replace(/\bbs-sel-\w+/g, '');
    });
    [0, 1, 2, 3, 4, 5].forEach(function(round) {
        const btn = document.getElementById('bs-rb-' + round);
        if (btn) btn.classList.remove('bs-sel');
    });

    window.activeBetSlip = { fightId, side, match, pick: name, odds: safeOdds, method: null, methodBonus: 0, round: null };
}
