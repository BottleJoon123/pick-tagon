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
    canvas.width  = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');

    var RED    = '#E10600';
    var BLUE   = '#2563eb';
    var WHITE  = '#f4f4f5';
    var MUTED  = '#9a9aa2';
    var MUTED2 = '#67676e';

    var F_BLK  = '"Oswald","Pretendard","Apple SD Gothic Neo",Arial,sans-serif';
    var F_BODY = '"Pretendard","Oswald","Apple SD Gothic Neo",Arial,sans-serif';
    var F_MONO = '"Space Mono","Courier New",monospace';

    var PAD = 80;
    var midX = W / 2;

    // 1. 배경
    ctx.fillStyle = '#08090b';
    ctx.fillRect(0, 0, W, H);

    // 2. 왼쪽 빨강 glow (Red 선수)
    var gL = ctx.createRadialGradient(W * 0.18, H * 0.42, 0, W * 0.18, H * 0.42, 620);
    gL.addColorStop(0, 'rgba(225,6,0,0.30)');
    gL.addColorStop(1, 'rgba(225,6,0,0)');
    ctx.fillStyle = gL;
    ctx.fillRect(0, 0, W, H);

    // 3. 오른쪽 파랑 glow (Blue 선수)
    var gR = ctx.createRadialGradient(W * 0.82, H * 0.42, 0, W * 0.82, H * 0.42, 620);
    gR.addColorStop(0, 'rgba(37,99,235,0.28)');
    gR.addColorStop(1, 'rgba(37,99,235,0)');
    ctx.fillStyle = gR;
    ctx.fillRect(0, 0, W, H);

    // 4. 옥타곤 데코
    ctx.save();
    ctx.strokeStyle = 'rgba(225,6,0,0.16)'; ctx.lineWidth = 2;
    _scOctagon(ctx, midX, H / 2, W * 0.60, Math.PI / 8); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1.5;
    _scOctagon(ctx, midX, H / 2, W * 0.73, Math.PI / 8); ctx.stroke();
    ctx.restore();

    // 5. 테두리 프레임
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

    // 6. 헤더 — 로고 + 이벤트명
    var logoCy = 100, logoR = 22;
    var logoCx = PAD + logoR;
    _scDrawLogo(ctx, logoCx, logoCy, logoR, F_BLK);

    var hasEvent = !!data.event && data.event !== 'Pick-tagon';
    var evRight = hasEvent
        ? ((data.event.length > 26) ? data.event.slice(0, 25) + '…' : data.event).toUpperCase()
        : 'UFC & MMA PICK GAME';
    ctx.font = '400 20px ' + F_MONO;
    ctx.fillStyle = MUTED2;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(evRight, W - PAD, logoCy);
    ctx.textAlign = 'left';

    // 헤더 구분선
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, 130); ctx.lineTo(W - PAD, 130); ctx.stroke();

    // 7. 체급/라운드 라벨
    var divLabel = (data.division || '').toUpperCase();
    if (divLabel.length > 32) divLabel = divLabel.slice(0, 31) + '…';
    var divText = divLabel ? (divLabel + ' · ' + data.rounds + 'R') : (data.rounds + 'R');
    ctx.font = '400 22px ' + F_MONO;
    ctx.fillStyle = MUTED;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(divText, midX, 200);

    // 8. 중앙 세로 분리선 (얇은 빨강)
    var sepTop = 250, sepBot = 620;
    var gSep = ctx.createLinearGradient(0, sepTop, 0, sepBot);
    gSep.addColorStop(0,   'rgba(225,6,0,0)');
    gSep.addColorStop(0.5, 'rgba(225,6,0,0.55)');
    gSep.addColorStop(1,   'rgba(225,6,0,0)');
    ctx.strokeStyle = gSep; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(midX, sepTop); ctx.lineTo(midX, sepBot); ctx.stroke();

    // 9. 선수 영역
    var halfMax = midX - PAD - 30; // 각 절반 영역 최대 폭
    var leftCx  = PAD + halfMax / 2 + 10;
    var rightCx = midX + 30 + halfMax / 2;
    var nameY   = 380;

    function drawFighter(f, cx, color) {
        var name = (f && f.name) ? f.name : '—';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        _scFitFont(ctx, name, '700', 64, F_BLK, halfMax, 30);
        ctx.fillStyle = WHITE;
        ctx.fillText(name, cx, nameY);

        var sub = [];
        if (f && f.record)  sub.push(f.record);
        if (f && f.country) sub.push(f.country);
        if (sub.length) {
            ctx.font = '400 26px ' + F_MONO;
            ctx.fillStyle = color;
            ctx.fillText(sub.join('  ·  '), cx, nameY + 56);
        }
    }
    drawFighter(data.f1, leftCx, '#ff5a52');
    drawFighter(data.f2, rightCx, '#5b8cff');

    // 10. 중앙 VS 배지
    var vsCy = nameY;
    ctx.save();
    ctx.beginPath();
    ctx.arc(midX, vsCy, 42, 0, Math.PI * 2);
    ctx.fillStyle = '#08090b';
    ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = RED;
    ctx.stroke();
    ctx.restore();
    ctx.font = '700 34px ' + F_BLK;
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('VS', midX, vsCy + 1);

    // 11. 커뮤니티 픽 비율 바
    var barY = 500;
    var pc = data.pickCounts;
    if (pc && (Number(pc.c0) > 0 || Number(pc.c1) > 0)) {
        var c0 = Number(pc.c0) || 0, c1 = Number(pc.c1) || 0;
        var tot = c0 + c1;
        var p0 = Math.round(c0 / tot * 100);
        var p1 = 100 - p0;

        ctx.font = '400 18px ' + F_MONO;
        ctx.fillStyle = MUTED2;
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillText('COMMUNITY PICKS', midX, barY - 14);

        var barX = PAD, barW = W - PAD * 2, barH = 26;
        var w0 = Math.round(barW * p0 / 100);
        // 좌(red)
        ctx.fillStyle = RED;
        _scRoundRectLeft(ctx, barX, barY, w0, barH, 13);
        // 우(blue)
        ctx.fillStyle = BLUE;
        _scRoundRectRight(ctx, barX + w0, barY, barW - w0, barH, 13);

        ctx.font = '700 22px ' + F_BLK;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = WHITE;
        ctx.textAlign = 'left';
        ctx.fillText(p0 + '%', barX + 6, barY + barH / 2);
        ctx.textAlign = 'right';
        ctx.fillText(p1 + '%', barX + barW - 6, barY + barH / 2);
        ctx.textAlign = 'left';
    }

    // 12. 핵심 문구 영역
    var msgY = 720;
    var pickedName = data.userPick === 'f1' ? (data.f1 && data.f1.name)
                   : data.userPick === 'f2' ? (data.f2 && data.f2.name)
                   : null;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (pickedName) {
        var msg = '나는 ' + pickedName + ' 픽 ✓';
        _scFitFont(ctx, msg, '700', 52, F_BODY, W - PAD * 2, 30);
        ctx.fillStyle = (data.userPick === 'f1') ? '#ff5a52' : '#5b8cff';
        ctx.fillText(msg, midX, msgY);

        ctx.font = '600 30px ' + F_BODY;
        ctx.fillStyle = MUTED;
        ctx.fillText('너도 한 수?', midX, msgY + 64);
    } else {
        ctx.font = '700 52px ' + F_BODY;
        ctx.fillStyle = WHITE;
        ctx.fillText('이 경기, 누구 보세요?', midX, msgY);

        ctx.font = '600 30px ' + F_BODY;
        ctx.fillStyle = MUTED;
        ctx.fillText('너는 누구?', midX, msgY + 64);
    }

    // 13. 하단 CTA
    var fY = H - 70;
    var ctaText = pickedName
        ? '너는 누구? · pick-tagon.com'
        : 'pick-tagon.com에서 픽하기';
    ctx.font = '700 34px ' + F_BODY;
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ctaText, midX, fY);

    // 하단 빨간 강조선 (gradient)
    var lineY = H - fr - 4;
    var lineX = fr + r;
    var lineW = (W - fr - r) - lineX;
    var gBar = ctx.createLinearGradient(lineX, 0, lineX + lineW, 0);
    gBar.addColorStop(0,   'rgba(225,6,0,0)');
    gBar.addColorStop(0.5, 'rgba(225,6,0,0.9)');
    gBar.addColorStop(1,   'rgba(225,6,0,0)');
    ctx.fillStyle = gBar;
    ctx.fillRect(lineX, lineY, lineW, 4);
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
