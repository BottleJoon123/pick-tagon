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

function _scDivisionLabel(div) {
    var MAP = {
        'hw':'헤비웨이트', 'heavyweight':'헤비웨이트',
        'lhw':'라이트헤비웨이트', 'light heavyweight':'라이트헤비웨이트',
        'mw':'미들웨이트', 'middleweight':'미들웨이트',
        'ww':'웰터웨이트', 'welterweight':'웰터웨이트',
        'lw':'라이트웨이트', 'lightweight':'라이트웨이트',
        'fw':'페더웨이트', 'featherweight':'페더웨이트',
        'bw':'밴텀웨이트', 'bantamweight':'밴텀웨이트',
        'flw':'플라이웨이트', 'flyweight':'플라이웨이트',
        'w-sw':'여자 스트로웨이트', "women's strawweight":'여자 스트로웨이트',
        'w-flw':'여자 플라이웨이트', "women's flyweight":'여자 플라이웨이트',
        'w-bw':'여자 밴텀웨이트', "women's bantamweight":'여자 밴텀웨이트',
        'w-fw':'여자 페더웨이트', "women's featherweight":'여자 페더웨이트',
        'w-mw':'여자 미들웨이트', "women's middleweight":'여자 미들웨이트',
    };
    var key = (div || '').toLowerCase().trim();
    return MAP[key] || (div ? div.toUpperCase() : '');
}

