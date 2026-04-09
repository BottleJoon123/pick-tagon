/* ==============================
   PROFILE STATS
   (extracted from index.html – global functions, no import/export)
   의존성: state.js (state), community.js (getBeltInfo, getRollingScore), utils.js (escapeHtml)
============================== */

function renderProfileStats() {
    renderProfileReport();
    renderDivisionStats();
    renderFormChart();
    renderMethodStats();
    renderBonusSummary();
}

// 연승 스트릭 계산
function calcStreak() {
    const settled = state.history.filter(h => h.res !== 'PENDING');
    if (settled.length === 0) return { type: 'none', count: 0 };
    let count = 0;
    const first = settled[0].res;
    for (const h of settled) {
        if (h.res === first) count++;
        else break;
    }
    return { type: first, count };
}

// 애널리스트 타입 판별
function getAnalystType(acc, total, methodBonusCount, upsetCount) {
    if (total === 0) return { title: '🥚 루키', desc: '아직 예측 기록이 없어요. 첫 픽을 시작해보세요!', color: 'text-gray-400' };
    if (acc >= 80 && total >= 10) return { title: '🧠 옥타곤 오라클', desc: '압도적인 적중률! 당신의 분석력은 프로 수준입니다.', color: 'text-yellow-400' };
    if (upsetCount >= 3) return { title: '🔥 업셋 헌터', desc: '약자 픽을 두려워하지 않는 대담한 예측가!', color: 'text-orange-400' };
    if (methodBonusCount >= 3) return { title: '🎯 피니시 예언자', desc: '승리 방식까지 꿰뚫어 보는 세밀한 분석가.', color: 'text-purple-400' };
    if (acc >= 60) return { title: '⚔️ 파이터 IQ', desc: '꾸준한 적중률을 보여주는 신뢰할 수 있는 예측가.', color: 'text-ufcRed' };
    if (total >= 5) return { title: '📚 분석 수련생', desc: '경험을 쌓아가는 중! 패턴을 찾아나가고 있어요.', color: 'text-blue-400' };
    return { title: '🥊 신인 파이터', desc: '첫 발걸음을 뗐어요. 더 많은 픽으로 실력을 키워보세요.', color: 'text-gray-400' };
}

function renderProfileReport() {
    const streak = calcStreak();
    const settled = Object.values(state.settled || {});
    const total = state.total;
    const success = state.success;
    const acc = total === 0 ? 0 : Math.round(success / total * 100);
    const totalEarned = state.history.filter(h => h.res === 'WIN').reduce((s, h) => s + (h.payout || 0), 0);
    const upsetWins = settled.filter(s => s.hadUpsetBonus && s.result === 'WIN').length;
    const methodBonusCount = settled.filter(s => s.hadMethodBonus).length;
    const analyst = getAnalystType(acc, total, methodBonusCount, upsetWins);

    // 스트릭 배지
    const streakEl = document.getElementById('profile-streak-badge');
    if (streakEl) {
        if (streak.count >= 2) {
            const isWin = streak.type === 'WIN';
            streakEl.innerHTML = `
            <div class="oswald-sharp px-4 py-2 rounded-xl font-black italic text-sm uppercase tracking-widest border
                ${isWin ? 'bg-ufcRed/15 border-ufcRed/40 text-ufcRed' : 'bg-white/5 border-white/10 text-gray-500'}">
                ${isWin ? '🔥' : '❄️'} ${streak.count}연${isWin ? '승' : '패'} 스트릭
            </div>`;
        } else {
            streakEl.innerHTML = '';
        }
    }

    // 리포트 그리드 4칸
    const reportEl = document.getElementById('profile-report-grid');
    if (reportEl) {
        reportEl.innerHTML = [
            { label: '총 예측', value: total + '회', sub: `${success}승 ${total - success}패`, color: 'text-white' },
            { label: '전체 적중률', value: acc + '%', sub: acc >= 70 ? '🔥 상위권' : acc >= 50 ? '양호' : '성장 중', color: acc >= 70 ? 'text-ufcRed' : 'text-white' },
            { label: '총 획득 포인트', value: totalEarned.toLocaleString() + 'P', sub: `현재 잔액 ${state.points.toLocaleString()}P`, color: 'text-yellow-400' },
            { label: '업셋 픽 성공', value: upsetWins + '회', sub: '역전 전문가 지수', color: 'text-orange-400' },
        ].map(item => `
            <div class="bg-black/30 rounded-2xl p-4 border border-white/5">
                <p class="oswald-sharp text-[9px] text-gray-500 uppercase tracking-widest italic mb-2">${item.label}</p>
                <p class="oswald-sharp text-xl lg:text-2xl font-black italic ${item.color}">${item.value}</p>
                <p class="oswald-sharp text-[9px] text-gray-600 italic mt-1">${item.sub}</p>
            </div>
        `).join('');
    }

    // 애널리스트 타입
    const typeEl = document.getElementById('profile-analyst-type');
    if (typeEl) {
        typeEl.innerHTML = `
        <div class="flex items-center gap-4">
            <div>
                <p class="oswald-sharp text-[9px] text-gray-500 uppercase tracking-widest italic mb-1">나의 예측가 유형</p>
                <p class="oswald-sharp text-lg lg:text-xl font-black italic ${analyst.color}">${analyst.title}</p>
                <p class="text-gray-400 text-xs mt-1 italic">${analyst.desc}</p>
            </div>
        </div>`;
    }
}

