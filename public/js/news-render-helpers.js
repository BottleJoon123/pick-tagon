/* news-render-helpers.js — Extracted from index.html inline script (Phase 9D-7).
   News card HTML generation helpers. Depend on:
   - NEWS_CATEGORY_BAR_CLASS, NEWS_CATEGORY_BADGE_CLASS, NEWS_CATEGORY_LABEL,
     YOUTUBE_CARDS — from data/constants.js
   - cachedNews — from state.js (var, window-accessible)
   - escapeHtml — from utils.js
   - getNewsCategoryImg — from home.js (checked with typeof guard)
   No DOM manipulation, no Supabase, no auth deps. */

/* ==============================================================
   [뉴스 1.5차] 중복 제거 + 출처/시각 공용 로직 (순수 함수, YouTube와 분리)
   - 실데이터만 사용, 추측 합치기 금지: canonical URL 동일 또는 정규화 제목 완전 동일만 제거.
   - 대표 선택은 결정적(새로고침해도 동일). 반환값은 원본 배열의 부분집합(객체 동일성 유지)
     → cachedNews.indexOf(rep) 기반 클릭/모달/티커 경로 무회귀.
============================================================== */

// URL canonical: URL API 사용. host 소문자·hash 제거·추적 파라미터 제거·trailing slash 정규화.
//   의미 있는 query는 보존. 파싱 실패 시 원문 안전 정규화(hash/trailing slash만).
var _NEWS_TRACKING_PARAM = /^(utm_|fbclid$|gclid$|dclid$|gbraid$|wbraid$|igshid$|mc_eid$|mc_cid$|ref$|ref_src$|_hsenc$|_hsmi$|spm$|yclid$)/i;
function canonicalizeNewsUrl(url) {
    if (!url || typeof url !== 'string') return '';
    var raw = url.trim();
    if (!raw) return '';
    try {
        var u = new URL(raw);
        u.hash = '';
        u.hostname = u.hostname.toLowerCase();
        var kept = [];
        u.searchParams.forEach(function (v, k) { if (!_NEWS_TRACKING_PARAM.test(k)) kept.push([k, v]); });
        var sp = new URLSearchParams();
        kept.forEach(function (p) { sp.append(p[0], p[1]); });
        var qs = sp.toString();
        var pathn = u.pathname.replace(/\/+$/, '');
        if (!pathn) pathn = '/';
        return u.protocol + '//' + u.hostname + (u.port ? ':' + u.port : '') + pathn + (qs ? '?' + qs : '');
    } catch (e) {
        return raw.replace(/#.*$/, '').replace(/\/+$/, '');
    }
}

// 제목 정규화: trim·공백 축소·소문자·일반 구두점 통일만. 매체명 접미사/선수명/숫자/승패 표현은 삭제하지 않음(보수적).
function normalizeNewsTitle(title) {
    if (!title) return '';
    return String(title)
        .replace(/[“”″"']/g, '"')
        .replace(/[–—―−]/g, '-')
        .replace(/[…]/g, '...')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

// 시간값(ms): published_at(신뢰) 우선, 없으면 date('YYYY.MM.DD') 파생. 둘 다 없으면 0.
function _newsTimeVal(n) {
    if (n && n.published_at) { var t = Date.parse(n.published_at); if (!isNaN(t)) return t; }
    if (n && n.date) {
        var p = String(n.date).split('.');
        if (p.length === 3) { var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)); if (!isNaN(d.getTime())) return d.getTime(); }
    }
    return 0;
}

// 대표 우선순위(결정적): 유효 URL > 출처 존재 > 이미지 존재 > 더 긴 제목 > 최신 시각 > (동률이면 first-seen 유지).
function _newsRepBetter(a, b) {
    var au = (a.url && /^https?:/i.test(a.url)) ? 1 : 0, bu = (b.url && /^https?:/i.test(b.url)) ? 1 : 0; if (au !== bu) return au > bu;
    var as = (a.source && String(a.source).trim()) ? 1 : 0, bs = (b.source && String(b.source).trim()) ? 1 : 0; if (as !== bs) return as > bs;
    var ai = a.image_url ? 1 : 0, bi = b.image_url ? 1 : 0; if (ai !== bi) return ai > bi;
    var al = (a.title || '').length, bl = (b.title || '').length; if (al !== bl) return al > bl;
    var at = _newsTimeVal(a), bt = _newsTimeVal(b); if (at !== bt) return at > bt;
    return false;
}

// 명확한 중복만 제거: canonical URL 동일 OR 정규화 제목 완전 동일. 유사도(3순위)는 V1 미적용(과합침 방지).
//   반환은 원본 객체 부분집합(첫 등장 순서 유지). 유사도 후보 수는 _lastNewsDedupeStats 로 노출(표시 안 함).
var _lastNewsDedupeStats = null;
function dedupeNewsList(list) {
    if (!Array.isArray(list) || list.length === 0) { _lastNewsDedupeStats = { input: 0, output: 0, removed: 0 }; return list || []; }
    var urlKeyToGroup = {}, titleKeyToGroup = {}, groups = [];
    for (var i = 0; i < list.length; i++) {
        var n = list[i]; if (!n) continue;
        var cu = canonicalizeNewsUrl(n.url); var uk = cu ? 'u:' + cu : '';
        // 제목 키는 입증된 " - {source}" 접미사를 제거한 핵심 헤드라인 기준(동일 헤드라인 다매체 syndication 병합).
        //   접미사 제거는 각 행의 실제 source 와 정확히 일치할 때만(추측 없음). 핵심 제목이 다르면 병합 안 됨.
        var nt = normalizeNewsTitle(newsDisplayTitle(n)); var tk = nt ? 't:' + nt : '';
        var g = null;
        if (uk && urlKeyToGroup[uk] != null) g = urlKeyToGroup[uk];
        else if (tk && titleKeyToGroup[tk] != null) g = titleKeyToGroup[tk];
        if (g == null) { g = groups.length; groups.push([]); }
        groups[g].push(n);
        if (uk) urlKeyToGroup[uk] = g;
        if (tk) titleKeyToGroup[tk] = g;
    }
    var out = [];
    for (var j = 0; j < groups.length; j++) {
        var items = groups[j], best = items[0];
        for (var k = 1; k < items.length; k++) { if (_newsRepBetter(items[k], best)) best = items[k]; }
        out.push(best);
    }
    _lastNewsDedupeStats = { input: list.length, output: out.length, removed: list.length - out.length };
    return out;
}

// 메모이즈: 같은 cachedNews 배열이면 재계산 없이 공유(티커·featured·목록·검색·정렬이 1회 계산 결과 공유).
var _newsDedupeMemo = { src: null, out: null };
function getDedupedNews(list) {
    if (list === _newsDedupeMemo.src && _newsDedupeMemo.out) return _newsDedupeMemo.out;
    var out = dedupeNewsList(list);
    _newsDedupeMemo.src = list; _newsDedupeMemo.out = out;
    return out;
}

// 표시 시각: 신뢰 가능한 published_at→한국어 상대시간(+절대일자 title). rel/abs 둘 다 없으면 빈 값(깨진 구분자 방지).
function formatNewsTime(n) {
    var t = _newsTimeVal(n);
    if (!t) return { rel: '', abs: '' };
    var d = new Date(t);
    var abs = d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
    var diff = Date.now() - t;
    var rel;
    if (diff < 0) rel = abs;
    else if (diff < 60000) rel = '방금 전';
    else if (diff < 3600000) rel = Math.floor(diff / 60000) + '분 전';
    else if (diff < 86400000) rel = Math.floor(diff / 3600000) + '시간 전';
    else if (diff < 172800000) rel = '어제';
    else if (diff < 604800000) rel = Math.floor(diff / 86400000) + '일 전';
    else rel = abs;
    return { rel: rel, abs: abs };
}

// 표시 제목: 출처를 별도 노출하므로 " - {source}" 접미사가 정확히 일치할 때만 제거(입증된 Google뉴스 패턴). 그 외 원문 유지.
function newsDisplayTitle(n) {
    var t = (n && n.title) ? String(n.title) : '';
    var s = (n && n.source) ? String(n.source).trim() : '';
    if (s) {
        var suf = ' - ' + s;
        if (t.length > suf.length && t.slice(-suf.length) === suf) t = t.slice(0, -suf.length).trim();
    }
    return t;
}

if (typeof window !== 'undefined') {
    window.getDedupedNews = getDedupedNews;
    window.dedupeNewsList = dedupeNewsList;
    window.canonicalizeNewsUrl = canonicalizeNewsUrl;
    window.normalizeNewsTitle = normalizeNewsTitle;
    window.formatNewsTime = formatNewsTime;
    window.newsDisplayTitle = newsDisplayTitle;
}

function buildNewsCardHtml(n, i) {
    var bar = NEWS_CATEGORY_BAR_CLASS[n.category] || 'bg-white/10';
    var badge = NEWS_CATEGORY_BADGE_CLASS[n.category] || 'bg-white/10 text-white';
    var lbl = NEWS_CATEGORY_LABEL[n.category] || '뉴스';
    var ft = formatNewsTime(n);
    var src = (n.source ? String(n.source).trim() : '');
    var realIdx = cachedNews.indexOf(n);
    var cardClick = (n.url && n.url.startsWith('http'))
        ? 'onclick="window.open(\'' + n.url + '\',\'_blank\')"'
        : 'onclick="openNewsDetail(' + realIdx + ')"';
    var newsImg = n.image_url || (typeof getNewsCategoryImg === 'function'
        ? getNewsCategoryImg(n.category, i)
        : (typeof _NEWS_FALLBACK_POOL !== 'undefined' ? _NEWS_FALLBACK_POOL[i % _NEWS_FALLBACK_POOL.length] : 'https://images.unsplash.com/photo-1552072092-7f9b8d63efcb?auto=format&fit=crop&q=80&w=600'));
    var fbUrl = typeof _NEWS_FALLBACK_POOL !== 'undefined'
        ? _NEWS_FALLBACK_POOL[(i + 1) % _NEWS_FALLBACK_POOL.length]
        : 'https://images.unsplash.com/photo-1552072092-7f9b8d63efcb?auto=format&fit=crop&q=80&w=600';
    return '<div class="glass-card rounded-[1.5rem] overflow-hidden hover:border-ufcRed/30 transition-all duration-500 cursor-pointer" ' + cardClick + '>' +
        '<div class="relative overflow-hidden" style="height:150px">' +
        '<img src="' + newsImg + '" class="w-full h-full object-cover hover:scale-105 transition-transform duration-500" onerror="this.src=\'' + fbUrl + '\'">' +
        '<div class="absolute inset-0 pointer-events-none" style="background:linear-gradient(to top,rgba(0,0,0,0.65) 0%,transparent 60%)"></div>' +
        '<div class="nc-cat-bar absolute top-0 left-0 right-0 h-1 ' + bar + '"></div>' +
        '<span class="absolute top-3 left-3 oswald-sharp text-[9px] px-2 py-1 rounded-lg font-black italic uppercase border border-white/10 ' + badge + '">' + lbl + (i < 2 ? ' 🔥' : '') + '</span>' +
        '</div>' +
        '<div class="p-4 lg:p-5">' +
        (ft.rel
            ? '<div class="flex items-center justify-between mb-2">' +
              '<span class="oswald-sharp text-[9px] text-gray-500 italic" title="' + escapeHtml(ft.abs) + '">🕒 ' + escapeHtml(ft.rel) + '</span>' +
              '</div>'
            : '') +
        '<h4 class="oswald-sharp text-sm lg:text-base font-black italic text-white uppercase tracking-tight leading-snug mb-3" style="word-break:keep-all">' + escapeHtml(newsDisplayTitle(n)) + '</h4>' +
        '<div class="flex items-center justify-between gap-2 mt-2">' +
        (src ? '<p class="oswald-sharp text-[9px] text-gray-500 italic uppercase truncate min-w-0">출처: ' + escapeHtml(src) + '</p>' : '<span></span>') +
        '<span class="oswald-sharp text-[9px] text-ufcRed/60 italic uppercase flex-shrink-0">원문 →</span>' +
        '</div>' +
        '</div></div>';
}

// [Featured] 전체 탭 최신 1건 대형 카드 — 실데이터만(가짜 메타 없음). 데스크톱 가로(썸네일+본문), 모바일 세로.
//   클릭 동작은 일반 카드와 동일(원문 링크 or openNewsDetail). 그리드 2열을 span.
function buildNewsFeaturedHtml(n) {
    if (!n) return '';
    var bar = NEWS_CATEGORY_BAR_CLASS[n.category] || 'bg-white/10';
    var badge = NEWS_CATEGORY_BADGE_CLASS[n.category] || 'bg-white/10 text-white';
    var lbl = NEWS_CATEGORY_LABEL[n.category] || '뉴스';
    var realIdx = (typeof cachedNews !== 'undefined') ? cachedNews.indexOf(n) : -1;
    var cardClick = (n.url && n.url.startsWith('http'))
        ? 'onclick="window.open(\'' + n.url + '\',\'_blank\')"'
        : 'onclick="openNewsDetail(' + realIdx + ')"';
    var img = n.image_url || (typeof getNewsCategoryImg === 'function' ? getNewsCategoryImg(n.category, 0)
        : (typeof _NEWS_FALLBACK_POOL !== 'undefined' ? _NEWS_FALLBACK_POOL[0] : 'https://images.unsplash.com/photo-1552072092-7f9b8d63efcb?auto=format&fit=crop&q=80&w=800'));
    var fbUrl = (typeof _NEWS_FALLBACK_POOL !== 'undefined') ? _NEWS_FALLBACK_POOL[1]
        : 'https://images.unsplash.com/photo-1552072092-7f9b8d63efcb?auto=format&fit=crop&q=80&w=800';
    var summary = (typeof stripHtmlSummary === 'function') ? (stripHtmlSummary(n.summary) || '') : (n.summary || '');
    var ft = formatNewsTime(n);
    var src = (n.source ? String(n.source).trim() : '');
    var metaParts = [];
    if (ft.rel) metaParts.push('🕒 ' + escapeHtml(ft.rel));
    if (src) metaParts.push(escapeHtml(src));
    var metaLine = metaParts.length
        ? '<span class="oswald-sharp text-[9px] text-gray-500 italic uppercase mb-2" title="' + escapeHtml(ft.abs) + '">' + metaParts.join(' · ') + '</span>'
        : '';
    return '<div class="col-span-1 lg:col-span-2 glass-card rounded-[1.5rem] overflow-hidden hover:border-ufcRed/30 transition-all duration-500 cursor-pointer flex flex-col lg:flex-row" ' + cardClick + '>' +
        '<div class="relative overflow-hidden lg:w-[52%] flex-shrink-0" style="min-height:200px">' +
        '<img src="' + img + '" class="w-full h-full object-cover hover:scale-105 transition-transform duration-500" style="min-height:200px" onerror="this.src=\'' + fbUrl + '\'">' +
        '<div class="absolute inset-0 pointer-events-none" style="background:linear-gradient(to top,rgba(0,0,0,0.5) 0%,transparent 55%)"></div>' +
        '<div class="nc-cat-bar absolute top-0 left-0 right-0 h-1 ' + bar + '"></div>' +
        '<span class="absolute top-3 left-3 oswald-sharp text-[10px] px-2.5 py-1 rounded-lg font-black italic uppercase border border-white/10 ' + badge + '">' + lbl + ' 🔥</span>' +
        '</div>' +
        '<div class="p-5 lg:p-7 flex flex-col justify-center lg:w-[48%]">' +
        metaLine +
        '<h3 class="oswald-sharp text-lg lg:text-2xl font-black italic text-white uppercase tracking-tight leading-tight mb-3 line-clamp-3" style="word-break:keep-all">' + escapeHtml(newsDisplayTitle(n)) + '</h3>' +
        (summary ? '<p class="text-gray-400 text-xs lg:text-sm leading-relaxed line-clamp-3 mb-3">' + escapeHtml(summary) + '</p>' : '') +
        '<span class="oswald-sharp text-[10px] text-ufcRed/70 italic uppercase tracking-widest">자세히 보기 →</span>' +
        '</div></div>';
}

function buildYoutubeShortcutHtml(c, i) {
    return '<button onclick="goToYoutubeCard(' + i + ')" class="glass-card rounded-xl p-3 flex items-center gap-3 hover:border-red-500/30 transition-all text-left">' +
        '<span class="text-xl">' + c.icon + '</span>' +
        '<div><p class="oswald-sharp text-[10px] font-black italic text-white uppercase">' + c.title + '</p>' +
        '<p class="text-[9px] text-gray-500">🎬 영상 보기</p></div></button>';
}
