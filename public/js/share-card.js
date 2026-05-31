'use strict';
/* ==============================
   SHARE-CARD
   픽타곤 결과 공유 카드 — canvas 기반, 외부 이미지 없음 (taint-free)
   의존성 (전역 window 스코프):
     state.js       : state.points, state.total, state.success
     utils.js       : getDisplayUsername()
     community.js   : getBeltInfo(pts) → {name, color}
     profile.js     : calcStreak() → {type, count}
     admin.js       : eventInfo.name
============================== */

// ── 데이터 수집 ────────────────────────────────────────
function buildShareCardData() {
    var nick = '';
    try { nick = (typeof getDisplayUsername === 'function') ? getDisplayUsername() : ''; } catch(e) {}
    if (!nick) nick = 'Pick-tagon Player';

    var pts = 0, tot = 0, suc = 0;
    try {
        if (typeof state !== 'undefined') {
            pts = state.points  || 0;
            tot = state.total   || 0;
            suc = state.success || 0;
        }
    } catch(e) { console.warn('[ShareCard] state read failed:', e); }

    var acc = (tot > 0) ? Math.round(suc / tot * 100) : 0;

    var belt = { name: 'White', color: '#e8e8e8' };
    try { if (typeof getBeltInfo === 'function') belt = getBeltInfo(pts); } catch(e) {}

    var streak = { type: 'none', count: 0 };
    try { if (typeof calcStreak === 'function') streak = calcStreak(); } catch(e) {}

    // 리더보드 순위 — renderLeaderboard() 이후 DOM에 확정됨
    var rankEl = document.getElementById('my-rank-num');
    var rank = (rankEl && rankEl.textContent.trim()) ? rankEl.textContent.trim() : '—';
    if (rank === '0') rank = '—';

    var evName = 'Pick-tagon';
    try {
        if (typeof eventInfo !== 'undefined' && eventInfo && eventInfo.name) {
            evName = eventInfo.name;
        }
    } catch(e) {}

    return {
        nick:    nick,
        points:  pts,
        total:   tot,
        success: suc,
        acc:     acc,
        belt:    belt,
        streak:  streak,
        rank:    rank,
        event:   evName
    };
}

