/* ==============================
   NEWS ADMIN LAYER
   (extracted from index.html – global functions, no import/export)
   의존성: state.js (newsDB, editingNewsId, sb, cachedNews)
           data/constants.js (NEWS_SEED, UNSPLASH_DEFAULTS)
           utils.js (showToast)
           api/supabase.js (renderHomeNewsFromRSS)
============================== */

    function loadNews() {
        const n = localStorage.getItem('picktagon_news');
        newsDB = n ? JSON.parse(n) : [...NEWS_SEED];
    }

    function saveNews_() {
        localStorage.setItem('picktagon_news', JSON.stringify(newsDB));
    }

    // ---- PUBLIC RENDER ----
    function _mapNewsCacheItems(data) {
        return data.map(function(n) {
            var d = new Date(n.published_at);
            return {
                title: n.title,
                url: n.url,
                thumbnail_url: n.image_url || '',
                category: n.category || 'ufc',
                source: n.source || '',
                date: d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getDate()).padStart(2,'0')
            };
        });
    }

    function renderHomeNews() {
        var grid = document.getElementById('home-news-grid');
        if (!grid) return;

        // 캐시-퍼스트: cachedNews 이미 있으면 즉시 렌더 (Supabase 재요청 불필요)
        if (cachedNews && cachedNews.length > 0 && typeof renderNewsCards === 'function') {
            var cached = cachedNews.slice(0, 6).map(function(n) {
                return { title: n.title, url: n.url, thumbnail_url: n.image_url || '', category: n.category || 'ufc', source: n.source || '', date: n.date || '' };
            });
            grid.innerHTML = renderNewsCards(cached);
            grid.dataset.loaded = '1';
            return;
        }

        // 캐시 없을 때만 스켈레톤 + Supabase 쿼리
        if (typeof renderNewsSkeleton === 'function') {
            grid.innerHTML = renderNewsSkeleton(3);
        }

        if (!sb) {
            grid.innerHTML = '<div class="col-span-3 glass-card rounded-[2rem] p-12 text-center text-gray-600 oswald-sharp text-xs italic uppercase tracking-widest">등록된 뉴스가 없습니다</div>';
            return;
        }

        if (sb) {
            sb.from('news_cache')
                .select('*')
                .order('published_at', { ascending: false })
                .limit(6)
                .then(function(res) {
                    if (res.data && res.data.length > 0) {
                        var items = _mapNewsCacheItems(res.data);
                        if (typeof renderNewsCards === 'function') {
                            grid.innerHTML = renderNewsCards(items);
                            grid.dataset.loaded = '1';
                        }
                    } else {
                        grid.innerHTML = '<div class="col-span-3 glass-card rounded-[2rem] p-12 text-center text-gray-600 oswald-sharp text-xs italic uppercase tracking-widest">등록된 뉴스가 없습니다</div>';
                    }
                });
        }
    }

    function renderHomeNewsLegacy() {
        const grid = document.getElementById('home-news-grid');
        if (!grid) return;
        const sorted = [...newsDB]
            .sort((a, b) => {
                if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                return (b.date || '').localeCompare(a.date || '');
            })
            .slice(0, 6);

        if (sorted.length === 0) {
            grid.innerHTML = `<div class="col-span-3 glass-card rounded-[2rem] p-12 text-center text-gray-600 oswald-sharp text-xs italic uppercase tracking-widest">등록된 뉴스가 없습니다</div>`;
            return;
        }

        const TAG_COLORS = {
            'NEWS': 'bg-ufcRed', 'BREAKING': 'bg-ufcRed',
            'RANKING': 'bg-blue-600', 'ANALYSIS': 'bg-purple-600',
            'UPDATE': 'bg-green-700', 'EVENT': 'bg-orange-600',
            'EXCLUSIVE': 'bg-yellow-600'
        };

        grid.innerHTML = sorted.map(n => {
            const dateStr = n.date
                ? new Date(n.date + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '.').replace('.','')
                : '';
            const imgSrc = n.img || UNSPLASH_DEFAULTS[n.tag] || UNSPLASH_DEFAULTS['NEWS'];
            const tagColor = TAG_COLORS[n.tag] || 'bg-ufcRed';
            const clickAttr = n.link ? `onclick="window.open('${n.link}','_blank')"` : '';
            return `
            <div class="glass-card rounded-[1.5rem] lg:rounded-[2rem] overflow-hidden group cursor-pointer" ${clickAttr}>
                <div class="h-40 lg:h-48 bg-gray-800 relative overflow-hidden">
                    <img src="${imgSrc}" class="w-full h-full object-cover group-hover:scale-110 transition duration-500" alt="news"
                        onerror="this.src='${UNSPLASH_DEFAULTS['NEWS']}'">
                    <div class="absolute top-4 left-4 ${tagColor} text-white text-[10px] px-2 py-1 font-bold uppercase">${n.tag}</div>
                    ${n.pinned ? `<div class="absolute top-4 right-4 bg-yellow-500/90 text-black text-[8px] px-2 py-1 font-black uppercase rounded oswald-sharp italic">📌 PINNED</div>` : ''}
                </div>
                <div class="p-6 lg:p-8">
                    <h4 class="oswald-sharp text-lg lg:text-xl font-bold mb-2 group-hover:text-ufcRed transition uppercase italic leading-tight">${n.title}</h4>
                    <p class="text-gray-500 text-xs lg:text-sm mb-4 italic leading-relaxed">${n.desc}</p>
                    <span class="text-[10px] text-gray-600 font-bold oswald-sharp uppercase tracking-widest">${dateStr}</span>
                </div>
            </div>`;
        }).join('');
    }

    // ---- ADMIN ----
    function renderNewsAdminList() {
        const list = document.getElementById('news-admin-list');
        const count = document.getElementById('news-admin-count');
        if (!list) return;

        // Supabase에서 관리자 뉴스 동기화 (source='admin') — DB가 진실의 원천
        if (sb) {
            sb.from('news_cache')
                .select('*')
                .eq('source', 'admin')
                .order('published_at', { ascending: false })
                .then(function(res) {
                    if (res.data && res.data.length > 0) {
                        res.data.forEach(function(n) {
                            var ncUrl = n.url;
                            var existing = newsDB.find(function(x) {
                                return x.link === ncUrl || ('picktagon-admin://' + x.id) === ncUrl;
                            });
                            if (!existing) {
                                var d = new Date(n.published_at);
                                var ds = d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getDate()).padStart(2,'0');
                                newsDB.push({
                                    id: 'nc_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
                                    tag: n.category || 'NEWS',
                                    title: n.title,
                                    desc: n.summary || '',
                                    date: ds,
                                    img: n.image_url || '',
                                    link: ncUrl,
                                    pinned: false
                                });
                            }
                        });
                        saveNews_();
                    }
                    count.textContent = newsDB.length;
                    _renderNewsAdminListUI(list);
                });
            return; // 비동기 렌더링
        }

        count.textContent = newsDB.length;
        _renderNewsAdminListUI(list);
    }

    function _renderNewsAdminListUI(list) {

        if (newsDB.length === 0) {
            list.innerHTML = `<div class="glass-card p-8 text-center text-gray-600 oswald-sharp text-xs italic uppercase tracking-widest rounded-2xl">등록된 뉴스가 없습니다</div>`;
            return;
        }

        const sorted = [...newsDB].sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return (b.date || '').localeCompare(a.date || '');
        });

        const TAG_COLORS = {
            'NEWS': 'text-red-400 border-red-400/30', 'BREAKING': 'text-red-400 border-red-400/30',
            'RANKING': 'text-blue-400 border-blue-400/30', 'ANALYSIS': 'text-purple-400 border-purple-400/30',
            'UPDATE': 'text-green-400 border-green-400/30', 'EVENT': 'text-orange-400 border-orange-400/30',
            'EXCLUSIVE': 'text-yellow-400 border-yellow-400/30'
        };

        list.innerHTML = sorted.map((n, idx) => {
            const tagCls = TAG_COLORS[n.tag] || 'text-gray-400 border-gray-400/30';
            const imgSrc = n.img || UNSPLASH_DEFAULTS[n.tag] || UNSPLASH_DEFAULTS['NEWS'];
            return `
            <div class="glass-card rounded-2xl p-4 flex items-center gap-4 hover:border-white/20 transition">
                <div class="w-14 h-14 flex-shrink-0 rounded-xl overflow-hidden bg-gray-900 border border-white/5">
                    <img src="${imgSrc}" class="w-full h-full object-cover" alt="" onerror="this.style.display='none'">
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1 flex-wrap">
                        <span class="oswald-sharp text-[9px] border ${tagCls} px-2 py-0.5 rounded-md font-black italic uppercase">${n.tag}</span>
                        ${n.pinned ? `<span class="oswald-sharp text-[9px] text-yellow-500 italic uppercase">📌 고정</span>` : ''}
                    </div>
                    <p class="oswald-sharp font-black italic text-sm text-white uppercase tracking-tight truncate">${n.title}</p>
                    <p class="oswald-sharp text-[10px] text-gray-500 italic uppercase tracking-widest">${n.date || '—'}</p>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    <button onclick="moveNews('${n.id}', -1)" ${idx===0?'disabled':''} class="text-gray-600 hover:text-white transition px-2 text-sm disabled:opacity-20" title="위로">▲</button>
                    <button onclick="moveNews('${n.id}', 1)" ${idx===sorted.length-1?'disabled':''} class="text-gray-600 hover:text-white transition px-2 text-sm disabled:opacity-20" title="아래로">▼</button>
                    <button onclick="openNewsModal('${n.id}')" class="oswald-sharp text-[10px] border border-white/10 text-gray-400 hover:text-white px-3 py-2 rounded-xl italic uppercase tracking-widest transition">수정</button>
                    <button onclick="deleteNews('${n.id}')" class="oswald-sharp text-[10px] border border-ufcRed/20 text-ufcRed/60 hover:text-ufcRed px-3 py-2 rounded-xl italic uppercase tracking-widest transition">삭제</button>
                </div>
            </div>`;
        }).join('');
    }

    function openNewsModal(newsId) {
        editingNewsId = newsId || null;
        document.getElementById('news-modal').classList.remove('hidden');
        const preview = document.getElementById('nm-img-preview');
        preview.classList.add('hidden');

        if (newsId) {
            const n = newsDB.find(x => x.id === newsId);
            if (!n) return;
            document.getElementById('news-modal-title').textContent = '뉴스 수정';
            document.getElementById('nm-tag').value = n.tag || 'NEWS';
            document.getElementById('nm-title').value = n.title || '';
            document.getElementById('nm-desc').value = n.desc || '';
            document.getElementById('nm-date').value = n.date || '';
            document.getElementById('nm-img').value = n.img || '';
            document.getElementById('nm-link').value = n.link || '';
            document.getElementById('nm-pinned').checked = !!n.pinned;
            document.getElementById('nm-edit-id').value = newsId;
            if (n.img) {
                document.getElementById('nm-img-preview-img').src = n.img;
                preview.classList.remove('hidden');
            }
        } else {
            document.getElementById('news-modal-title').textContent = '뉴스 추가';
            ['nm-title','nm-desc','nm-img','nm-link'].forEach(id => document.getElementById(id).value = '');
            document.getElementById('nm-tag').value = 'NEWS';
            document.getElementById('nm-date').value = new Date().toISOString().slice(0,10);
            document.getElementById('nm-pinned').checked = false;
            document.getElementById('nm-edit-id').value = '';
        }
    }

    function closeNewsModal() {
        document.getElementById('news-modal').classList.add('hidden');
        editingNewsId = null;
    }

    function previewNewsImg() {
        const url = document.getElementById('nm-img').value.trim();
        const preview = document.getElementById('nm-img-preview');
        const img = document.getElementById('nm-img-preview-img');
        if (!url) { showToast('⚠ 이미지 URL을 입력하세요'); return; }
        img.src = url;
        preview.classList.remove('hidden');
    }

    function saveNews() {
        const title = document.getElementById('nm-title').value.trim();
        if (!title) { showToast('⚠ 제목을 입력하세요'); return; }

        const data = {
            id: editingNewsId || ('news_' + Date.now()),
            tag:    document.getElementById('nm-tag').value,
            title,
            desc:   document.getElementById('nm-desc').value.trim(),
            date:   document.getElementById('nm-date').value,
            img:    document.getElementById('nm-img').value.trim(),
            link:   document.getElementById('nm-link').value.trim(),
            pinned: document.getElementById('nm-pinned').checked,
        };

        if (editingNewsId) {
            const idx = newsDB.findIndex(x => x.id === editingNewsId);
            if (idx !== -1) newsDB[idx] = data;
            showToast(`✅ "${title}" 뉴스 업데이트 완료`);
        } else {
            newsDB.push(data);
            showToast(`📰 "${title}" 뉴스 발행 완료`);
        }

        saveNews_();
        // Supabase news_cache 동기화 (새로고침 후에도 뉴스 유지)
        if (sb) {
            var ncUrl = data.link || ('picktagon-admin://' + data.id);
            var publishedAt = data.date ? new Date(data.date + 'T12:00:00').toISOString() : new Date().toISOString();
            sb.from('news_cache').upsert({
                title: data.title,
                summary: data.desc || '',
                url: ncUrl,
                image_url: data.img || null,
                category: data.tag || 'NEWS',
                source: 'admin',
                published_at: publishedAt
            }, { onConflict: 'url' }).then(function(res) {
                if (res.error) console.warn('뉴스 DB 저장 실패:', res.error.message);
                else renderHomeNews();
            });
        }
        closeNewsModal();
        renderNewsAdminList();
        renderHomeNews();
    }

    function deleteNews(newsId) {
        const n = newsDB.find(x => x.id === newsId);
        if (!n) return;
        if (!confirm(`"${n.title}" 뉴스를 삭제하시겠습니까?`)) return;
        // Supabase news_cache에서도 삭제
        if (sb) {
            var ncUrl = n.link || ('picktagon-admin://' + n.id);
            sb.from('news_cache').delete().eq('url', ncUrl).then(function(res) {
                if (res.error) console.warn('뉴스 DB 삭제 실패:', res.error.message);
            });
        }
        newsDB = newsDB.filter(x => x.id !== newsId);
        saveNews_();
        renderNewsAdminList();
        renderHomeNews();
        showToast(`🗑 뉴스 삭제됨`);
    }

    function moveNews(newsId, dir) {
        // Sort by current visual order (pinned first, then date)
        const sorted = [...newsDB].sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return (b.date || '').localeCompare(a.date || '');
        });
        const idx = sorted.findIndex(x => x.id === newsId);
        const target = idx + dir;
        if (target < 0 || target >= sorted.length) return;
        // Swap dates to reorder
        const dateA = sorted[idx].date;
        const dateB = sorted[target].date;
        const pinnedA = sorted[idx].pinned;
        const pinnedB = sorted[target].pinned;
        const dbA = newsDB.find(x => x.id === sorted[idx].id);
        const dbB = newsDB.find(x => x.id === sorted[target].id);
        if (dbA && dbB) {
            [dbA.date, dbB.date] = [dateB, dateA];
            [dbA.pinned, dbB.pinned] = [pinnedB, pinnedA];
        }
        saveNews_();
        renderNewsAdminList();
        renderHomeNews();
    }
