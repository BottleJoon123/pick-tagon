/* format-helpers.js — Extracted from index.html inline script (Phase 9D-5).
   Pure news filter helpers. Depend only on NEWS_CATEGORY_KEYWORDS / MMA_NEWS_KEYWORDS
   from data/constants.js (loaded before this file). No DOM / state / Supabase deps. */

function matchesCategory(newsItem) {
    var kws = NEWS_CATEGORY_KEYWORDS[newsItem.category];
    if (!kws) return true;
    var haystack = (newsItem.title + ' ' + (newsItem.summary || '')).toLowerCase();
    return kws.some(function(kw) { return haystack.indexOf(kw) >= 0; });
}

function isMMARelated(newsItem) {
    var hay = (newsItem.title + ' ' + (newsItem.source || '')).toLowerCase();
    return MMA_NEWS_KEYWORDS.some(function(kw) { return hay.indexOf(kw) >= 0; });
}