function renderDivisionStats() {
    const el = document.getElementById('profile-division-stats');
    if (!el) return;

    // 히스토리에서 체급 정보 추출 (fight ID → division 매핑)
    const fights = getActiveFights();
    const divMap = {};
    fights.forEach(f => { divMap[f.id] = f.division; });

    // settled 결과로 체급별 집계
    const divStats = {};
    Object.entries(state.settled || {}).forEach(([fightId, s]) => {
        const div = divMap[fightId] || '기타';
        if (!divStats[div]) divStats[div] = { wins: 0, total: 0 };
        divStats[div].total++;
        if (s.result === 'WIN') divStats[div].wins++;
    });

    const entries = Object.entries(divStats).sort((a, b) => {
        const accA = a[1].total === 0 ? 0 : a[1].wins / a[1].total;
        const accB = b[1].total === 0 ? 0 : b[1].wins / b[1].total;
        return accB - accA;
    });

    if (entries.length === 0) {
        el.innerHTML = `<p class="oswald-sharp text-xs text-gray-700 italic uppercase text-center py-4">결과 확정된 예측 없음</p>`;
        return;
    }

    el.innerHTML = entries.map(([div, stat]) => {
        const acc = stat.total === 0 ? 0 : Math.round(stat.wins / stat.total * 100);
        const shortDiv = div.replace('CHAMPIONSHIP', '').replace("WOMEN'S", '여자').trim();
        return `
        <div>
            <div class="flex justify-between items-center mb-1.5">
                <span class="oswald-sharp text-[10px] lg:text-xs font-black italic text-gray-300 uppercase truncate max-w-[60%]">${shortDiv}</span>
                <div class="flex items-center gap-2">
                    <span class="oswald-sharp text-[9px] text-gray-600 italic">${stat.wins}/${stat.total}</span>
                    <span class="oswald-sharp text-xs font-black italic ${acc >= 70 ? 'text-ufcRed' : acc >= 50 ? 'text-white' : 'text-gray-500'}">${acc}%</span>
                </div>
            </div>
            <div class="h-2 rounded-full bg-white/5 overflow-hidden">
                <div class="h-full rounded-full transition-all duration-700 ${acc >= 70 ? 'bg-ufcRed' : acc >= 50 ? 'bg-blue-500' : 'bg-white/20'}"
                    style="width:${acc}%"></div>
            </div>
        </div>`;
    }).join('');
}

