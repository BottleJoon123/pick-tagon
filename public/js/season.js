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
    hallOfFame: [],       // array of { seasonName, endDate, top3: [{rank, name, points, accuracy, belt}] }
    adminHallOfFame: []   // admin-only: includes hidden entries, each top3 entry has hofId/isHidden/hiddenReason
};

var seasonResetSubmitting = false;

// adminHofFilter: 'all' | 'visible' | 'hidden'  — persists across re-renders
var adminHofFilter = 'all';
function setAdminHofFilter(f) {
    adminHofFilter = f;
    renderSeasonAdminPanel();
}

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
        var sub = document.getElementById('rankings-season-subtitle');
        if (sub) sub.textContent = '· ' + row.name;
    }).catch(function() {});
}

// get_hall_of_fame() → seasonData.hallOfFame 갱신 + renderHallOfFame() 호출
// RPC 성공이면 빈 배열이어도 DB 결과로 덮어씀 (stale localStorage 제거)
// RPC 실패/네트워크 오류일 때만 기존 seasonData 유지 (fallback)
function loadHallOfFameFromDB() {
    if (!sb) { renderHallOfFame(); return Promise.resolve(); }
    return sb.rpc('get_hall_of_fame').then(function(res) {
        if (!res.error && Array.isArray(res.data)) {
            if (res.data.length > 0) {
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
            } else {
                // RPC 성공 + 빈 배열 = 실제로 HOF 없음, stale localStorage 제거
                seasonData.hallOfFame = [];
            }
            saveSeason();
        }
        // res.error 또는 비정상 응답이면 기존 seasonData.hallOfFame 유지 (fallback)
    }).catch(function() {}).then(function() {
        renderHallOfFame();
    });
}

