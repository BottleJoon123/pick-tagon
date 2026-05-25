/* event-countdown.js — Extracted from index.html inline script (Phase 9D-1).
   Pick-close countdown timer for the active event. */

var _countdownInterval = null;

function startEventCountdown(eventDateStr) {
    var labelEl = document.getElementById('event-countdown-label');
    var valueEl = document.getElementById('event-countdown-value');
    if (!valueEl) return;
    if (_countdownInterval) clearInterval(_countdownInterval);

    function update() {
        var now = Date.now();
        // 픽 마감 = 이벤트 시작 2시간 전
        var eventMs = new Date(eventDateStr).getTime();
        var deadlineMs = eventMs - 2 * 60 * 60 * 1000;
        var diff = deadlineMs - now;

        if (diff <= 0) {
            if (labelEl) labelEl.textContent = 'Status';
            valueEl.textContent = now < eventMs ? '🔴 LIVE' : 'LOCKED';
            clearInterval(_countdownInterval);
            return;
        }

        var days  = Math.floor(diff / 86400000);
        var hours = Math.floor((diff % 86400000) / 3600000);
        var mins  = Math.floor((diff % 3600000)  / 60000);

        if (labelEl) labelEl.textContent = 'Pick Closes';
        if (days > 1) {
            valueEl.textContent = 'D-' + days;
        } else if (days === 1) {
            valueEl.textContent = '1d ' + hours + 'h';
        } else {
            valueEl.textContent = hours + 'h ' + (mins < 10 ? '0' : '') + mins + 'm';
        }
    }

    update();
    _countdownInterval = setInterval(update, 60000);
}
