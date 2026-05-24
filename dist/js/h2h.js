/* ==============================
   HEAD-TO-HEAD COMPARISON
   (extracted from index.html – global functions, no import/export)
   의존성: state.js (fighterDB, archiveDB, h2hRadarChart),
           admin.js (getActiveFights), utils.js (escapeHtml)
============================== */

// Returns a valid 5-element stats array for display, falling back to [75,75,75,75,75].
// [] is truthy in JS so the || operator alone cannot detect empty arrays.
function _getDisplayStats(f) {
    var s = f && f.stats;
    return (Array.isArray(s) && s.length === 5) ? s : [75, 75, 75, 75, 75];
}

function openH2H() {
    const modal = document.getElementById('h2h-modal');
    modal.classList.remove('hidden');

    // Populate selects with all fighters (DB + fight card fighters)
    const allFighters = getAllFightersForH2H();
    ['h2h-f1-select', 'h2h-f2-select'].forEach(id => {
        const sel = document.getElementById(id);
        const cur = sel.value;
        sel.innerHTML = '<option value="">-- 선택 --</option>';
        allFighters.forEach(f => {
            sel.innerHTML += `<option value="${f.id}" ${cur === f.id ? 'selected' : ''}>${f.name}</option>`;
        });
    });
    renderH2H();
}

function closeH2H() {
    document.getElementById('h2h-modal').classList.add('hidden');
    if (h2hRadarChart) { h2hRadarChart.destroy(); h2hRadarChart = null; }
}

function getAllFightersForH2H() {
    const fromDB = fighterDB.map(f => ({ ...f }));
    const fromFights = [];
    getActiveFights().forEach(fight => {
        [fight.f1, fight.f2].forEach(f => {
            if (!fromDB.find(d => d.name === f.name) && !fromFights.find(d => d.name === f.name)) {
                fromFights.push({ ...f, id: 'fc_' + f.name.replace(/\s/g, '_') });
            }
        });
    });
    return [...fromDB, ...fromFights];
}

