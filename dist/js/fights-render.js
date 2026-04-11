/* ==============================
   FIGHT CARD RENDERING
   (extracted from index.html – global functions, no import/export)
   의존성: state.js (state, adminUnlocked, customFights), constants.js (BET_COST, FIGHTS),
           admin.js (getActiveFights), utils.js (escapeHtml)
============================== */

function renderFightCards() {
    const container = document.getElementById('fight-cards-container');
    if (!container) return;

    const fights = getActiveFights();
    let _lastSection = null;
    let _html = '';
    fights.forEach((fight, idx) => {
        const isMain = idx === 0;
        // 섹션 헤더 삽입
        if (fight.sectionLabel && fight.sectionLabel !== _lastSection) {
            _lastSection = fight.sectionLabel;
            const sectionColors = { '메인 카드': 'border-ufcRed text-ufcRed', '프렐림': 'border-yellow-500 text-yellow-500', '얼리 프렐림': 'border-gray-500 text-gray-500' };
            const c = sectionColors[fight.sectionLabel] || 'border-white/30 text-gray-400';
            _html += `<div class="flex items-center gap-4 mb-4 ${idx > 0 ? 'mt-10' : ''}">
                <div class="border-l-4 ${c} pl-3">
                    <div class="oswald-sharp text-xs font-black italic uppercase tracking-[0.25em]">${fight.sectionLabel}</div>
                    ${fight.sectionTime ? `<div class="oswald-sharp text-[10px] text-gray-600 italic">${fight.sectionTime}</div>` : ''}
                </div>
                <div class="flex-1 h-px bg-white/5"></div>
            </div>`;
        }

        const cardSize = isMain
            ? 'rounded-[2.5rem] lg:rounded-[4rem]'
            : 'rounded-[2rem] lg:rounded-[3rem]';
        const tagColor = isMain
            ? 'bg-ufcRed text-white'
            : idx === 1
            ? 'bg-white/10 text-white border border-white/20'
            : 'bg-black/40 text-gray-400 border border-white/10';

        _html += `
        <div id="card-${fight.id}" class="glass-card ${cardSize} overflow-hidden transition-all duration-500">
            <!-- Card Header -->
            <div class="flex items-center justify-between px-6 lg:px-12 py-4 lg:py-6 border-b border-white/10 bg-black/30">
                <div class="flex items-center gap-3 lg:gap-4">
                    <span class="oswald-sharp text-[8px] lg:text-xs font-black italic uppercase tracking-widest px-3 py-1 rounded-full ${tagColor}">${fight.tag}</span>
                    <span class="oswald-sharp text-[8px] lg:text-xs text-gray-500 font-black italic tracking-widest uppercase">${fight.division}</span>
                </div>
                <div class="flex items-center gap-3">
                    <!-- 라이브 픽 카운터 -->
                    <div id="live-total-${fight.id}" class="barlow text-[10px] font-bold italic text-gray-600 uppercase tracking-widest"></div>
                    <button onclick="toggleAnalysis('${fight.id}')" id="analysis-btn-${fight.id}" class="oswald-sharp text-[8px] lg:text-xs text-gray-500 hover:text-ufcRed transition font-black italic uppercase tracking-widest flex items-center gap-2">
                        <span id="analysis-btn-label-${fight.id}">▼ ANALYSIS</span>
                    </button>
                </div>
            </div>

            <!-- 실시간 커뮤니티 픽 바 -->
            <div class="px-6 lg:px-12 py-3 bg-black/20 border-b border-white/5">
                <div class="flex items-center justify-between mb-1.5">
                    <span id="live-pct-l-${fight.id}" class="barlow text-[10px] font-black italic text-red-400 uppercase">${fight.f1.name.split(' ').pop()} 0%</span>
                    <span class="barlow text-[9px] font-bold italic text-gray-700 uppercase tracking-widest">커뮤니티 픽 현황</span>
                    <span id="live-pct-r-${fight.id}" class="barlow text-[10px] font-black italic text-blue-400 uppercase">${fight.f2.name.split(' ').pop()} 0%</span>
                </div>
                <div id="live-bar-${fight.id}" class="h-1.5 rounded-full overflow-hidden flex bg-white/5">
                    <div class="live-bar-left h-full rounded-l-full transition-all duration-700" style="width:50%; background:var(--red)"></div>
                    <div class="live-bar-right h-full rounded-r-full transition-all duration-700" style="width:50%; background:#2563eb"></div>
                </div>
            </div>

            <!-- Fighters Row -->
            <div class="flex flex-col ${isMain ? 'lg:flex-row' : 'lg:flex-row'} items-stretch">
                <!-- Fighter 1 -->
                <div class="flex-1 ${isMain ? 'p-8 lg:p-16' : 'p-6 lg:p-10'} text-center border-b lg:border-b-0 lg:border-r border-white/10">
                    <span class="oswald-sharp text-ufcRed font-black text-[10px] lg:text-sm italic tracking-widest uppercase">${fight.f1.rank} · ODDS ${fight.f1.odds}</span>
                    <h4 onclick="openFighterProfile(${JSON.stringify(fight.f1).replace(/\"/g, '&quot;')})" class="oswald-sharp ${isMain ? 'text-2xl lg:text-5xl' : 'text-xl lg:text-3xl'} font-black italic my-3 lg:my-6 uppercase tracking-tighter leading-tight cursor-pointer hover:text-ufcRed transition group-hover:text-ufcRed">${fight.f1.name} <span class="text-[10px] lg:text-sm text-gray-600 font-normal not-italic align-middle">↗</span></h4>
                    <div class="grid grid-cols-3 gap-2 mb-4 lg:mb-6">
                        <div class="bg-black/40 p-2 lg:p-4 rounded-xl border border-white/5">
                            <p class="text-gray-400 oswald-sharp text-[7px] lg:text-[10px] uppercase tracking-widest">Record</p>
                            <p class="oswald-sharp text-sm lg:text-xl font-bold italic">${fight.f1.record}</p>
                        </div>
                        <div class="bg-black/40 p-2 lg:p-4 rounded-xl border border-white/5">
                            <p class="text-gray-400 oswald-sharp text-[7px] lg:text-[10px] uppercase tracking-widest">Height</p>
                            <p class="oswald-sharp text-sm lg:text-xl font-bold italic">${fight.f1.height}</p>
                        </div>
                        <div class="bg-black/40 p-2 lg:p-4 rounded-xl border border-white/5">
                            <p class="text-gray-400 oswald-sharp text-[7px] lg:text-[10px] uppercase tracking-widest">Reach</p>
                            <p class="oswald-sharp text-sm lg:text-xl font-bold italic">${fight.f1.reach}</p>
                        </div>
                    </div>
                    <p class="text-ufcRed oswald-sharp text-[10px] lg:text-xs italic font-bold tracking-widest mb-3 lg:mb-5 uppercase">PROFIT: ${Math.round(fight.f1.odds * 100)}P ON SUCCESS</p>
                    <button id="bet-btn-f1-${fight.id}" onclick="openBetSlip('${fight.id}', 'left', '${fight.f1.name} vs ${fight.f2.name}', '${fight.f1.name}', ${fight.f1.odds})"
                        class="oswald-sharp w-full py-3 lg:py-5 bg-white text-black font-black ${isMain ? 'text-lg lg:text-2xl' : 'text-sm lg:text-xl'} rounded-xl hover:shadow-[0_0_20px_rgba(210,10,10,0.5)] transition-all italic tracking-widest uppercase">
                        BET ${fight.f1.name.split(' ')[fight.f1.name.split(' ').length - 1].toUpperCase()}
                    </button>
                </div>

                <!-- VS Divider -->
                <div class="bg-ufcRed flex items-center justify-center py-3 lg:py-0 ${isMain ? 'lg:px-10' : 'lg:px-6'}">
                    <span class="oswald-sharp ${isMain ? 'text-3xl lg:text-7xl' : 'text-2xl lg:text-4xl'} font-black italic tracking-tighter">VS</span>
                </div>

                <!-- Fighter 2 -->
                <div class="flex-1 ${isMain ? 'p-8 lg:p-16' : 'p-6 lg:p-10'} text-center bg-white/[0.01]">
                    <span class="oswald-sharp text-ufcBlue font-black text-[10px] lg:text-sm italic tracking-widest uppercase">${fight.f2.rank} · ODDS ${fight.f2.odds}</span>
                    <h4 onclick="openFighterProfile(${JSON.stringify(fight.f2).replace(/\"/g, '&quot;')})" class="oswald-sharp ${isMain ? 'text-2xl lg:text-5xl' : 'text-xl lg:text-3xl'} font-black italic my-3 lg:my-6 uppercase tracking-tighter leading-tight cursor-pointer hover:text-ufcBlue transition">${fight.f2.name} <span class="text-[10px] lg:text-sm text-gray-600 font-normal not-italic align-middle">↗</span></h4>
                    <div class="grid grid-cols-3 gap-2 mb-4 lg:mb-6">
                        <div class="bg-black/40 p-2 lg:p-4 rounded-xl border border-white/5">
                            <p class="text-gray-400 oswald-sharp text-[7px] lg:text-[10px] uppercase tracking-widest">Record</p>
                            <p class="oswald-sharp text-sm lg:text-xl font-bold italic">${fight.f2.record}</p>
                        </div>
                        <div class="bg-black/40 p-2 lg:p-4 rounded-xl border border-white/5">
                            <p class="text-gray-400 oswald-sharp text-[7px] lg:text-[10px] uppercase tracking-widest">Height</p>
                            <p class="oswald-sharp text-sm lg:text-xl font-bold italic">${fight.f2.height}</p>
                        </div>
                        <div class="bg-black/40 p-2 lg:p-4 rounded-xl border border-white/5">
                            <p class="text-gray-400 oswald-sharp text-[7px] lg:text-[10px] uppercase tracking-widest">Reach</p>
                            <p class="oswald-sharp text-sm lg:text-xl font-bold italic">${fight.f2.reach}</p>
                        </div>
                    </div>
                    <p class="text-ufcBlue oswald-sharp text-[10px] lg:text-xs italic font-bold tracking-widest mb-3 lg:mb-5 uppercase">PROFIT: ${Math.round(fight.f2.odds * 100)}P ON SUCCESS</p>
                    <button id="bet-btn-f2-${fight.id}" onclick="openBetSlip('${fight.id}', 'right', '${fight.f1.name} vs ${fight.f2.name}', '${fight.f2.name}', ${fight.f2.odds})"
                        class="oswald-sharp w-full py-3 lg:py-5 bg-white text-black font-black ${isMain ? 'text-lg lg:text-2xl' : 'text-sm lg:text-xl'} rounded-xl hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] transition-all italic tracking-widest uppercase">
                        BET ${fight.f2.name.split(' ')[fight.f2.name.split(' ').length - 1].toUpperCase()}
                    </button>
                </div>
            </div>

            <!-- Analysis Section (collapsible, 4 tabs) -->
            <div id="analysis-${fight.id}" class="hidden border-t border-white/10 bg-black/20">
                <!-- Tab Nav -->
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
                <!-- 차트 Tab -->
                <div id="atab-content-radar-${fight.id}" class="p-6 lg:p-10">
                    <div class="text-center mb-4">
                        <span class="oswald-sharp text-gray-500 text-[10px] lg:text-sm tracking-[0.3em] font-black italic uppercase">Fighter Stat Comparison</span>
                    </div>
                    <div class="relative mx-auto w-full max-w-md" style="height:260px">
                        <canvas id="radar-${fight.id}"></canvas>
                    </div>
                    <div class="flex justify-center gap-6 mt-4">
                        <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-ufcRed"></div><span class="oswald-sharp text-[10px] text-gray-400 italic uppercase">${fight.f1.name.split(' ').pop()}</span></div>
                        <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-ufcBlue"></div><span class="oswald-sharp text-[10px] text-gray-400 italic uppercase">${fight.f2.name.split(' ').pop()}</span></div>
                    </div>
                </div>
                <!-- 스탯 Tab -->
                <div id="atab-content-stats-${fight.id}" class="hidden p-6 lg:p-10">
                    ${renderStatBarsHTML(fight)}
                </div>
                <!-- 분석 Tab -->
                <div id="atab-content-insight-${fight.id}" class="hidden p-6 lg:p-10">
                    ${renderInsightHTML(fight)}
                </div>
                <!-- 최근전적 Tab -->
                <div id="atab-content-recent-${fight.id}" class="hidden p-6 lg:p-10">
                    ${renderRecentHTML(fight)}
                </div>
            </div>

            <!-- Settled Fight Result Badge -->
            <div id="settled-${fight.id}" class="hidden border-t border-white/10 py-4 lg:py-6 text-center">
                <span id="settled-text-${fight.id}" class="oswald-sharp text-sm lg:text-xl font-black italic uppercase tracking-widest"></span>
            </div>
        </div>`;
    });
    container.innerHTML = _html;

    // Restore vote result UI for any pending bets
    updateAllFightCards();
    updateEventTotalPicks();
}