// ── 카드 드로잉 ────────────────────────────────────────
function drawPicktagonShareCard(canvas, data) {
    var W = 1080, H = 1080;
    canvas.width  = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');

    var RED    = '#E11414';
    var GOLD   = '#E8B23A';
    var GREEN  = '#34c759';
    var WHITE  = '#f4f4f5';
    var MUTED  = '#9a9aa2';
    var MUTED2 = '#6a6a72';
    var F_BLK  = '"Oswald","Pretendard","Apple SD Gothic Neo",Arial,sans-serif';
    var F_BODY = '"Pretendard","Oswald","Apple SD Gothic Neo",Arial,sans-serif';
    var F_MONO = '"Space Mono","Courier New",monospace';
    var PAD    = 72;

    // Belt colors (card use: graphic + ring + accent)
    var beltName = data.belt ? data.belt.name : 'White';
    var BELT_COLORS = {
        'White':  { card:'#e4e4e7', glow:'rgba(228,228,231,0.35)', textColor:'#9a9aa2' },
        'Blue':   { card:'#3b82f6', glow:'rgba(59,130,246,0.50)',  textColor:'#3b82f6' },
        'Purple': { card:'#a855f7', glow:'rgba(168,85,247,0.50)',  textColor:'#a855f7' },
        'Brown':  { card:'#9a5b2d', glow:'rgba(154,91,45,0.50)',   textColor:'#c8862e' },
        'Black':  { card:'#3a3a3a', glow:'rgba(225,20,20,0.45)',   textColor:'#e4e4e7' }
    };
    var beltMeta   = BELT_COLORS[beltName] || BELT_COLORS['White'];
    var beltColor  = beltMeta.card;
    var beltGlow   = beltMeta.glow;
    var beltTextC  = beltMeta.textColor;

    /* ── ZONE 0: Background ── */
    ctx.fillStyle = '#080808';
    ctx.fillRect(0, 0, W, H);

    // Left-top: red radial glow
    var gRed = ctx.createRadialGradient(W * 0.18, H * 0.08, 0, W * 0.18, H * 0.08, W * 0.85);
    gRed.addColorStop(0,   'rgba(225,20,20,0.42)');
    gRed.addColorStop(0.55,'rgba(225,20,20,0)');
    ctx.fillStyle = gRed;
    ctx.fillRect(0, 0, W, H);

    // Right-bottom: belt color glow
    var gBelt = ctx.createRadialGradient(W * 0.88, H * 0.92, 0, W * 0.88, H * 0.92, W * 0.9);
    gBelt.addColorStop(0,   beltGlow);
    gBelt.addColorStop(0.55,'rgba(0,0,0,0)');
    ctx.fillStyle = gBelt;
    ctx.fillRect(0, 0, W, H);

    // Linear overlay
    var gLin = ctx.createLinearGradient(0, 0, W, H);
    gLin.addColorStop(0, 'rgba(13,10,12,0.85)');
    gLin.addColorStop(0.72, 'rgba(6,6,6,0.95)');
    gLin.addColorStop(1, 'rgba(6,6,6,1)');
    ctx.fillStyle = gLin;
    ctx.fillRect(0, 0, W, H);

    // Vignette
    var gVig = ctx.createRadialGradient(W/2, H*0.40, W*0.28, W/2, H*0.40, W*0.85);
    gVig.addColorStop(0, 'rgba(0,0,0,0)');
    gVig.addColorStop(1, 'rgba(0,0,0,0.50)');
    ctx.fillStyle = gVig;
    ctx.fillRect(0, 0, W, H);

    // Large octagon outline (translucent, inset)
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.055)';
    ctx.lineWidth = 1.5;
    _scOctagon(ctx, W/2, H*0.48, W*0.44, Math.PI/8);
    ctx.stroke();
    ctx.restore();

    // Rounded border frame
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1.5;
    var fr = 22, rc = 18;
    ctx.beginPath();
    ctx.moveTo(fr+rc, fr); ctx.lineTo(W-fr-rc, fr);
    ctx.arcTo(W-fr, fr, W-fr, fr+rc, rc);
    ctx.lineTo(W-fr, H-fr-rc);
    ctx.arcTo(W-fr, H-fr, W-fr-rc, H-fr, rc);
    ctx.lineTo(fr+rc, H-fr);
    ctx.arcTo(fr, H-fr, fr, H-fr-rc, rc);
    ctx.lineTo(fr, fr+rc);
    ctx.arcTo(fr, fr, fr+rc, fr, rc);
    ctx.closePath();
    ctx.stroke();

    /* ── ZONE 1: Header (y: 0–135) ── */
    var logoY  = 88;
    var logoR  = 20;
    var logoCx = PAD + logoR;

    // Octagon outline + checkmark logo
    ctx.save();
    ctx.strokeStyle = RED; ctx.lineWidth = 3;
    _scOctagon(ctx, logoCx, logoY, logoR, Math.PI/8);
    ctx.stroke();
    ctx.strokeStyle = WHITE; ctx.lineWidth = 2.5;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(logoCx - logoR*0.44, logoY + logoR*0.06);
    ctx.lineTo(logoCx - logoR*0.05, logoY + logoR*0.50);
    ctx.lineTo(logoCx + logoR*0.54, logoY - logoR*0.44);
    ctx.stroke();
    ctx.restore();

    ctx.font = '600 40px ' + F_BLK;
    ctx.fillStyle = WHITE;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText('PICK-TAGON', logoCx + logoR + 18, logoY);

    // SEASON 1 (right)
    ctx.font = '400 20px ' + F_MONO;
    ctx.fillStyle = MUTED2;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('SEASON 1', W - PAD, logoY);
    ctx.textAlign = 'left';

    // Header divider
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, 128); ctx.lineTo(W-PAD, 128); ctx.stroke();

    /* ── ZONE 2: Identity (y: 135–315) ── */
    // Belt graphic: horizontal bar with plate + stripes
    var beltBarY = 168, beltBarW = 220, beltBarH = 16;
    // Main bar
    ctx.fillStyle = beltColor;
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(PAD, beltBarY, beltBarW, beltBarH, 3);
    } else {
        ctx.rect(PAD, beltBarY, beltBarW, beltBarH);
    }
    ctx.fill();
    // Dark plate (right ~1/3)
    var plateX = PAD + beltBarW * 0.65, plateW = beltBarW * 0.26;
    var plateY = beltBarY - 4, plateH = beltBarH + 8;
    ctx.fillStyle = '#101010';
    ctx.fillRect(plateX, plateY, plateW, plateH);
    // White stripes on plate
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(plateX + 8, plateY, 4, plateH);
    ctx.fillRect(plateX + 18, plateY, 4, plateH);

    // Belt name
    ctx.font = '700 38px ' + F_BLK;
    ctx.fillStyle = beltTextC;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(beltName.toUpperCase() + ' BELT', PAD, 240);

    // Nickname (right side, large)
    var nick = data.nick || 'FIGHTER';
    var nickDisplay = '@' + nick.toUpperCase();
    var nickFontSize = 58;
    ctx.font = '700 ' + nickFontSize + 'px ' + F_BLK;
    // Auto-shrink if too wide
    var maxNickW = W/2 - PAD;
    while (ctx.measureText(nickDisplay).width > maxNickW && nickFontSize > 30) {
        nickFontSize -= 4;
        ctx.font = '700 ' + nickFontSize + 'px ' + F_BLK;
    }
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(nickDisplay, W - PAD, 210);

    // Sub handle text
    ctx.font = '400 19px ' + F_MONO;
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'right';
    ctx.fillText('UFC 예측 · 프로필', W - PAD, 246);
    ctx.textAlign = 'left';

    /* ── ZONE 3: Hero — Record + Ring (y: 315–565) ── */
    // Top divider
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, 315); ctx.lineTo(W-PAD, 315); ctx.stroke();

    // "시즌 예측 전적" label
    ctx.font = '400 22px ' + F_MONO;
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('시즌 예측 전적', PAD, 352);

    // Record: W – L  (success – fail)
    var wins  = data.success;
    var fails = Math.max((data.total || 0) - (data.success || 0), 0);
    var recFontSize = 148;
    // Available width for record (left ~55% of card, leaving room for ring)
    var recAreaW = W * 0.52 - PAD;
    var wStr = String(wins), dashStr = '–', lStr = String(fails);
    ctx.font = '700 ' + recFontSize + 'px ' + F_BLK;
    var wW = ctx.measureText(wStr).width;
    ctx.font = '700 ' + Math.round(recFontSize * 0.65) + 'px ' + F_BLK;
    var dashW = ctx.measureText(dashStr).width;
    ctx.font = '700 ' + recFontSize + 'px ' + F_BLK;
    var lW = ctx.measureText(lStr).width;
    var totalRecW = wW + 18 + dashW + 18 + lW;
    // Scale down if needed
    while (totalRecW > recAreaW && recFontSize > 60) {
        recFontSize -= 6;
        ctx.font = '700 ' + recFontSize + 'px ' + F_BLK;
        wW = ctx.measureText(wStr).width;
        ctx.font = '700 ' + Math.round(recFontSize * 0.65) + 'px ' + F_BLK;
        dashW = ctx.measureText(dashStr).width;
        ctx.font = '700 ' + recFontSize + 'px ' + F_BLK;
        lW = ctx.measureText(lStr).width;
        totalRecW = wW + 18 + dashW + 18 + lW;
    }
    var recY  = 496;
    var recX  = PAD;
    // Draw W (red)
    ctx.font = '700 ' + recFontSize + 'px ' + F_BLK;
    ctx.fillStyle = RED;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(wStr, recX, recY);
    // Draw dash (muted2, smaller)
    var dashSize = Math.round(recFontSize * 0.65);
    ctx.font = '700 ' + dashSize + 'px ' + F_BLK;
    ctx.fillStyle = MUTED2;
    ctx.fillText(dashStr, recX + wW + 14, recY - (recFontSize - dashSize) * 0.08);
    // Draw L (white)
    ctx.font = '700 ' + recFontSize + 'px ' + F_BLK;
    ctx.fillStyle = WHITE;
    ctx.fillText(lStr, recX + wW + 14 + dashW + 14, recY);

    // Tags: "N적중" (red bg) + "총 Npick" (gray bg)
    var tagY   = 536;
    var tagH   = 38;
    var tagR   = 19;
    var winTagText  = wins + '적중';
    var totTagText  = '총 ' + data.total + '픽';
    function drawTag(text, x, y, bgColor, textColor) {
        ctx.font = '700 20px ' + F_MONO;
        var tw = ctx.measureText(text).width + 28;
        ctx.fillStyle = bgColor;
        ctx.beginPath();
        if (ctx.roundRect) { ctx.roundRect(x, y, tw, tagH, tagR); }
        else { ctx.rect(x, y, tw, tagH); }
        ctx.fill();
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(text, x + 14, y + tagH/2);
        return tw + 10; // advance
    }
    var tx = PAD;
    tx += drawTag(winTagText, tx, tagY, 'rgba(225,20,20,0.18)', '#ff3b3b');
    drawTag(totTagText, tx, tagY, 'rgba(255,255,255,0.07)', MUTED);

    // Accuracy ring (right side)
    var ringCx = W - PAD - 120, ringCy = 445, ringR = 110, ringLW = 18;
    // Background track
    ctx.beginPath();
    ctx.arc(ringCx, ringCy, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = ringLW;
    ctx.stroke();
    // Progress arc
    var accPct = data.acc || 0;
    if (accPct > 0) {
        var startAngle = -Math.PI / 2;
        var endAngle   = startAngle + (accPct / 100) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(ringCx, ringCy, ringR, startAngle, endAngle);
        ctx.strokeStyle = beltColor;
        ctx.lineWidth = ringLW;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';
    }
    // Center text
    ctx.font = '700 58px ' + F_BLK;
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(accPct + '%', ringCx, ringCy + 18);
    ctx.font = '400 19px ' + F_MONO;
    ctx.fillStyle = MUTED;
    ctx.fillText('적중률', ringCx, ringCy + 50);

    // Bottom divider
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, 565); ctx.lineTo(W-PAD, 565); ctx.stroke();

    /* ── ZONE 4: Recent Form (y: 565–670) ── */
    // Read state.history
    var history = [];
    try { if (typeof state !== 'undefined') history = state.history || []; } catch(e) {}
    var recentFive = [];
    for (var hi = 0; hi < history.length && recentFive.length < 5; hi++) {
        if (history[hi].res === 'WIN' || history[hi].res === 'LOSE') {
            recentFive.push(history[hi].res);
        }
    }

    ctx.font = '400 20px ' + F_MONO;
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('최근 5픽', PAD, 614);

    var dotR = 26, dotGap = 14;
    var dotStartX = PAD + 120;
    var dotCy = 614;
    for (var di = 0; di < 5; di++) {
        var dcx = dotStartX + di * (dotR * 2 + dotGap);
        var res = recentFive[di];
        ctx.beginPath();
        ctx.arc(dcx + dotR, dotCy, dotR, 0, Math.PI * 2);
        if (res === 'WIN') {
            ctx.fillStyle = RED;
            ctx.fill();
            ctx.shadowColor = 'rgba(225,20,20,0.50)';
            ctx.shadowBlur = 12;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.font = '700 22px ' + F_BLK;
            ctx.fillStyle = WHITE;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('W', dcx + dotR, dotCy);
        } else if (res === 'LOSE') {
            ctx.strokeStyle = MUTED2;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.font = '700 22px ' + F_BLK;
            ctx.fillStyle = MUTED2;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('L', dcx + dotR, dotCy);
        } else {
            // placeholder
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
    ctx.textAlign = 'left';

    /* ── ZONE 5: Stats Chips (y: 670–850) ── */
    var chipY   = 690, chipH = 148, chipGap = 18;
    var chipW   = (W - PAD * 2 - chipGap * 2) / 3;
    var chips = [
        {
            label: '포인트',
            value: (data.points || 0).toLocaleString() + ' P',
            vColor: GOLD
        },
        {
            label: '랭킹',
            value: (data.rank === '—') ? '집계중' : ('#' + data.rank),
            vColor: (data.rank === '—') ? MUTED : WHITE,
            small: (data.rank === '—')
        },
        {
            label: '연승',
            value: (data.streak && data.streak.type === 'WIN' && data.streak.count >= 1)
                   ? (data.streak.count + '연승')
                   : '—',
            vColor: (data.streak && data.streak.type === 'WIN' && data.streak.count >= 1)
                    ? '#ff3b3b' : MUTED2
        }
    ];
    chips.forEach(function(chip, i) {
        var cx = PAD + i * (chipW + chipGap);
        // Chip background
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.strokeStyle = 'rgba(255,255,255,0.09)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) { ctx.roundRect(cx, chipY, chipW, chipH, 16); }
        else { ctx.rect(cx, chipY, chipW, chipH); }
        ctx.fill();
        ctx.stroke();
        // Label
        ctx.font = '400 19px ' + F_MONO;
        ctx.fillStyle = MUTED2;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(chip.label, cx + 22, chipY + 46);
        // Value
        var valFontSize = chip.small ? 38 : 58;
        ctx.font = '700 ' + valFontSize + 'px ' + F_BLK;
        ctx.fillStyle = chip.vColor;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(chip.value, cx + 22, chipY + 46 + valFontSize + 12);
    });

    /* ── ZONE 6: Footer (y: 850–1080) ── */
    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, 870); ctx.lineTo(W-PAD, 870); ctx.stroke();

    // CTA: "너 적중률은? · pick-tagon.com"
    ctx.font = '700 34px ' + F_BODY;
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('너 적중률은? · ', PAD, 944);
    var ctaPrefix = '너 적중률은? · ';
    ctx.font = '700 34px ' + F_BODY;
    var prefW = ctx.measureText(ctaPrefix).width;
    ctx.fillStyle = RED;
    ctx.fillText('pick-tagon.com', PAD + prefW, 944);

    // "무료" badge (right side)
    var badgeText = '무료';
    ctx.font = '700 20px ' + F_MONO;
    var badgeW = ctx.measureText(badgeText).width + 26;
    var badgeH = 38, badgeX = W - PAD - badgeW, badgeY = 917;
    ctx.fillStyle = 'rgba(52,199,89,0.16)';
    ctx.strokeStyle = 'rgba(52,199,89,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 19); }
    else { ctx.rect(badgeX, badgeY, badgeW, badgeH); }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = GREEN;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2);
    ctx.textAlign = 'left';

    // Bottom red accent line
    var alY  = H - fr - 4;
    var alX  = fr + rc;
    var alW  = (W - fr - rc) - alX;
    var gAL  = ctx.createLinearGradient(alX, 0, alX + alW, 0);
    gAL.addColorStop(0,   'rgba(225,20,20,0)');
    gAL.addColorStop(0.5, 'rgba(225,20,20,0.9)');
    gAL.addColorStop(1,   'rgba(225,20,20,0)');
    ctx.fillStyle = gAL;
    ctx.fillRect(alX, alY, alW, 4);
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
// ── 공유 모드 선택 피커 ──────────────────────────────────
var _scPickerEl = null;

