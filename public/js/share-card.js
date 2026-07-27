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

    var pts = 0, tot = 0;
    try {
        if (typeof state !== 'undefined') {
            pts = state.points || 0;
            tot = state.total  || 0;   // 전체 참여 픽 수(표시용) — accuracy/전적 분모로는 쓰지 않음
        }
    } catch(e) { console.warn('[ShareCard] state read failed:', e); }

    // canonical(win/(win+lose)): pending/cancelled를 패배로 세지 않음, 정산 0건 → acc null
    var _v = (typeof currentUserAccuracyView === 'function')
        ? currentUserAccuracyView()
        : { win: 0, lose: 0, settled: 0, acc: null };
    var acc = _v.acc; // null 가능(정산 0건)

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
        total:   tot,         // 전체 참여 픽 수
        win:     _v.win,
        lose:    _v.lose,
        settled: _v.settled,  // 정산 픽 수 = win+lose
        success: _v.win,      // 하위호환(=win)
        acc:     acc,         // canonical, null = 정산 0건
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
        'catchweight':'캐치웨이트',
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
    var wins  = data.win != null ? data.win : (data.success || 0);
    var fails = data.lose != null ? data.lose : 0;  // 정산 패배만 — pending/cancelled 제외
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
    var totTagText  = '정산 ' + (data.settled != null ? data.settled : (wins + fails)) + '픽';
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
    // Progress arc — 정산 0건이면 acc=null → 호 없이 '—' 표시
    var accNull = (data.acc === null || data.acc === undefined);
    var accPct = accNull ? 0 : data.acc;
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
    ctx.fillText(accNull ? '—' : accPct + '%', ringCx, ringCy + 18);
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
// ── 공유 모드 선택 피커 (정적 #share-picker-modal 구동) ──────
// 접근성: role=dialog/aria-modal/aria-labelledby는 index.html 정적 마크업에 선언.
// 열림 시 첫 액션 focus + Tab 순환 + Escape(최상위 모달일 때만) + body lock 저장/복원.
// [id$="-modal"] 노드라 Back/popstate·history 연동은 _initModalHistory가 자동 처리하고,
// MODAL_CLOSE_FN('share-picker-modal'→closeSharePicker)이 리스너·focus까지 정리한다.
var _scPickerKeyHandler   = null;   // 열림/닫힘 짝으로 add/remove — 재오픈 누적 0
var _scPickerTrigger      = null;   // 피커를 연 트리거 — 닫을 때 focus 복귀
var _scPickerPrevOverflow = null;   // 열기 전 body.overflow — 원래 잠금 상태 그대로 복원