function renderFormChart() {
    const formEl = document.getElementById('profile-form-chart');
    const streakTextEl = document.getElementById('profile-streak-text');
    if (!formEl) return;

    const recent = state.history.filter(h => h.res !== 'PENDING').slice(0, 10).reverse();
    const streak = calcStreak();

    if (streakTextEl) {
        if (streak.count >= 2) {
            streakTextEl.textContent = `${streak.count}연${streak.type === 'WIN' ? '승' : '패'} 중`;
            streakTextEl.className = `oswald-sharp text-xs font-black italic uppercase ${streak.type === 'WIN' ? 'text-ufcRed' : 'text-gray-600'}`;
        } else {
            streakTextEl.textContent = '';
        }
    }

    if (recent.length === 0) {
        formEl.innerHTML = `<p class="oswald-sharp text-xs text-gray-700 italic uppercase w-full text-center self-center">예측 기록 없음</p>`;
        return;
    }

    const maxPayout = Math.max(...recent.map(h => h.payout || 100), 100);
    formEl.innerHTML = recent.map(h => {
        const isWin = h.res === 'WIN';
        const height = isWin ? Math.max(28, Math.round((h.payout || 100) / maxPayout * 96)) : 16;
        return `
        <div class="flex flex-col items-center gap-1 flex-1 group relative">
            <div class="absolute -top-7 left-1/2 -translate-x-1/2 bg-black/80 text-[9px] text-white px-2 py-1 rounded oswald-sharp italic opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10">
                ${isWin ? '+' + (h.payout || 0) + 'P' : 'LOSE'}
            </div>
            <div class="w-full rounded-t-lg transition-all duration-700 ${isWin ? 'bg-ufcRed hover:bg-red-400' : 'bg-white/10 hover:bg-white/20'} cursor-default"
                style="height:${height}px; min-height:6px;"></div>
            <span class="oswald-sharp text-[8px] font-black italic ${isWin ? 'text-ufcRed' : 'text-gray-700'}">${isWin ? 'W' : 'L'}</span>
        </div>`;
    }).join('');
}

function renderMethodStats() {
    const methodEl = document.getElementById('profile-method-stats');
    if (!methodEl) return;

    const settled = Object.values(state.settled || {});
    const methods = [
        { key: 'KO/TKO', icon: '🥊', color: 'bg-ufcRed' },
        { key: 'SUB',    icon: '🤼', color: 'bg-purple-500' },
        { key: 'UD',     icon: '📋', color: 'bg-blue-500' },
    ];

    if (settled.length === 0) {
        methodEl.innerHTML = `<p class="oswald-sharp text-xs text-gray-700 italic uppercase text-center">결과 확정된 예측 없음</p>`;
        return;
    }

    methodEl.innerHTML = methods.map(m => {
        const mSettled = settled.filter(s => s.actualMethod === m.key);
        const total = mSettled.length;
        const wins = mSettled.filter(s => s.result === 'WIN').length;
        const pct = total === 0 ? 0 : Math.round(wins / total * 100);
        return `
        <div>
            <div class="flex justify-between items-center mb-1.5">
                <span class="oswald-sharp text-xs font-black italic text-gray-300 uppercase">${m.icon} ${m.key}</span>
                <span class="oswald-sharp text-xs font-black italic ${pct >= 70 ? 'text-ufcRed' : pct >= 50 ? 'text-white' : 'text-gray-500'}">
                    ${total === 0 ? '—' : pct + '%'}
                </span>
            </div>
            <div class="h-2 rounded-full bg-white/5 overflow-hidden">
                <div class="h-full rounded-full ${m.color} transition-all duration-700" style="width:${pct}%"></div>
            </div>
            <p class="oswald-sharp text-[9px] text-gray-600 italic mt-1">${total === 0 ? '데이터 없음' : `${wins}승 / ${total}경기`}</p>
        </div>`;
    }).join('');
}

function renderBonusSummary() {
    const bonusEl = document.getElementById('profile-bonus-summary');
    if (!bonusEl) return;

    const allSettled = Object.values(state.settled || {});
    const methodBonusCount = allSettled.filter(s => s.hadMethodBonus).length;
    const roundBonusCount  = allSettled.filter(s => s.hadRoundBonus).length;
    const upsetBonusCount  = allSettled.filter(s => s.hadUpsetBonus).length;

    bonusEl.innerHTML = [
        { icon: '🎯', label: '방식 보너스', count: methodBonusCount, color: 'text-yellow-400' },
        { icon: '⏱',  label: '라운드 보너스', count: roundBonusCount,  color: 'text-yellow-300' },
        { icon: '🔥', label: '업셋 보너스', count: upsetBonusCount,  color: 'text-orange-400' },
    ].map(b => `
        <div class="glass-card rounded-2xl p-4 text-center border border-white/5">
            <p class="text-2xl mb-1">${b.icon}</p>
            <p class="oswald-sharp text-xl lg:text-2xl font-black italic ${b.color}">${b.count}</p>
            <p class="oswald-sharp text-[9px] text-gray-600 uppercase tracking-widest italic mt-1">${b.label}</p>
        </div>
    `).join('');
}

