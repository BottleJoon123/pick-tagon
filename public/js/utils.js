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

    function updateNicknameDisplay() {
        const name = getDisplayUsername();
        const el = document.getElementById('profile-nickname-display');
        if (el) el.textContent = name;
        // also update nav if needed
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