function _scDismissPicker() {
    if (_scPickerEl) { _scPickerEl.remove(); _scPickerEl = null; }
}

function _scShowSharePicker(opts) {
    _scDismissPicker();

    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;';

    var sheet = document.createElement('div');
    sheet.style.cssText = 'width:100%;background:#111;border-radius:20px 20px 0 0;padding:12px 16px 40px;box-shadow:0 -4px 40px rgba(0,0,0,0.9);';

    var handle = document.createElement('div');
    handle.style.cssText = 'width:36px;height:4px;background:#2a2a2a;border-radius:2px;margin:0 auto 18px;';
    sheet.appendChild(handle);

    if (opts.title) {
        var lbl = document.createElement('p');
        lbl.style.cssText = 'color:#6a6a72;font-size:10px;font-weight:700;letter-spacing:0.12em;text-align:center;text-transform:uppercase;margin-bottom:12px;';
        lbl.textContent = opts.title;
        sheet.appendChild(lbl);
    }

    opts.actions.forEach(function(act) {
        var row = document.createElement('button');
        row.type = 'button';
        row.style.cssText = 'display:flex;align-items:center;gap:14px;width:100%;padding:15px 12px;background:transparent;border:none;border-radius:12px;cursor:pointer;margin-bottom:2px;';
        var iconEl = document.createElement('span');
        iconEl.style.cssText = 'font-size:20px;width:26px;text-align:center;flex-shrink:0;';
        iconEl.textContent = act.icon;
        var textEl = document.createElement('span');
        textEl.style.cssText = 'font-family:Pretendard,sans-serif;font-weight:500;font-size:15px;color:#f4f4f5;';
        textEl.textContent = act.label;
        row.appendChild(iconEl); row.appendChild(textEl);
        row.addEventListener('pointerenter', function() { row.style.background = 'rgba(255,255,255,0.07)'; });
        row.addEventListener('pointerleave', function() { row.style.background = ''; });
        row.addEventListener('click', function() { _scDismissPicker(); act.fn(); });
        sheet.appendChild(row);
    });

    var sep = document.createElement('div');
    sep.style.cssText = 'height:1px;background:rgba(255,255,255,0.07);margin:10px 0;';
    sheet.appendChild(sep);

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.style.cssText = 'width:100%;padding:14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;color:#6a6a72;font-size:14px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;cursor:pointer;';
    cancelBtn.textContent = '취소';
    cancelBtn.addEventListener('click', _scDismissPicker);
    sheet.appendChild(cancelBtn);

    ov.appendChild(sheet);
    ov.addEventListener('click', function(e) { if (e.target === ov) _scDismissPicker(); });
    document.body.appendChild(ov);
    _scPickerEl = ov;

    function _onEsc(e) {
        if (e.key === 'Escape') { _scDismissPicker(); document.removeEventListener('keydown', _onEsc); }
    }
    document.addEventListener('keydown', _onEsc);
}