// admin_get_hall_of_fame() → seasonData.adminHallOfFame 갱신 (숨김 항목 포함, hofId 포함)
// is_admin() guard가 있으므로 non-admin에서는 RPC 오류 → adminHallOfFame 빈 배열 유지
function loadAdminHallOfFameFromDB() {
    if (!sb) return Promise.resolve();
    return sb.rpc('admin_get_hall_of_fame').then(function(res) {
        if (!res.error && Array.isArray(res.data)) {
            var grouped = [];
            var idxMap = {};
            res.data.forEach(function(row) {
                if (!(row.season_id in idxMap)) {
                    idxMap[row.season_id] = grouped.length;
                    grouped.push({ seasonName: row.season_name, endDate: row.end_date, top3: [] });
                }
                grouped[idxMap[row.season_id]].top3.push({
                    hofId:        row.hof_id,
                    rank:         row.rank,
                    name:         row.nickname,
                    points:       row.points,
                    total:        row.total_picks,
                    success:      row.success_picks,
                    accuracy:     row.accuracy !== null ? row.accuracy + '%' : '0%',
                    belt:         row.belt,
                    isHidden:     row.is_hidden,
                    hiddenReason: row.hidden_reason
                });
            });
            seasonData.adminHallOfFame = grouped.reverse();
        }
    }).catch(function() {});
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
    const sub = document.getElementById('rankings-season-subtitle');
    if (sub) sub.textContent = seasonData.current?.name ? '· ' + seasonData.current.name : '';
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
            <div class="divide-y divide-white/4">
                ${(season.top3 || []).map((p, i) => {
                    const rankNum   = Number(p.rank) || (i + 1);
                    const beltStyle = BELT_STYLES[p.belt] || 'text-white';
                    const bgGlow    = rankNum === 1 ? 'bg-yellow-500/3' : '';
                    return `
                    <div class="flex items-center justify-between px-6 lg:px-10 py-4 lg:py-5 ${bgGlow} hover:bg-white/2 transition">
                        <div class="flex items-center gap-4">
                            <span class="text-lg lg:text-2xl w-8 text-center flex-shrink-0">${MEDAL[rankNum - 1] || `#${rankNum}`}</span>
                            <div>
                                <p class="oswald-sharp font-black italic text-sm lg:text-xl uppercase tracking-tighter ${rankNum === 1 ? 'text-white' : 'text-gray-300'}">${p.name}</p>
                                <p class="oswald-sharp text-[9px] text-gray-600 italic uppercase tracking-widest">${p.total}전 ${p.success}승 · 적중률 ${p.accuracy}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3 lg:gap-5">
                            <p class="oswald-sharp font-black italic text-base lg:text-2xl ${rankNum === 1 ? 'text-ufcRed' : 'text-gray-400'}">${p.points.toLocaleString()}<span class="text-[9px] ml-1">P</span></p>
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

    // Past seasons (DB 기반; loadAdminHallOfFameFromDB 이후 갱신됨)
    const adminHof = seasonData.adminHallOfFame || [];
    hofCountEl.textContent = adminHof.length;
    if (adminHof.length === 0) {
        hofList.innerHTML = `<div class="glass-card p-6 text-center text-gray-700 oswald-sharp text-xs italic uppercase tracking-widest rounded-2xl">기록된 시즌 없음</div>`;
    } else {
        const totalVisible = adminHof.reduce((n, s) => n + s.top3.filter(e => !e.isHidden).length, 0);
        const totalHidden  = adminHof.reduce((n, s) => n + s.top3.filter(e =>  e.isHidden).length, 0);
        const fBtn = (f, label) => {
            const active = adminHofFilter === f;
            return `<button onclick="setAdminHofFilter('${f}')" class="oswald-sharp text-[9px] italic uppercase tracking-widest px-3 py-1.5 rounded-lg border transition ${active ? 'text-white border-white/30 bg-white/10' : 'text-gray-600 border-white/10 hover:text-gray-400 hover:border-white/20'}">${label}</button>`;
        };
        const filterBar = `<div class="flex items-center gap-2 mb-3">${fBtn('all', '전체 ' + adminHof.length + '시즌')}${fBtn('visible', '공개 ' + totalVisible + '건')}${fBtn('hidden', '숨김 ' + totalHidden + '건')}</div>`;

        const cardHtml = adminHof.map((s) => {
            const filteredTop3 = s.top3.filter(e => {
                if (adminHofFilter === 'visible') return !e.isHidden;
                if (adminHofFilter === 'hidden')  return  e.isHidden;
                return true;
            });
            if (filteredTop3.length === 0) return null;

            const allHidden     = s.top3.length > 0 && s.top3.every(e => e.isHidden);
            const partialHidden = !allHidden && s.top3.some(e => e.isHidden);
            const champion      = s.top3.find(e => e.rank === 1);
            const championName  = champion
                ? (champion.isHidden ? '(숨김 처리됨)' : escapeHtml(champion.name))
                : '—';
            const hiddenCount   = s.top3.filter(e => e.isHidden).length;

            const hideButtons = filteredTop3.filter(e => !e.isHidden).map(e =>
                `<button onclick="hideSeasonHofEntry(${e.hofId})" class="oswald-sharp text-[9px] text-gray-500 hover:text-red-400 italic uppercase tracking-widest px-2 py-1 border border-white/10 rounded-lg hover:border-red-500/30 transition">숨김 #${e.rank}</button>`
            ).join('');
            const restoreButtons = filteredTop3.filter(e => e.isHidden).map(e =>
                `<button onclick="restoreSeasonHofEntry(${e.hofId})" class="oswald-sharp text-[9px] text-yellow-600 hover:text-yellow-400 italic uppercase tracking-widest px-2 py-1 border border-yellow-600/20 rounded-lg hover:border-yellow-400/40 transition">복구 #${e.rank}</button>`
            ).join('');

            const titleBadge = allHidden
                ? ` <span class="not-italic font-normal text-gray-600 text-[9px] tracking-normal">[숨김]</span>`
                : partialHidden
                ? ` <span class="not-italic font-normal text-yellow-600/70 text-[9px] tracking-normal">[일부 숨김 ${hiddenCount}/${s.top3.length}]</span>`
                : '';

            return `
            <div class="glass-card rounded-2xl p-4 flex items-center justify-between hover:border-yellow-500/20 transition ${allHidden ? 'opacity-40' : ''}">
                <div class="flex items-center gap-3">
                    <span class="text-xl">${allHidden ? '👻' : '🏆'}</span>
                    <div>
                        <p class="oswald-sharp font-black italic text-sm ${allHidden ? 'text-gray-500 line-through' : 'text-white'} uppercase tracking-tighter">${escapeHtml(s.seasonName)}${titleBadge}</p>
                        <p class="oswald-sharp text-[9px] text-gray-600 italic uppercase">종료: ${s.endDate} · 우승: ${championName}</p>
                    </div>
                </div>
                <div class="flex flex-wrap gap-1.5 justify-end max-w-[160px]">${hideButtons}${restoreButtons}</div>
            </div>`;
        }).filter(Boolean).join('');

        hofList.innerHTML = filterBar + (cardHtml || `<div class="glass-card p-6 text-center text-gray-700 oswald-sharp text-xs italic uppercase tracking-widest rounded-2xl">조건에 맞는 HOF 항목 없음</div>`);
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
        <div class="flex items-center justify-between py-3 px-4 rounded-xl bg-white/2 border border-white/4">
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
    const modal = document.getElementById('season-reset-modal');
    const seasonNameEl = document.getElementById('season-reset-season-name');
    const preview = document.getElementById('season-reset-top3-preview');

    seasonNameEl.textContent = seasonData.current?.name || 'Season 1';
    // 실제 Top3는 admin_end_season RPC가 서버 users 테이블 기준으로 확정 계산
    // 클라이언트 mockRankings와 다를 수 있으므로 가짜 프리뷰를 표시하지 않음
    preview.innerHTML = `
        <div class="py-3 px-4 rounded-xl bg-white/3 border border-yellow-500/10 text-center">
            <p class="oswald-sharp text-[10px] text-yellow-500/60 italic uppercase tracking-widest">최종 Top 3는 서버의 현재 users 랭킹 기준으로 저장됩니다.</p>
        </div>`;

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

        // S1 리셋 정책: users.points만 1000으로 리셋, total/success는 all-time 커리어 지표 유지
        state.points = 1000;
        // 로컬 캐시(history/pendings/settled)는 시즌 전환 시 초기화
        // total/success는 DB가 source of truth — loadUserFromDB로 재동기화
        state.history  = [];
        state.pendings = {};
        state.settled  = {};
        save();
        if (currentUser && typeof loadUserFromDB === 'function') {
            loadUserFromDB(currentUser.id);
        }

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

function hideSeasonHofEntry(hofId) {
    if (!sb) { showToast('⚠ DB 연결 필요'); return; }
    const reasonInput = prompt('숨김 사유 입력 (선택)\n빈칸이면 사유 없이 숨김됩니다.\n취소 버튼 클릭 시 실행되지 않습니다.');
    if (reasonInput === null) return;
    const reason = reasonInput.trim() || null;
    sb.rpc('admin_hide_hof_entry', { p_hof_id: hofId, p_reason: reason }).then(function(res) {
        if (res.error) { showToast('⚠ RPC 오류: ' + res.error.message); return; }
        const data = res.data;
        if (!data || !data.ok) {
            const reason = data && data.reason;
            if (reason === 'admin_required')             showToast('⚠ 관리자 권한 필요');
            else if (reason === 'active_season_not_allowed') showToast('⚠ 활성 시즌은 숨길 수 없습니다');
            else if (reason === 'hof_entry_not_found')   showToast('⚠ 항목을 찾을 수 없습니다');
            else showToast('⚠ 숨김 처리 실패');
            return;
        }
        if (data.idempotent) { showToast('ℹ 이미 숨김 처리된 항목입니다'); return; }
        showToast('✅ HOF 항목 숨김 처리됨');
        loadAdminHallOfFameFromDB().then(renderSeasonAdminPanel);
        loadHallOfFameFromDB();
    }).catch(function() { showToast('⚠ RPC 오류'); });
}

function restoreSeasonHofEntry(hofId) {
    if (!sb) { showToast('⚠ DB 연결 필요'); return; }
    sb.rpc('admin_restore_hof_entry', { p_hof_id: hofId }).then(function(res) {
        if (res.error) { showToast('⚠ RPC 오류: ' + res.error.message); return; }
        const data = res.data;
        if (!data || !data.ok) {
            const reason = data && data.reason;
            if (reason === 'admin_required')           showToast('⚠ 관리자 권한 필요');
            else if (reason === 'hof_entry_not_found') showToast('⚠ 항목을 찾을 수 없습니다');
            else showToast('⚠ 복구 실패');
            return;
        }
        if (data.idempotent) { showToast('ℹ 이미 공개 상태입니다'); return; }
        showToast('✅ HOF 항목 복구됨');
        loadAdminHallOfFameFromDB().then(renderSeasonAdminPanel);
        loadHallOfFameFromDB();
    }).catch(function() { showToast('⚠ RPC 오류'); });
}
