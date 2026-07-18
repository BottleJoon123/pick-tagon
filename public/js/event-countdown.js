/* event-countdown.js — Extracted from index.html inline script (Phase 9D-1).
   Uses events.picks_locked_at only when a canonical timestamp with an
   explicit timezone is present. event_date is a calendar-date placeholder
   and must never feed this countdown. */

var _countdownInterval = null;

function _isValidPicksLockedAt(str) {
    if (typeof str !== 'string') return false;
    var s = str.trim();
    if (!s) return false;
    // 날짜+시간+명시적 timezone(Z 또는 ±HH[:]MM|±HH)까지 갖춘 canonical timestamptz만 허용.
    //   시간대 없는 "YYYY-MM-DDTHH:MM:SS"류는 로컬시로 모호하게 해석될 수 있어 거부(추측 금지).
    if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)$/.test(s)) return false;
    return isFinite(Date.parse(s));
}

function startEventCountdown(picksLockedAtStr) {
    var labelEl = document.getElementById('event-countdown-label');
    var valueEl = document.getElementById('event-countdown-value');
    if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }
    if (!valueEl) return;

    if (labelEl) labelEl.textContent = '픽 마감';

    var trimmed = typeof picksLockedAtStr === 'string' ? picksLockedAtStr.trim() : picksLockedAtStr;

    if (!_isValidPicksLockedAt(trimmed)) {
        valueEl.textContent = '시각 미정';
        return;
    }

    var deadlineMs = Date.parse(trimmed);

    // true = 아직 미래(카운트다운 렌더) / false = 이미 만료("마감됨" + interval 정리).
    // 첫 실행 결과로 interval 생성 여부를 결정해, 사전 검사와 최초 update() 사이의
    // 극미세 구간에 마감되어도 만료 직후 interval이 재생성되는 경계 버그를 없앤다.
    function update() {
        var diff = deadlineMs - Date.now();
        if (diff <= 0) {
            valueEl.textContent = '마감됨';
            if (_countdownInterval) { clearInterval(_countdownInterval); _countdownInterval = null; }
            return false;
        }

        var days  = Math.floor(diff / 86400000);
        var hours = Math.floor((diff % 86400000) / 3600000);
        var mins  = Math.floor((diff % 3600000)  / 60000);

        if (days > 1) {
            valueEl.textContent = 'D-' + days;
        } else if (days === 1) {
            valueEl.textContent = '1d ' + hours + 'h';
        } else {
            valueEl.textContent = hours + 'h ' + (mins < 10 ? '0' : '') + mins + 'm';
        }
        return true;
    }

    if (!update()) return;
    _countdownInterval = setInterval(update, 60000);
}