// 링크 복사 (clipboard → prompt fallback)
async function _scCopyLink(url) {
    try {
        await navigator.clipboard.writeText(url);
        if (typeof showToast === 'function') showToast('링크를 복사했어요 📋');
    } catch(e) {
        try { window.prompt('링크를 복사하세요:', url); } catch(e2) {}
    }
}

// 링크 공유 (navigator.share → clipboard fallback)
async function _scShareLink(title, text, url) {
    if (navigator.share) {
        try { await navigator.share({ title: title, text: text, url: url }); return; }
        catch(e) { if (e.name === 'AbortError') return; }
    }
    _scCopyLink(url);
}

// ── 프로필 공유 피커 ─────────────────────────────────────
function sharePicktagonCard() {
    var data = buildShareCardData();
    var losses = (data.total || 0) - (data.success || 0);
    var shareText  = data.nick + '의 픽 전적 ' + (data.success || 0) + '승 ' + losses + '패 · '
                   + '적중률 ' + (data.acc || 0) + '% · 너 적중률은? pick-tagon.com';
    var shareUrl   = 'https://pick-tagon.com/#profile';
    var shareTitle = 'PICK-TAGON';

    _scShowSharePicker({
        title: '공유 방식 선택',
        actions: [
            { icon: '🖼', label: '이미지 카드 공유', fn: function() {
                _scShareProfileImage(data, shareText, shareTitle);
            }},
            { icon: '🔗', label: '링크로 공유', fn: function() {
                _scShareLink(shareTitle, shareText, shareUrl);
            }},
            { icon: '📋', label: '링크 복사', fn: function() {
                _scCopyLink(shareUrl);
            }}
        ]
    });
}

