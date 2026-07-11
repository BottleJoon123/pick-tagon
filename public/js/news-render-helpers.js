/* news-render-helpers.js — Extracted from index.html inline script (Phase 9D-7).
   News card HTML generation helpers. Depend on:
   - NEWS_CATEGORY_BAR_CLASS, NEWS_CATEGORY_BADGE_CLASS, NEWS_CATEGORY_LABEL,
     YOUTUBE_CARDS — from data/constants.js
   - cachedNews — from state.js (var, window-accessible)
   - escapeHtml — from utils.js
   - getNewsCategoryImg — from home.js (checked with typeof guard)
   No DOM manipulation, no Supabase, no auth deps. */

function buildNewsCardHtml(n, i) {
    var bar = NEWS_CATEGORY_BAR_CLASS[n.category] || 'bg-white/10';
    var badge = NEWS_CATEGORY_BADGE_CLASS[n.category] || 'bg-white/10 text-white';
    var lbl = NEWS_CATEGORY_LABEL[n.category] || '뉴스';
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
        '<div class="flex items-center justify-between mb-2">' +
        '<span class="oswald-sharp text-[9px] text-gray-600 italic">' + (n.date || '') + '</span>' +
        '</div>' +
        '<h4 class="oswald-sharp text-sm lg:text-base font-black italic text-white uppercase tracking-tight leading-snug mb-3">' + escapeHtml(n.title) + '</h4>' +
        '<div class="flex items-center justify-between mt-2">' +
        (n.source ? '<p class="oswald-sharp text-[9px] text-gray-600 italic uppercase">출처: ' + escapeHtml(n.source) + '</p>' : '<span></span>') +
        '<span class="oswald-sharp text-[9px] text-ufcRed/60 italic uppercase">원문 →</span>' +
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
    return '<div class="col-span-1 lg:col-span-2 glass-card rounded-[1.5rem] overflow-hidden hover:border-ufcRed/30 transition-all duration-500 cursor-pointer flex flex-col lg:flex-row" ' + cardClick + '>' +
        '<div class="relative overflow-hidden lg:w-[52%] flex-shrink-0" style="min-height:200px">' +
        '<img src="' + img + '" class="w-full h-full object-cover hover:scale-105 transition-transform duration-500" style="min-height:200px" onerror="this.src=\'' + fbUrl + '\'">' +
        '<div class="absolute inset-0 pointer-events-none" style="background:linear-gradient(to top,rgba(0,0,0,0.5) 0%,transparent 55%)"></div>' +
        '<div class="nc-cat-bar absolute top-0 left-0 right-0 h-1 ' + bar + '"></div>' +
        '<span class="absolute top-3 left-3 oswald-sharp text-[10px] px-2.5 py-1 rounded-lg font-black italic uppercase border border-white/10 ' + badge + '">' + lbl + ' 🔥</span>' +
        '</div>' +
        '<div class="p-5 lg:p-7 flex flex-col justify-center lg:w-[48%]">' +
        '<span class="oswald-sharp text-[9px] text-gray-600 italic uppercase mb-2">' + escapeHtml(n.date || '') + (n.source ? ' · ' + escapeHtml(n.source) : '') + '</span>' +
        '<h3 class="oswald-sharp text-lg lg:text-2xl font-black italic text-white uppercase tracking-tight leading-tight mb-3 line-clamp-3">' + escapeHtml(n.title) + '</h3>' +
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