function _scPickerTrapTab(e, panel) {
    var f = Array.prototype.filter.call(
        panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
        function(el) { return !el.disabled && el.offsetParent !== null; });
    if (!f.length) { e.preventDefault(); return; }
    var first = f[0], last = f[f.length - 1];
    var inside = panel.contains(document.activeElement);
    if (e.shiftKey) {
        if (!inside || document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
        if (!inside || document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
}

function closeSharePicker() {
    // 멱등 정리: 모달이 이미(외부 경로로) hidden이어도 stale 리스너/lock/트리거를 항상 정리.
    var modal = document.getElementById('share-picker-modal');
    var wasOpen = !!(modal && !modal.classList.contains('hidden'));
    if (modal) modal.classList.add('hidden');
    if (typeof _scPrepGen === 'number') _scPrepGen++;   // 진행 중 사전 준비 무효화(늦은 결과 폐기)
    if (_scPickerKeyHandler) {
        document.removeEventListener('keydown', _scPickerKeyHandler, true);
        _scPickerKeyHandler = null;
    }
    if (_scPickerPrevOverflow !== null) {
        document.body.style.overflow = _scPickerPrevOverflow;   // 열기 전 상태 그대로(중첩 모달 보존)
        _scPickerPrevOverflow = null;
    }
    var trig = _scPickerTrigger;
    _scPickerTrigger = null;
    if (wasOpen && trig && document.contains(trig)) { try { trig.focus(); } catch (e) {} }
}
// 레거시 호출명 유지
function _scDismissPicker() { closeSharePicker(); }

function _scShowSharePicker(opts) {
    var modal = document.getElementById('share-picker-modal');
    var box   = document.getElementById('share-picker-actions');
    if (!modal || !box) { console.warn('[SharePicker] static modal missing'); return; }
    closeSharePicker();   // 재오픈 시 리스너/트리거/lock 상태 초기화

    var titleEl = document.getElementById('share-picker-title');
    if (titleEl) titleEl.textContent = (opts && opts.title) || '공유 방식 선택';

    box.innerHTML = '';
    ((opts && opts.actions) || []).forEach(function(act) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'share-picker-act';
        var iconEl = document.createElement('span');
        iconEl.className = 'share-picker-act-icon';
        iconEl.setAttribute('aria-hidden', 'true');
        iconEl.textContent = act.icon || '';
        var textEl = document.createElement('span');
        textEl.className = 'share-picker-act-label';
        textEl.textContent = act.label || '';
        row.appendChild(iconEl); row.appendChild(textEl);
        if (act.type === 'image') {
            // 이미지 액션: 사전 준비(_scStartPrep)와 짝 — 준비 중 disabled, click은
            // 피커를 직접 닫지 않고 실행부(_scExecuteImageAction)가 상태별 처리(재시도/공유/저장).
            row.dataset.scImg = '1';
            row.disabled = true;
            row.addEventListener('click', function() { _scExecuteImageAction(); });
        } else {
            row.addEventListener('click', function() { closeSharePicker(); act.fn(); });
        }
        box.appendChild(row);
    });

    _scPickerTrigger = (document.activeElement && document.activeElement !== document.body)
        ? document.activeElement : null;
    _scPickerPrevOverflow = document.body.style.overflow;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // 첫 '활성' 액션에 focus(이미지 액션이 준비 중 disabled면 다음 액션) — disabled는 trap에서도 제외됨
    var firstAct = box.querySelector('button:not(:disabled)') || box.querySelector('button');
    if (firstAct && !firstAct.disabled) { try { firstAct.focus(); } catch (e) {} }

    _scPickerKeyHandler = function(e) {
        if (e.key !== 'Escape' && e.key !== 'Tab') return;
        // 스택 최상위일 때만 반응 — 위에 auth 등 z-index 더 높은 모달이 있으면 그쪽 우선
        if (typeof _topModalEl === 'function') {
            var top = _topModalEl();
            if (top && top.id !== 'share-picker-modal') return;
        }
        if (e.key === 'Tab') {
            _scPickerTrapTab(e, modal.querySelector('.share-picker-panel') || modal);
            return;
        }
        // capture에서 닫은 뒤 같은 keydown이 아래 모달(fighter-profile 등)의 bubble
        // Escape 핸들러에 도달해 이중 닫힘되는 것을 차단
        e.stopPropagation();
        closeSharePicker();
    };
    document.addEventListener('keydown', _scPickerKeyHandler, true);
}

// ── 공유 이미지 생성 공통부 (pre-prepare 아키텍처) ───────────────
// Web Share의 transient user activation을 보존하기 위해, 피커가 열려 있는 동안
// 카드 Blob/File을 '미리' 생성한다(이미지 액션은 준비 중 disabled). 사용자의 명시적
// click 시점에는 어떤 비동기 대기도 없이 navigator.share를 즉시 호출한다.
// 파일 공유 불가 환경(데스크톱 등)은 액션명을 'PNG 저장'으로 정직하게 표기한다.
var _scShareBusy = false;   // click-execute(공유/저장) 연타 가드
var _scPrepGen   = 0;       // 준비 세대 — 피커 닫힘/재오픈 시 증가해 늦은 준비 결과를 폐기
var _scPrep      = null;    // { gen, kind, status:'pending'|'ready'|'failed', canvas, blob, file, canFile, authKey, meta }

// 어떤 선행 Promise(fonts/rank/manifest/image)도 영구 pending으로 준비를 고착시키지
// 못하게 하는 타임아웃 래퍼. reject도 fallback으로 흡수(절대 throw하지 않음).
function _scAwait(p, ms, fallback) {
    return new Promise(function(resolve) {
        var t = setTimeout(function() { resolve(fallback); }, ms);
        Promise.resolve(p).then(
            function(v) { clearTimeout(t); resolve(v); },
            function()  { clearTimeout(t); resolve(fallback); });
    });
}

// 카드가 쓰는 폰트 face 명시 로드 — canvas fillText는 CSS lazy 폰트 로드를 트리거하지
// 않을 수 있어 document.fonts.load로 보장. 실패해도 fallback 폰트로 조용히 진행.
function _scEnsureFonts() {
    try {
        if (!document.fonts || !document.fonts.load) return Promise.resolve();
        var faces = [
            'italic 700 40px "Barlow Condensed"',
            'italic 900 40px "Barlow Condensed"',
            '700 40px "Barlow Condensed"',
            '400 20px "Bebas Neue"',
            '400 20px "JetBrains Mono"',
            '700 20px "JetBrains Mono"',
            '600 20px "Barlow"',
            '700 40px "Oswald"'
        ];
        return Promise.all(faces.map(function(f) {
            return document.fonts.load(f).catch(function() {});
        })).then(function() {
            return (document.fonts.ready && typeof document.fonts.ready.catch === 'function')
                ? document.fonts.ready.catch(function() {}) : null;
        }).catch(function() {});
    } catch (e) { return Promise.resolve(); }
}

// toBlob 안전 래퍼 — 늦은/중복/미호출 콜백과 동기 throw 전부 방어. 항상 resolve.
// settled 이후 도착한 콜백은 어떤 부작용도 일으키지 않는다(다운로드/공유/토스트 0).
function _scToBlob(canvas, ms) {
    return new Promise(function(resolve) {
        var settled = false;
        function fin(b) { if (!settled) { settled = true; clearTimeout(t); resolve(b || null); } }
        var t = setTimeout(function() { fin(null); }, ms || 10000);
        try {
            canvas.toBlob(function(blob) {
                if (settled) return;   // guard 이후 늦게 도착 / 2회 호출 — 무시(부작용 0)
                fin(blob);
            }, 'image/png');
        } catch (e) { fin(null); }
    });
}

// PNG 다운로드 — blob URL 사용 후 반드시 revoke. DOM 조작 throw까지 내부 흡수(절대 throw 없음).
function _scDownloadCanvasPng(canvas, blob, baseName) {
    var safe = String(baseName || 'picktagon').replace(/[^a-zA-Z0-9가-힣_-]/g, '_').slice(0, 60) || 'picktagon';
    var url = null, ok = false;
    try {
        var a = document.createElement('a');
        try { url = URL.createObjectURL(blob); a.href = url; }
        catch (e) { a.href = canvas.toDataURL('image/png'); }   // blob URL 불가 → dataURL fallback
        a.download = safe + '.png';
        document.body.appendChild(a);
        try { a.click(); ok = true; } finally { try { document.body.removeChild(a); } catch (e2) {} }
    } catch (e) {
        try { if (typeof showToast === 'function') showToast('⚠️ 이미지 저장에 실패했어요 — 다시 시도해주세요'); } catch (e3) {}
        ok = false;
    } finally {
        if (url) setTimeout(function() { try { URL.revokeObjectURL(url); } catch (e4) {} }, 1500);
    }
    return ok;
}

// 이미지 액션 버튼(data-sc-img) 상태 갱신 — 피커가 열려 있을 때만 존재.
function _scSetImgAction(state) {
    var btn = document.querySelector('#share-picker-actions [data-sc-img]');
    if (!btn) return;
    var lbl = btn.querySelector('.share-picker-act-label');
    if (state === 'pending')         { btn.disabled = true;  if (lbl) lbl.textContent = '이미지 준비 중…'; }
    else if (state === 'ready-share'){ btn.disabled = false; if (lbl) lbl.textContent = '이미지 카드 공유'; }
    else if (state === 'ready-save') { btn.disabled = false; if (lbl) lbl.textContent = 'PNG 저장'; }
    else if (state === 'failed')     { btn.disabled = false; if (lbl) lbl.textContent = '이미지 생성 재시도'; }
}

// 카드 이미지 사전 준비 — 피커가 열린 동안 실행. 모든 선행 단계는 _scAwait로 유계(有界):
// fonts 3s · prepare(rank/manifest/portrait) 5s · toBlob 10s → busy/준비 고착 불가.
// 세대(gen) 불일치(닫힘/재오픈/새 준비)면 결과를 조용히 폐기한다.
function _scStartPrep(kind, meta) {
    var gen = ++_scPrepGen;
    _scPrep = {
        gen: gen, kind: kind, status: 'pending', meta: meta,
        authKey: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null,
        canvas: null, blob: null, file: null, canFile: false
    };
    _scSetImgAction('pending');
    (function() {
        var p = (async function() {
            await _scAwait(_scEnsureFonts(), 3000, null);
            if (gen !== _scPrepGen) return;
            if (meta.prepare) await _scAwait(meta.prepare(meta.data), 8000, null);
            if (gen !== _scPrepGen) return;
            var canvas = document.createElement('canvas');
            meta.draw(canvas, meta.data);
            var blob = await _scAwait(_scToBlob(canvas, 10000), 11000, null);
            if (gen !== _scPrepGen) return;
            if (!blob) {
                _scPrep.status = 'failed';
                _scSetImgAction('failed');
                return;
            }
            var file = null;
            try { file = new File([blob], meta.fileName, { type: 'image/png' }); } catch (e) {}
            var canFile = false;
            try { canFile = !!(file && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { canFile = false; }
            _scPrep.canvas = canvas; _scPrep.blob = blob; _scPrep.file = file; _scPrep.canFile = canFile;
            _scPrep.status = 'ready';
            _scSetImgAction(canFile ? 'ready-share' : 'ready-save');
        })();
        p.catch(function(e) {   // draw 등 동기 예외 — 실패 상태로 회복(리스너/busy 고착 0)
            console.warn('[ShareCard] prepare failed:', e);
            if (gen === _scPrepGen && _scPrep) { _scPrep.status = 'failed'; _scSetImgAction('failed'); }
        });
    })();
}

// 이미지 액션 click 실행부 — 준비 완료 상태에서만 도달(그 외 disabled/재시도).
// user activation 보존: click task 안에서 비동기 대기 없이 navigator.share를 즉시 호출.
function _scExecuteImageAction() {
    var prep = _scPrep;
    if (!prep || prep.gen !== _scPrepGen) return;
    if (prep.status === 'pending') return;                       // disabled — 방어적 no-op
    if (prep.status === 'failed') { _scStartPrep(prep.kind, prep.meta); return; }   // 재시도(피커 유지)
    if (_scShareBusy) return;                                    // 연타 중복 방지

    // 프로필 카드: 준비 시점 계정과 현재 계정이 다르면 stale 사용자 데이터 공유 차단.
    // (match/fighter 공개 카드는 auth 결합 없음)
    if (prep.kind === 'profile') {
        var nowKey = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;
        if (nowKey !== prep.authKey) {
            closeSharePicker();
            if (typeof showToast === 'function') showToast('계정이 변경되어 카드를 다시 열어주세요');
            return;
        }
    }

    _scShareBusy = true;
    closeSharePicker();
    if (prep.canFile) {
        var sp;
        try { sp = navigator.share({ files: [prep.file], title: prep.meta.shareTitle, text: prep.meta.shareText }); }
        catch (e) { sp = Promise.reject(e); }                    // 동기 throw → 아래 다운로드 회복
        Promise.resolve(sp).then(function() {
            _scShareBusy = false;
        }, function(err) {
            try {
                if (!err || err.name !== 'AbortError') {         // 사용자 취소는 무음
                    if (_scDownloadCanvasPng(prep.canvas, prep.blob, prep.meta.downloadBase)
                        && typeof showToast === 'function') showToast(prep.meta.savedToast);
                }
            } catch (e2) {}
            _scShareBusy = false;
        });
    } else {
        try {
            if (_scDownloadCanvasPng(prep.canvas, prep.blob, prep.meta.downloadBase)
                && typeof showToast === 'function') showToast(prep.meta.savedToast);
        } catch (e) {}
        _scShareBusy = false;
    }
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
async function sharePicktagonCard() {
    // 공유 직전 canonical current-user stats 확보 — 응답 hang이 피커를 막지 않게 4s 유계
    if (typeof ensureCurrentUserStats === 'function') {
        try { await _scAwait(ensureCurrentUserStats(), 4000, null); } catch(e) {}
    }
    var data = buildShareCardData();
    // 전적 = canonical W-L(정산 픽), 적중률 = canonical(정산 0건 → '—')
    var accTxt = (data.acc === null || data.acc === undefined) ? '—' : data.acc + '%';
    var shareText  = data.nick + '의 픽 전적 ' + (data.win || 0) + '승 ' + (data.lose || 0) + '패'
                   + '(정산 ' + (data.settled || 0) + '픽) · 적중률 ' + accTxt + ' · 너 적중률은? pick-tagon.com';
    var shareUrl   = 'https://pick-tagon.com/?og=v2#profile';
    var shareTitle = 'PICK-TAGON';

    _scShowSharePicker({
        title: '공유 방식 선택',
        actions: [
            { icon: '🖼', label: '이미지 준비 중…', type: 'image' },
            { icon: '🔗', label: '링크로 공유', fn: function() {
                _scShareLink(shareTitle, shareText, shareUrl);
            }},
            { icon: '📋', label: '링크 복사', fn: function() {
                _scCopyLink(shareUrl);
            }}
        ]
    });
    // 피커가 열려 있는 동안 카드 Blob 사전 준비 → click 시 navigator.share 즉시 호출(activation 보존)
    _scStartPrep('profile', {
        data: data,
        prepare: null,                              // 프로필 카드는 추가 리소스 없음
        draw: drawPicktagonShareCard,               // 드로잉은 기존 그대로(회귀 보호)
        fileName: 'picktagon.png',
        downloadBase: 'picktagon_' + (data.nick || ''),
        savedToast: '📥 PNG 저장됨 — 카카오·인스타 등에 공유해보세요!',
        shareTitle: shareTitle,
        shareText: shareText
    });
}

/* ==============================
   MATCH SHARE CARD (Phase 2-A)
   매치업 픽 공유 카드 — canvas 기반, 외부 이미지 없음 (taint-free)
============================== */

// ── 데이터 수집 ────────────────────────────────────────
// 실집계 count 유효성 — number 타입의 0 이상 유한 정수만("3"/true/1.5/-1/NaN/Infinity 전부 invalid).
function _scValidCount(v) {
    return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= 0;
}

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

    // 2. 유저 픽 상태 — side는 'left'/'right'만 신뢰. 그 외(garbage/undefined)는 null
    //    ('left 아니면 전부 f2' 오판정 금지).
    var userPick = null;  // null | 'f1' | 'f2'
    try {
        var pending = (typeof state !== 'undefined') ? state.pendings[fightId] : null;
        if (pending) {
            userPick = (pending.side === 'left')  ? 'f1'
                     : (pending.side === 'right') ? 'f2' : null;
        }
    } catch(e) {}

    // 3. 커뮤니티 픽 집계 — get_event_pick_ratios 실집계만.
    //    count 유효성 = number 타입 + 정수 + 유한 + 0 이상(_scValidCount).
    //    문자열/boolean/소수/음수/NaN은 invalid → null 강등('픽 집계 준비 중' 중립 표기).
    var pickCounts = null;
    try {
        if (typeof eventPickCounts !== 'undefined' && eventPickCounts[fightId]) {
            var _pcRaw = eventPickCounts[fightId];
            if (_pcRaw && _scValidCount(_pcRaw.c0) && _scValidCount(_pcRaw.c1)) {
                pickCounts = { c0: _pcRaw.c0, c1: _pcRaw.c1 };
            }
        }
    } catch(e) {}

    // 4. 이벤트명 — 해당 fight의 _eventTitle만(identity 보장). 전역 eventInfo.name은
    //    다른 이벤트일 수 있어 fallback으로 쓰지 않는다(없으면 중립 브랜드 라벨로 렌더).
    var evName = '';
    try { evName = fight._eventTitle || ''; } catch(e) {}

    // 5. 라운드 — 유효한 양의 정수만. 없으면 null(카드에서 R 메타 생략 — 기본 3R 합성 금지).
    var rounds = null;
    try {
        var _r = fight.rounds;
        if (typeof _r === 'number' && Number.isInteger(_r) && _r > 0) rounds = _r;
    } catch(e) {}

    return {
        fightId:   fightId,
        f1:        fight.f1,
        f2:        fight.f2,
        division:  fight.division || fight.weight || '',
        rounds:    rounds,      // number | null
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

// 현재 ctx.font 기준 결정적 말줄임 — min 폰트에서도 maxW를 넘는 초장문(한글 등)이
// 컬럼/캔버스를 벗어나지 않게 한다. maxW 이하면 원문 그대로.
function _scEllipsize(ctx, text, maxW) {
    var t = String(text == null ? '' : text);
    if (ctx.measureText(t).width <= maxW) return t;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
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
// handoff(01-share-cards/matchup) 언어 채택: red/blue 코너 대비 + pixel portrait +
// 중앙 VS + 코너별 이름/메타 + 실집계 픽 현황 + 태그라인 + 브랜드 footer.
// 데이터 진실성: 실집계(c0+c1>0)만 비율 표시, 0표는 '아직 픽 없음', 집계 미로드는
// '픽 집계 준비 중'. 실시간 구독이 없으므로 LIVE 표기는 어떤 상태에서도 그리지 않는다.
function drawPicktagonMatchShareCard(canvas, data) {
    var W = 1080, H = 1080;
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    var RED    = '#E10600';
    var BLUE   = '#1F6FEB';
    var WHITE  = '#FFFFFF';
    var INK1   = '#ECECEE';
    var MUTED  = '#B3B5BC';
    var MUTED2 = '#71757F';
    var F_DISP = '"Barlow Condensed","Oswald","Pretendard","Apple SD Gothic Neo",Arial,sans-serif';
    var F_EYE  = '"Bebas Neue","Oswald",Arial,sans-serif';
    var F_BODY = '"Barlow","Pretendard","Apple SD Gothic Neo",Arial,sans-serif';
    var F_MONO = '"JetBrains Mono","Space Mono","Courier New",monospace';
    var PAD    = 64;

    /* ── ZONE 0: Background (red↔blue clash) ── */
    ctx.fillStyle = '#08090C';
    ctx.fillRect(0, 0, W, H);

    var gR = ctx.createRadialGradient(W * 0.10, H * 0.40, 0, W * 0.10, H * 0.40, W * 0.85);
    gR.addColorStop(0,    'rgba(225,6,0,0.50)');
    gR.addColorStop(0.55, 'rgba(225,6,0,0)');
    ctx.fillStyle = gR;
    ctx.fillRect(0, 0, W, H);

    var gB = ctx.createRadialGradient(W * 0.90, H * 0.40, 0, W * 0.90, H * 0.40, W * 0.85);
    gB.addColorStop(0,    'rgba(31,111,235,0.45)');
    gB.addColorStop(0.55, 'rgba(31,111,235,0)');
    ctx.fillStyle = gB;
    ctx.fillRect(0, 0, W, H);

    var gD = ctx.createLinearGradient(0, H, W, 0);
    gD.addColorStop(0,   'rgba(225,6,0,0.12)');
    gD.addColorStop(0.4, 'rgba(225,6,0,0)');
    gD.addColorStop(0.6, 'rgba(31,111,235,0)');
    gD.addColorStop(1,   'rgba(31,111,235,0.12)');
    ctx.fillStyle = gD;
    ctx.fillRect(0, 0, W, H);

    // Vignette
    var gV = ctx.createRadialGradient(W / 2, H * 0.42, W * 0.28, W / 2, H * 0.42, W * 0.82);
    gV.addColorStop(0, 'rgba(0,0,0,0)');
    gV.addColorStop(1, 'rgba(0,0,0,0.60)');
    ctx.fillStyle = gV;
    ctx.fillRect(0, 0, W, H);

    // Center diagonal seam (6°)
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(6 * Math.PI / 180);
    var gS = ctx.createLinearGradient(0, -H * 0.72, 0, H * 0.72);
    gS.addColorStop(0, 'rgba(255,255,255,0.22)');
    gS.addColorStop(1, 'rgba(255,255,255,0.02)');
    ctx.strokeStyle = gS;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -H * 0.72);
    ctx.lineTo(0,  H * 0.72);
    ctx.stroke();
    ctx.restore();

    // Translucent octagon deco
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1.5;
    _scOctagon(ctx, W / 2, H * 0.40, W * 0.44, Math.PI / 8);
    ctx.stroke();
    ctx.restore();

    /* ── ZONE 1: Header ── */
    var logoY = 84;
    ctx.save();
    ctx.strokeStyle = RED;
    ctx.lineWidth = 3;
    _scOctagon(ctx, PAD + 19, logoY, 19, Math.PI / 8);
    ctx.stroke();
    var lx = PAD + 19, lr = 19;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lx - lr * 0.44, logoY + lr * 0.06);
    ctx.lineTo(lx - lr * 0.05, logoY + lr * 0.50);
    ctx.lineTo(lx + lr * 0.54, logoY - lr * 0.44);
    ctx.stroke();
    ctx.restore();

    ctx.font = 'italic 900 40px ' + F_DISP;
    ctx.fillStyle = WHITE;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('PICK-TAGON', PAD + 48, logoY);

    // Event name (right) — 실제 event title만, 없으면 중립 브랜드 라벨
    var evText = (data.event && data.event !== 'Pick-tagon' && data.event.length > 0)
        ? data.event
        : 'UFC & MMA PICK GAME';
    if (evText.length > 24) evText = evText.slice(0, 23) + '…';
    ctx.font = '400 19px ' + F_MONO;
    ctx.fillStyle = MUTED2;
    ctx.textAlign = 'right';
    ctx.fillText(evText.toUpperCase(), W - PAD, logoY);
    ctx.textAlign = 'left';

    // Divider + weight class line
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, 128); ctx.lineTo(W - PAD, 128); ctx.stroke();

    // 체급 · 라운드 — 실데이터가 있는 조각만 조합(라운드 없으면 R 생략, 기본 3R 합성 금지)
    var divLabel = _scDivisionLabel(data.division);
    var wParts = [];
    if (divLabel) wParts.push(divLabel);
    if (typeof data.rounds === 'number' && Number.isInteger(data.rounds) && data.rounds > 0) wParts.push(data.rounds + 'R');
    if (wParts.length) {
        ctx.font = '400 27px ' + F_EYE;
        ctx.fillStyle = MUTED;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(wParts.join(' · '), W / 2, 172);
        ctx.textAlign = 'left';
    }

    /* ── ZONE 2: Pixel portraits (same-origin만, 실패 시 중립 initials) ── */
    var f1Name = (data.f1 && data.f1.name) ? data.f1.name : '?';
    var f2Name = (data.f2 && data.f2.name) ? data.f2.name : '?';
    var pBottom = 646;                       // 포트레잇 하단(이름 뒤 scrim이 덮는 기준선)
    var pTop = 190, pH = pBottom - pTop;     // 456
    var pW = 440;
    var cx1 = 260, cx2 = W - 260;

    function drawCorner(img, cx, name) {
        if (img && img.width) {
            var scale = Math.max(pW / img.width, pH / img.height);
            var dw = img.width * scale, dh = img.height * scale;
            ctx.save();
            ctx.beginPath();
            ctx.rect(cx - pW / 2, pTop, pW, pH);
            ctx.clip();
            ctx.imageSmoothingEnabled = false;   // pixel-art 선명 유지(image-rendering:pixelated)
            // 가로 중앙 · 세로 상단 고정 — 머리/얼굴이 잘리지 않게 top-anchor
            ctx.drawImage(img, cx - dw / 2, pTop, dw, dh);
            ctx.imageSmoothingEnabled = true;
            ctx.restore();
        } else {
            // 중립 initials 실루엣 — 코너 배경 글로우가 이미 색을 주므로 선수 tint 없음
            var bw = 292, bh = 330, bx = cx - bw / 2, by = pBottom - bh;
            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.strokeStyle = 'rgba(255,255,255,0.10)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 18); else ctx.rect(bx, by, bw, bh);
            ctx.fill(); ctx.stroke();
            var initials = String(name || '?').trim().split(/\s+/)
                .map(function(w) { return w.charAt(0) || ''; }).join('').slice(0, 2).toUpperCase() || '?';
            ctx.font = 'italic 900 112px ' + F_DISP;
            ctx.fillStyle = 'rgba(255,255,255,0.14)';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(initials, cx, by + bh * 0.46);
            ctx.font = '400 15px ' + F_MONO;
            ctx.fillStyle = 'rgba(255,255,255,0.20)';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText('선수 이미지 준비 중', cx, by + bh - 22);
            ctx.restore();
            ctx.textAlign = 'left';
        }
    }
    drawCorner(data._pxImg1, cx1, f1Name);
    drawCorner(data._pxImg2, cx2, f2Name);

    // Bottom scrim — 이름 가독성 확보 (포트레잇 하단을 배경색으로 페이드)
    var gSc = ctx.createLinearGradient(0, 430, 0, 700);
    gSc.addColorStop(0, 'rgba(8,9,12,0)');
    gSc.addColorStop(1, 'rgba(8,9,12,0.96)');
    ctx.fillStyle = gSc;
    ctx.fillRect(0, 430, W, 700 - 430);

    /* ── VS badge ── */
    var vsX = W / 2, vsY = 400, vsR = 60;
    ctx.save();
    ctx.fillStyle = 'rgba(7,7,9,0.92)';
    ctx.beginPath(); ctx.arc(vsX, vsY, vsR, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'rgba(225,6,0,0.55)';
    ctx.shadowBlur = 26;
    ctx.strokeStyle = RED;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(vsX, vsY, vsR, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = 'italic 900 44px ' + F_DISP;
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('VS', vsX, vsY + 2);
    ctx.restore();

    /* ── ZONE 3: Names + meta (코너 컬럼 중앙 정렬) ── */
    var colMaxW = 430;
    var colCx1 = 270, colCx2 = W - 270;
    var fnBaseY = 514, lnBaseY = 600, metaBaseY = 646;

    // 공식 랭크(ufc_rankings)만 메타에 사용 — fighters.rank 단독값 미사용.
    var divFull = null;
    try {
        if (typeof UFC_DIVISION_FULL_LABELS !== 'undefined' && data.division != null) {
            divFull = UFC_DIVISION_FULL_LABELS[String(data.division).toLowerCase()] || null;
        }
    } catch (e) {}
    function officialRankText(f) {
        try {
            if (data._rankMap && typeof _officialRankBadge === 'function') {
                var orb = _officialRankBadge(f && f.nameEn, f && f.name, divFull, data._rankMap);
                if (orb && orb.ranked) return orb.text;
            }
        } catch (e) {}
        return '';   // 미랭크/맵 미로드 → 랭크 생략(단정 금지)
    }

    function drawNameCol(f, name, cx, shadowColor, metaColor) {
        var parts = String(name).trim().split(/\s+/);
        var last  = parts[parts.length - 1] || '?';
        var first = parts.slice(0, -1).join(' ');

        if (first) {
            _scFitFont(ctx, first.toUpperCase(), '400', 34, F_EYE, colMaxW, 16);
            ctx.fillStyle = MUTED;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(_scEllipsize(ctx, first.toUpperCase(), colMaxW), cx, fnBaseY);
        }
        _scFitFont(ctx, last.toUpperCase(), 'italic 900', 82, F_DISP, colMaxW, 36);
        ctx.fillStyle = WHITE;
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = 26;
        ctx.textAlign = 'center';
        // min 폰트에서도 넘치는 초장문은 결정적 말줄임(캔버스/반대 컬럼 침범 방지)
        ctx.fillText(_scEllipsize(ctx, last.toUpperCase(), colMaxW), cx, lnBaseY);
        ctx.shadowBlur = 0;

        // 메타: 실제 record · 공식 랭크가 있을 때만
        var metaParts = [];
        if (f && f.record) metaParts.push(f.record);
        var rk = officialRankText(f);
        if (rk) metaParts.push(rk);
        if (metaParts.length) {
            var meta = metaParts.join(' · ');
            _scFitFont(ctx, meta, '700', 22, F_BODY, colMaxW, 13);
            ctx.fillStyle = metaColor;
            ctx.fillText(_scEllipsize(ctx, meta, colMaxW), cx, metaBaseY);
        }
        ctx.textAlign = 'left';
    }
    drawNameCol(data.f1, f1Name, colCx1, 'rgba(225,6,0,0.45)',   '#FF8A84');
    drawNameCol(data.f2, f2Name, colCx2, 'rgba(31,111,235,0.45)', '#8FBEFF');

    // '내 픽' 마커 — 선택 코너에만
    if (data.userPick === 'f1' || data.userPick === 'f2') {
        var mkCx = (data.userPick === 'f1') ? colCx1 : colCx2;
        var mkCol = (data.userPick === 'f1') ? RED : BLUE;
        var mkTxt = '✔ 내 픽';
        ctx.font = 'italic 700 19px ' + F_DISP;
        var mkW = ctx.measureText(mkTxt).width + 30;
        var mkX = mkCx - mkW / 2, mkY = 662, mkH = 34;
        ctx.fillStyle = (data.userPick === 'f1') ? 'rgba(225,6,0,0.16)' : 'rgba(31,111,235,0.16)';
        ctx.strokeStyle = mkCol;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(mkX, mkY, mkW, mkH, mkH / 2); else ctx.rect(mkX, mkY, mkW, mkH);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(mkTxt, mkCx, mkY + mkH / 2 + 1);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    /* ── ZONE 4: 픽 현황 (실집계만 — LIVE 표기 금지) ── */
    var barLabelY = 748;
    var barTop = 762, barH = 64, barW = W - PAD * 2, barR = 14;
    var pc = data.pickCounts;
    var total = pc ? (pc.c0 + pc.c1) : null;

    ctx.font = '400 22px ' + F_EYE;
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(pc ? '현재 픽 현황' : '픽 현황', PAD, barLabelY);

    if (pc) {
        ctx.font = '400 17px ' + F_MONO;
        ctx.fillStyle = MUTED2;
        ctx.textAlign = 'right';
        ctx.fillText(total + '명 참여', W - PAD, barLabelY);
        ctx.textAlign = 'left';
    }

    if (pc && total > 0) {
        var pct0 = Math.round(pc.c0 / total * 100);
        var pct1 = 100 - pct0;
        var seg0W = Math.max(0, Math.min(barW, barW * pct0 / 100));
        var seg1W = barW - seg0W;
        if (seg0W > 0) {
            var gBR = ctx.createLinearGradient(0, barTop, 0, barTop + barH);
            gBR.addColorStop(0, '#E10600'); gBR.addColorStop(1, '#A60400');
            ctx.fillStyle = gBR;
            _scRoundRectLeft(ctx, PAD, barTop, seg0W, barH, barR);
        }
        if (seg1W > 0) {
            var gBB = ctx.createLinearGradient(0, barTop, 0, barTop + barH);
            gBB.addColorStop(0, '#2F7BF0'); gBB.addColorStop(1, '#1652C2');
            ctx.fillStyle = gBB;
            _scRoundRectRight(ctx, PAD + seg0W, barTop, seg1W, barH, barR);
        }
        ctx.font = 'italic 800 38px ' + F_DISP;
        ctx.fillStyle = WHITE;
        ctx.textBaseline = 'middle';
        if (seg0W >= 110) { ctx.textAlign = 'left';  ctx.fillText(pct0 + '%', PAD + 18, barTop + barH / 2 + 1); }
        if (seg1W >= 110) { ctx.textAlign = 'right'; ctx.fillText(pct1 + '%', W - PAD - 18, barTop + barH / 2 + 1); }
        ctx.textAlign = 'left';
    } else {
        // 0표 또는 집계 미로드 — 중립 트랙(가짜 50:50 금지)
        ctx.fillStyle = 'rgba(255,255,255,0.045)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(PAD, barTop, barW, barH, barR); else ctx.rect(PAD, barTop, barW, barH);
        ctx.fill();
        ctx.font = '400 23px ' + F_EYE;
        ctx.fillStyle = MUTED2;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(pc ? '아직 픽 없음 — 첫 픽의 주인공이 되어보세요' : '픽 집계 준비 중', W / 2, barTop + barH / 2 + 1);
        ctx.textAlign = 'left';
    }

    // Bar border
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(PAD, barTop, barW, barH, barR);
    else ctx.rect(PAD, barTop, barW, barH);
    ctx.stroke();
    ctx.textBaseline = 'alphabetic';

    /* ── ZONE 5: Hook / tagline ── */
    var hookY = 908, subY = 954;
    var pre, nm, post, subText, nmColor;
    if (data.userPick === 'f1' || data.userPick === 'f2') {
        var pickedLast = String((data.userPick === 'f1') ? f1Name : f2Name).trim().split(/\s+/).pop();
        pre = '나는 '; nm = pickedLast; post = ' 픽. 너는?';
        nmColor = (data.userPick === 'f1') ? RED : '#4C8DFF';
        subText = '반박은 픽으로.';
    } else {
        pre = '이 경기, '; nm = '누구'; post = ' 보세요?';
        nmColor = RED;
        subText = '픽타곤에서 의견을 던져보세요.';
    }
    var hookFull = pre + nm + post;
    var hookPx = 74;
    ctx.font = 'italic 900 ' + hookPx + 'px ' + F_DISP;
    while (ctx.measureText(hookFull).width > W - PAD * 2 && hookPx > 40) {
        hookPx -= 4;
        ctx.font = 'italic 900 ' + hookPx + 'px ' + F_DISP;
    }
    var preW2 = ctx.measureText(pre).width;
    var nmW2  = ctx.measureText(nm).width;
    var totW2 = ctx.measureText(hookFull).width;
    var hx = W / 2 - totW2 / 2;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = WHITE;      ctx.fillText(pre,  hx, hookY);
    ctx.fillStyle = nmColor;    ctx.fillText(nm,   hx + preW2, hookY);
    ctx.fillStyle = WHITE;      ctx.fillText(post, hx + preW2 + nmW2, hookY);

    ctx.font = 'italic 600 29px ' + F_DISP;
    ctx.fillStyle = '#8A8E97';
    ctx.textAlign = 'center';
    ctx.fillText(subText, W / 2, subY);
    ctx.textAlign = 'left';

    /* ── ZONE 6: Footer ── */
    var lineY = 990;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, lineY); ctx.lineTo(W - PAD, lineY); ctx.stroke();
    // 중앙 red tick(글로우)
    var gT = ctx.createLinearGradient(W / 2 - 90, 0, W / 2 + 90, 0);
    gT.addColorStop(0, 'rgba(225,6,0,0)');
    gT.addColorStop(0.5, 'rgba(225,6,0,0.9)');
    gT.addColorStop(1, 'rgba(225,6,0,0)');
    ctx.fillStyle = gT;
    ctx.fillRect(W / 2 - 90, lineY - 1.5, 180, 3);

    var ctaY = 1036;
    var ctaPre = 'UFC 픽으로 붙는 곳 · ';
    ctx.font = 'italic 800 30px ' + F_DISP;
    var ctaFullW = ctx.measureText(ctaPre + 'pick-tagon.com').width;
    var ctaX = W / 2 - ctaFullW / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = INK1;
    ctx.fillText(ctaPre, ctaX, ctaY);
    ctx.fillStyle = RED;
    ctx.fillText('pick-tagon.com', ctaX + ctx.measureText(ctaPre).width, ctaY);

    // '무료' pill (right)
    ctx.font = '400 19px ' + F_EYE;
    var mBadge = '무료';
    var mbW = ctx.measureText(mBadge).width + 30;
    var mbH = 36, mbX = W - PAD - mbW, mbY = ctaY - mbH + 6;
    ctx.fillStyle = 'rgba(31,191,107,0.12)';
    ctx.strokeStyle = 'rgba(31,191,107,0.40)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(mbX, mbY, mbW, mbH, mbH / 2); else ctx.rect(mbX, mbY, mbW, mbH);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1FBF6B';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(mBadge, mbX + mbW / 2, mbY + mbH / 2 + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    // Rounded border frame (최상단)
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
    // Dynamic OG link → /share/fight/:id Pages Function serves per-matchup og:title/description,
    // then meta-refreshes into the in-app deep link (?fight=id&og=v2).
    var shareUrl   = 'https://pick-tagon.com/share/fight/' + encodeURIComponent(fightId);
    var shareTitle = 'PICK-TAGON';

    _scShowSharePicker({
        title: '공유 방식 선택',
        actions: [
            { icon: '🖼', label: '이미지 준비 중…', type: 'image' },
            { icon: '🔗', label: '링크로 공유', fn: function() {
                _scShareLink(shareTitle, shareText, shareUrl);
            }},
            { icon: '📋', label: '링크 복사', fn: function() {
                _scCopyLink(shareUrl);
            }}
        ]
    });
    // 피커가 열려 있는 동안 사전 준비(랭크/포트레잇 포함) → click 시 share 즉시 호출
    _scStartPrep('match', {
        data: data,
        prepare: async function(d) {
            // 공식 랭크(ufc_rankings) — 세션 캐시 공유(미로드 시 1회 SELECT, in-flight 공유).
            // 실패/타임아웃이면 null → 카드에서 랭크 생략(단정 금지).
            d._rankMap = null;
            try {
                if (typeof _ensureOfficialRankMap === 'function') {
                    d._rankMap = (await _scAwait(_ensureOfficialRankMap(), 4000, null)) || null;
                }
            } catch (e) { d._rankMap = null; }
            // Pixel portrait — manifest 최대 1회(캐시), fighter_id 기반 매칭만(타입 정규화).
            // 실패/타임아웃은 코너별 initials fallback(카드 생성은 계속).
            d._pxImg1 = null; d._pxImg2 = null;
            try {
                await _scAwait(_scLoadPixelManifest(), 3000, null);
                var _p1 = (d.f1 && d.f1.id != null && d.f1.id !== '') ? _scGetFighterPixelPath(String(d.f1.id)) : null;
                var _p2 = (d.f2 && d.f2.id != null && d.f2.id !== '') ? _scGetFighterPixelPath(String(d.f2.id)) : null;
                var _imgs = await _scAwait(Promise.all([_scLoadImage(_p1), _scLoadImage(_p2)]), 4000, [null, null]);
                d._pxImg1 = (_imgs && _imgs[0]) || null;
                d._pxImg2 = (_imgs && _imgs[1]) || null;
            } catch (e) {}
        },
        draw: drawPicktagonMatchShareCard,
        fileName: 'picktagon_match.png',
        downloadBase: 'picktagon_' + (((data.f1 && data.f1.name) || '') + '_vs_' + ((data.f2 && data.f2.name) || '')),
        savedToast: '📥 매치 카드 저장됨!',
        shareTitle: shareTitle,
        shareText: shareText
    });
}

/* ==============================
   FIGHTER SHARE CARD (Phase 3)
   파이터 프로필 공유 카드 — canvas 기반, 외부 이미지 없음 (taint-free)
   의존성: state.js, utils.js, admin.js (getActiveFights), fights-render.js (_fightCardCache)
============================== */

// ── 데이터 수집 ────────────────────────────────────────
// ── Pixel portrait manifest ──────────────────────────────
// Delegates to the shared window.PicktagonPixelFighters helper (pixel-fighters.js).
// Kept as thin wrappers so the existing share-card call sites are unchanged;
// both degrade silently (placeholder) if the helper is unavailable.
function _scLoadPixelManifest() {
    if (window.PicktagonPixelFighters && window.PicktagonPixelFighters.load) {
        return window.PicktagonPixelFighters.load();
    }
    return Promise.resolve({});
}
function _scGetFighterPixelPath(fighter) {
    if (window.PicktagonPixelFighters && window.PicktagonPixelFighters.getPath) {
        return window.PicktagonPixelFighters.getPath(fighter);
    }
    return null;
}
// Load a same-origin image; resolves to HTMLImageElement or null (never rejects).
// No crossOrigin: pixel PNGs are same-origin, so the canvas stays untainted.
function _scLoadImage(src) {
    return new Promise(function(resolve) {
        if (!src) { resolve(null); return; }
        var img = new Image();
        img.onload  = function() { resolve(img); };
        img.onerror = function() { resolve(null); };
        img.src = src;
    });
}

// finish rate 유효성: number 타입만(문자열 숫자 금지), 0은 유효, NaN/음수/100 초과 invalid.
function _scValidRate(v) {
    return (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100) ? v : null;
}

function buildFighterShareCardData(fighter) {
    var f = fighter || {};
    var name = f.name || '?';

    // Pick percentage: fighter_id '만'으로 매칭(이름 단독 매칭 합성 금지 — 동명이인 오염 방지).
    // id 없으면 pickPct 미산출. 타입(number/string) 차이는 String 정규화, 빈 id는 불일치.
    var pickPct = null;
    try {
        var fid = (f.id != null && String(f.id) !== '') ? String(f.id) : null;
        var fights0 = (fid && typeof getActiveFights === 'function') ? getActiveFights() : [];
        for (var i = 0; i < fights0.length; i++) {
            var fight0 = fights0[i];
            var _id1 = (fight0.f1 && fight0.f1.id != null && String(fight0.f1.id) !== '') ? String(fight0.f1.id) : null;
            var _id2 = (fight0.f2 && fight0.f2.id != null && String(fight0.f2.id) !== '') ? String(fight0.f2.id) : null;
            var isF1p = (_id1 !== null && _id1 === fid);
            var isF2p = (_id2 !== null && _id2 === fid);
            if ((isF1p || isF2p) && typeof eventPickCounts !== 'undefined' && eventPickCounts[fight0.id]) {
                var pc = eventPickCounts[fight0.id];
                // count validator 공유(_scValidCount) — invalid를 0으로 눙치지 않는다
                if (pc && _scValidCount(pc.c0) && _scValidCount(pc.c1)) {
                    var tot = pc.c0 + pc.c1;
                    if (tot > 0) pickPct = Math.round((isF1p ? pc.c0 : pc.c1) / tot * 100);
                }
                break;
            }
        }
    } catch(e) {}

    // ── Finish rate: 세 값 모두 유효(0..100, 0 허용)할 때만 섹션 렌더.
    //    일부만 있으면 전체 중립화(빈 축 합성 금지). 합계 보정/정규화도 하지 않는다.
    var koRate  = _scValidRate(f.ko_rate);
    var subRate = _scValidRate(f.sub_rate);
    var decRate = _scValidRate(f.dec_rate);
    var finishValid = (koRate != null && subRate != null && decRate != null
                       && (koRate + subRate + decRate) <= 100.5);

    // ── 레이더(픽타곤 레이팅) 유효성: 실제 배열 + 정확히 5개 + 각 원소 number 타입
    //    (문자열 숫자 금지) + 유한 + 0~100 범위.
    //    placeholder 규칙: '전원 정확히 50'([50×5])만 제거 — v19 코드의 하드코딩 기본값
    //    footprint가 [50,50,50,50,50] 하나뿐이라(다른 all-equal 기본값 없음), 그 외
    //    전축 동일값은 실측 데이터일 수 있어 보존한다(근거: 코드 provenance).
    var stats = null;
    if (Array.isArray(f.stats) && f.stats.length === 5) {
        var okEls = f.stats.every(function(v) {
            return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
        });
        var legacyDefault = okEls && f.stats.every(function(v) { return v === 50; });
        if (okEls && !legacyDefault) stats = f.stats.slice();
    }

    // ── 다음 경기: fighter_id '만'으로 매칭(이름 단독 매칭 금지 — 동명이인 위험).
    //    id는 String 정규화(타입 차이 안전), 빈 id 불일치. scheduled 상태만.
    //    상대 이름이 없는('?'/빈) 대진은 후보에서 제외 — 'VS 상대 미정 + CTA' 조합 금지.
    //    이벤트 제목/날짜는 그 fight의 _eventTitle/_eventId(event_date)에서만 해상(identity 일치).
    //    시각/장소는 데이터가 없으므로 추측 표기 0.
    var nextFight = null;
    try {
        var fid2 = (f.id != null && String(f.id) !== '') ? String(f.id) : null;
        if (fid2 && typeof getActiveFights === 'function') {
            var fights1 = getActiveFights() || [];
            for (var k = 0; k < fights1.length; k++) {
                var ft = fights1[k];
                if (ft._resultStatus && ft._resultStatus !== 'scheduled') continue;   // settled/cancelled 제외
                var _a1 = (ft.f1 && ft.f1.id != null && String(ft.f1.id) !== '') ? String(ft.f1.id) : null;
                var _a2 = (ft.f2 && ft.f2.id != null && String(ft.f2.id) !== '') ? String(ft.f2.id) : null;
                var side = (_a1 !== null && _a1 === fid2) ? 'f1'
                         : (_a2 !== null && _a2 === fid2) ? 'f2' : null;
                if (!side) continue;
                var opp = (side === 'f1') ? (ft.f2 && ft.f2.name) : (ft.f1 && ft.f1.name);
                var oppStr = (opp == null) ? '' : String(opp).trim();
                if (!oppStr || oppStr === '?') continue;          // 상대 미상 → 섹션 후보 제외
                var evDate = null;
                try {
                    if (ft._eventId && typeof _sidebarEventsCache !== 'undefined' && Array.isArray(_sidebarEventsCache)) {
                        var ev = _sidebarEventsCache.find(function(e) { return e.id === ft._eventId; });
                        if (ev && ev.event_date) evDate = String(ev.event_date).slice(0, 10).replace(/-/g, '.');
                    }
                } catch (e2) {}
                nextFight = {
                    opponent: oppStr,
                    event:    ft._eventTitle || null,
                    date:     evDate          // 없으면 날짜 미표기(추측 금지)
                };
                break;
            }
        }
    } catch(e) {}

    return {
        id:            f.id || null,
        name:          name,
        nameEn:        f.name_en || f.nameEn || null,
        nickname:      f.nickname || null,
        record:        f.record   || null,
        division:      f.division || null,
        divisionLabel: _scDivisionLabel(f.division) || null,
        height:        f.height   || null,
        reach:         f.reach    || null,
        weight:        f.weight   || null,
        odds:          f.odds     || null,
        koRate:        koRate,
        subRate:       subRate,
        decRate:       decRate,
        finishValid:   finishValid,
        stats:         stats,          // null이면 레이더 미렌더(가짜 오각형 금지)
        pickPct:       pickPct,
        nextFight:     nextFight,
        officialRank:  null            // prep(prepare)에서 ufc_rankings 맵으로 주입
    };
}

// ── 레이더 차트 (handoff 5축: per-axis 컬러 dot + 값 라벨) ──────────
// grid 3링(0.34/0.67/1.0) + 스포크, 데이터 폴리곤(red fill/stroke), 축별 컬러 dot,
// 라벨(Bebas) 아래 값(Barlow Condensed italic, 축 색상). values는 유효 5수치 전제.
function _scDrawRadarHandoff(ctx, cx, cy, R, values, labels, axisColors, fonts) {
    var N = values.length;
    var F_EYE  = fonts.F_EYE;
    var F_DISP = fonts.F_DISP;

    function ptAt(i, r) {
        var a = -Math.PI / 2 + i * (Math.PI * 2 / N);
        return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    }

    [0.34, 0.67, 1.0].forEach(function(frac) {
        ctx.beginPath();
        for (var i = 0; i < N; i++) {
            var p = ptAt(i, R * frac);
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        ctx.stroke();
    });
    for (var s = 0; s < N; s++) {
        var sp = ptAt(s, R);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(sp.x, sp.y);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    ctx.beginPath();
    for (var i = 0; i < N; i++) {
        var v = Math.max(0, Math.min(100, values[i])) / 100;
        var p = ptAt(i, R * v);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(225,6,0,0.20)';
    ctx.fill();
    ctx.strokeStyle = '#E10600';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    for (var d = 0; d < N; d++) {
        var dv = Math.max(0, Math.min(100, values[d])) / 100;
        var dp = ptAt(d, R * dv);
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = axisColors[d % axisColors.length];
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#0B0C0F';
        ctx.stroke();
    }

    // 라벨 + 값 — 축 방향 기준 정렬, 값은 라벨 바로 아래(축 색상)
    for (var L = 0; L < N; L++) {
        var lp = ptAt(L, R + 34);
        var align = (Math.abs(lp.x - cx) < 12) ? 'center' : (lp.x < cx) ? 'right' : 'left';
        ctx.textAlign = align;
        ctx.textBaseline = 'middle';
        ctx.font = '400 21px ' + F_EYE;
        ctx.fillStyle = '#B3B5BC';
        ctx.fillText(labels[L], lp.x, lp.y - 12);
        ctx.font = 'italic 800 24px ' + F_DISP;
        ctx.fillStyle = axisColors[L % axisColors.length];
        ctx.fillText(String(Math.round(values[L])), lp.x, lp.y + 15);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}

// ── 카드 드로잉 (handoff 01-share-cards/stat-card 채택) ────────────
// 크기: 1080×1350(4:5) — handoff 795×~980 비율 채택. OG 소비처는 자체 1200×630 정적
// JPG(functions/_utils/og.js)를 쓰므로 공유 이미지에 정사각 전제 없음(감사 확인).
// 데이터 진실성: 레이더=유효 5수치(전부 동일 placeholder 제외)만, finish=3값 모두
// 유효할 때만, 랭크=ufc_rankings 공식 맵만(fighters.rank 단독값 미사용), 다음 경기=
// fighter_id 매칭만·날짜는 event_date만(시각/장소 추측 금지), 알림 받기 버튼 없음.
function drawPicktagonFighterShareCard(canvas, data) {
    var W = 1080, H = 1350;
    canvas.width  = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');

    var RED    = '#E10600';
    var WHITE  = '#FFFFFF';
    var INK1   = '#ECECEE';
    var MUTED  = '#B3B5BC';
    var MUTED2 = '#71757F';
    var PAD    = 46;
    var F_DISP = '"Barlow Condensed","Oswald","Pretendard","Apple SD Gothic Neo",Arial,sans-serif';
    var F_EYE  = '"Bebas Neue","Oswald",Arial,sans-serif';
    var F_BODY = '"Barlow","Pretendard","Apple SD Gothic Neo",Arial,sans-serif';
    var F_MONO = '"JetBrains Mono","Space Mono","Courier New",monospace';

    /* ── ZONE 0: Background ── */
    ctx.fillStyle = '#0B0C0F';
    ctx.fillRect(0, 0, W, H);

    var gR = ctx.createRadialGradient(W * 0.80, H * 0.05, 0, W * 0.80, H * 0.05, W * 0.72);
    gR.addColorStop(0,    'rgba(225,6,0,0.22)');
    gR.addColorStop(0.6,  'rgba(225,6,0,0)');
    ctx.fillStyle = gR;
    ctx.fillRect(0, 0, W, H);

    var gB = ctx.createRadialGradient(W * 0.08, H * 0.97, 0, W * 0.08, H * 0.97, W * 0.60);
    gB.addColorStop(0,    'rgba(31,111,235,0.13)');
    gB.addColorStop(0.6,  'rgba(31,111,235,0)');
    ctx.fillStyle = gB;
    ctx.fillRect(0, 0, W, H);

    var gV = ctx.createRadialGradient(W / 2, H * 0.42, W * 0.30, W / 2, H * 0.42, W * 0.95);
    gV.addColorStop(0, 'rgba(0,0,0,0)');
    gV.addColorStop(1, 'rgba(0,0,0,0.50)');
    ctx.fillStyle = gV;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1.5;
    _scOctagon(ctx, W * 0.76, H * 0.30, W * 0.36, Math.PI / 8);
    ctx.stroke();
    ctx.restore();

    // Top red bar (handoff: 카드 최상단 red accent)
    ctx.fillStyle = RED;
    ctx.fillRect(0, 0, W, 6);

    /* ── ZONE 1: Header (brand + chips) ── */
    var headY = 88;
    ctx.save();
    ctx.fillStyle = RED;
    ctx.shadowColor = 'rgba(225,6,0,0.6)';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(PAD + 9, headY, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.font = 'italic 900 37px ' + F_DISP;
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('PICK-TAGON', PAD + 30, headY);

    // Right chips — division(항상, 있을 때) + official rank(공식 맵에 있을 때만). 오른쪽부터 배치.
    var chipH = 42, chipY = headY - chipH / 2, chipRight = W - PAD;
    if (data.divisionLabel) {
        ctx.font = '400 20px ' + F_EYE;
        var dW = ctx.measureText(data.divisionLabel).width + 40;
        var dX = chipRight - dW;
        ctx.fillStyle = '#1B1E25';
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(dX, chipY, dW, chipH, chipH / 2); else ctx.rect(dX, chipY, dW, chipH);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = MUTED;
        ctx.textAlign = 'center';
        ctx.fillText(data.divisionLabel, dX + dW / 2, headY + 1);
        chipRight = dX - 10;
        ctx.textAlign = 'left';
    }
    if (data.officialRank) {
        ctx.font = 'italic 800 21px ' + F_DISP;
        var rkTxt = data.officialRank;
        var rW = ctx.measureText(rkTxt).width + 36;
        // 랭크 텍스트가 길면(다체급·P4P 병기) 좌측 공간 안에서 자동 축소
        var rkPx = 21;
        var availW = chipRight - (PAD + 30 + 260) - 16;
        while (rW > Math.max(120, availW) && rkPx > 14) {
            rkPx -= 1;
            ctx.font = 'italic 800 ' + rkPx + 'px ' + F_DISP;
            rW = ctx.measureText(rkTxt).width + 36;
        }
        var rX = chipRight - rW;
        ctx.fillStyle = 'rgba(225,6,0,0.16)';
        ctx.strokeStyle = 'rgba(225,6,0,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(rX, chipY, rW, chipH, chipH / 2); else ctx.rect(rX, chipY, rW, chipH);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = WHITE;
        ctx.textAlign = 'center';
        ctx.fillText(rkTxt, rX + rW / 2, headY + 1);
        ctx.textAlign = 'left';
    }

    /* ── ZONE 2: Identity (photo slot + name/record) ── */
    var phX = PAD, phY = 150, phW = 224, phH = 272, phR = 16;
    var _img = data._pixelImg;
    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(phX, phY, phW, phH, phR); else ctx.rect(phX, phY, phW, phH);
    ctx.clip();
    if (_img && _img.width) {
        var cover = Math.max(phW / _img.width, phH / _img.height);
        var dw = _img.width * cover, dh = _img.height * cover;
        ctx.imageSmoothingEnabled = false;   // pixel-art 선명 유지
        // 가로 중앙 · 세로 상단 고정(object-position: center top) — 얼굴 잘림 방지
        ctx.drawImage(_img, phX + (phW - dw) / 2, phY, dw, dh);
        ctx.imageSmoothingEnabled = true;
    } else {
        var gPh = ctx.createLinearGradient(0, phY, 0, phY + phH);
        gPh.addColorStop(0, '#20242C');
        gPh.addColorStop(1, '#101216');
        ctx.fillStyle = gPh;
        ctx.fillRect(phX, phY, phW, phH);
        var initials = String(data.name || '?').trim().split(/\s+/)
            .map(function(w2) { return w2.charAt(0) || ''; }).join('').slice(0, 2).toUpperCase() || '?';
        ctx.font = 'italic 900 84px ' + F_DISP;
        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(initials, phX + phW / 2, phY + phH / 2 - 8);
        ctx.font = '400 14px ' + F_MONO;
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('이미지 준비 중', phX + phW / 2, phY + phH - 20);
        ctx.textAlign = 'left';
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(phX, phY, phW, phH, phR); else ctx.rect(phX, phY, phW, phH);
    ctx.stroke();

    // Name — handoff: 두 줄(first/last) 동일 크기, italic 800 uppercase, line-height .86
    var nameX = phX + phW + 34;
    var nameMaxW = W - PAD - nameX;
    var parts = String(data.name || '?').trim().split(/\s+/);
    var lastNm  = parts[parts.length - 1] || '?';
    var firstNm = parts.slice(0, -1).join(' ');
    var line1 = (firstNm || lastNm).toUpperCase();
    var line2 = firstNm ? lastNm.toUpperCase() : '';

    var nmPx = 92;
    ctx.font = 'italic 800 ' + nmPx + 'px ' + F_DISP;
    var widest = Math.max(ctx.measureText(line1).width, line2 ? ctx.measureText(line2).width : 0);
    while (widest > nameMaxW && nmPx > 44) {
        nmPx -= 4;
        ctx.font = 'italic 800 ' + nmPx + 'px ' + F_DISP;
        widest = Math.max(ctx.measureText(line1).width, line2 ? ctx.measureText(line2).width : 0);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = WHITE;
    var nb1 = phY + nmPx * 0.82;
    // min 폰트(44px)에서도 넘치는 초장문은 결정적 말줄임(캔버스 밖 잘림 방지)
    ctx.fillText(_scEllipsize(ctx, line1, nameMaxW), nameX, nb1);
    var nbLast = nb1;
    if (line2) {
        nbLast = nb1 + Math.round(nmPx * 0.90);
        ctx.fillText(_scEllipsize(ctx, line2, nameMaxW), nameX, nbLast);
    }

    // Record — 숫자 red + 'MMA 전적' 라벨(Bebas). 없으면 중립 문구(합성 금지).
    var recY = Math.min(nbLast + 62, phY + phH - 8);
    if (data.record) {
        ctx.font = 'italic 800 42px ' + F_DISP;
        ctx.fillStyle = RED;
        ctx.fillText(data.record, nameX, recY);
        var recW = ctx.measureText(data.record).width;
        ctx.font = '400 22px ' + F_EYE;
        ctx.fillStyle = MUTED2;
        ctx.fillText('MMA 전적', nameX + recW + 14, recY - 2);
    } else {
        ctx.font = '400 19px ' + F_MONO;
        ctx.fillStyle = MUTED2;
        ctx.fillText('전적 정보 없음', nameX, recY);
    }

    /* ── ZONE 3: Stat strip (4열, 상하 hairline) ── */
    var stripTop = 470, stripBot = 584;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, stripTop); ctx.lineTo(W - PAD, stripTop); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD, stripBot); ctx.lineTo(W - PAD, stripBot); ctx.stroke();

    var cells = [
        { k: 'HT',   v: data.height || '—' },
        { k: 'RCH',  v: data.reach  || '—' },
        { k: 'WT',   v: data.weight || '—' },
        { k: 'ODDS', v: data.odds ? ('×' + data.odds) : '—' }
    ];
    var cellW = (W - PAD * 2) / cells.length;
    cells.forEach(function(c, ci) {
        var ccx = PAD + cellW * ci + cellW / 2;
        ctx.font = '400 16px ' + F_MONO;
        ctx.fillStyle = MUTED2;
        ctx.textAlign = 'center';
        ctx.fillText(c.k, ccx, stripTop + 36);
        var vStr = String(c.v);
        var vPx = 42;
        ctx.font = 'italic 800 ' + vPx + 'px ' + F_DISP;
        while (ctx.measureText(vStr).width > cellW - 24 && vPx > 20) {
            vPx -= 2;
            ctx.font = 'italic 800 ' + vPx + 'px ' + F_DISP;
        }
        ctx.fillStyle = WHITE;
        ctx.fillText(vStr, ccx, stripTop + 94);
    });
    ctx.textAlign = 'left';

    /* ── ZONE 4: Radar(좌) + Finish rate(우) ── */
    var eyeY = 650;
    ctx.font = '400 21px ' + F_EYE;
    ctx.fillStyle = MUTED;
    ctx.fillText('FIGHTER STATS', PAD, eyeY);
    ctx.font = '400 14px ' + F_MONO;
    ctx.fillStyle = MUTED2;
    ctx.fillText('· 픽타곤 레이팅', PAD + 158, eyeY - 1);   // 출처 명시(공식 스탯 아님)

    var AXIS_COLORS = ['#E10600', '#1F6FEB', '#1FBF6B', '#F4B400', '#8B3FE3'];
    var STAT_KR = ['스트라이킹', '그래플링', '스태미나', '디펜스', '스피드'];
    if (data.stats) {
        _scDrawRadarHandoff(ctx, 286, 862, 118, data.stats, STAT_KR, AXIS_COLORS,
            { F_EYE: F_EYE, F_DISP: F_DISP });
    } else {
        // 유효 5수치 없음 → 중립 empty state(가짜 오각형 금지)
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(PAD, 692, 476, 300, 16); else ctx.rect(PAD, 692, 476, 300);
        ctx.fill(); ctx.stroke();
        ctx.font = '400 24px ' + F_EYE;
        ctx.fillStyle = MUTED2;
        ctx.textAlign = 'center';
        ctx.fillText('레이팅 데이터 없음', PAD + 238, 830);
        ctx.font = '400 15px ' + F_MONO;
        ctx.fillText('스탯 집계 중', PAD + 238, 866);
        ctx.textAlign = 'left';
    }

    var fx = 608, fw = W - PAD - fx;
    if (data.finishValid) {
        ctx.font = '400 21px ' + F_EYE;
        ctx.fillStyle = MUTED;
        ctx.fillText('FINISH RATE', fx, eyeY);

        // Stacked bar — 실측 %만(정규화 금지). 합계<100이면 남는 트랙 그대로 노출.
        var sbY = 692, sbH = 22, sbR = 11;
        ctx.fillStyle = '#232730';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(fx, sbY, fw, sbH, sbR); else ctx.rect(fx, sbY, fw, sbH);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(fx, sbY, fw, sbH, sbR); else ctx.rect(fx, sbY, fw, sbH);
        ctx.clip();
        var segX = fx;
        [[data.koRate, RED], [data.subRate, '#1F6FEB'], [data.decRate, '#54585F']].forEach(function(seg) {
            var wSeg = fw * (seg[0] / 100);
            if (wSeg > 0) { ctx.fillStyle = seg[1]; ctx.fillRect(segX, sbY, wSeg, sbH); segX += wSeg; }
        });
        ctx.restore();

        var rows = [
            { lbl: 'KO/TKO',  val: data.koRate,  col: RED },
            { lbl: '서브미션', val: data.subRate, col: '#1F6FEB' },
            { lbl: '판정',     val: data.decRate, col: '#54585F' }
        ];
        var rowY = 764, rowStep = 66;
        rows.forEach(function(r2, ri) {
            var ry = rowY + ri * rowStep;
            ctx.fillStyle = r2.col;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(fx, ry - 15, 17, 17, 4); else ctx.rect(fx, ry - 15, 17, 17);
            ctx.fill();
            ctx.font = '600 24px ' + F_BODY;
            ctx.fillStyle = INK1;
            ctx.fillText(r2.lbl, fx + 30, ry);
            ctx.font = 'italic 800 30px ' + F_DISP;
            ctx.fillStyle = WHITE;
            ctx.textAlign = 'right';
            ctx.fillText(r2.val.toFixed(1) + '%', fx + fw, ry);
            ctx.textAlign = 'left';
        });
    } else {
        // ko/sub/dec 중 하나라도 invalid → 전체 중립화(부분 합성 금지)
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(fx, 692, fw, 300, 16); else ctx.rect(fx, 692, fw, 300);
        ctx.fill(); ctx.stroke();
        ctx.font = '400 24px ' + F_EYE;
        ctx.fillStyle = MUTED2;
        ctx.textAlign = 'center';
        ctx.fillText('피니시 데이터 없음', fx + fw / 2, 830);
        ctx.font = '400 15px ' + F_MONO;
        ctx.fillText('집계 중', fx + fw / 2, 866);
        ctx.textAlign = 'left';
    }

    /* ── ZONE 5: 다음 경기 bar ── */
    var nfY = 1046, nfH = 118, nfR = 16;
    var nf = data.nextFight;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(PAD, nfY, W - PAD * 2, nfH, nfR); else ctx.rect(PAD, nfY, W - PAD * 2, nfH);
    if (nf) {
        var gNf = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
        gNf.addColorStop(0, 'rgba(225,6,0,0.14)');
        gNf.addColorStop(1, 'rgba(225,6,0,0.03)');
        ctx.fillStyle = gNf;
        ctx.strokeStyle = 'rgba(225,6,0,0.28)';
    } else {
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    }
    ctx.lineWidth = 1;
    ctx.fill(); ctx.stroke();

    if (nf) {
        ctx.font = '400 16px ' + F_EYE;
        ctx.fillStyle = '#FF5D55';
        ctx.fillText('다음 경기', PAD + 28, nfY + 34);

        // CTA chip(이미지 속 시각 요소 — 실제 버튼 아님을 전제로 한 포스터 CTA)
        var ctaTxt = '픽하러 가기 →';
        ctx.font = 'italic 800 21px ' + F_DISP;
        var ctaW2 = ctx.measureText(ctaTxt).width + 44;
        var ctaH2 = 48, ctaX2 = W - PAD - 24 - ctaW2, ctaY2 = nfY + (nfH - ctaH2) / 2;
        ctx.fillStyle = RED;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(ctaX2, ctaY2, ctaW2, ctaH2, 12); else ctx.rect(ctaX2, ctaY2, ctaW2, ctaH2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(ctaTxt, ctaX2 + ctaW2 / 2, ctaY2 + ctaH2 / 2 + 1);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

        var oppMaxW = ctaX2 - (PAD + 28) - 24;
        var oppTxt = 'VS ' + String(nf.opponent || '상대 미정').toUpperCase();
        _scFitFont(ctx, oppTxt, 'italic 800', 34, F_DISP, oppMaxW, 20);
        ctx.fillStyle = WHITE;
        ctx.fillText(_scEllipsize(ctx, oppTxt, oppMaxW), PAD + 28, nfY + 72);

        var subParts = [];
        if (nf.event) subParts.push(nf.event);
        if (nf.date)  subParts.push(nf.date);
        if (subParts.length) {
            var subTxt = subParts.join(' · ');
            _scFitFont(ctx, subTxt, '400', 17, F_BODY, oppMaxW, 12);
            ctx.fillStyle = MUTED2;
            ctx.fillText(_scEllipsize(ctx, subTxt, oppMaxW), PAD + 28, nfY + 100);
        }
    } else {
        // 일정 없음/미확인 — 중립. '알림 받기' 등 미구현 기능 CTA 금지.
        ctx.font = '400 16px ' + F_EYE;
        ctx.fillStyle = MUTED2;
        ctx.fillText('다음 경기', PAD + 28, nfY + 34);
        ctx.font = 'italic 800 30px ' + F_DISP;
        ctx.fillStyle = MUTED;
        ctx.fillText('일정 미정', PAD + 28, nfY + 72);
        ctx.font = '400 15px ' + F_BODY;
        ctx.fillStyle = MUTED2;
        ctx.fillText('픽타곤 등록 대진 기준', PAD + 28, nfY + 100);
    }

    /* ── ZONE 6: Footer ── */
    var ftLineY = 1206;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, ftLineY); ctx.lineTo(W - PAD, ftLineY); ctx.stroke();

    var ftY = 1266;
    // pickPct는 실집계가 있을 때만 문구에 반영(0표는 기본 문구)
    var leftPre, leftPct = null;
    if (data.pickPct !== null && data.pickPct !== undefined) {
        leftPre = '픽타곤 유저 ';
        leftPct = data.pickPct + '%';
    } else {
        leftPre = '이 선수, 픽? · ';
    }
    ctx.font = 'italic 800 30px ' + F_DISP;
    ctx.textAlign = 'left';
    if (leftPct) {
        ctx.fillStyle = INK1;
        ctx.fillText(leftPre, PAD, ftY);
        var w1 = ctx.measureText(leftPre).width;
        ctx.fillStyle = RED;
        ctx.fillText(leftPct, PAD + w1, ftY);
        var w2 = w1 + ctx.measureText(leftPct).width;
        ctx.fillStyle = INK1;
        ctx.fillText('가 이 선수 픽 · ', PAD + w2, ftY);
        var w3 = w2 + ctx.measureText('가 이 선수 픽 · ').width;
        ctx.fillStyle = RED;
        ctx.fillText('pick-tagon.com', PAD + w3, ftY);
    } else {
        ctx.fillStyle = INK1;
        ctx.fillText(leftPre, PAD, ftY);
        ctx.fillStyle = RED;
        ctx.fillText('pick-tagon.com', PAD + ctx.measureText(leftPre).width, ftY);
    }

    // '무료' chip (right)
    ctx.font = '400 18px ' + F_EYE;
    var frTxt = '무료';
    var frW = ctx.measureText(frTxt).width + 32;
    var frH = 40, frX = W - PAD - frW, frY2 = ftY - frH + 8;
    ctx.fillStyle = 'rgba(31,191,107,0.12)';
    ctx.strokeStyle = 'rgba(31,191,107,0.40)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(frX, frY2, frW, frH, frH / 2); else ctx.rect(frX, frY2, frW, frH);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1FBF6B';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(frTxt, frX + frW / 2, frY2 + frH / 2 + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    // Rounded border frame
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1.5;
    var fr2 = 20, rc2 = 18;
    ctx.beginPath();
    ctx.moveTo(fr2 + rc2, fr2);
    ctx.lineTo(W - fr2 - rc2, fr2);
    ctx.arcTo(W - fr2, fr2, W - fr2, fr2 + rc2, rc2);
    ctx.lineTo(W - fr2, H - fr2 - rc2);
    ctx.arcTo(W - fr2, H - fr2, W - fr2 - rc2, H - fr2, rc2);
    ctx.lineTo(fr2 + rc2, H - fr2);
    ctx.arcTo(fr2, H - fr2, fr2, H - fr2 - rc2, rc2);
    ctx.lineTo(fr2, fr2 + rc2);
    ctx.arcTo(fr2, fr2, fr2 + rc2, fr2, rc2);
    ctx.closePath();
    ctx.stroke();
}

// ── 파이터 카드 공유 피커 ─────────────────────────────────
function sharePicktagonFighterCard(fighter) {
    if (!fighter || !fighter.name) {
        if (typeof showToast === 'function') showToast('⚠️ 파이터 정보를 찾을 수 없습니다');
        return;
    }
    var data = buildFighterShareCardData(fighter);
    var shareText  = data.name + ' · ' + (data.record || '—') + ' · UFC 픽은 PICK-TAGON · pick-tagon.com';
    // Dynamic OG link → /share/fighter/:id Pages Function serves per-fighter og:title/description,
    // then meta-refreshes into the in-app deep link (?fighter=id&og=v2). id 없으면 기존 fallback.
    var shareUrl   = data.id
        ? 'https://pick-tagon.com/share/fighter/' + encodeURIComponent(data.id)
        : 'https://pick-tagon.com/#fighter';
    var shareTitle = 'PICK-TAGON — ' + data.name;

    _scShowSharePicker({
        title: '파이터 공유',
        actions: [
            { icon: '🖼', label: '이미지 준비 중…', type: 'image' },
            { icon: '🔗', label: '링크로 공유', fn: function() {
                _scShareLink(shareTitle, shareText, shareUrl);
            }},
            { icon: '📋', label: '링크 복사', fn: function() {
                _scCopyLink(shareUrl);
            }}
        ]
    });
    // 피커가 열려 있는 동안 사전 준비(공식 랭크/포트레잇 포함) → click 시 share 즉시 호출
    _scStartPrep('fighter', {
        data: data,
        prepare: async function(d) {
            // 공식 랭크(ufc_rankings)만 — fighters.rank 단독값 미사용. 프로필 모달이 이미
            // 같은 맵을 로드하므로 대부분 캐시 hit(추가 요청 0). ranked=true일 때만 칩.
            d.officialRank = null;
            try {
                if (typeof _ensureOfficialRankMap === 'function' && typeof _officialRankBadge === 'function') {
                    var _map = (await _scAwait(_ensureOfficialRankMap(), 4000, null)) || null;
                    if (_map) {
                        var _dl = null;
                        try {
                            if (typeof UFC_DIVISION_FULL_LABELS !== 'undefined' && d.division != null) {
                                _dl = UFC_DIVISION_FULL_LABELS[String(d.division).toLowerCase()] || null;
                            }
                        } catch (e0) {}
                        var _orb = _officialRankBadge(d.nameEn, d.name, _dl, _map);
                        if (_orb && _orb.ranked) d.officialRank = _orb.text;
                    }
                }
            } catch (e) { d.officialRank = null; }
            // Pixel portrait — same-origin, id 기반(타입 정규화), 실패/타임아웃은 initials.
            d._pixelImg = null;
            try {
                await _scAwait(_scLoadPixelManifest(), 3000, null);
                var _pxPath = (d.id != null && d.id !== '') ? _scGetFighterPixelPath(String(d.id)) : null;
                d._pixelImg = _pxPath ? await _scAwait(_scLoadImage(_pxPath), 4000, null) : null;
            } catch(e) { d._pixelImg = null; }
        },
        draw: drawPicktagonFighterShareCard,
        fileName: 'picktagon_fighter.png',
        downloadBase: 'picktagon_' + (data.name || 'fighter'),
        savedToast: '📥 파이터 카드 저장됨!',
        shareTitle: shareTitle,
        shareText: shareText
    });
}