// ── 옥타곤 경로 ────────────────────────────────────────
function _scOctagon(ctx, cx, cy, r, rot) {
    ctx.beginPath();
    for (var i = 0; i < 8; i++) {
        var a = rot + i * Math.PI / 4;
        var x = cx + r * Math.cos(a);
        var y = cy + r * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

// ── 카드 드로잉 ────────────────────────────────────────
function drawPicktagonShareCard(canvas, data) {
    var W = 1080, H = 1080;
    canvas.width  = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');

    var RED    = '#E10600';
    var GOLD   = '#E8B23A';
    var WHITE  = '#f4f4f5';
    var MUTED  = '#9a9aa2';
    var MUTED2 = '#67676e';

    // font: Oswald loaded by main page; Pretendard as body fallback
    var F_BLK  = '"Oswald","Pretendard","Apple SD Gothic Neo",Arial,sans-serif';
    var F_BODY = '"Pretendard","Oswald","Apple SD Gothic Neo",Arial,sans-serif';
    var F_MONO = '"Space Mono","Courier New",monospace';

    // 1. 배경
    ctx.fillStyle = '#08090b';
    ctx.fillRect(0, 0, W, H);

    // 2. 오른쪽 위 빨간 ambient glow (강화: 0.28 → 0.35)
    var g1 = ctx.createRadialGradient(W - 80, 80, 0, W - 80, 80, 580);
    g1.addColorStop(0, 'rgba(225,6,0,0.35)');
    g1.addColorStop(1, 'rgba(225,6,0,0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);

    // 3. 왼쪽 아래 벨트 색 glow (강화: 0.45 → 0.55)
    var bGlow = _beltGlow(data.belt.name);
    var g2 = ctx.createRadialGradient(80, H - 80, 0, 80, H - 80, 440);
    g2.addColorStop(0, bGlow);
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    // 4. 옥타곤 데코 (링 투명도 강화: 0.14 → 0.18)
    ctx.save();
    ctx.strokeStyle = 'rgba(225,6,0,0.18)'; ctx.lineWidth = 2;
    _scOctagon(ctx, W / 2, H / 2, W * 0.60, Math.PI / 8); ctx.stroke();
    ctx.strokeStyle = 'rgba(225,6,0,0.09)'; ctx.lineWidth = 1.5;
    _scOctagon(ctx, W / 2, H / 2, W * 0.73, Math.PI / 8); ctx.stroke();
    ctx.restore();

    // 5. 테두리 프레임 (둥근 직사각형 근사)
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 2;
    var fr = 28, r = 18;
    ctx.beginPath();
    ctx.moveTo(fr + r, fr);
    ctx.lineTo(W - fr - r, fr);
    ctx.arcTo(W - fr, fr, W - fr, fr + r, r);
    ctx.lineTo(W - fr, H - fr - r);
    ctx.arcTo(W - fr, H - fr, W - fr - r, H - fr, r);
    ctx.lineTo(fr + r, H - fr);
    ctx.arcTo(fr, H - fr, fr, H - fr - r, r);
    ctx.lineTo(fr, fr + r);
    ctx.arcTo(fr, fr, fr + r, fr, r);
    ctx.closePath();
    ctx.stroke();

    var PAD = 80;

    // 6. 로고 — 빨간 옥타곤 + 흰 체크마크 + PICK-TAGON
    var logoCy = 100;
    var logoR  = 22;
    var logoCx = PAD + logoR;
    ctx.save();
    ctx.strokeStyle = RED;
    ctx.lineWidth   = 3;
    ctx.lineJoin    = 'round';
    _scOctagon(ctx, logoCx, logoCy, logoR, Math.PI / 8);
    ctx.stroke();
    // 흰색 체크마크
    ctx.strokeStyle = WHITE;
    ctx.lineWidth   = 4;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(logoCx - logoR * 0.45, logoCy + logoR * 0.05);
    ctx.lineTo(logoCx - logoR * 0.05, logoCy + logoR * 0.50);
    ctx.lineTo(logoCx + logoR * 0.55, logoCy - logoR * 0.45);
    ctx.stroke();
    ctx.restore();

    ctx.font = '600 42px ' + F_BLK;
    ctx.fillStyle = WHITE;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText('PICK-TAGON', logoCx + logoR + 20, logoCy);

    // 이벤트명 (오른쪽) — fallback 개선
    var isDefaultEvent = !data.event || data.event === 'Pick-tagon';
    var evRight = isDefaultEvent
        ? 'UFC & MMA PICK GAME'
        : ((data.event.length > 26) ? data.event.slice(0, 25) + '…' : data.event).toUpperCase();
    ctx.font = '400 20px ' + F_MONO;
    ctx.fillStyle = MUTED2;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(evRight, W - PAD, logoCy);
    ctx.textAlign = 'left';

    // 구분선
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, 130); ctx.lineTo(W - PAD, 130); ctx.stroke();

    // 7. 큰 기록 숫자 — 히어로 (가운데 정렬)
    var heroCx = W / 2;

    // PICK RESULT 라벨
    ctx.font = '400 20px ' + F_MONO;
    ctx.fillStyle = MUTED2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('PICK RESULT', heroCx, 300);

    // success (큰 빨간) + /total (회색) — 묶음을 중앙에 정렬
    var recY = 470;
    var hitStr   = String(data.success);
    var totStr   = '/' + data.total;
    ctx.font = '700 190px ' + F_BLK;
    var hitW = ctx.measureText(hitStr).width;
    ctx.font = '400 80px ' + F_BLK;
    var totW = ctx.measureText(totStr).width;
    var gap  = 10;
    var blockW = hitW + gap + totW;
    var startX = heroCx - blockW / 2;

    ctx.textAlign = 'left';
    ctx.font = '700 190px ' + F_BLK;
    ctx.fillStyle = RED;
    ctx.fillText(hitStr, startX, recY);

    ctx.font = '400 80px ' + F_BLK;
    ctx.fillStyle = MUTED2;
    ctx.fillText(totStr, startX + hitW + gap, recY);

    // 정확도 강조 라벨 (GOLD)
    ctx.font = '600 32px ' + F_BODY;
    ctx.fillStyle = GOLD;
    ctx.textAlign = 'center';
    ctx.fillText('예측 적중 · ' + data.acc + '% ACCURACY', heroCx, recY + 56);
    ctx.textAlign = 'left';

    // 구분선
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath(); ctx.moveTo(PAD, recY + 96); ctx.lineTo(W - PAD, recY + 96); ctx.stroke();

    // 8. 스탯 그리드 2×2
    var beltLabel = data.belt.name.toUpperCase() + ' BELT';
    var beltColor = (data.belt.name === 'White') ? '#c0c0c4' :
                    (data.belt.name === 'Black') ? WHITE : data.belt.color;
    var rankIsNone = (data.rank === '—');
    var cells = [
        { k: 'LEADERBOARD', v: rankIsNone ? '집계 전' : ('#' + data.rank), c: rankIsNone ? MUTED : RED },
        { k: 'BELT RANK',   v: beltLabel,                          c: beltColor },
        { k: 'TOTAL PICKS', v: String(data.total),                 c: WHITE  },
        { k: 'POINTS',      v: data.points.toLocaleString() + ' P', c: GOLD   }
    ];
    var colW  = (W - PAD * 2) / 2;
    var rowH  = 128;
    var grdY  = recY + 120;
    ctx.textBaseline = 'alphabetic';
    cells.forEach(function(cell, i) {
        var col = i % 2, row = Math.floor(i / 2);
        var x = PAD + col * colW, y = grdY + row * rowH;
        ctx.font = '400 18px ' + F_MONO; ctx.fillStyle = MUTED2; ctx.fillText(cell.k, x, y);
        ctx.font = '600 56px ' + F_BLK;  ctx.fillStyle = cell.c;  ctx.fillText(cell.v, x, y + 64);
    });

    // 9. 연승 뱃지
    var streakY = grdY + 2 * rowH + 18;
    if (data.streak && data.streak.count >= 2) {
        var isWin  = data.streak.type === 'WIN';
        var sIcon  = isWin ? '🔥' : '❄️';
        var sText  = data.streak.count + '연' + (isWin ? '승' : '패') + ' 스트릭';
        ctx.font = '600 26px ' + F_BODY;
        ctx.fillStyle = isWin ? RED : '#3b82f6';
        ctx.fillText(sIcon + ' ' + sText, PAD, streakY);
    }

    // 10. 하단 푸터 — 닉네임 + 선명한 CTA
    var fY = H - 70;

    ctx.font = '600 28px ' + F_BODY;
    ctx.fillStyle = WHITE; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText('@' + data.nick, PAD, fY);

    ctx.font = '700 30px ' + F_BODY;
    ctx.fillStyle = WHITE; ctx.textAlign = 'right';
    ctx.fillText('너도 픽 해보기 · pick-tagon.com', W - PAD, fY);
    ctx.textAlign = 'left';

    // 하단 빨간 강조선 (gradient, 카드 하단 경계)
    var barY = H - fr - 4;
    var barX = fr + r;
    var barW = (W - fr - r) - barX;
    var gBar = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    gBar.addColorStop(0,   'rgba(225,6,0,0)');
    gBar.addColorStop(0.5, 'rgba(225,6,0,0.9)');
    gBar.addColorStop(1,   'rgba(225,6,0,0)');
    ctx.fillStyle = gBar;
    ctx.fillRect(barX, barY, barW, 4);
}

function _beltGlow(beltName) {
    switch (beltName) {
        case 'Blue':   return 'rgba(59,130,246,0.20)';
        case 'Purple': return 'rgba(139,63,227,0.20)';
        case 'Brown':  return 'rgba(181,128,58,0.20)';
        case 'Black':  return 'rgba(225,6,0,0.20)';
        default:       return 'rgba(232,232,232,0.10)'; // White
    }
}

// ── 공유 실행 ───────────────────────────────────────────
async function sharePicktagonCard() {
    var btn = document.getElementById('profile-share-btn');
    if (btn) { btn.disabled = true; btn.textContent = '생성 중…'; }

    try {
        var data   = buildShareCardData();
        var canvas = document.createElement('canvas');

        // 폰트 로딩 완료 후 드로잉
        if (typeof document.fonts !== 'undefined' && document.fonts.ready) {
            try { await document.fonts.ready; } catch(e) {}
        }
        drawPicktagonShareCard(canvas, data);

        await new Promise(function(resolve, reject) {
            canvas.toBlob(async function(blob) {
                if (!blob) { reject(new Error('toBlob failed')); return; }

                var file = new File([blob], 'picktagon.png', { type: 'image/png' });
                var shareText = '@' + data.nick + ' · ' + data.success + '/' + data.total
                              + ' 예측 적중 · ' + data.acc + '% 정확도 · pick-tagon.com';

                // 모바일 네이티브 공유 (파일 포함)
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({ files: [file], text: shareText, title: 'PICK-TAGON' });
                        resolve(); return;
                    } catch(e) {
                        if (e.name === 'AbortError') { resolve(); return; }
                        console.warn('[ShareCard] native share:', e);
                    }
                }

                // Web Share API (텍스트+URL)
                if (navigator.share) {
                    try {
                        await navigator.share({ text: shareText, url: 'https://pick-tagon.com/', title: 'PICK-TAGON' });
                        resolve(); return;
                    } catch(e) {
                        if (e.name === 'AbortError') { resolve(); return; }
                        console.warn('[ShareCard] web share:', e);
                    }
                }

                // PC fallback: PNG 다운로드
                var a = document.createElement('a');
                a.href    = canvas.toDataURL('image/png');
                a.download = 'picktagon_' + data.nick.replace(/[^a-zA-Z0-9가-힣]/g, '_') + '.png';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                if (typeof showToast === 'function') {
                    showToast('📥 PNG 저장됨 — 카카오·인스타 등에 공유해보세요!');
                }
                resolve();
            }, 'image/png');
        });
    } catch(err) {
        console.warn('[ShareCard] error:', err);
        if (typeof showToast === 'function') showToast('⚠️ 공유 중 오류가 발생했습니다');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '📤 기록 공유'; }
    }
}