async function _scShareProfileImage(data, shareText, shareTitle) {
    var btn = document.getElementById('profile-share-btn');
    if (btn) { btn.disabled = true; btn.textContent = '생성 중…'; }
    try {
        var canvas = document.createElement('canvas');
        if (typeof document.fonts !== 'undefined' && document.fonts.ready) {
            try { await document.fonts.ready; } catch(e) {}
        }
        drawPicktagonShareCard(canvas, data);

        await new Promise(function(resolve, reject) {
            canvas.toBlob(async function(blob) {
                if (!blob) { reject(new Error('toBlob failed')); return; }
                var file = new File([blob], 'picktagon.png', { type: 'image/png' });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({ files: [file], title: shareTitle, text: shareText });
                        resolve(); return;
                    } catch(e) { if (e.name === 'AbortError') { resolve(); return; } }
                }
                // PC fallback
                var a = document.createElement('a');
                a.href    = canvas.toDataURL('image/png');
                a.download = 'picktagon_' + data.nick.replace(/[^a-zA-Z0-9가-힣]/g, '_') + '.png';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                if (typeof showToast === 'function') showToast('📥 PNG 저장됨 — 카카오·인스타 등에 공유해보세요!');
                resolve();
            }, 'image/png');
        });
    } catch(err) {
        console.warn('[ProfileCard] image share error:', err);
        if (typeof showToast === 'function') showToast('⚠️ 공유 중 오류가 발생했습니다');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '📤 기록 공유'; }
    }
}

/* ==============================
   MATCH SHARE CARD (Phase 2-A)
   매치업 픽 공유 카드 — canvas 기반, 외부 이미지 없음 (taint-free)
============================== */

// ── 데이터 수집 ────────────────────────────────────────
function buildMatchShareCardData(fightId) {
    // 1. fight 객체 가져오기
    var fight = null;
    try {
        if (typeof _fightCardCache !== 'undefined') fight = _fightCardCache[fightId];
        if (!fight && typeof getActiveFights === 'function') {
            fight = getActiveFights().find(function(f) { return f.id === fightId; });
        }
    } catch(e) {}
    if (!fight) { console.warn('[MatchCard] fight not found:', fightId); return null; }

    // 2. 유저 픽 상태
    var userPick = null;  // null | 'f1' | 'f2'
    try {
        var pending = (typeof state !== 'undefined') ? state.pendings[fightId] : null;
        if (pending) userPick = (pending.side === 'left') ? 'f1' : 'f2';
    } catch(e) {}

    // 3. 커뮤니티 픽 비율
    var pickCounts = null;
    try {
        if (typeof eventPickCounts !== 'undefined' && eventPickCounts[fightId]) {
            pickCounts = eventPickCounts[fightId]; // { c0, c1 }
        }
    } catch(e) {}

    // 4. 이벤트명
    var evName = '';
    try {
        evName = fight._eventTitle || (typeof eventInfo !== 'undefined' && eventInfo.name) || '';
    } catch(e) {}

    return {
        fightId:   fightId,
        f1:        fight.f1,
        f2:        fight.f2,
        division:  fight.division || fight.weight || '',
        rounds:    fight.rounds || 3,
        tag:       fight.tag || '',
        event:     evName,
        userPick:  userPick,    // 'f1' | 'f2' | null
        pickCounts: pickCounts  // { c0, c1 } | null
    };
}

// ── PICK-TAGON 로고 그리기 (재사용) ───────────────────────
function _scDrawLogo(ctx, logoCx, logoCy, logoR, F_BLK) {
    var RED   = '#E10600';
    var WHITE = '#f4f4f5';
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
}

// 선수명이 maxW를 넘으면 폰트 크기를 줄여 반환
function _scFitFont(ctx, text, weight, basePx, F, maxW, minPx) {
    var px = basePx;
    minPx = minPx || 28;
    while (px > minPx) {
        ctx.font = weight + ' ' + px + 'px ' + F;
        if (ctx.measureText(text).width <= maxW) break;
        px -= 2;
    }
    ctx.font = weight + ' ' + px + 'px ' + F;
    return px;
}

// 선수 이름 블록(first + last + record) — width fitting + gap 보장
// Returns: last name font size (used for VS badge Y)
function _scDrawMatchNameBlock(ctx, opts) {
    var firstName   = opts.firstName || '';
    var lastName    = opts.lastName  || '?';
    var record      = opts.record    || '';
    var side        = opts.side;
    var nameEdge    = opts.nameEdge;
    var maxW        = opts.maxW;
    var lastNameY   = opts.lastNameY;
    var shadowColor = opts.shadowColor;
    var recordColor = opts.recordColor;
    var WHITE       = opts.WHITE;
    var F_BLK       = opts.F_BLK;
    var F_MONO      = opts.F_MONO;
    var align       = (side === 'left') ? 'right' : 'left';

    // Auto-fit last name 96→36 (step 2 via _scFitFont)
    var lnSize = _scFitFont(ctx, lastName.toUpperCase(), '600', 96, F_BLK, maxW, 36);

    // Auto-fit first name 30→16, then truncate if still over
    var fnSize = 30;
    if (firstName) {
        fnSize = _scFitFont(ctx, firstName.toUpperCase(), '400', 30, F_BLK, maxW, 16);
        ctx.font = '400 ' + fnSize + 'px ' + F_BLK;
        if (ctx.measureText(firstName.toUpperCase()).width > maxW) {
            while (firstName.length > 1 && ctx.measureText((firstName.slice(0, -1) + '…').toUpperCase()).width > maxW)
                firstName = firstName.slice(0, -1);
            firstName = firstName + '…';
        }
    }

    // Gap guarantee: bottom-of-first-name (fnY + fnSize*0.25) is ≥12px above
    // top-of-last-name (lastNameY - lnSize*0.78)
    // => fnY = lastNameY - lnSize*0.78 - 12 - fnSize*0.25
    var fnY     = firstName ? (lastNameY - lnSize * 0.78 - 12 - fnSize * 0.25) : 0;
    var recordY = lastNameY + 38;

    ctx.textBaseline = 'alphabetic';

    if (firstName) {
        ctx.font = '400 ' + fnSize + 'px ' + F_BLK;
        ctx.fillStyle = 'rgba(244,244,245,0.65)';
        ctx.textAlign = align;
        ctx.fillText(firstName.toUpperCase(), nameEdge, fnY);
    }
    ctx.font = '600 ' + lnSize + 'px ' + F_BLK;
    ctx.fillStyle = WHITE;
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = 26;
    ctx.textAlign = align;
    ctx.fillText(lastName.toUpperCase(), nameEdge, lastNameY);
    ctx.shadowBlur = 0;
    if (record) {
        ctx.font = '400 19px ' + F_MONO;
        ctx.fillStyle = recordColor;
        ctx.textAlign = align;
        ctx.fillText(record, nameEdge, recordY);
    }

    return lnSize;
}