/* ── 분석 탭 헬퍼 함수 ── */
function renderStatBarsHTML(fight) {
    const f1 = fight.f1, f2 = fight.f2;
    if (!f1.slpm && !f1.strAcc) return '<p class="text-center text-gray-600 text-sm italic oswald-sharp">스탯 데이터 없음</p>';
    const bar = (label, v1, v2, fmt) => {
        const mx = Math.max(v1, v2, 0.01);
        const p1 = Math.round(v1 / mx * 100), p2 = Math.round(v2 / mx * 100);
        return `<div class="mb-5">
            <div class="oswald-sharp text-[10px] text-gray-500 uppercase tracking-widest text-center mb-2">${label}</div>
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
    const isHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    btnLabel.textContent = isHidden ? '▲ ANALYSIS' : '▼ ANALYSIS';
    if (isHidden) {
        // 탭 초기화: 차트 탭 활성
        switchAnalysisTab(fightId, 'radar');
    }
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

        if (btn1) {
            btn1.disabled = false;
            btn1.classList.remove('opacity-40', 'cursor-not-allowed');
        }
        if (btn2) {
            btn2.disabled = false;
            btn2.classList.remove('opacity-40', 'cursor-not-allowed');
        }
        if (settledDiv) {
            settledDiv.classList.add('hidden');
            settledDiv.style.background = '';
        }

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

/* [📊 ADVANCED DATA & ODDS SYSTEM: Radar Chart] */
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
            labels: ['Striking', 'Grappling', 'Stamina', 'Defense', 'Speed'],
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
