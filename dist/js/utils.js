/* ==============================
   SHARED UTILITIES
   (extracted from index.html – global functions, no import/export)
============================== */

    function showToast(msg) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerText = msg;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function escapeHtml(value = '') {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getNickname() {
        return localStorage.getItem('picktagon_nickname') || null;
    }

    function getDisplayUsername() {
        return getNickname() || ('PLAYER_' + (localStorage.getItem('picktagon_display_name') || Math.random().toString(36).slice(2,6).toUpperCase()));
    }

    // 집단 이모지 + 닉네임 조합 (e.g. "🐻 하빕킹")
    function getDisplayUsernameWithFaction() {
        var nick = getDisplayUsername();
        if (currentFaction && currentFaction.emoji_icon) {
            return currentFaction.emoji_icon + ' ' + nick;
        }
        return nick;
    }

    // 집단 뱃지 HTML 반환 (인라인 표시용)
    // size: 'sm' | 'md' (default 'sm')
    function getFactionBadge(factionObj, size) {
        if (!factionObj || !factionObj.emoji_icon) return '';
        var sz = (size === 'md')
            ? 'text-base px-2 py-0.5'
            : 'text-[11px] px-1.5 py-0';
        return '<span class="oswald-sharp ' + sz + ' rounded-md border border-white/10 bg-white/5 text-white/70 font-black italic select-none" title="' + escapeHtml(factionObj.name) + '">' + factionObj.emoji_icon + '</span>';
    }

    // 닉네임으로 faction 검색 (posts의 author 기준 — DB 조인 없이 factions 캐시 활용)
    function getFactionByNick(nick) {
        // 현재 로그인 유저 본인이면 currentFaction 사용
        if (nick === getDisplayUsername() && currentFaction) return currentFaction;
        return null; // 타 유저 faction은 posts 로드 시 별도 저장 필요 (2단계)
    }

    function updateNicknameDisplay() {
        var name = getDisplayUsernameWithFaction();
        var el = document.getElementById('profile-nickname-display');
        if (el) el.textContent = name;
    }

    // 집단 뱃지 UI 갱신 (로그인 후 faction 확정 시 호출)
    function updateFactionBadgeUI() {
        updateNicknameDisplay();
        // 프로필 내 집단 표시 영역 업데이트
        var factionEl = document.getElementById('profile-faction-display');
        if (factionEl) {
            if (currentFaction) {
                factionEl.innerHTML = getFactionBadge(currentFaction, 'md') +
                    '<span class="oswald-sharp text-sm font-black italic text-white ml-2">' + escapeHtml(currentFaction.name) + '</span>';
            } else {
                factionEl.innerHTML = '<button onclick="openFactionSelectModal()" class="oswald-sharp text-xs font-black italic uppercase text-ufcRed border border-ufcRed/40 px-3 py-1 rounded-lg hover:bg-ufcRed/10 transition">+ 집단 선택</button>';
            }
        }
    }

    function stripHtmlSummary(text) {
        if (!text) return '';
        try {
            // DOM-based parsing: handles partial/malformed HTML perfectly
            var tmp = document.createElement('div');
            tmp.innerHTML = text;
            var result = (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
            if (result && result.length > 3 && !/^https?:\/\/\S+$/.test(result)) {
                return result.substring(0, 200);
            }
        } catch(e) {}
        return '';
    }
