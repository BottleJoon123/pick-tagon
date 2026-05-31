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
        if (typeof applyProfileAvatar === 'function') applyProfileAvatar();
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

    // ── 아바타 커스터마이징 (localStorage 기반, 기기별 저장) ──────────
    var _AVATAR_BG_WHITELIST = ['#1a0a0a','#E10600','#1d4ed8','#7c3aed','#b45309','#15803d','#1a1a1a'];
    var _AVATAR_FG_WHITELIST = ['#ffffff','#E10600'];
    var _AVATAR_DEFAULT_BG   = '#1a0a0a';
    var _AVATAR_DEFAULT_FG   = '#E10600';
    var _AVATAR_DEFAULT_LABEL = '⚡';

    function getAvatarStorageKey() {
        var uid = (typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? currentUser.id : 'guest';
        return 'picktagon_avatar_v1_' + uid;
    }

    function getAvatarConfig() {
        try {
            var raw = localStorage.getItem(getAvatarStorageKey());
            if (raw) {
                var p = JSON.parse(raw);
                if (_AVATAR_BG_WHITELIST.indexOf(p.bg) === -1) p.bg = _AVATAR_DEFAULT_BG;
                if (_AVATAR_FG_WHITELIST.indexOf(p.fg) === -1) p.fg = _AVATAR_DEFAULT_FG;
                if (p.mode !== 'emoji' && p.mode !== 'initial') p.mode = 'emoji';
                return p;
            }
        } catch(e) {}
        return { mode: 'emoji', label: _AVATAR_DEFAULT_LABEL, bg: _AVATAR_DEFAULT_BG, fg: _AVATAR_DEFAULT_FG };
    }

    function saveAvatarConfig(config) {
        var mode  = (config.mode === 'initial') ? 'initial' : 'emoji';
        var raw   = String(config.label || '');
        var label = Array.from(raw).slice(0, 2).join('') || _AVATAR_DEFAULT_LABEL;
        var bg    = (_AVATAR_BG_WHITELIST.indexOf(config.bg) !== -1) ? config.bg : _AVATAR_DEFAULT_BG;
        var fg    = (_AVATAR_FG_WHITELIST.indexOf(config.fg) !== -1) ? config.fg : _AVATAR_DEFAULT_FG;
        var sanitized = { mode: mode, label: label, bg: bg, fg: fg, updatedAt: new Date().toISOString() };
        localStorage.setItem(getAvatarStorageKey(), JSON.stringify(sanitized));
        _syncAvatarToAuthMeta(sanitized);
    }

    function _syncAvatarToAuthMeta(cfg) {
        if (typeof sb === 'undefined' || !sb || typeof currentUser === 'undefined' || !currentUser) return;
        sb.auth.updateUser({ data: { avatar_config: cfg } })
            .then(function(res) {
                if (res && res.data && res.data.user && currentUser) {
                    currentUser.user_metadata = res.data.user.user_metadata || currentUser.user_metadata;
                }
            })
            .catch(function(e) { console.warn('[avatar] auth metadata sync failed:', e); });
    }

    function syncAvatarFromAuthMeta() {
        if (typeof currentUser === 'undefined' || !currentUser) return;
        var meta = (currentUser.user_metadata && currentUser.user_metadata.avatar_config) || null;
        if (!meta) { applyProfileAvatar(); return; }
        var metaBg    = (_AVATAR_BG_WHITELIST.indexOf(meta.bg) !== -1) ? meta.bg : _AVATAR_DEFAULT_BG;
        var metaFg    = (_AVATAR_FG_WHITELIST.indexOf(meta.fg) !== -1) ? meta.fg : _AVATAR_DEFAULT_FG;
        var metaMode  = (meta.mode === 'initial') ? 'initial' : 'emoji';
        var metaLabel = Array.from(String(meta.label || _AVATAR_DEFAULT_LABEL)).slice(0, 2).join('');
        var metaTs    = meta.updatedAt || '';
        var localRaw  = null;
        try { localRaw = JSON.parse(localStorage.getItem(getAvatarStorageKey())); } catch(e) {}
        var localTs = (localRaw && localRaw.updatedAt) ? localRaw.updatedAt : '';
        if (!localTs || (metaTs && metaTs > localTs)) {
            localStorage.setItem(getAvatarStorageKey(), JSON.stringify(
                { mode: metaMode, label: metaLabel, bg: metaBg, fg: metaFg, updatedAt: metaTs }
            ));
        }
        applyProfileAvatar();
    }

    function getAvatarInitialsFromNickname() {
        var nick = getDisplayUsername() || '';
        var clean = nick.replace(/[^a-zA-Z0-9가-힣]/g, ' ').trim();
        var parts = clean.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) return (Array.from(parts[0])[0] + Array.from(parts[1])[0]).toUpperCase();
        return Array.from(nick).slice(0, 2).join('').toUpperCase() || '?';
    }

    function applyProfileAvatar() {
        var wrap = document.getElementById('profile-avatar-wrap');
        if (!wrap) return;
        var cfg = getAvatarConfig();
        var bg = (_AVATAR_BG_WHITELIST.indexOf(cfg.bg) !== -1) ? cfg.bg : _AVATAR_DEFAULT_BG;
        var fg = (_AVATAR_FG_WHITELIST.indexOf(cfg.fg) !== -1) ? cfg.fg : _AVATAR_DEFAULT_FG;
        var label = cfg.label || '';
        if (!label) label = (cfg.mode === 'initial') ? getAvatarInitialsFromNickname() : _AVATAR_DEFAULT_LABEL;
        var displayLabel = Array.from(label).slice(0, 2).join('') || _AVATAR_DEFAULT_LABEL;
        wrap.style.background = bg;
        wrap.style.borderColor = (fg === '#E10600') ? 'rgba(225,6,0,0.3)' : 'rgba(255,255,255,0.15)';
        var labelEl = document.getElementById('profile-avatar-label');
        if (labelEl) {
            labelEl.style.color = fg;
            labelEl.textContent = displayLabel;
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
