/* ==============================
   SEASON SYSTEM
   (extracted from index.html – global functions, no import/export)
   의존성: state.js (seasonData, mockRankings, state, sb, currentUser)
           utils.js (showToast, escapeHtml), community.js (getBeltInfo)
============================== */

var mockRankings = [
    { name: "DAGESTANI_KING",   points: 18450, total: 88, success: 74 },
    { name: "OCTAGON_ORACLE",   points: 15200, total: 71, success: 58 },
    { name: "SUBMISSION_IQ",    points: 12800, total: 64, success: 51 },
    { name: "KO_PROPHET",       points: 11300, total: 60, success: 47 },
    { name: "GUARD_PASSER_99",  points: 9750,  total: 55, success: 42 },
    { name: "JITZ_WIZARD",      points: 8200,  total: 50, success: 37 },
    { name: "TAKEDOWN_HUNTER",  points: 6400,  total: 43, success: 31 },
    { name: "CLINCH_MASTER",    points: 5100,  total: 38, success: 27 },
    { name: "MMA_STRATEGIST",   points: 3800,  total: 30, success: 20 },
    { name: "FIGHT_FAN_99",     points: 2500,  total: 22, success: 13 },
    { name: "ROOKIE_FIGHTER",   points: 1700,  total: 15, success: 8  },
    { name: "NEWBIE_MMA",       points: 800,   total: 8,  success: 3  },
];

var seasonData = {
    current: { name: 'Season 1', startDate: new Date().toISOString().slice(0, 10) },
    hallOfFame: []  // array of { seasonName, endDate, top3: [{rank, name, points, accuracy, belt}] }
};

var seasonResetSubmitting = false;

function loadSeason() {
    const s = localStorage.getItem('picktagon_season');
    if (s) seasonData = JSON.parse(s);
}

function saveSeason() {
    localStorage.setItem('picktagon_season', JSON.stringify(seasonData));
}

// ---- DB HELPERS ----

// get_current_season() → seasonData.current 갱신 + badge 업데이트
// sb 없거나 실패 시 localStorage 값 유지 (fallback)
function loadCurrentSeasonFromDB() {
    if (!sb) return Promise.resolve();
    return sb.rpc('get_current_season').then(function(res) {
        if (res.error || !res.data || res.data.length === 0) return;
        var row = res.data[0];
        seasonData.current = { name: row.name, startDate: row.start_date, id: row.id };
        saveSeason();
        var badge = document.getElementById('current-season-badge');
        if (badge) badge.textContent = row.name;
    }).catch(function() {});
}

// get_hall_of_fame() → seasonData.hallOfFame 갱신 + renderHallOfFame() 호출
// sb 없거나 실패 시 기존 seasonData 유지 후 renderHallOfFame 호출
function loadHallOfFameFromDB() {
    if (!sb) { renderHallOfFame(); return Promise.resolve(); }
    return sb.rpc('get_hall_of_fame').then(function(res) {
        if (!res.error && res.data && res.data.length > 0) {
            // DB는 season_id DESC 순 반환 → 그룹화 후 oldest-first로 저장
            // (renderHallOfFame이 .reverse()로 newest-first 표시)
            var grouped = [];
            var idxMap = {};
            res.data.forEach(function(row) {
                if (!(row.season_id in idxMap)) {
                    idxMap[row.season_id] = grouped.length;
                    grouped.push({ seasonName: row.season_name, endDate: row.end_date, top3: [] });
                }
                grouped[idxMap[row.season_id]].top3.push({
                    rank:    row.rank,
                    name:    row.nickname,
                    points:  row.points,
                    total:   row.total_picks,
                    success: row.success_picks,
                    accuracy: row.accuracy !== null ? row.accuracy + '%' : '0%',
                    belt:    row.belt
                });
            });
            seasonData.hallOfFame = grouped.reverse();
            saveSeason();
        }
    }).catch(function() {}).then(function() {
        renderHallOfFame();
    });
}

// 시즌 종료 모달 미리보기 전용 — 실제 Top3는 admin_end_season RPC가 서버에서 계산
function getCurrentSeasonRankings() {
    const userEntry = { name: 'YOU', points: state.points, total: state.total, success: state.success, isUser: true };
    return [...mockRankings, userEntry].sort((a, b) => b.points - a.points);
}

