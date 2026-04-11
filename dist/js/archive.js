/* ==============================
   ARCHIVE SYSTEM
   (extracted from index.html – global functions, no import/export)
   의존성: state.js (archiveDB, archiveFightRowCount, editingArchiveId)
           storage.js (save), utils.js (showToast, escapeHtml)
============================== */

var archiveDB = [];
var archiveFightRowCount = 0;
var editingArchiveId = null;

// Seed data — classic UFC events
const ARCHIVE_SEED = [
    {
        id: 'arc_1', name: 'UFC 300', date: '2024-04-13', venue: 'T-Mobile Arena, Las Vegas',
        fights: [
            { f1: '알렉스 페레이라', f2: '자말 힐', winner: '알렉스 페레이라', method: 'KO/TKO', round: 1, time: '1:44', tag: 'MAIN EVENT' },
            { f1: '맥스 할로웨이', f2: '저스틴 게이치', winner: '맥스 할로웨이', method: 'KO/TKO', round: 5, time: '4:59', tag: 'CO-MAIN EVENT' },
            { f1: '장웨일리', f2: '야마사키나나', winner: '장웨일리', method: 'SUB', round: 2, time: '3:11', tag: 'FEATURED' },
            { f1: '보 니칼', f2: '카이저 우메', winner: '보 니칼', method: 'KO/TKO', round: 1, time: '0:41', tag: 'PRELIMS' },
        ]
    },
    {
        id: 'arc_2', name: 'UFC 303', date: '2024-06-29', venue: 'T-Mobile Arena, Las Vegas',
        fights: [
            { f1: '알렉스 페레이라', f2: '지리 프로하스카', winner: '알렉스 페레이라', method: 'KO/TKO', round: 2, time: '4:10', tag: 'MAIN EVENT' },
            { f1: '브라이언 오르테가', f2: '디에고 로페스', winner: '디에고 로페스', method: 'UD', round: 3, time: '5:00', tag: 'CO-MAIN EVENT' },
            { f1: '조 로조', f2: '네이트 디아즈', winner: '네이트 디아즈', method: 'UD', round: 3, time: '5:00', tag: 'SPECIAL' },
        ]
    },
    {
        id: 'arc_3', name: 'UFC 308', date: '2024-10-26', venue: 'Etihad Arena, Abu Dhabi',
        fights: [
            { f1: '이칸 토픽', f2: '맥스 할로웨이', winner: '이칸 토픽', method: 'UD', round: 5, time: '5:00', tag: 'MAIN EVENT' },
            { f1: '마고메드 안칼라예프', f2: '알렉산더 라키치', winner: '마고메드 안칼라예프', method: 'KO/TKO', round: 1, time: '2:17', tag: 'CO-MAIN EVENT' },
        ]
    },
    {
        id: 'arc_4', name: 'UFC 311', date: '2025-01-18', venue: 'Intuit Dome, Inglewood',
        fights: [
            { f1: '이슬람 마카체프', f2: '아르만 차를라비', winner: '이슬람 마카체프', method: 'SUB', round: 5, time: '1:40', tag: 'MAIN EVENT' },
            { f1: '메랍 드발리쉬빌리', f2: '우마르 누르마고메도프', winner: '메랍 드발리쉬빌리', method: 'UD', round: 5, time: '5:00', tag: 'CO-MAIN EVENT' },
            { f1: '라파엘 피지에우', f2: '다비트 테자다', winner: '라파엘 피지에우', method: 'KO/TKO', round: 1, time: '2:26', tag: 'FEATURED' },
        ]
    },
    {
        id: 'arc_5', name: 'UFC 312', date: '2025-02-08', venue: 'Qudos Bank Arena, Sydney',
        fights: [
            { f1: '드라이커스 두 플레시', f2: '이즈 아데산야', winner: '드라이커스 두 플레시', method: 'UD', round: 5, time: '5:00', tag: 'MAIN EVENT' },
            { f1: '제이크 매튜스', f2: '빅토르 페타', winner: '제이크 매튜스', method: 'UD', round: 3, time: '5:00', tag: 'CO-MAIN EVENT' },
        ]
    },
];

function loadArchive() {
    const a = localStorage.getItem('picktagon_archive');
    if (a) {
        archiveDB = JSON.parse(a);
    } else {
        archiveDB = [...ARCHIVE_SEED];
        localStorage.setItem('picktagon_archive', JSON.stringify(archiveDB));
    }
}

