/* ==============================
   YOUTUBE & NEWS TAB LAYER
   (extracted from index.html – global functions, no import/export)
   의존성: state.js (ytVideoCache, ytMetaCache, activeYoutubeCardIdx, currentNewsCat)
           data/constants.js (YOUTUBE_CARDS, NEWS_CATS)
           utils.js (escapeHtml)
============================== */

    function renderYoutubeSkeletons() {
        return '<div class="col-span-1 lg:col-span-2">' +
            '<p class="oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest mb-4 flex items-center gap-2">' +
            '<span class="animate-spin inline-block w-3 h-3 border border-red-500 border-t-transparent rounded-full"></span> 최신 영상 불러오는 중...</p>' +
            '<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">' +
            Array(6).fill(0).map(function() {
                return '<div class="glass-card rounded-[1.2rem] overflow-hidden animate-pulse">' +
                    '<div class="bg-gray-800 h-36 w-full"></div>' +
                    '<div class="p-3"><div class="h-3 bg-gray-700 rounded w-3/4 mb-2"></div>' +
                    '<div class="h-2 bg-gray-800 rounded w-1/2"></div></div></div>';
            }).join('') +
            '</div></div>';
    }

    function renderYoutubeVideoCard(vid, cardInfo) {
        var thumb = 'https://img.youtube.com/vi/' + vid.id + '/mqdefault.jpg';
        var watchUrl = 'https://www.youtube.com/watch?v=' + vid.id;
        var rawTitle = vid.title ? vid.title : ('YouTube 영상 보기 · ' + cardInfo.title);
        var titleText = escapeHtml(rawTitle.substring(0, 60));
        return '<a href="' + watchUrl + '" target="_blank" rel="noopener noreferrer" ' +
            'class="glass-card rounded-[1.2rem] overflow-hidden hover:border-red-500/40 transition-all duration-300 block group">' +
            '<div class="relative bg-gray-900 overflow-hidden" style="aspect-ratio:16/9">' +
            '<img src="' + thumb + '" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" ' +
            'onerror="this.style.display=\'none\'">' +
            '<div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/40">' +
            '<div class="bg-red-600/90 rounded-full w-10 h-10 flex items-center justify-center text-white text-lg">▶</div></div>' +
            '<div class="absolute top-2 left-2 bg-red-600 text-white text-[8px] px-1.5 py-0.5 rounded oswald-sharp font-black italic uppercase">YouTube</div>' +
            '</div>' +
            '<div class="p-3"><p class="oswald-sharp text-[10px] lg:text-xs font-black italic text-white leading-snug line-clamp-2">' + titleText + '</p>' +
            '</div></a>';
    }

    // videoId별 oEmbed 제목 조회 (ytMetaCache로 중복 fetch 방지)
    async function fetchVideoTitle(videoId) {
        if (ytMetaCache[videoId] !== undefined) return ytMetaCache[videoId];
        try {
            var oEmbedUrl = 'https://www.youtube.com/oembed?url=' +
                encodeURIComponent('https://www.youtube.com/watch?v=' + videoId) +
                '&format=json';
            var res = await fetch(oEmbedUrl);
            if (!res.ok) { ytMetaCache[videoId] = null; return null; }
            var data = await res.json();
            var title = (data && data.title) ? String(data.title) : null;
            ytMetaCache[videoId] = title;
            return title;
        } catch(e) {
            ytMetaCache[videoId] = null;
            return null;
        }
    }

    // r.jina.ai 프록시 텍스트 fetch — AbortController 타임아웃(hang 방지). 미지원 브라우저는 signal 없이 진행.
    async function _ytFetchText(url, timeoutMs) {
        var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var timer = ctrl ? setTimeout(function() { try { ctrl.abort(); } catch (e) {} }, timeoutMs) : null;
        try {
            var res = await fetch(url, { headers: { 'Accept': 'text/plain' }, signal: ctrl ? ctrl.signal : undefined });
            if (!res.ok) throw new Error('http ' + res.status);
            return await res.text();
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    async function fetchYoutubeVideosForQuery(query) {
        if (ytVideoCache[query]) return ytVideoCache[query];
        // EgQIBBABMAE%3D = "This month" + sort by upload date
        var searchUrl = 'https://r.jina.ai/https://www.youtube.com/results?search_query=' + encodeURIComponent(query) + '&sp=EgQIBBABMAE%3D';
        var videoIds = [];
        // [보강] 소스(r.jina.ai→YouTube)가 403/CAPTCHA로 간헐 차단됨(대부분 실패, 가끔 성공).
        //   차단 응답은 빠르게 반환되므로 최대 2회 시도(과도한 재시도 금지). 타임아웃으로 hang 방지.
        for (var attempt = 0; attempt < 2 && videoIds.length === 0; attempt++) {
            try {
                var text = await _ytFetchText(searchUrl, 7000);
                // [보강] videoId 추출 다중 패턴 — r.jina.ai 마크다운(/watch?v=)뿐 아니라 원본 JSON("videoId":"…")도 안전 지원.
                //   순서 유지 + 중복 제거, 최대 6개. 제목 근처 줄 추정은 여전히 금지(오탐 방지).
                var seen = new Set();
                var re = /(?:\/watch\?v=|"videoId":")([A-Za-z0-9_-]{11})/g, mm;
                while ((mm = re.exec(text)) !== null) {
                    if (!seen.has(mm[1])) { seen.add(mm[1]); videoIds.push({ id: mm[1], title: null }); }
                    if (videoIds.length >= 6) break;
                }
            } catch (e) { /* timeout/http/network → 다음 시도, 그래도 실패면 아래에서 [] 반환 */ }
        }
        // 실패(0개) → 캐시하지 않고 [] 반환. 호출측이 YouTube 검색 링크로 fallback(가짜 영상 생성 없음),
        //   다음 진입 시 재시도 가능(간헐 차단 특성상 중요).
        if (videoIds.length === 0) return [];
        // videoId별 oEmbed 제목 병렬 조회(best-effort). 실패해도 title=null → 카드는 ID 기반 썸네일로 정상 표시.
        await Promise.all(videoIds.map(function(v) {
            return fetchVideoTitle(v.id).then(function(title) { v.title = title; });
        }));
        ytVideoCache[query] = videoIds;   // 성공분만 캐시
        return videoIds;
    }

    function goToYoutubeCard(idx) {
        activeYoutubeCardIdx = idx;
        _ytFromShortcut = true;
        currentNewsCat = 'youtube';
        renderNewsCatTabs();
        loadYoutubeTab();
    }

    async function loadYoutubeTab() {
        var grid = document.getElementById('news-grid');
        if (!grid) return;
        grid.innerHTML = renderYoutubeSkeletons();

        // 모든 카테고리 영상 병렬 fetch
        var cardsToLoad = (activeYoutubeCardIdx >= 0 && activeYoutubeCardIdx < YOUTUBE_CARDS.length)
            ? [YOUTUBE_CARDS[activeYoutubeCardIdx]]
            : YOUTUBE_CARDS;

        var results = await Promise.all(cardsToLoad.map(function(c) {
            return fetchYoutubeVideosForQuery(c.query).then(function(vids) {
                return { card: c, videos: vids };
            });
        }));

        if (currentNewsCat !== 'youtube') return; // 탭 전환됐으면 무시

        var html = results.map(function(r) {
            var c = r.card;
            var vids = r.videos;
            var sectionClass = 'mb-8';
            var headerHtml = '<div class="flex items-center gap-2 mb-3">' +
                '<span class="text-xl">' + c.icon + '</span>' +
                '<h4 class="oswald-sharp text-sm font-black italic text-white uppercase tracking-tight">' + c.title + '</h4>' +
                '</div>';

            if (vids.length === 0) {
                // 스크래핑 실패 시 fallback: YouTube 검색 링크
                var ytUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(c.query) + '&sp=EgQIBBABMAE%3D';
                return '<div class="' + sectionClass + '">' + headerHtml +
                    '<a href="' + ytUrl + '" target="_blank" rel="noopener" ' +
                    'class="glass-card rounded-xl p-4 flex items-center gap-3 hover:border-red-500/30 transition-all bg-gradient-to-r ' + c.color + '">' +
                    '<span class="text-2xl">🔍</span>' +
                    '<div><p class="oswald-sharp text-xs font-black italic text-white uppercase">YouTube에서 검색</p>' +
                    '<p class="text-[9px] text-gray-400">' + escapeHtml(c.query) + '</p></div>' +
                    '<span class="ml-auto text-red-400 text-lg">→</span></a></div>';
            }

            return '<div class="' + sectionClass + '">' + headerHtml +
                '<div class="grid grid-cols-2 md:grid-cols-3 gap-3">' +
                vids.map(function(vid) { return renderYoutubeVideoCard(vid, c); }).join('') +
                '</div></div>';
        }).join('');

        // 테마 스위처 (숏컷에서 온 경우가 아닐 때 → YouTube 탭 진입)
        var themeSwitcher = '';
        if (!_ytFromShortcut && activeYoutubeCardIdx >= 0) {
            themeSwitcher = '<div class="flex gap-2 flex-wrap mb-5">' +
                YOUTUBE_CARDS.map(function(c, i) {
                    var isActive = i === activeYoutubeCardIdx;
                    return '<button onclick="activeYoutubeCardIdx=' + i + ';loadYoutubeTab()" ' +
                        'class="oswald-sharp flex-shrink-0 text-[11px] font-black italic uppercase tracking-widest px-3 py-2 rounded-xl border transition-all ' +
                        (isActive ? 'bg-red-600/20 border-red-500/50 text-white' : 'border-white/10 text-gray-500 hover:text-white') + '">' +
                        c.icon + ' ' + c.title + '</button>';
                }).join('') +
                '</div>';
        }

        // 뒤로 버튼 (숏컷에서 온 경우에만 표시)
        var backBtn = '';
        if (_ytFromShortcut) {
            backBtn = '<div class="mb-5"><button onclick="_ytFromShortcut=false;activeYoutubeCardIdx=0;loadYoutubeTab()" ' +
                'class="oswald-sharp text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/30 px-4 py-2 rounded-xl italic uppercase tracking-widest transition">← 전체 보기</button></div>';
        }
        grid.innerHTML = backBtn + themeSwitcher + html;
    }

    function renderNewsCatTabs() {
        var tabs = document.getElementById('news-cat-tabs');
        if (!tabs) return;
        // 시각 개선: pill 세그먼트. 활성=레드 필 + 흰 텍스트, 비활성=은은한 보더 + hover 상승.
        tabs.innerHTML = NEWS_CATS.map(function(c) {
            var active = currentNewsCat === c.id;
            return '<button onclick="setNewsCat(\'' + c.id + '\')" aria-pressed="' + (active ? 'true' : 'false') + '" ' +
                'class="oswald-sharp flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-black italic text-[11px] uppercase tracking-widest transition-all border ' +
                (active
                    ? 'bg-ufcRed border-ufcRed text-white shadow-[0_4px_16px_rgba(225,6,0,0.35)]'
                    : 'bg-white/[0.02] border-white/10 text-gray-500 hover:text-white hover:border-white/25') + '">' +
                '<span>' + c.icon + '</span><span>' + c.label + '</span></button>';
        }).join('');
    }

    function setNewsCat(catId) {
        currentNewsCat = catId;
        renderNewsCatTabs();
        if (catId === 'youtube') {
            activeYoutubeCardIdx = 0; // 첫 번째 테마만 로드 (lazy)
            _ytFromShortcut = false;
            loadYoutubeTab();
        } else {
            renderNewsGrid();
        }
    }