// ---- PUBLIC: Render Hall of Fame ----
function renderHallOfFame() {
    const list = document.getElementById('hof-list');
    const empty = document.getElementById('hof-empty');
    const label = document.getElementById('hof-season-label');
    if (!list) return;

    const hof = [...(seasonData.hallOfFame || [])].reverse(); // newest first

    // Season badge on rankings page
    const badge = document.getElementById('current-season-badge');
    if (badge) badge.textContent = seasonData.current?.name || 'Season 1';
    if (label) label.textContent = `총 ${hof.length}시즌 완료`;

    if (hof.length === 0) {
        list.innerHTML = '';
        empty?.classList.remove('hidden');
        return;
    }
    empty?.classList.add('hidden');

    const MEDAL = ['🥇', '🥈', '🥉'];
    const BELT_STYLES = {
        'Black': 'text-ufcRed', 'Brown': 'text-yellow-600',
        'Purple': 'text-purple-400', 'Blue': 'text-blue-400', 'White': 'text-white'
    };

    list.innerHTML = hof.map((season, si) => `
        <div class="glass-card rounded-[2rem] overflow-hidden hover:border-yellow-500/20 transition-all duration-500">
            <!-- Season Header -->
            <div class="flex items-center justify-between px-6 lg:px-10 py-4 lg:py-6 bg-black/30 border-b border-white/5">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                        <span class="text-lg lg:text-xl">🏆</span>
                    </div>
                    <div>
                        <p class="oswald-sharp font-black italic text-base lg:text-2xl text-white uppercase tracking-tighter">${season.seasonName}</p>
                        <p class="oswald-sharp text-[9px] text-gray-600 italic uppercase tracking-widest">종료: ${season.endDate}</p>
                    </div>
                </div>
                <span class="oswald-sharp text-[9px] text-gray-600 italic uppercase tracking-widest hidden lg:block">Season ${hof.length - si}</span>
            </div>
            <!-- Top 3 -->
            <div class="divide-y divide-white/[0.04]">
                ${(season.top3 || []).map((p, i) => {
                    const beltStyle = BELT_STYLES[p.belt] || 'text-white';
                    const bgGlow = i === 0 ? 'bg-yellow-500/[0.03]' : '';
                    return `
                    <div class="flex items-center justify-between px-6 lg:px-10 py-4 lg:py-5 ${bgGlow} hover:bg-white/[0.02] transition">
                        <div class="flex items-center gap-4">
                            <span class="text-lg lg:text-2xl w-8 text-center flex-shrink-0">${MEDAL[i] || `#${i+1}`}</span>
                            <div>
                                <p class="oswald-sharp font-black italic text-sm lg:text-xl uppercase tracking-tighter ${i === 0 ? 'text-white' : 'text-gray-300'}">${p.name}</p>
                                <p class="oswald-sharp text-[9px] text-gray-600 italic uppercase tracking-widest">${p.total}전 ${p.success}승 · 적중률 ${p.accuracy}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3 lg:gap-5">
                            <p class="oswald-sharp font-black italic text-base lg:text-2xl ${i === 0 ? 'text-ufcRed' : 'text-gray-400'}">${p.points.toLocaleString()}<span class="text-[9px] ml-1">P</span></p>
                            <span class="oswald-sharp text-[9px] lg:text-[10px] ${beltStyle} font-black italic uppercase hidden lg:block">${p.belt} Belt</span>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>
    `).join('');
}

// ---- ADMIN: Season Panel ----
function renderSeasonAdminPanel() {
    const cur = seasonData.current;
    const nameEl = document.getElementById('admin-season-name');
    const metaEl = document.getElementById('admin-season-meta');
    const playersEl = document.getElementById('admin-season-players');
    const topEl = document.getElementById('admin-season-top');
    const daysEl = document.getElementById('admin-season-days');
    const hofCountEl = document.getElementById('admin-hof-count');
    const hofList = document.getElementById('admin-hof-list');
    if (!nameEl) return;

    // Current season info (DB 기반; loadCurrentSeasonFromDB 이후 갱신됨)
    nameEl.textContent = cur.name || 'Season 1';
    const startDate = cur.startDate ? new Date(cur.startDate + 'T00:00:00') : new Date();
    const daysPassed = Math.floor((Date.now() - startDate.getTime()) / 86400000);
    metaEl.textContent = `시작일: ${cur.startDate || '—'} · ${daysPassed}일 경과`;
    daysEl.textContent = daysPassed + 'D';

    const rankings = getCurrentSeasonRankings();
    playersEl.textContent = rankings.length;
    topEl.textContent = (rankings[0]?.points || 0).toLocaleString() + 'P';

    // Name input prefill
    const nameInput = document.getElementById('new-season-name-input');
    if (nameInput) nameInput.value = cur.name || '';

    // Top 3 preview
    renderAdminSeasonTop3(rankings);

    // Past seasons (DB 기반; loadHallOfFameFromDB 이후 갱신됨)
    hofCountEl.textContent = (seasonData.hallOfFame || []).length;
    const hof = [...(seasonData.hallOfFame || [])].reverse();
    if (hof.length === 0) {
        hofList.innerHTML = `<div class="glass-card p-6 text-center text-gray-700 oswald-sharp text-xs italic uppercase tracking-widest rounded-2xl">기록된 시즌 없음</div>`;
    } else {
        hofList.innerHTML = hof.map((s, i) => `
            <div class="glass-card rounded-2xl p-4 flex items-center justify-between hover:border-yellow-500/20 transition">
                <div class="flex items-center gap-3">
                    <span class="text-xl">🏆</span>
                    <div>
                        <p class="oswald-sharp font-black italic text-sm text-white uppercase tracking-tighter">${s.seasonName}</p>
                        <p class="oswald-sharp text-[9px] text-gray-600 italic uppercase">종료: ${s.endDate} · 우승: ${s.top3?.[0]?.name || '—'}</p>
                    </div>
                </div>
                <button onclick="deleteSeasonRecord(${seasonData.hallOfFame.length - 1 - i})"
                    class="oswald-sharp text-[9px] border border-ufcRed/20 text-ufcRed/50 hover:text-ufcRed px-3 py-1.5 rounded-xl italic uppercase tracking-widest transition">삭제</button>
            </div>
        `).join('');
    }
}

function renderAdminSeasonTop3(rankings) {
    const el = document.getElementById('admin-season-top3');
    if (!el) return;
    const MEDAL = ['🥇', '🥈', '🥉'];
    el.innerHTML = rankings.slice(0, 3).map((u, i) => {
        const belt = getBeltInfo(u.points);
        const acc = u.total === 0 ? '0%' : Math.round(u.success / u.total * 100) + '%';
        return `
        <div class="flex items-center justify-between py-3 px-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <div class="flex items-center gap-3">
                <span class="text-base w-7">${MEDAL[i]}</span>
                <div>
                    <p class="oswald-sharp font-black italic text-sm text-white uppercase">${u.name}</p>
                    <p class="oswald-sharp text-[9px] text-gray-600 italic uppercase">${u.total}전 · ${acc}</p>
                </div>
            </div>
            <p class="oswald-sharp font-black italic text-base text-ufcRed">${u.points.toLocaleString()}P</p>
        </div>`;
    }).join('');
}

// ---- ADMIN: Update Season Name via RPC ----
function updateSeasonName() {
    const val = document.getElementById('new-season-name-input').value.trim();
    if (!val) { showToast('⚠ 시즌 이름을 입력하세요'); return; }
    if (!sb) { showToast('⚠ DB 연결 필요'); return; }

    sb.rpc('admin_update_season_name', { p_name: val }).then(function(res) {
        if (res.error) { showToast('⚠ RPC 오류: ' + res.error.message); return; }
        const data = res.data;
        if (!data || !data.ok) {
            const reason = data && data.reason;
            if (reason === 'admin_required')    showToast('⚠ 관리자 권한 필요');
            else if (reason === 'name_required') showToast('⚠ 시즌 이름을 입력하세요');
            else if (reason === 'no_active_season') showToast('⚠ 활성 시즌 없음');
            else showToast('⚠ 시즌명 변경 실패');
            return;
        }
        seasonData.current.name = data.name;
        saveSeason();
        renderSeasonAdminPanel();
        renderHallOfFame();
        showToast(`✅ 시즌명 변경: "${data.name}"`);
    }).catch(function() {
        showToast('⚠ RPC 오류');
    });
}

function confirmSeasonReset() {
    const rankings = getCurrentSeasonRankings();
    const modal = document.getElementById('season-reset-modal');
    const seasonNameEl = document.getElementById('season-reset-season-name');
    const preview = document.getElementById('season-reset-top3-preview');
    const MEDAL = ['🥇', '🥈', '🥉'];

    seasonNameEl.textContent = seasonData.current?.name || 'Season 1';
    preview.innerHTML = rankings.slice(0, 3).map((u, i) => {
        const acc = u.total === 0 ? '0%' : Math.round(u.success / u.total * 100) + '%';
        return `
        <div class="flex items-center justify-between py-2 px-4 rounded-xl bg-white/[0.03] border border-white/[0.05]">
            <div class="flex items-center gap-3">
                <span class="text-base">${MEDAL[i]}</span>
                <p class="oswald-sharp font-black italic text-sm text-white uppercase">${u.name}</p>
            </div>
            <p class="oswald-sharp font-black italic text-sm text-ufcRed">${u.points.toLocaleString()}P</p>
        </div>`;
    }).join('');

    modal.classList.remove('hidden');
}

function closeSeasonResetModal() {
    document.getElementById('season-reset-modal').classList.add('hidden');
}

// ---- ADMIN: Execute Season Reset via RPC ----
// 주의: 호출 시 전체 users.points 1000P 리셋, 되돌릴 수 없음
function executeSeasonReset() {
    if (seasonResetSubmitting) return;
    if (!sb) { showToast('⚠ DB 연결 필요'); return; }

    seasonResetSubmitting = true;
    const btn = document.querySelector('#season-reset-modal button[onclick="executeSeasonReset()"]');
    if (btn) { btn.disabled = true; btn.textContent = '처리 중...'; }

    function cleanup() {
        seasonResetSubmitting = false;
        if (btn) { btn.disabled = false; btn.textContent = '확정 종료'; }
    }

    // 다음 시즌명은 서버 자동 증가 (p_next_season_name = '')
    sb.rpc('admin_end_season', { p_next_season_name: '' }).then(function(res) {
        if (res.error) {
            showToast('⚠ RPC 오류: ' + res.error.message);
            cleanup();
            return;
        }
        const data = res.data;
        if (!data || !data.ok) {
            const reason = data && data.reason;
            if (reason === 'admin_required')      showToast('⚠ 관리자 권한 필요');
            else if (reason === 'no_active_season') showToast('⚠ 활성 시즌 없음');
            else showToast('⚠ 시즌 종료 실패');
            cleanup();
            return;
        }

        // 로컬 state 동기화 (서버가 points=1000으로 리셋했으므로 로컬도 맞춤)
        state.points = 1000;
        state.total  = 0;
        state.success = 0;
        state.history = [];
        state.pendings = {};
        state.settled  = {};
        save();

        closeSeasonResetModal();

        // DB에서 최신 season/HOF 재로드 → 렌더
        loadCurrentSeasonFromDB().then(function() {
            return loadHallOfFameFromDB();
        }).then(function() {
            renderSeasonAdminPanel();
            refreshUI();
            cleanup();
            showToast('🏆 시즌 종료! ' + data.new_season + ' 시작');
        }).catch(function() {
            cleanup();
        });
    }).catch(function() {
        showToast('⚠ RPC 오류');
        cleanup();
    });
}

function deleteSeasonRecord(idx) {
    if (!confirm('이 시즌 기록을 삭제하시겠습니까?')) return;
    seasonData.hallOfFame.splice(idx, 1);
    saveSeason();
    renderSeasonAdminPanel();
    renderHallOfFame();
    showToast('🗑 시즌 기록 삭제됨');
}