// ── 매치 카드 드로잉 ─────────────────────────────────────
function drawPicktagonMatchShareCard(canvas, data) {
    var W = 1080, H = 1080;
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    var RED    = '#E11414';
    var BLUE   = '#2f6df6';
    var WHITE  = '#f4f4f5';
    var MUTED  = '#9a9aa2';
    var MUTED2 = '#6a6a72';
    var F_BLK  = '"Oswald","Pretendard","Apple SD Gothic Neo",Arial,sans-serif';
    var F_BODY = '"Pretendard","Oswald","Apple SD Gothic Neo",Arial,sans-serif';
    var F_MONO = '"Space Mono","Courier New",monospace';
    var PAD    = 68;

    /* ── ZONE 0: Background ── */
    // Base dark
    ctx.fillStyle = '#070707';
    ctx.fillRect(0, 0, W, H);

    // Left red radial glow (원점을 카드 왼쪽 바깥)
    var gR = ctx.createRadialGradient(-W * 0.08, H * 0.40, 0, -W * 0.08, H * 0.40, W);
    gR.addColorStop(0,   'rgba(225,20,20,0.58)');
    gR.addColorStop(0.55,'rgba(225,20,20,0)');
    ctx.fillStyle = gR;
    ctx.fillRect(0, 0, W, H);

    // Right blue radial glow
    var gB = ctx.createRadialGradient(W * 1.08, H * 0.40, 0, W * 1.08, H * 0.40, W);
    gB.addColorStop(0,   'rgba(47,109,246,0.52)');
    gB.addColorStop(0.55,'rgba(47,109,246,0)');
    ctx.fillStyle = gB;
    ctx.fillRect(0, 0, W, H);

    // Diagonal linear clash overlay (118deg-ish)
    var gD = ctx.createLinearGradient(0, H, W, 0);
    gD.addColorStop(0,   'rgba(225,20,20,0.14)');
    gD.addColorStop(0.4, 'rgba(225,20,20,0)');
    gD.addColorStop(0.6, 'rgba(47,109,246,0)');
    gD.addColorStop(1,   'rgba(47,109,246,0.14)');
    ctx.fillStyle = gD;
    ctx.fillRect(0, 0, W, H);

    // Vignette
    var gV = ctx.createRadialGradient(W / 2, H * 0.42, W * 0.28, W / 2, H * 0.42, W * 0.82);
    gV.addColorStop(0, 'rgba(0,0,0,0)');
    gV.addColorStop(1, 'rgba(0,0,0,0.60)');
    ctx.fillStyle = gV;
    ctx.fillRect(0, 0, W, H);

    // Center diagonal seam
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(8 * Math.PI / 180);
    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -H * 0.72);
    ctx.lineTo(0,  H * 0.72);
    ctx.stroke();
    ctx.restore();

    // Large translucent octagon background deco
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.055)';
    ctx.lineWidth = 1.5;
    _scOctagon(ctx, W / 2, H * 0.43, W * 0.46, Math.PI / 8);
    ctx.stroke();
    ctx.restore();

    // Rounded border frame
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 2;
    var fr = 22, rc = 18;
    ctx.beginPath();
    ctx.moveTo(fr + rc, fr);
    ctx.lineTo(W - fr - rc, fr);
    ctx.arcTo(W - fr, fr, W - fr, fr + rc, rc);
    ctx.lineTo(W - fr, H - fr - rc);
    ctx.arcTo(W - fr, H - fr, W - fr - rc, H - fr, rc);
    ctx.lineTo(fr + rc, H - fr);
    ctx.arcTo(fr, H - fr, fr, H - fr - rc, rc);
    ctx.lineTo(fr, fr + rc);
    ctx.arcTo(fr, fr, fr + rc, fr, rc);
    ctx.closePath();
    ctx.stroke();

    /* ── ZONE 1: Header (y: 0–168) ── */
    var logoY = 88;

    // Logo: octagon outline
    ctx.save();
    ctx.strokeStyle = RED;
    ctx.lineWidth = 3;
    _scOctagon(ctx, PAD + 19, logoY, 19, Math.PI / 8);
    ctx.stroke();
    // Checkmark
    var lx = PAD + 19, ly = logoY, lr = 19;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lx - lr * 0.44, ly + lr * 0.06);
    ctx.lineTo(lx - lr * 0.05, ly + lr * 0.50);
    ctx.lineTo(lx + lr * 0.54, ly - lr * 0.44);
    ctx.stroke();
    ctx.restore();

    ctx.font = '600 40px ' + F_BLK;
    ctx.fillStyle = WHITE;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('PICK-TAGON', PAD + 48, logoY);

    // Event name (right)
    var evText = (data.event && data.event !== 'Pick-tagon' && data.event.length > 0)
        ? data.event
        : 'UFC & MMA PICK GAME';
    if (evText.length > 22) evText = evText.slice(0, 21) + '…';
    ctx.font = '400 20px ' + F_MONO;
    ctx.fillStyle = MUTED2;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(evText.toUpperCase(), W - PAD, logoY);
    ctx.textAlign = 'left';

    // Header divider
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, 132);
    ctx.lineTo(W - PAD, 132);
    ctx.stroke();

    // Weight class / rounds label
    var divLabel = _scDivisionLabel(data.division);
    var wLabel   = divLabel + (divLabel ? ' · ' : '') + (data.rounds || 3) + 'R';
    ctx.font = '400 24px ' + F_MONO;
    ctx.fillStyle = MUTED2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(wLabel.toUpperCase(), W / 2, 164);
    ctx.textAlign = 'left';

    /* ── ZONE 2: Fighter Names (y: 168–548) ── */
    // Names take up ~380px vertical space
    // Layout: first-name row ~y=285, last-name row ~y=410, record ~y=448
    // VS badge centered at (W/2, ~340)

    var f1Name   = (data.f1 && data.f1.name) ? data.f1.name : '?';
    var f2Name   = (data.f2 && data.f2.name) ? data.f2.name : '?';

    // Split into first+last parts
    var f1Parts  = f1Name.trim().split(/\s+/);
    var f2Parts  = f2Name.trim().split(/\s+/);
    var f1Last   = f1Parts[f1Parts.length - 1];
    var f1First  = f1Parts.slice(0, -1).join(' ');
    var f2Last   = f2Parts[f2Parts.length - 1];
    var f2First  = f2Parts.slice(0, -1).join(' ');

    // Available width per side (from edge to VS badge boundary)
    var vsBadgeR = 58;          // VS badge radius
    var vsX      = W / 2;       // VS badge center X
    var nameEdge = vsX - vsBadgeR - 16;   // right boundary for f1 (left side)
    var maxNameW = nameEdge - PAD;        // max width for last-name text

    var lastNameY = 420;

    var f1LnSize = _scDrawMatchNameBlock(ctx, {
        firstName:   f1First,
        lastName:    f1Last,
        record:      data.f1 && data.f1.record ? data.f1.record : '',
        side:        'left',
        nameEdge:    nameEdge,
        maxW:        maxNameW,
        lastNameY:   lastNameY,
        shadowColor: 'rgba(225,20,20,0.45)',
        recordColor: 'rgba(225,20,20,0.65)',
        WHITE: WHITE, F_BLK: F_BLK, F_MONO: F_MONO
    });

    var f2NameEdge = vsX + vsBadgeR + 16;
    var f2LnSize = _scDrawMatchNameBlock(ctx, {
        firstName:   f2First,
        lastName:    f2Last,
        record:      data.f2 && data.f2.record ? data.f2.record : '',
        side:        'right',
        nameEdge:    f2NameEdge,
        maxW:        maxNameW,
        lastNameY:   lastNameY,
        shadowColor: 'rgba(47,109,246,0.45)',
        recordColor: 'rgba(47,109,246,0.65)',
        WHITE: WHITE, F_BLK: F_BLK, F_MONO: F_MONO
    });

    // VS badge (centered at visual midpoint of last name glyphs)
    var vsY = lastNameY - Math.max(f1LnSize, f2LnSize) * 0.30;
    ctx.save();
    // background circle
    ctx.fillStyle = 'rgba(7,7,7,0.92)';
    ctx.beginPath();
    ctx.arc(vsX, vsY, vsBadgeR, 0, Math.PI * 2);
    ctx.fill();
    // glow ring
    ctx.shadowColor = 'rgba(225,20,20,0.55)';
    ctx.shadowBlur = 20;
    ctx.strokeStyle = RED;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(vsX, vsY, vsBadgeR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // VS text
    ctx.font = '700 38px ' + F_BLK;
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VS', vsX, vsY);
    ctx.restore();

    /* ── ZONE 3: Pick Bar (y: 548–680) ── */
    var barLabelY = 564;
    var barTop    = 584;
    var barH      = 70;
    var barW      = W - PAD * 2;

    // Label: "현재 팬 여론"
    ctx.font = '400 19px ' + F_MONO;
    ctx.fillStyle = MUTED2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('현재 팬 여론', PAD, barLabelY);
    // LIVE dot + text
    var dotX = PAD + ctx.measureText('현재 팬 여론  ').width;
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(dotX + 6, barLabelY - 6, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '400 16px ' + F_MONO;
    ctx.fillStyle = '#ff3b3b';
    ctx.textAlign = 'left';
    ctx.fillText('LIVE', dotX + 18, barLabelY);

    // Compute percentages
    var pct0 = 50, pct1 = 50;
    if (data.pickCounts) {
        var ptot = data.pickCounts.c0 + data.pickCounts.c1;
        if (ptot > 0) {
            pct0 = Math.round(data.pickCounts.c0 / ptot * 100);
            pct1 = 100 - pct0;
        }
    }

    var seg0W = Math.max(0, Math.min(barW, barW * pct0 / 100));
    var seg1W = barW - seg0W;

    // Red segment
    if (seg0W > 0) {
        var gBR = ctx.createLinearGradient(PAD, 0, PAD + seg0W, 0);
        gBR.addColorStop(0, '#b81010');
        gBR.addColorStop(1, '#e11414');
        ctx.fillStyle = gBR;
        ctx.beginPath();
        _scRoundRectLeft(ctx, PAD, barTop, seg0W, barH, 8);
        ctx.fill();
    }
    // Blue segment
    if (seg1W > 0) {
        var gBB = ctx.createLinearGradient(PAD + seg0W, 0, W - PAD, 0);
        gBB.addColorStop(0, '#2f6df6');
        gBB.addColorStop(1, '#1a44b8');
        ctx.fillStyle = gBB;
        ctx.beginPath();
        _scRoundRectRight(ctx, PAD + seg0W, barTop, seg1W, barH, 8);
        ctx.fill();
    }

    // Percentage labels on bar
    ctx.font = '700 28px ' + F_BLK;
    ctx.fillStyle = WHITE;
    ctx.textBaseline = 'middle';
    if (pct0 > 0) {
        ctx.textAlign = 'left';
        ctx.fillText(pct0 + '%', PAD + 14, barTop + barH / 2);
    }
    if (pct1 > 0) {
        ctx.textAlign = 'right';
        ctx.fillText(pct1 + '%', W - PAD - 14, barTop + barH / 2);
    }

    // Bar border
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(PAD, barTop, barW, barH, 8);
    } else {
        ctx.moveTo(PAD + 8, barTop);
        ctx.lineTo(W - PAD - 8, barTop);
        ctx.arcTo(W - PAD, barTop, W - PAD, barTop + 8, 8);
        ctx.lineTo(W - PAD, barTop + barH - 8);
        ctx.arcTo(W - PAD, barTop + barH, W - PAD - 8, barTop + barH, 8);
        ctx.lineTo(PAD + 8, barTop + barH);
        ctx.arcTo(PAD, barTop + barH, PAD, barTop + barH - 8, 8);
        ctx.lineTo(PAD, barTop + 8);
        ctx.arcTo(PAD, barTop, PAD + 8, barTop, 8);
        ctx.closePath();
    }
    ctx.stroke();

    /* ── ZONE 4: Hook Text (y: 680–900) ── */
    var hookY  = 790;
    var subY   = 848;

    var hookText, subText;
    if (data.userPick === 'f1') {
        hookText = f1Last + ', 간다.';
        subText  = '반박은 픽으로.';
    } else if (data.userPick === 'f2') {
        hookText = f2Last + ', 간다.';
        subText  = '반박은 픽으로.';
    } else {
        hookText = '이 경기, 누구 보세요?';
        subText  = '';
    }

    // Auto-shrink hook text if too wide
    var hookSize = 68;
    ctx.font = '700 ' + hookSize + 'px ' + F_BLK;
    while (ctx.measureText(hookText).width > W - PAD * 2 && hookSize > 40) {
        hookSize -= 4;
        ctx.font = '700 ' + hookSize + 'px ' + F_BLK;
    }
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(hookText, W / 2, hookY);

    if (subText) {
        ctx.font = '500 32px ' + F_BODY;
        ctx.fillStyle = MUTED;
        ctx.textAlign = 'center';
        ctx.fillText(subText, W / 2, subY);
    }

    /* ── ZONE 5: Footer (y: 900–1080) ── */
    // Red accent line
    var accentY = 928;
    var gLine   = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
    gLine.addColorStop(0,   'rgba(225,20,20,0)');
    gLine.addColorStop(0.25, RED);
    gLine.addColorStop(0.75, RED);
    gLine.addColorStop(1,   'rgba(225,20,20,0)');
    ctx.fillStyle = gLine;
    ctx.fillRect(PAD, accentY, W - PAD * 2, 3);

    // CTA text
    var ctaY    = 988;
    var ctaText = data.userPick
        ? 'UFC 픽으로 붙는 곳 · pick-tagon.com'
        : 'pick-tagon.com에서 픽하기';
    ctx.font = '600 32px ' + F_BODY;
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(ctaText, W / 2, ctaY);
    ctx.textAlign = 'left';
}