function saveArchive() {
    localStorage.setItem('picktagon_archive', JSON.stringify(archiveDB));
}

// ---- PUBLIC VIEW ----
function renderArchive() {
    const list = document.getElementById('archive-list');
    const empty = document.getElementById('archive-empty');
    if (!list) return;

    const query = (document.getElementById('archive-search')?.value || '').toLowerCase();
    const yearFilter = document.getElementById('archive-filter')?.value || 'all';

    let filtered = [...archiveDB].filter(ev => {
        const matchName = ev.name.toLowerCase().includes(query) ||
            (ev.venue || '').toLowerCase().includes(query);
        const matchYear = yearFilter === 'all' || (ev.date || '').startsWith(yearFilter);
        return matchName && matchYear;
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // Update stats
    const totalFights = archiveDB.reduce((s, e) => s + (e.fights || []).length, 0);
    const koFights = archiveDB.reduce((s, e) => s + (e.fights || []).filter(f => f.method === 'KO/TKO').length, 0);
    document.getElementById('archive-stat-events').textContent = archiveDB.length;
    document.getElementById('archive-stat-fights').textContent = totalFights;
    document.getElementById('archive-stat-ko').textContent = totalFights > 0 ? Math.round(koFights / totalFights * 100) + '%' : '0%';

    if (filtered.length === 0) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    const METHOD_COLOR = {
        'KO/TKO': 'text-ufcRed border-ufcRed/40 bg-ufcRed/10',
        'SUB': 'text-purple-400 border-purple-400/40 bg-purple-400/10',
        'UD': 'text-blue-400 border-blue-400/40 bg-blue-400/10',
        'SD': 'text-yellow-400 border-yellow-400/40 bg-yellow-400/10',
        'MD': 'text-orange-400 border-orange-400/40 bg-orange-400/10',
        'DQ': 'text-gray-400 border-gray-400/40 bg-gray-400/10',
        'NC': 'text-gray-500 border-gray-500/40 bg-gray-500/10',
    };

    list.innerHTML = filtered.map(ev => {
        const dateStr = ev.date ? new Date(ev.date + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '날짜 미상';
        const mainEvent = (ev.fights || []).find(f => f.tag === 'MAIN EVENT') || ev.fights?.[0];

        return `
        <div class="glass-card rounded-[2rem] overflow-hidden hover:border-white/20 transition-all duration-500">
            <!-- Event Header -->
            <div class="flex flex-col lg:flex-row lg:items-center justify-between px-6 lg:px-10 py-5 lg:py-7 bg-black/30 border-b border-white/5 gap-3">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 lg:w-14 lg:h-14 rounded-2xl bg-ufcRed/10 border border-ufcRed/30 flex items-center justify-center flex-shrink-0">
                        <span class="oswald-sharp text-ufcRed text-[8px] lg:text-[10px] font-black italic uppercase text-center leading-tight px-1">${ev.name.replace('UFC ','').substring(0,4)}</span>
                    </div>
                    <div>
                        <p class="oswald-sharp font-black italic text-lg lg:text-3xl text-white uppercase tracking-tighter">${ev.name}</p>
                        <p class="oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest">${dateStr} · ${ev.venue || '—'}</p>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <span class="oswald-sharp text-[8px] lg:text-[10px] text-gray-600 italic uppercase tracking-widest">${(ev.fights || []).length}경기</span>
                    <button onclick="toggleArchiveDetail('${ev.id}')" id="archive-toggle-btn-${ev.id}"
                        class="oswald-sharp text-[8px] lg:text-xs border border-white/10 text-gray-500 hover:text-white hover:border-white/30 px-3 lg:px-4 py-1 lg:py-2 rounded-xl italic uppercase tracking-widest transition flex items-center gap-1">
                        <span id="archive-toggle-label-${ev.id}">▼ 결과 보기</span>
                    </button>
                </div>
            </div>

            ${mainEvent ? `
            <!-- Main Event Highlight -->
            <div class="px-6 lg:px-10 py-5 lg:py-6 border-b border-white/5 flex items-center justify-between gap-4">
                <div class="flex items-center gap-3 flex-wrap">
                    <span class="oswald-sharp text-[8px] bg-ufcRed/10 border border-ufcRed/20 text-ufcRed px-2 py-1 rounded-lg font-black italic uppercase">${mainEvent.tag}</span>
                    <span class="oswald-sharp text-sm lg:text-xl font-black italic text-white uppercase tracking-tighter">${mainEvent.f1} <span class="text-gray-600">vs</span> ${mainEvent.f2}</span>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    <span class="oswald-sharp text-[10px] lg:text-sm font-black italic text-ufcRed uppercase">W: ${mainEvent.winner}</span>
                    <span class="oswald-sharp text-[8px] border ${METHOD_COLOR[mainEvent.method] || 'text-gray-400 border-gray-400/40 bg-gray-400/10'} px-2 py-1 rounded-lg font-black italic uppercase">${mainEvent.method}</span>
                </div>
            </div>` : ''}

            <!-- Full Results (collapsible) -->
            <div id="archive-detail-${ev.id}" class="hidden">
                <div class="divide-y divide-white/5">
                    ${(ev.fights || []).map((f, i) => `
                    <div class="px-6 lg:px-10 py-4 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition">
                        <div class="flex items-center gap-3 min-w-0">
                            <span class="oswald-sharp text-[7px] lg:text-[9px] text-gray-600 italic uppercase tracking-widest flex-shrink-0 w-5 lg:w-8 text-center">${i + 1}</span>
                            <div class="min-w-0">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <span class="oswald-sharp text-xs lg:text-base font-black italic text-white uppercase tracking-tighter truncate">${f.f1}</span>
                                    <span class="text-gray-700 text-[10px]">vs</span>
                                    <span class="oswald-sharp text-xs lg:text-base font-black italic text-white uppercase tracking-tighter truncate">${f.f2}</span>
                                </div>
                                <p class="oswald-sharp text-[8px] lg:text-[10px] text-gray-600 italic uppercase tracking-widest mt-0.5">R${f.round} ${f.time}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0">
                            <div class="text-right">
                                <p class="oswald-sharp text-[9px] lg:text-xs font-black italic text-ufcRed uppercase">${f.winner}</p>
                                <p class="oswald-sharp text-[7px] lg:text-[9px] text-gray-600 italic uppercase tracking-widest">WINNER</p>
                            </div>
                            <span class="oswald-sharp text-[8px] border ${METHOD_COLOR[f.method] || 'text-gray-400 border-gray-400/40 bg-gray-400/10'} px-2 py-1 rounded-lg font-black italic uppercase">${f.method}</span>
                        </div>
                    </div>
                    `).join('')}
                </div>
            </div>
        </div>`;
    }).join('');
}

function toggleArchiveDetail(evId) {
    const panel = document.getElementById(`archive-detail-${evId}`);
    const label = document.getElementById(`archive-toggle-label-${evId}`);
    const isHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    label.textContent = isHidden ? '▲ 접기' : '▼ 결과 보기';
}

// ---- ADMIN ----
function renderArchiveAdminList() {
    const list = document.getElementById('archive-admin-list');
    const count = document.getElementById('archive-admin-count');
    if (!list) return;
    count.textContent = archiveDB.length;

    if (archiveDB.length === 0) {
        list.innerHTML = `<div class="glass-card p-8 text-center text-gray-600 oswald-sharp text-xs italic uppercase tracking-widest rounded-2xl">등록된 아카이브가 없습니다</div>`;
        return;
    }

    const sorted = [...archiveDB].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    list.innerHTML = sorted.map(ev => `
        <div class="glass-card rounded-2xl p-4 lg:p-5 flex items-center justify-between hover:border-white/20 transition">
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-xl bg-ufcRed/10 border border-ufcRed/20 flex items-center justify-center">
                    <span class="oswald-sharp text-ufcRed text-[8px] font-black italic">${ev.name.replace('UFC ','').substring(0,4)}</span>
                </div>
                <div>
                    <p class="oswald-sharp font-black italic text-sm lg:text-lg text-white uppercase tracking-tighter">${ev.name}</p>
                    <p class="oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest">${ev.date || '—'} · ${(ev.fights || []).length}경기</p>
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
    editingArchiveId = evId || null;
    archiveFightRowCount = 0;
    document.getElementById('archive-event-modal').classList.remove('hidden');
    document.getElementById('archive-fight-rows').innerHTML = '';

    if (evId) {
        const ev = archiveDB.find(e => e.id === evId);
        if (!ev) return;
        document.getElementById('archive-modal-title').textContent = '이벤트 수정';
        document.getElementById('ae-name').value = ev.name;
        document.getElementById('ae-date').value = ev.date || '';
        document.getElementById('ae-venue').value = ev.venue || '';
        document.getElementById('ae-edit-id').value = evId;
        (ev.fights || []).forEach(f => addArchiveFightRow(f));
    } else {
        document.getElementById('archive-modal-title').textContent = '이벤트 추가';
        ['ae-name', 'ae-venue'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('ae-date').value = '';
        document.getElementById('ae-edit-id').value = '';
        addArchiveFightRow(); // start with one row
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
    row.className = 'grid grid-cols-12 gap-2 items-center p-3 rounded-xl bg-black/30 border border-white/5';
    row.innerHTML = `
        <div class="col-span-1 text-center">
            <select id="afr-tag-${idx}" class="w-full bg-black/50 border border-white/10 rounded-lg px-1 py-2 text-white text-[9px] focus:outline-none focus:border-ufcRed">
                <option>MAIN EVENT</option><option>CO-MAIN EVENT</option><option>FEATURED</option><option>PRELIMS</option><option>SPECIAL</option>
            </select>
        </div>
        <div class="col-span-3">
            <input id="afr-f1-${idx}" type="text" placeholder="파이터 1" value="${prefill?.f1 || ''}"
                class="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-2 text-white text-xs focus:outline-none focus:border-ufcRed oswald-sharp italic uppercase font-black">
        </div>
        <div class="col-span-3">
            <input id="afr-f2-${idx}" type="text" placeholder="파이터 2" value="${prefill?.f2 || ''}"
                class="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-2 text-white text-xs focus:outline-none focus:border-ufcRed oswald-sharp italic uppercase font-black">
        </div>
        <div class="col-span-2">
            <input id="afr-winner-${idx}" type="text" placeholder="승자" value="${prefill?.winner || ''}"
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
        <div class="col-span-1 text-center">
            <button onclick="document.getElementById('afr-${idx}').remove()" class="text-gray-600 hover:text-ufcRed transition text-sm">✕</button>
        </div>
    `;
    container.appendChild(row);

    if (prefill) {
        document.getElementById(`afr-tag-${idx}`).value = prefill.tag || 'MAIN EVENT';
        document.getElementById(`afr-method-${idx}`).value = prefill.method || 'UD';
    }
}

function saveArchiveEvent() {
    const name = document.getElementById('ae-name').value.trim();
    if (!name) { showToast('⚠ 이벤트명을 입력하세요'); return; }

    // Collect fight rows
    const fights = [];
    document.querySelectorAll('[id^="afr-"]:not([id*="-f1-"]):not([id*="-f2-"]):not([id*="-winner-"]):not([id*="-method-"]):not([id*="-round-"]):not([id*="-tag-"])').forEach(row => {
        const idx = row.id.replace('afr-', '');
        const f1 = document.getElementById(`afr-f1-${idx}`)?.value.trim();
        const f2 = document.getElementById(`afr-f2-${idx}`)?.value.trim();
        if (f1 && f2) {
            fights.push({
                f1, f2,
                winner: document.getElementById(`afr-winner-${idx}`)?.value.trim() || f1,
                method: document.getElementById(`afr-method-${idx}`)?.value || 'UD',
                round: parseInt(document.getElementById(`afr-round-${idx}`)?.value) || 3,
                time: '5:00',
                tag: document.getElementById(`afr-tag-${idx}`)?.value || 'MAIN EVENT',
            });
        }
    });

    const evData = {
        id: editingArchiveId || ('arc_' + Date.now()),
        name,
        date: document.getElementById('ae-date').value || '',
        venue: document.getElementById('ae-venue').value.trim(),
        fights
    };

    if (editingArchiveId) {
        const idx = archiveDB.findIndex(e => e.id === editingArchiveId);
        if (idx !== -1) archiveDB[idx] = evData;
        showToast(`✅ ${name} 업데이트 완료`);
    } else {
        archiveDB.push(evData);
        showToast(`📊 ${name} 아카이브 등록 완료`);
    }

    saveArchive();
    closeArchiveEventModal();
    renderArchiveAdminList();
    renderArchive();
}

function deleteArchiveEvent(evId) {
    const ev = archiveDB.find(e => e.id === evId);
    if (!ev) return;
    if (!confirm(`"${ev.name}" 이벤트를 아카이브에서 삭제하시겠습니까?`)) return;
    archiveDB = archiveDB.filter(e => e.id !== evId);
    saveArchive();
    renderArchiveAdminList();
    renderArchive();
    showToast(`🗑 ${ev.name} 삭제됨`);
}

/* ==============================
   SEASON SYSTEM
============================== */

