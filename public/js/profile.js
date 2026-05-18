/* ==============================
   PROFILE STATS
   (extracted from index.html – global functions, no import/export)
   의존성: state.js (state), community.js (getBeltInfo, getRollingScore), utils.js (escapeHtml)
============================== */

let _rpcStats = null;        // get_user_pick_stats RPC 캐시 (null = 미로드 또는 실패 → state fallback)
let _rpcStatsLoading = false; // RPC 진행 중 플래그 — empty CTA 조기 표시 방지용

// weight_class 단축키 → 표시 레이블
const WEIGHT_CLASS_LABEL = {
    hw: 'Heavyweight', lhw: 'Light Heavyweight', mw: 'Middleweight',
    ww: 'Welterweight', lw: 'Lightweight', fw: 'Featherweight',
    bw: 'Bantamweight', flw: 'Flyweight',
    wbw: "W. Bantamweight", wfw: "W. Featherweight",
    wsw: "W. Strawweight", wflw: "W. Flyweight",
};

// actual_method → 아이콘 / 바 색상 (RPC 동적 렌더용)
const METHOD_CONFIG = {
    'KO/TKO': { icon: '🥊', color: 'bg-ufcRed' },
    'KO':     { icon: '🥊', color: 'bg-ufcRed' },
    'TKO':    { icon: '🥊', color: 'bg-red-700' },
    'SUB':    { icon: '🤼', color: 'bg-purple-500' },
    'UD':     { icon: '📋', color: 'bg-blue-500' },
    'SD':     { icon: '📋', color: 'bg-blue-400' },
    'MD':     { icon: '📋', color: 'bg-blue-600' },
};
const METHOD_DEFAULT_CONFIG = { icon: '⚔️', color: 'bg-white/30' };