function renderH2H() {
    const f1Id = document.getElementById('h2h-f1-select').value;
    const f2Id = document.getElementById('h2h-f2-select').value;
    const content = document.getElementById('h2h-content');

    if (!f1Id || !f2Id) {
        content.innerHTML = `<div class="text-center py-12 text-gray-600 oswald-sharp text-xs italic uppercase tracking-widest">두 파이터를 선택하면 비교 분석이 시작됩니다</div>`;
        return;
    }
    if (f1Id === f2Id) {
        content.innerHTML = `<div class="text-center py-12 text-gray-500 oswald-sharp text-xs italic uppercase tracking-widest">같은 파이터를 선택했어요 — 다른 파이터를 선택해주세요</div>`;
        return;
    }

    const all = getAllFightersForH2H();
    const f1 = all.find(f => f.id === f1Id);
    const f2 = all.find(f => f.id === f2Id);
    if (!f1 || !f2) return;

    const stats1 = _getDisplayStats(f1);
    const stats2 = _getDisplayStats(f2);
    const STAT_LABELS = ['Striking', 'Grappling', 'Stamina', 'Defense', 'Speed'];

    // 스탯 우위
    const totalAdv1 = stats1.reduce((s, v, i) => s + (v > stats2[i] ? 1 : 0), 0);
    const totalAdv2 = stats2.reduce((s, v, i) => s + (v > stats1[i] ? 1 : 0), 0);
    const overallAdv = totalAdv1 > totalAdv2 ? f1.name : (totalAdv2 > totalAdv1 ? f2.name : 'EVEN');

    // ── 아카이브 기반 실제 맞대결 기록 ──
    const h2hRecords = findH2HRecords(f1.name, f2.name);

    // ── 스타일 궁합 분석 ──
    const styleAnalysis = analyzeStyleMatchup(stats1, stats2, f1.name, f2.name);

    // ── UFC 랭킹 위치 ──
    const rank1 = findUFCRank(f1.name);
    const rank2 = findUFCRank(f2.name);

    content.innerHTML = `
    <!-- Fighter Cards -->
    <div class="grid grid-cols-2 gap-4 mb-6">
        ${[{ f: f1, col: 'ufcRed', side: 'RED', rank: rank1 }, { f: f2, col: 'ufcBlue', side: 'BLUE', rank: rank2 }].map(({ f, col, side, rank }) => `
        <div class="glass-card rounded-2xl p-4 lg:p-6 border border-${col}/20 text-center">
            <span class="oswald-sharp text-[8px] text-${col} font-black italic uppercase tracking-widest">${side} CORNER</span>
            <h4 class="oswald-sharp text-base lg:text-2xl font-black italic text-white uppercase tracking-tighter mt-2 mb-1 leading-tight">${f.name}</h4>
            <p class="oswald-sharp text-[10px] text-gray-500 italic uppercase">${f.record || '—'}</p>
            ${rank ? `<div class="mt-2 inline-block oswald-sharp text-[9px] bg-white/5 border border-white/10 px-2 py-1 rounded-lg font-black italic text-gray-400 uppercase">${rank.label}</div>` : ''}
            <div class="grid grid-cols-2 gap-2 mt-3 text-left">
                <div><p class="oswald-sharp text-[8px] text-gray-600 uppercase">신장</p><p class="oswald-sharp text-sm font-black italic text-white">${f.height || '—'}</p></div>
                <div><p class="oswald-sharp text-[8px] text-gray-600 uppercase">리치</p><p class="oswald-sharp text-sm font-black italic text-white">${f.reach || '—'}</p></div>
                <div><p class="oswald-sharp text-[8px] text-gray-600 uppercase">배당</p><p class="oswald-sharp text-sm font-black italic text-${col}">×${f.odds || '—'}</p></div>
                <div><p class="oswald-sharp text-[8px] text-gray-600 uppercase">체급</p><p class="oswald-sharp text-[9px] font-black italic text-white truncate">${(f.division || '—').replace('CHAMPIONSHIP', '').replace("WOMEN'S", '여자').trim().split(' ')[0]}</p></div>
            </div>
        </div>`).join('')}
    </div>

    <!-- 실제 맞대결 기록 -->
    <div class="glass-card rounded-2xl p-5 lg:p-7 mb-6 border ${h2hRecords.length > 0 ? 'border-yellow-500/20 bg-yellow-500/[0.03]' : 'border-white/5'}">
        <p class="oswald-sharp text-[9px] text-gray-500 uppercase tracking-[0.3em] font-black italic mb-4">
            ⚔️ 실제 맞대결 기록 (아카이브 기반)
            <span class="text-gray-700 ml-2">${h2hRecords.length}경기</span>
        </p>
        ${h2hRecords.length === 0
            ? `<p class="oswald-sharp text-xs text-gray-700 italic uppercase text-center py-3">아카이브에 두 선수의 맞대결 기록이 없습니다</p>`
            : `<div class="space-y-3">
                ${h2hRecords.map(r => {
                    const w1 = r.winner.toLowerCase().includes(f1.name.split(' ').pop().toLowerCase());
                    return `
                    <div class="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0">
                        <div class="flex items-center gap-3 min-w-0">
                            <span class="oswald-sharp text-[9px] text-gray-600 italic uppercase flex-shrink-0">${r.event}</span>
                            <span class="oswald-sharp text-xs font-black italic ${w1 ? 'text-ufcRed' : 'text-gray-400'} flex-shrink-0">${f1.name.split(' ').pop()}</span>
                            <span class="text-gray-700 text-[9px]">vs</span>
                            <span class="oswald-sharp text-xs font-black italic ${!w1 ? 'text-ufcBlue' : 'text-gray-400'} flex-shrink-0">${f2.name.split(' ').pop()}</span>
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0">
                            <span class="oswald-sharp text-[9px] font-black italic ${w1 ? 'text-ufcRed' : 'text-ufcBlue'} uppercase">
                                ${w1 ? f1.name.split(' ').pop() : f2.name.split(' ').pop()} WIN
                            </span>
                            <span class="oswald-sharp text-[8px] border border-white/10 text-gray-500 px-2 py-0.5 rounded-lg font-black italic uppercase">${r.method} R${r.round}</span>
                        </div>
                    </div>`;
                }).join('')}
                <div class="flex justify-around pt-3">
                    <div class="text-center">
                        <p class="oswald-sharp text-2xl font-black italic text-ufcRed">${h2hRecords.filter(r => r.winner.toLowerCase().includes(f1.name.split(' ').pop().toLowerCase())).length}</p>
                        <p class="oswald-sharp text-[9px] text-gray-600 italic uppercase">${f1.name.split(' ').pop()} 승</p>
                    </div>
                    <div class="text-center self-center oswald-sharp text-gray-600 font-black italic">VS</div>
                    <div class="text-center">
                        <p class="oswald-sharp text-2xl font-black italic text-ufcBlue">${h2hRecords.filter(r => r.winner.toLowerCase().includes(f2.name.split(' ').pop().toLowerCase())).length}</p>
                        <p class="oswald-sharp text-[9px] text-gray-600 italic uppercase">${f2.name.split(' ').pop()} 승</p>
                    </div>
                </div>
            </div>`}
    </div>

    <!-- 스타일 궁합 분석 -->
    <div class="glass-card rounded-2xl p-5 lg:p-7 mb-6 border border-white/5">
        <p class="oswald-sharp text-[9px] text-gray-500 uppercase tracking-[0.3em] font-black italic mb-4">🧠 스타일 궁합 분석</p>
        <div class="grid grid-cols-3 gap-3 mb-4">
            <div class="text-center p-3 rounded-xl bg-black/30 border border-white/5">
                <p class="text-xl mb-1">${styleAnalysis.f1Icon}</p>
                <p class="oswald-sharp text-[9px] text-gray-500 italic uppercase mb-1">${f1.name.split(' ').pop()}</p>
                <p class="oswald-sharp text-xs font-black italic text-ufcRed uppercase">${styleAnalysis.f1Style}</p>
            </div>
            <div class="text-center p-3 rounded-xl bg-ufcRed/5 border border-ufcRed/20 flex items-center justify-center">
                <div>
                    <p class="oswald-sharp text-[8px] text-gray-500 italic uppercase mb-1">키 매치업</p>
                    <p class="oswald-sharp text-xs font-black italic text-white uppercase leading-tight">${styleAnalysis.keyMatchup}</p>
                </div>
            </div>
            <div class="text-center p-3 rounded-xl bg-black/30 border border-white/5">
                <p class="text-xl mb-1">${styleAnalysis.f2Icon}</p>
                <p class="oswald-sharp text-[9px] text-gray-500 italic uppercase mb-1">${f2.name.split(' ').pop()}</p>
                <p class="oswald-sharp text-xs font-black italic text-ufcBlue uppercase">${styleAnalysis.f2Style}</p>
            </div>
        </div>
        <div class="p-3 rounded-xl bg-black/20 border border-white/5">
            <p class="text-gray-300 text-xs italic leading-relaxed">${styleAnalysis.prediction}</p>
        </div>
    </div>

    <!-- 스탯 바 비교 -->
    <div class="mb-6 space-y-3">
        <p class="oswald-sharp text-[9px] text-gray-500 uppercase tracking-[0.3em] font-black italic">스탯 비교</p>
        ${STAT_LABELS.map((label, i) => {
            const v1 = stats1[i], v2 = stats2[i];
            const pct1 = Math.round(v1 / (v1 + v2) * 100);
            const pct2 = 100 - pct1;
            const adv = v1 > v2 ? 'left' : v2 > v1 ? 'right' : 'even';
            return `
            <div>
                <div class="flex justify-between items-center mb-1">
                    <span class="oswald-sharp text-xs font-black italic ${adv === 'left' ? 'text-ufcRed' : 'text-gray-400'}">${v1}</span>
                    <span class="oswald-sharp text-[9px] text-gray-500 italic uppercase tracking-widest">${label}</span>
                    <span class="oswald-sharp text-xs font-black italic ${adv === 'right' ? 'text-ufcBlue' : 'text-gray-400'}">${v2}</span>
                </div>
                <div class="flex h-2.5 rounded-full overflow-hidden gap-px">
                    <div class="h-full rounded-l-full transition-all duration-700" style="width:${pct1}%; background:${adv === 'left' ? '#d20a0a' : 'rgba(255,255,255,0.12)'}"></div>
                    <div class="h-full rounded-r-full transition-all duration-700" style="width:${pct2}%; background:${adv === 'right' ? '#3b82f6' : 'rgba(255,255,255,0.12)'}"></div>
                </div>
            </div>`;
        }).join('')}
    </div>

    <!-- 레이더 차트 -->
    <div class="mb-6">
        <p class="oswald-sharp text-[9px] text-gray-500 uppercase tracking-[0.3em] font-black italic mb-4">레이더 분석</p>
        <div class="relative mx-auto" style="max-width:300px; height:240px">
            <canvas id="h2h-radar-canvas"></canvas>
        </div>
        <div class="flex justify-center gap-6 mt-3">
            <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-ufcRed"></div><span class="oswald-sharp text-[10px] text-gray-400 italic uppercase">${f1.name.split(' ').pop()}</span></div>
            <div class="flex items-center gap-2"><div class="w-3 h-3 rounded-full bg-ufcBlue"></div><span class="oswald-sharp text-[10px] text-gray-400 italic uppercase">${f2.name.split(' ').pop()}</span></div>
        </div>
    </div>

    <!-- 종합 판정 -->
    <div class="glass-card rounded-2xl p-6 text-center border ${overallAdv === 'EVEN' ? 'border-white/10' : 'border-ufcRed/20'}"
        style="${overallAdv !== 'EVEN' ? 'background:rgba(210,10,10,0.05)' : ''}">
        <p class="oswald-sharp text-[9px] text-gray-500 uppercase tracking-widest italic mb-2">스탯 우위 종합</p>
        <p class="oswald-sharp text-2xl lg:text-3xl font-black italic text-white uppercase tracking-tighter">
            ${overallAdv === 'EVEN' ? '⚖️ EVEN' : `🏆 ${overallAdv}`}
        </p>
        <p class="oswald-sharp text-xs text-gray-500 italic mt-2 uppercase">${totalAdv1}개 항목 우위 vs ${totalAdv2}개 항목 우위</p>
    </div>`;

    // 레이더 차트 그리기
    setTimeout(() => {
        if (h2hRadarChart) { h2hRadarChart.destroy(); h2hRadarChart = null; }
        const canvas = document.getElementById('h2h-radar-canvas');
        if (!canvas) return;
        h2hRadarChart = new Chart(canvas.getContext('2d'), {
            type: 'radar',
            data: {
                labels: STAT_LABELS,
                datasets: [
                    { label: f1.name, data: stats1, fill: true, backgroundColor: 'rgba(210,10,10,0.25)', borderColor: '#d20a0a', pointBackgroundColor: '#d20a0a', pointRadius: 4, borderWidth: 2 },
                    { label: f2.name, data: stats2, fill: true, backgroundColor: 'rgba(59,130,246,0.25)', borderColor: '#3b82f6', pointBackgroundColor: '#3b82f6', pointRadius: 4, borderWidth: 2 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { r: { min: 0, max: 100, ticks: { display: false }, grid: { color: 'rgba(255,255,255,0.07)' }, angleLines: { color: 'rgba(255,255,255,0.07)' }, pointLabels: { color: '#9ca3af', font: { family: 'Oswald', size: 10, weight: '700', style: 'italic' } } } },
                plugins: { legend: { display: false } }
            }
        });
    }, 80);
}

function findH2HRecords(name1, name2) {
    const records = [];
    const n1 = name1.split(' ').pop().toLowerCase();
    const n2 = name2.split(' ').pop().toLowerCase();
    (archiveDB || []).forEach(ev => {
        (ev.fights || []).forEach(f => {
            const f1n = f.f1.toLowerCase(), f2n = f.f2.toLowerCase();
            const involves1 = f1n.includes(n1) || n1.includes(f1n.split(' ').pop());
            const involves2 = f2n.includes(n2) || n2.includes(f2n.split(' ').pop());
            const involves1r = f1n.includes(n2) || n2.includes(f1n.split(' ').pop());
            const involves2r = f2n.includes(n1) || n1.includes(f2n.split(' ').pop());
            if ((involves1 && involves2) || (involves1r && involves2r)) {
                records.push({ event: ev.name, date: ev.date, winner: f.winner, method: f.method, round: f.round, time: f.time });
            }
        });
    });
    return records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function analyzeStyleMatchup(s1, s2, name1, name2) {
    const [str1, grp1, stm1, def1, spd1] = s1;
    const [str2, grp2, stm2, def2, spd2] = s2;

    const getStyle = (str, grp, spd) => {
        if (grp > str + 10) return { label: '그래플러', icon: '🤼' };
        if (str > grp + 15) return { label: '스트라이커', icon: '👊' };
        if (spd > 88) return { label: '스피드 파이터', icon: '⚡' };
        return { label: '올라운더', icon: '⚔️' };
    };

    const st1 = getStyle(str1, grp1, spd1);
    const st2 = getStyle(str2, grp2, spd2);

    // 키 매치업 판별
    let keyMatchup = '';
    let prediction = '';
    const n1 = name1.split(' ').pop();
    const n2 = name2.split(' ').pop();

    if (st1.label === '그래플러' && st2.label === '스트라이커') {
        keyMatchup = '테이크다운 vs 스트라이킹';
        prediction = `${n1}의 테이크다운 성공 여부가 핵심입니다. ${n2}은 스트라이킹이 강하므로 ${n1}이 거리를 좁혀 그래플링 게임으로 끌고 가야 유리합니다.`;
    } else if (st1.label === '스트라이커' && st2.label === '그래플러') {
        keyMatchup = '스트라이킹 vs 테이크다운';
        prediction = `${n2}의 테이크다운 성공 여부가 핵심입니다. ${n1}은 스트라이킹이 강하므로 거리를 유지하며 타격전을 펼쳐야 유리합니다.`;
    } else if (st1.label === st2.label && st1.label === '그래플러') {
        keyMatchup = '그래플링 대결';
        prediction = `두 선수 모두 그래플링이 강합니다. 스태미나(${stm1} vs ${stm2})와 디펜스(${def1} vs ${def2})가 후반 라운드 결과를 결정할 가능성이 높습니다.`;
    } else if (st1.label === st2.label && st1.label === '스트라이커') {
        keyMatchup = '타격 맞대결';
        prediction = `두 선수 모두 스트라이킹이 강합니다. 순발력(${spd1} vs ${spd2})과 디펜스(${def1} vs ${def2})가 관건입니다. KO 가능성이 높은 경기입니다.`;
    } else {
        keyMatchup = '스타일 충돌';
        const advName = str1 + grp1 > str2 + grp2 ? n1 : n2;
        prediction = `두 선수의 스타일이 흥미롭게 맞붙습니다. 종합 스탯에서는 ${advName}가 약간 우세하지만 경기 흐름에 따라 결과가 달라질 수 있습니다.`;
    }

    return { f1Style: st1.label, f1Icon: st1.icon, f2Style: st2.label, f2Icon: st2.icon, keyMatchup, prediction };
}

function findUFCRank(name) {
    const nameLower = name.toLowerCase();
    for (const [divId, divData] of Object.entries(ufcRankingsDB || {})) {
        if (divData.champion && divData.champion.name.toLowerCase().includes(nameLower.split(' ').pop())) {
            const divInfo = UFC_DIVISIONS.find(d => d.id === divId);
            return { label: `🏆 ${divInfo?.label || ''} 챔피언`, divId };
        }
        const found = (divData.fighters || []).find(f => f.name.toLowerCase().includes(nameLower.split(' ').pop()));
        if (found) {
            const divInfo = UFC_DIVISIONS.find(d => d.id === divId);
            return { label: `#${found.rank} ${divInfo?.label || ''}`, divId, rank: found.rank };
        }
    }
    return null;
}