// 좌측만 둥근 사각형 (픽 비율 바)
function _scRoundRectLeft(ctx, x, y, w, h, rad) {
    if (w <= 0) return;
    rad = Math.min(rad, w);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.arcTo(x, y + h, x, y + h - rad, rad);
    ctx.lineTo(x, y + rad);
    ctx.arcTo(x, y, x + rad, y, rad);
    ctx.closePath();
    ctx.fill();
}
// 우측만 둥근 사각형
function _scRoundRectRight(ctx, x, y, w, h, rad) {
    if (w <= 0) return;
    rad = Math.min(rad, w);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w - rad, y);
    ctx.arcTo(x + w, y, x + w, y + rad, rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
}

// ── 매치 카드 공유 피커 ──────────────────────────────────
function sharePicktagonMatchCard(fightId) {
    var data = buildMatchShareCardData(fightId);
    if (!data) {
        if (typeof showToast === 'function') showToast('⚠️ 경기 정보를 찾을 수 없습니다');
        return;
    }
    var pickedName = data.userPick === 'f1' ? data.f1.name
                   : data.userPick === 'f2' ? data.f2.name : null;
    var shareText  = pickedName
        ? '나는 ' + pickedName + ' 픽! 너는? · UFC 픽은 PICK-TAGON'
        : data.f1.name + ' vs ' + data.f2.name + ', 너는 누구 보세요? · UFC 픽은 PICK-TAGON';
    var shareUrl   = 'https://pick-tagon.com/?fight=' + encodeURIComponent(fightId);
    var shareTitle = 'PICK-TAGON';

    _scShowSharePicker({
        title: '공유 방식 선택',
        actions: [
            { icon: '🖼', label: '이미지 카드 공유', fn: function() {
                _scShareMatchImage(data, shareText, shareTitle);
            }},
            { icon: '🔗', label: '링크로 공유', fn: function() {
                _scShareLink(shareTitle, shareText, shareUrl);
            }},
            { icon: '📋', label: '링크 복사', fn: function() {
                _scCopyLink(shareUrl);
            }}
        ]
    });
}

async function _scShareMatchImage(data, shareText, shareTitle) {
    var canvas = document.createElement('canvas');
    if (typeof document.fonts !== 'undefined' && document.fonts.ready) {
        try { await document.fonts.ready; } catch(e) {}
    }
    drawPicktagonMatchShareCard(canvas, data);

    return new Promise(function(resolve, reject) {
        canvas.toBlob(async function(blob) {
            if (!blob) { reject(new Error('toBlob failed')); return; }
            var file = new File([blob], 'picktagon_match.png', { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({ files: [file], title: shareTitle, text: shareText });
                    resolve(); return;
                } catch(e) { if (e.name === 'AbortError') { resolve(); return; } }
            }
            // PC fallback
            var a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = 'picktagon_' + (data.f1.name + '_vs_' + data.f2.name).replace(/[^a-zA-Z0-9가-힣]/g, '_') + '.png';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            if (typeof showToast === 'function') showToast('📥 매치 카드 저장됨!');
            resolve();
        }, 'image/png');
    }).catch(function(err) {
        console.warn('[MatchCard] image share error:', err);
        if (typeof showToast === 'function') showToast('⚠️ 공유 중 오류가 발생했습니다');
    });
}