async function renderProfileStats() {
    _rpcStats = null;
    const shouldLoadRpc = !!currentUser?.id;
    _rpcStatsLoading = shouldLoadRpc; // 1차 렌더 전에 설정 — empty CTA 조기 표시 방지

    // 1차: state 기반 즉시 렌더 (현재 이벤트 범위 fallback)
    renderProfileReport();
    renderDivisionStats();
    renderFormChart();
    renderMethodStats();
    renderBonusSummary();

    // 2차: RPC 데이터 수신 후 해당 섹션 덮어쓰기 (전체 이벤트, cross-session)
    if (shouldLoadRpc) {
        try {
            const { data, error } = await sb.rpc('get_user_pick_stats', { p_user_id: currentUser.id });
            if (!error && data) _rpcStats = data;
        } finally {
            _rpcStatsLoading = false;
        }
        renderProfileReport();
        renderDivisionStats();
        renderMethodStats();
    }
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
// acc: null = 정산 픽 없음 (accuracy 기반 판별 skip)
// settledCount = win+lose (accuracy 분모), engagedTotal = 전체 픽 수 (참여도 기준)
function getAnalystType(acc, settledCount, engagedTotal, methodBonusCount, upsetCount) {
    if (engagedTotal === 0) return { title: '🥚 루키', desc: '아직 예측 기록이 없어요. 첫 픽을 시작해보세요!', color: 'text-gray-400' };
    if (acc !== null && acc >= 80 && settledCount >= 10) return { title: '🧠 옥타곤 오라클', desc: '압도적인 적중률! 당신의 분석력은 프로 수준입니다.', color: 'text-yellow-400' };
    if (upsetCount >= 3) return { title: '🔥 업셋 헌터', desc: '약자 픽을 두려워하지 않는 대담한 예측가!', color: 'text-orange-400' };
    if (methodBonusCount >= 3) return { title: '🎯 피니시 예언자', desc: '승리 방식까지 꿰뚫어 보는 세밀한 분석가.', color: 'text-purple-400' };
    if (acc !== null && acc >= 60) return { title: '⚔️ 파이터 IQ', desc: '꾸준한 적중률을 보여주는 신뢰할 수 있는 예측가.', color: 'text-ufcRed' };
    if (engagedTotal >= 5) return { title: '📚 분석 수련생', desc: '경험을 쌓아가는 중! 패턴을 찾아나가고 있어요.', color: 'text-blue-400' };
    return { title: '🥊 신인 파이터', desc: '첫 발걸음을 뗐어요. 더 많은 픽으로 실력을 키워보세요.', color: 'text-gray-400' };
}

function renderProfileReport() {
    const streak = calcStreak();
    const stateSettled = Object.values(state.settled || {});

    let winCount, loseCount, pendingCount, totalAll, settledCount, acc, totalEarned, upsetWins, upsetPicks, methodBonusCount;

    if (_rpcStats) {
        winCount     = _rpcStats.win_count     || 0;
        loseCount    = _rpcStats.lose_count    || 0;
        pendingCount = _rpcStats.pending_count || 0;
        const cancelCount = _rpcStats.cancel_count || 0;
        settledCount = winCount + loseCount;           // accuracy 분모
        totalAll     = winCount + loseCount + pendingCount + cancelCount;
        acc          = _rpcStats.accuracy ?? null;     // null = 정산 픽 없음
        totalEarned  = _rpcStats.net_points || 0;
        upsetWins    = _rpcStats.upset_wins  || 0;
        upsetPicks   = _rpcStats.upset_picks || 0;
        methodBonusCount = stateSettled.filter(s => s.hadMethodBonus).length;
    } else {
        winCount     = state.success;
        loseCount    = state.total - state.success;
        pendingCount = Object.keys(state.pendings || {}).length;
        settledCount = state.total;
        totalAll     = state.total + pendingCount;
        acc          = state.total === 0 ? null : Math.min(100, Math.round(state.success / state.total * 100));
        totalEarned  = state.history.filter(h => h.res === 'WIN').reduce((s, h) => s + (h.payout || 0), 0);
        upsetWins    = stateSettled.filter(s => s.hadUpsetBonus && s.result === 'WIN').length;
        upsetPicks   = stateSettled.filter(s => s.hadUpsetBonus).length;
        methodBonusCount = stateSettled.filter(s => s.hadMethodBonus).length;
    }

    const analyst = getAnalystType(acc, settledCount, totalAll, methodBonusCount, upsetWins);

    // ── 빈 상태 / 정산 대기 상태 분기 ────────────────────────────
    // _rpcStatsLoading 중에는 empty CTA를 보여주지 않음 (로그인 유저 깜빡임 방지)
    if (totalAll === 0 && !_rpcStatsLoading) {
        const streakEl = document.getElementById('profile-streak-badge');
        if (streakEl) streakEl.innerHTML = '';
        const reportEl = document.getElementById('profile-report-grid');
        if (reportEl) {
            reportEl.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-8 gap-4 text-center">
                <p class="oswald-sharp text-xl font-black italic text-gray-500 uppercase">아직 예측 기록이 없습니다</p>
                <p class="text-gray-600 text-sm italic">첫 픽을 등록하고 파이터 IQ를 쌓아보세요</p>
                <button onclick="navigateTo('matchups')"
                    class="oswald-sharp mt-2 px-6 py-3 rounded-xl font-black italic text-sm uppercase tracking-widest bg-ufcRed hover:bg-red-700 text-white transition-colors">
                    픽하러 가기
                </button>
            </div>`;
        }
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
        return;
    }

    if (pendingCount > 0 && settledCount === 0) {
        const streakEl = document.getElementById('profile-streak-badge');
        if (streakEl) streakEl.innerHTML = '';
        const reportEl = document.getElementById('profile-report-grid');
        if (reportEl) {
            reportEl.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-8 gap-3 text-center">
                <p class="oswald-sharp text-lg font-black italic text-white uppercase tracking-widest">예측 등록 완료</p>
                <p class="text-gray-400 text-sm italic">경기 결과를 기다리는 중 · ${pendingCount}개 픽 대기</p>
                <p class="oswald-sharp text-[10px] text-gray-600 italic uppercase tracking-widest mt-1">결과 확정 후 통계가 업데이트됩니다</p>
            </div>`;
        }
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
        return;
    }
    // ─────────────────────────────────────────────────────────────

    // 적중률 표시 (null = 정산 픽 없음 → "—")
    const accText  = acc === null ? '—' : acc + '%';
    const accColor = acc === null ? 'text-gray-600' : (acc >= 70 ? 'text-ufcRed' : 'text-white');
    const accSub   = acc === null ? '정산 픽 없음' : (acc >= 70 ? '🔥 상위권' : acc >= 50 ? '양호' : '성장 중');

    // 총 예측 sub: 승패 + 예정 중 구분
    const pickSub = pendingCount > 0
        ? `${winCount}승 ${loseCount}패 · ${pendingCount}예정`
        : `${winCount}승 ${loseCount}패`;

    // 업셋 sub: 데이터 있으면 비율 표시
    const upsetSub = upsetPicks > 0
        ? `${upsetWins}/${upsetPicks} 성공 (${Math.round(upsetWins / upsetPicks * 100)}%)`
        : '역전 전문가 지수';

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
            { label: '총 예측',        value: totalAll + '회',                      sub: pickSub,   color: 'text-white' },
            { label: '전체 적중률',    value: accText,                               sub: accSub,    color: accColor },
            { label: 'NET WIN 포인트', value: totalEarned.toLocaleString() + 'P',   sub: `잔액 ${state.points.toLocaleString()}P`, color: 'text-yellow-400' },
            { label: '업셋 픽 성공',   value: upsetWins + '회',                     sub: upsetSub,  color: 'text-orange-400' },
        ].map(item => `
            <div class="bg-black/30 rounded-2xl p-4 border border-white/[0.08]">
                <p class="oswald-sharp text-[10px] text-gray-400 uppercase tracking-widest italic mb-2">${item.label}</p>
                <p class="oswald-sharp text-xl lg:text-2xl font-black italic leading-none ${item.color}">${item.value}</p>
                <p class="oswald-sharp text-[10px] text-gray-500 italic mt-2 truncate">${item.sub}</p>
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

    // RPC 경로: picks JOIN matchups → 전체 이벤트 체급별 집계
    if (_rpcStats) {
        const wcs = _rpcStats.by_weight_class || [];
        if (wcs.length === 0) {
            el.innerHTML = `<p class="oswald-sharp text-xs text-gray-500 italic uppercase text-center py-4">체급별 기록은 정산 후 표시됩니다</p>`;
            return;
        }
        el.innerHTML = wcs.map(wc => {
            const win     = wc.win_count  || 0;
            const lose    = wc.lose_count || 0;
            const settled = win + lose;
            const acc     = wc.accuracy ?? null;   // null = 정산 픽 없음
            const accText  = acc === null ? '—' : acc + '%';
            const accColor = acc === null ? 'text-gray-600' : (acc >= 70 ? 'text-ufcRed' : acc >= 50 ? 'text-white' : 'text-gray-500');
            const barW     = acc === null ? 0 : acc;
            const barColor = acc === null ? 'bg-white/10' : (acc >= 70 ? 'bg-ufcRed' : acc >= 50 ? 'bg-blue-500' : 'bg-white/20');
            const label    = (WEIGHT_CLASS_LABEL[wc.weight_class] || wc.weight_class || '기타').toUpperCase();
            // win/lose 표기로 accuracy 분모 명확화 (총 픽에 pending 포함 시 보조 표시)
            const ratioText = settled === 0 ? '0W 0L' : `${win}W ${lose}L`;
            const totalNote = (wc.total || 0) > settled ? ` · ${wc.total}총` : '';
            return `
            <div>
                <div class="flex justify-between items-center mb-1.5">
                    <span class="oswald-sharp text-[10px] lg:text-xs font-black italic text-gray-300 uppercase truncate max-w-[55%]">${label}</span>
                    <div class="flex items-center gap-2 shrink-0">
                        <span class="oswald-sharp text-[9px] text-gray-500 italic">${ratioText}${totalNote}</span>
                        <span class="oswald-sharp text-xs font-black italic ${accColor}">${accText}</span>
                    </div>
                </div>
                <div class="h-2 rounded-full bg-white/[0.08] overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-700 ${barColor}" style="width:${barW}%"></div>
                </div>
            </div>`;
        }).join('');
        return;
    }

    // fallback: state 기반 (현재 이벤트 범위만)
    const fights = getActiveFights();
    const divMap = {};
    fights.forEach(f => { divMap[f.id] = f.division; });

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
        el.innerHTML = `<p class="oswald-sharp text-xs text-gray-500 italic uppercase text-center py-4">체급별 기록은 정산 후 표시됩니다</p>`;
        return;
    }

    el.innerHTML = entries.map(([div, stat]) => {
        const acc = stat.total === 0 ? 0 : Math.round(stat.wins / stat.total * 100);
        const loses = stat.total - stat.wins;
        const shortDiv = div.replace('CHAMPIONSHIP', '').replace("WOMEN'S", '여자').trim();
        return `
        <div>
            <div class="flex justify-between items-center mb-1.5">
                <span class="oswald-sharp text-[10px] lg:text-xs font-black italic text-gray-300 uppercase truncate max-w-[55%]">${shortDiv}</span>
                <div class="flex items-center gap-2 shrink-0">
                    <span class="oswald-sharp text-[9px] text-gray-500 italic">${stat.wins}W ${loses}L</span>
                    <span class="oswald-sharp text-xs font-black italic ${acc >= 70 ? 'text-ufcRed' : acc >= 50 ? 'text-white' : 'text-gray-500'}">${acc}%</span>
                </div>
            </div>
            <div class="h-2 rounded-full bg-white/[0.08] overflow-hidden">
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

    // RPC 경로: by_method 배열 전체를 동적 렌더 (hardcoded 3종 제거)
    if (_rpcStats) {
        const byMethod = _rpcStats.by_method || [];
        if (byMethod.length === 0) {
            methodEl.innerHTML = `<p class="oswald-sharp text-xs text-gray-500 italic uppercase text-center">승리 방식 통계는 적중 픽 정산 후 표시됩니다</p>`;
            return;
        }
        methodEl.innerHTML = byMethod.map(m => {
            const cfg      = METHOD_CONFIG[m.method] || METHOD_DEFAULT_CONFIG;
            const total    = m.total     || 0;
            const wins     = m.win_count || 0;
            const pct      = total === 0 ? 0 : Math.round(wins / total * 100);
            const pctText  = total === 0 ? '—' : pct + '%';
            const pctColor = pct >= 70 ? 'text-ufcRed' : pct >= 50 ? 'text-white' : 'text-gray-500';
            return `
            <div>
                <div class="flex justify-between items-center mb-1.5">
                    <span class="oswald-sharp text-xs font-black italic text-gray-300 uppercase min-w-0 truncate max-w-[55%]">${cfg.icon} ${m.method}</span>
                    <span class="oswald-sharp text-xs font-black italic shrink-0 ${pctColor}">${pctText}</span>
                </div>
                <div class="h-2 rounded-full bg-white/[0.08] overflow-hidden">
                    <div class="h-full rounded-full ${cfg.color} transition-all duration-700" style="width:${pct}%"></div>
                </div>
                <p class="oswald-sharp text-[10px] text-gray-500 italic mt-1">${wins}승 / ${total}정산</p>
            </div>`;
        }).join('');
        return;
    }

    // fallback: state 기반 (하드코딩 3종)
    const methods = [
        { key: 'KO/TKO', icon: '🥊', color: 'bg-ufcRed' },
        { key: 'SUB',    icon: '🤼', color: 'bg-purple-500' },
        { key: 'UD',     icon: '📋', color: 'bg-blue-500' },
    ];

    const settled = Object.values(state.settled || {});

    if (settled.length === 0) {
        methodEl.innerHTML = `<p class="oswald-sharp text-xs text-gray-500 italic uppercase text-center">승리 방식 통계는 적중 픽 정산 후 표시됩니다</p>`;
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
                <span class="oswald-sharp text-xs font-black italic text-gray-300 uppercase min-w-0 truncate max-w-[55%]">${m.icon} ${m.key}</span>
                <span class="oswald-sharp text-xs font-black italic shrink-0 ${pct >= 70 ? 'text-ufcRed' : pct >= 50 ? 'text-white' : 'text-gray-500'}">
                    ${total === 0 ? '—' : pct + '%'}
                </span>
            </div>
            <div class="h-2 rounded-full bg-white/[0.08] overflow-hidden">
                <div class="h-full rounded-full ${m.color} transition-all duration-700" style="width:${pct}%"></div>
            </div>
            <p class="oswald-sharp text-[10px] text-gray-500 italic mt-1">${total === 0 ? '데이터 없음' : `${wins}승 / ${total}경기`}</p>
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
