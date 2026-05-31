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

    // Auto-fit last names
    var f1Size = 96, f2Size = 96;
    ctx.font = '600 ' + f1Size + 'px ' + F_BLK;
    while (ctx.measureText(f1Last.toUpperCase()).width > maxNameW && f1Size > 36) {
        f1Size -= 4;
        ctx.font = '600 ' + f1Size + 'px ' + F_BLK;
    }
    ctx.font = '600 ' + f2Size + 'px ' + F_BLK;
    while (ctx.measureText(f2Last.toUpperCase()).width > maxNameW && f2Size > 36) {
        f2Size -= 4;
        ctx.font = '600 ' + f2Size + 'px ' + F_BLK;
    }

    var lastNameY  = 420;   // baseline for last names
    var firstNameY = lastNameY - Math.max(f1Size, f2Size) * 0.70 - 8;
    var recordY    = lastNameY + 36;

    ctx.textBaseline = 'alphabetic';

    // F1 first name
    if (f1First) {
        ctx.font = '400 30px ' + F_BLK;
        ctx.fillStyle = 'rgba(244,244,245,0.65)';
        ctx.textAlign = 'right';
        ctx.fillText(f1First.toUpperCase(), nameEdge, firstNameY);
    }
    // F1 last name
    ctx.font = '600 ' + f1Size + 'px ' + F_BLK;
    ctx.fillStyle = WHITE;
    ctx.shadowColor = 'rgba(225,20,20,0.45)';
    ctx.shadowBlur = 26;
    ctx.textAlign = 'right';
    ctx.fillText(f1Last.toUpperCase(), nameEdge, lastNameY);
    ctx.shadowBlur = 0;
    // F1 record
    if (data.f1 && data.f1.record) {
        ctx.font = '400 19px ' + F_MONO;
        ctx.fillStyle = 'rgba(225,20,20,0.65)';
        ctx.textAlign = 'right';
        ctx.fillText(data.f1.record, nameEdge, recordY);
    }

    // F2 first name
    var f2NameEdge = vsX + vsBadgeR + 16;   // left boundary for f2 (right side)
    if (f2First) {
        ctx.font = '400 30px ' + F_BLK;
        ctx.fillStyle = 'rgba(244,244,245,0.65)';
        ctx.textAlign = 'left';
        ctx.fillText(f2First.toUpperCase(), f2NameEdge, firstNameY);
    }
    // F2 last name
    ctx.font = '600 ' + f2Size + 'px ' + F_BLK;
    ctx.fillStyle = WHITE;
    ctx.shadowColor = 'rgba(47,109,246,0.45)';
    ctx.shadowBlur = 26;
    ctx.textAlign = 'left';
    ctx.fillText(f2Last.toUpperCase(), f2NameEdge, lastNameY);
    ctx.shadowBlur = 0;
    // F2 record
    if (data.f2 && data.f2.record) {
        ctx.font = '400 19px ' + F_MONO;
        ctx.fillStyle = 'rgba(47,109,246,0.65)';
        ctx.textAlign = 'left';
        ctx.fillText(data.f2.record, f2NameEdge, recordY);
    }

    // VS badge (centered vertically ~at lastNameY - lastNameSize/2)
    var vsY = lastNameY - Math.max(f1Size, f2Size) * 0.30;
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

// ── 매치 카드 공유 실행 ──────────────────────────────────
async function sharePicktagonMatchCard(fightId) {
    var data = buildMatchShareCardData(fightId);
    if (!data) {
        if (typeof showToast === 'function') showToast('⚠️ 경기 정보를 찾을 수 없습니다');
        return;
    }
    var canvas = document.createElement('canvas');
    if (typeof document.fonts !== 'undefined' && document.fonts.ready) {
        try { await document.fonts.ready; } catch(e) {}
    }
    drawPicktagonMatchShareCard(canvas, data);

    return new Promise(function(resolve, reject) {
        canvas.toBlob(async function(blob) {
            if (!blob) { reject(new Error('toBlob failed')); return; }
            var file = new File([blob], 'picktagon_match.png', { type: 'image/png' });
            var pickedName = data.userPick === 'f1' ? data.f1.name : data.userPick === 'f2' ? data.f2.name : null;
            var shareText = pickedName
                ? '나는 ' + pickedName + ' 픽! 너는? · pick-tagon.com'
                : data.f1.name + ' vs ' + data.f2.name + ' — 너는 누구? · pick-tagon.com';

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try { await navigator.share({ files: [file], text: shareText, title: 'PICK-TAGON' }); resolve(); return; }
                catch(e) { if (e.name === 'AbortError') { resolve(); return; } }
            }
            if (navigator.share) {
                try { await navigator.share({ text: shareText, url: 'https://pick-tagon.com/', title: 'PICK-TAGON' }); resolve(); return; }
                catch(e) { if (e.name === 'AbortError') { resolve(); return; } }
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
        console.warn('[MatchCard] error:', err);
        if (typeof showToast === 'function') showToast('⚠️ 공유 중 오류가 발생했습니다');
    });
}
