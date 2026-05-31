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
    var GOLD   = '#E8B23A';
    var WHITE  = '#f4f4f5';
    var MUTED  = '#9a9aa2';
    var MUTED2 = '#6a6a72';
    var F_BLK  = '"Oswald","Pretendard","Apple SD Gothic Neo",Arial,sans-serif';
    var F_BODY = '"Pretendard","Oswald","Apple SD Gothic Neo",Arial,sans-serif';
    var F_MONO = '"Space Mono","Courier New",monospace';
    var PAD    = 72;

    // 1. 배경: 어두운 기반 + diagonal clash
    ctx.fillStyle = '#070707';
    ctx.fillRect(0, 0, W, H);

    // 왼쪽 레드 radial glow
    var gR = ctx.createRadialGradient(-W*0.05, H*0.38, 0, -W*0.05, H*0.38, W*0.95);
    gR.addColorStop(0, 'rgba(225,20,20,0.55)');
    gR.addColorStop(0.5, 'rgba(225,20,20,0.0)');
    ctx.fillStyle = gR; ctx.fillRect(0, 0, W, H);

    // 오른쪽 블루 radial glow
    var gB = ctx.createRadialGradient(W*1.05, H*0.38, 0, W*1.05, H*0.38, W*0.95);
    gB.addColorStop(0, 'rgba(47,109,246,0.50)');
    gB.addColorStop(0.5, 'rgba(47,109,246,0.0)');
    ctx.fillStyle = gB; ctx.fillRect(0, 0, W, H);

    // diagonal linear overlay
    var gD = ctx.createLinearGradient(0, 0, W, H);
    gD.addColorStop(0,    'rgba(225,20,20,0.16)');
    gD.addColorStop(0.4,  'rgba(225,20,20,0.0)');
    gD.addColorStop(0.6,  'rgba(47,109,246,0.0)');
    gD.addColorStop(1,    'rgba(47,109,246,0.16)');
    ctx.fillStyle = gD; ctx.fillRect(0, 0, W, H);

    // 비네팅
    var gV = ctx.createRadialGradient(W/2, H*0.45, W*0.3, W/2, H*0.45, W*0.85);
    gV.addColorStop(0, 'rgba(0,0,0,0)');
    gV.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = gV; ctx.fillRect(0, 0, W, H);

    // 2. 중앙 분리 seam (약간 기울어진 반투명 선)
    ctx.save();
    ctx.translate(W/2, H/2);
    ctx.rotate(8 * Math.PI / 180);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.filter = 'blur(0.4px)';
    ctx.beginPath(); ctx.moveTo(0, -H*0.7); ctx.lineTo(0, H*0.7);
    ctx.stroke();
    ctx.filter = 'none';
    ctx.restore();

    // 3. 옥타곤 데코 (중앙, 연하게)
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    _scOctagon(ctx, W/2, H*0.45, W*0.44, Math.PI/8); ctx.stroke();
    ctx.restore();

    // 4. 테두리 프레임
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
    var fr = 24, rc = 20;
    ctx.beginPath();
    ctx.moveTo(fr+rc, fr); ctx.lineTo(W-fr-rc, fr);
    ctx.arcTo(W-fr, fr, W-fr, fr+rc, rc);
    ctx.lineTo(W-fr, H-fr-rc);
    ctx.arcTo(W-fr, H-fr, W-fr-rc, H-fr, rc);
    ctx.lineTo(fr+rc, H-fr);
    ctx.arcTo(fr, H-fr, fr, H-fr-rc, rc);
    ctx.lineTo(fr, fr+rc);
    ctx.arcTo(fr, fr, fr+rc, fr, rc);
    ctx.closePath(); ctx.stroke();

    // 5. 로고 (옥타곤+체크 + PICK-TAGON)
    var logoY = 96;
    // 옥타곤 outline
    ctx.save();
    ctx.strokeStyle = RED; ctx.lineWidth = 3;
    _scOctagon(ctx, PAD + 18, logoY, 18, Math.PI/8); ctx.stroke();
    // 체크마크
    var cx = PAD + 18, cy = logoY, r = 18;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - r*0.45, cy + r*0.05);
    ctx.lineTo(cx - r*0.05, cy + r*0.50);
    ctx.lineTo(cx + r*0.55, cy - r*0.45);
    ctx.stroke();
    ctx.restore();
    ctx.font = '600 38px ' + F_BLK;
    ctx.fillStyle = WHITE; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText('PICK-TAGON', PAD + 46, logoY);

    // 이벤트명 우측 (없으면 'UFC & MMA PICK GAME')
    var evText = (data.event && data.event !== 'Pick-tagon' && data.event.length > 0)
        ? data.event : 'UFC & MMA PICK GAME';
    if (evText.length > 24) evText = evText.slice(0, 23) + '…';
    ctx.font = '400 19px ' + F_MONO;
    ctx.fillStyle = MUTED2; ctx.textAlign = 'right';
    ctx.fillText(evText.toUpperCase(), W - PAD, logoY);
    ctx.textAlign = 'left';

    // 헤더 구분선
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, 126); ctx.lineTo(W-PAD, 126); ctx.stroke();

    // 6. 체급/라운드 라벨 (중앙)
    var divLabel = _scDivisionLabel(data.division);
    var wLabel = divLabel + (divLabel ? ' · ' : '') + data.rounds + 'R';
    ctx.font = '400 22px ' + F_MONO;
    ctx.fillStyle = MUTED2; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(wLabel.toUpperCase(), W/2, 178);
    ctx.textAlign = 'left';

    // 7. 선수명 대결 구도
    var midY = 370; // 중앙 Y 기준

    // 선수명 폰트 크기 자동 조정 (최대 너비 = 카드 절반 - PAD - VS배지 절반)
    var maxNameW = W/2 - PAD - 72;

    function fitFighterName(name, maxPx, maxFontSize) {
        var size = maxFontSize;
        ctx.font = '600 ' + size + 'px ' + F_BLK;
        while (ctx.measureText(name).width > maxPx && size > 32) {
            size -= 4;
            ctx.font = '600 ' + size + 'px ' + F_BLK;
        }
        return size;
    }

    // F1 (왼쪽, 빨간)
    var f1Name = (data.f1 && data.f1.name) ? data.f1.name : '?';
    var f1Parts = f1Name.split(' ');
    var f1Last  = f1Parts[f1Parts.length - 1];
    var f1First = f1Parts.slice(0, -1).join(' ');
    var f1Size  = fitFighterName(f1Last, maxNameW, 88);

    // F2 (오른쪽, 파란)
    var f2Name = (data.f2 && data.f2.name) ? data.f2.name : '?';
    var f2Parts = f2Name.split(' ');
    var f2Last  = f2Parts[f2Parts.length - 1];
    var f2First = f2Parts.slice(0, -1).join(' ');
    var f2Size  = fitFighterName(f2Last, maxNameW, 88);

    ctx.textBaseline = 'alphabetic';

    // F1 이름 (오른쪽 정렬, 왼쪽 절반)
    var f1X = W/2 - 68; // VS 배지 왼쪽 경계
    if (f1First) {
        ctx.font = '400 28px ' + F_BLK;
        ctx.fillStyle = 'rgba(244,244,245,0.7)';
        ctx.textAlign = 'right';
        ctx.fillText(f1First.toUpperCase(), f1X, midY - f1Size * 0.12 - 10);
    }
    ctx.font = '600 ' + f1Size + 'px ' + F_BLK;
    ctx.fillStyle = WHITE;
    ctx.shadowColor = 'rgba(225,20,20,0.45)';
    ctx.shadowBlur = 24;
    ctx.textAlign = 'right';
    ctx.fillText(f1Last.toUpperCase(), f1X, midY);
    ctx.shadowBlur = 0;

    // F1 전적
    if (data.f1 && data.f1.record) {
        ctx.font = '400 18px ' + F_MONO;
        ctx.fillStyle = 'rgba(225,20,20,0.70)';
        ctx.textAlign = 'right';
        ctx.fillText(data.f1.record, f1X, midY + 28);
    }

    // F2 이름 (왼쪽 정렬, 오른쪽 절반)
    var f2X = W/2 + 68;
    if (f2First) {
        ctx.font = '400 28px ' + F_BLK;
        ctx.fillStyle = 'rgba(244,244,245,0.7)';
        ctx.textAlign = 'left';
        ctx.fillText(f2First.toUpperCase(), f2X, midY - f2Size * 0.12 - 10);
    }
    ctx.font = '600 ' + f2Size + 'px ' + F_BLK;
    ctx.fillStyle = WHITE;
    ctx.shadowColor = 'rgba(47,109,246,0.45)';
    ctx.shadowBlur = 24;
    ctx.textAlign = 'left';
    ctx.fillText(f2Last.toUpperCase(), f2X, midY);
    ctx.shadowBlur = 0;

    if (data.f2 && data.f2.record) {
        ctx.font = '400 18px ' + F_MONO;
        ctx.fillStyle = 'rgba(47,109,246,0.70)';
        ctx.textAlign = 'left';
        ctx.fillText(data.f2.record, f2X, midY + 28);
    }

    // VS 배지 (중앙)
    var vsR = 56;
    ctx.save();
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath(); ctx.arc(W/2, midY - vsR*0.3, vsR, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = RED; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W/2, midY - vsR*0.3, vsR, 0, Math.PI*2); ctx.stroke();
    ctx.shadowColor = 'rgba(225,20,20,0.55)'; ctx.shadowBlur = 22;
    ctx.strokeStyle = RED; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W/2, midY - vsR*0.3, vsR, 0, Math.PI*2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = '700 36px ' + F_BLK;
    ctx.fillStyle = WHITE; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('VS', W/2, midY - vsR*0.3);
    ctx.restore();

    // 8. 커뮤니티 픽 바
    var barY = midY + 80;
    ctx.font = '400 18px ' + F_MONO;
    ctx.fillStyle = MUTED2; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('현재 팬 여론', PAD, barY);
    // LIVE dot
    ctx.fillStyle = RED;
    ctx.beginPath(); ctx.arc(PAD + 120, barY - 5, 5, 0, Math.PI*2); ctx.fill();
    ctx.font = '400 16px ' + F_MONO;
    ctx.fillStyle = '#ff3b3b'; ctx.textAlign = 'left';
    ctx.fillText('LIVE', PAD + 132, barY);

    var barH   = 52, barW = W - PAD*2;
    var barTop = barY + 12;
    var pct0   = 50, pct1 = 50;
    if (data.pickCounts) {
        var tot = data.pickCounts.c0 + data.pickCounts.c1;
        if (tot > 0) {
            pct0 = Math.round(data.pickCounts.c0 / tot * 100);
            pct1 = 100 - pct0;
        }
    }

    // 빨간 쪽 bar
    var gBarR = ctx.createLinearGradient(PAD, 0, PAD + barW*(pct0/100), 0);
    gBarR.addColorStop(0, '#b81010'); gBarR.addColorStop(1, '#e11414');
    ctx.fillStyle = gBarR;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(PAD, barTop, barW*(pct0/100), barH, [8, 0, 0, 8]) :
    (function () { ctx.moveTo(PAD+8, barTop); ctx.lineTo(PAD+barW*(pct0/100), barTop); ctx.lineTo(PAD+barW*(pct0/100), barTop+barH); ctx.lineTo(PAD+8, barTop+barH); ctx.arcTo(PAD, barTop+barH, PAD, barTop+barH-8, 8); ctx.lineTo(PAD, barTop+8); ctx.arcTo(PAD, barTop, PAD+8, barTop, 8); ctx.closePath(); })();
    ctx.fill();

    // 파란 쪽 bar
    var gBarB = ctx.createLinearGradient(W-PAD-barW*(pct1/100), 0, W-PAD, 0);
    gBarB.addColorStop(0, '#2f6df6'); gBarB.addColorStop(1, '#1d4aa8');
    ctx.fillStyle = gBarB;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(PAD+barW*(pct0/100), barTop, barW*(pct1/100), barH, [0, 8, 8, 0]) :
    (function () { ctx.moveTo(PAD+barW*(pct0/100), barTop); ctx.lineTo(W-PAD-8, barTop); ctx.arcTo(W-PAD, barTop, W-PAD, barTop+8, 8); ctx.lineTo(W-PAD, barTop+barH-8); ctx.arcTo(W-PAD, barTop+barH, W-PAD-8, barTop+barH, 8); ctx.lineTo(PAD+barW*(pct0/100), barTop+barH); ctx.closePath(); })();
    ctx.fill();

    // bar 위에 텍스트
    ctx.font = '700 26px ' + F_BLK;
    ctx.fillStyle = WHITE; ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(pct0 + '%', PAD + 14, barTop + barH/2);
    ctx.textAlign = 'right';
    ctx.fillText(pct1 + '%', W - PAD - 14, barTop + barH/2);

    // bar 테두리
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(PAD, barTop, barW, barH, 8);
    else { ctx.moveTo(PAD+8, barTop); ctx.lineTo(W-PAD-8, barTop); ctx.arcTo(W-PAD, barTop, W-PAD, barTop+8, 8); ctx.lineTo(W-PAD, barTop+barH-8); ctx.arcTo(W-PAD, barTop+barH, W-PAD-8, barTop+barH, 8); ctx.lineTo(PAD+8, barTop+barH); ctx.arcTo(PAD, barTop+barH, PAD, barTop+barH-8, 8); ctx.lineTo(PAD, barTop+8); ctx.arcTo(PAD, barTop, PAD+8, barTop, 8); ctx.closePath(); }
    ctx.stroke();

    // 9. Hook 문구
    var hookY = barTop + barH + 74;
    var hookText, subText;
    if (data.userPick === 'f1') {
        hookText = '나는 ' + f1Last + ' 픽';
        subText  = '반박은 픽으로.';
    } else if (data.userPick === 'f2') {
        hookText = '나는 ' + f2Last + ' 픽';
        subText  = '반박은 픽으로.';
    } else {
        hookText = '이 경기, 누구 보세요?';
        subText  = '';
    }

    ctx.font = '700 64px ' + F_BLK;
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    // 너무 길면 크기 줄이기
    while (ctx.measureText(hookText).width > W - PAD*2 && parseInt(ctx.font) > 40) {
        var curSize = parseInt(ctx.font);
        ctx.font = '700 ' + (curSize - 4) + 'px ' + F_BLK;
    }
    ctx.fillText(hookText, W/2, hookY);

    if (subText) {
        ctx.font = '500 30px ' + F_BODY;
        ctx.fillStyle = MUTED;
        ctx.fillText(subText, W/2, hookY + 46);
    }

    // 10. 하단 CTA
    var fY = H - 68;
    // red gradient accent line
    var gLine = ctx.createLinearGradient(PAD, 0, W-PAD, 0);
    gLine.addColorStop(0, 'rgba(225,20,20,0)');
    gLine.addColorStop(0.3, RED);
    gLine.addColorStop(0.7, RED);
    gLine.addColorStop(1, 'rgba(225,20,20,0)');
    ctx.fillStyle = gLine;
    ctx.fillRect(PAD, fY - 28, W - PAD*2, 3);

    var ctaText = data.userPick ? '너는? · pick-tagon.com' : 'pick-tagon.com에서 픽하기';
    ctx.font = '700 30px ' + F_BODY;
    ctx.fillStyle = WHITE; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(ctaText, W/2, fY);
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
