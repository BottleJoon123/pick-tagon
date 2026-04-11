/* ==============================
   NEWS & TRANSLATION LAYER
   (extracted from index.html – global functions, no import/export)
   의존성: utils.js (escapeHtml, stripHtmlSummary)
============================== */

    var GEMINI_TRANSLATE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=';

    function stripJsonFences(text) {
        // Gemini가 ```json ... ``` 또는 ``` ... ``` 형태로 감싸서 반환하는 경우 처리
        return text
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
    }

    function isEnglishText(text) {
        if (!text) return false;
        // 한글 유니코드 범위(\uAC00-\uD7A3)가 없으면 영문으로 판단
        return !/[\uAC00-\uD7A3]/.test(text);
    }

    async function translateNewsWithGemini(items) {
        var key = localStorage.getItem('picktagon_gemini_key') || '';
        if (!key) return null; // API 키 없으면 번역 건너뜀

        // 번역이 필요한 항목만 추출 (영문 제목인 경우)
        var needsTranslation = items.filter(function(n) {
            return isEnglishText(n.title);
        });
        if (needsTranslation.length === 0) return null;

        // 배치 요청 프롬프트 구성
        var promptItems = needsTranslation.map(function(n, i) {
            return i + ': title=' + JSON.stringify(n.title) + ' summary=' + JSON.stringify(n.summary || '');
        }).join('\n');

        var prompt = 'MMA 뉴스를 한국어로 번역하세요. 반드시 순수 JSON 배열만 반환하고 마크다운 코드블록(```)은 사용하지 마세요.\n\n입력:\n' + promptItems + '\n\n출력 형식:\n[{"title":"번역 제목","summary":"번역 요약"},...]';

        try {
            var res = await fetch(GEMINI_TRANSLATE_URL + key, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.1 }
                })
            });
            if (!res.ok) throw new Error('Gemini API 응답 오류: ' + res.status);
            var data = await res.json();
            var rawText = data.candidates[0].content.parts[0].text;

            // [핵심 버그 수정] 마크다운 코드 펜스 제거 후 파싱
            var cleanJson = stripJsonFences(rawText);
            var translations = JSON.parse(cleanJson);

            // 번역 결과를 원본 items에 반영
            var translationMap = {};
            needsTranslation.forEach(function(n, i) {
                if (translations[i]) translationMap[n.title] = translations[i];
            });
            return items.map(function(n) {
                var t = translationMap[n.title];
                if (t) {
                    return Object.assign({}, n, {
                        title: t.title || n.title,
                        summary: t.summary || n.summary
                    });
                }
                return n;
            });
        } catch (e) {
            console.warn('[번역 오류] Gemini API 응답 파싱 실패:', e.message);
            return null; // 번역 실패 시 원문 사용
        }
    }

    function renderHomeNewsFromRSS(newsItems) {
        var grid = document.getElementById('home-news-grid');
        if (!grid || !newsItems || newsItems.length === 0) return;

        var TAG_COLORS = {
            'ufc':'bg-ufcRed', 'result':'bg-green-700',
            'fighter':'bg-blue-600', 'event':'bg-purple-600',
            'ranking':'bg-yellow-600'
        };
        var TAG_LABELS = {
            'ufc':'UFC', 'result':'결과', 'fighter':'선수',
            'event':'이벤트', 'ranking':'랭킹'
        };

        grid.innerHTML = newsItems.map(function(n) {
            var tagColor = TAG_COLORS[n.category] || 'bg-ufcRed';
            var tagLabel = TAG_LABELS[n.category] || 'UFC';
            var imgSrc = n.image_url ||
                'https://images.unsplash.com/photo-1552072092-7f9b8d63efcb?auto=format&fit=crop&q=80&w=600';
            var clickAttr = n.url ? 'onclick="window.open(\'' + n.url + '\',\'_blank\')" style="cursor:pointer"' : '';
            return '<div class="glass-card rounded-[1.5rem] overflow-hidden group hover:border-ufcRed/30 transition-all duration-500" ' + clickAttr + '>' +
                '<div class="h-36 lg:h-44 bg-gray-900 relative overflow-hidden">' +
                '<img src="' + imgSrc + '" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" alt="news" ' +
                'onerror="this.src=\'https://images.unsplash.com/photo-1552072092-7f9b8d63efcb?auto=format&fit=crop&q=80&w=600\'">' +
                '<div class="absolute top-3 left-3 ' + tagColor + ' text-white text-[9px] px-2 py-1 font-bold barlow italic uppercase tracking-widest rounded-lg">' + tagLabel + '</div>' +
                '</div>' +
                '<div class="p-4 lg:p-6">' +
                '<h4 class="barlow text-sm lg:text-base font-black italic text-white uppercase leading-tight mb-2 group-hover:text-red-400 transition line-clamp-2">' + n.title + '</h4>' +
                '<p class="text-gray-500 text-[11px] lg:text-xs mb-3 leading-relaxed line-clamp-2">' + escapeHtml(stripHtmlSummary(n.summary) || '') + '</p>' +
                '<div class="flex items-center justify-between">' +
                '<span class="barlow text-[10px] font-bold italic text-gray-600 uppercase">' + (n.source || '') + '</span>' +
                '<span class="barlow text-[10px] font-bold italic text-gray-700 uppercase">' + (n.date || '') + '</span>' +
                '</div></div></div>';
        }).join('');
    }
