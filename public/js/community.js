/* ==============================
   COMMUNITY & SCORING LAYER
   (extracted from index.html – global functions, no import/export)
   의존성: state.js (posts, communityFilter, currentUser, state)
           storage.js (save)
           utils.js (escapeHtml, getDisplayUsername)
           index.html 내 함수들 (likePostInDB, toggleComArea, postCom, requestBattle)
============================== */

    function setCommunityFilter(f) {
        communityFilter = f;
        ['all','post','pick'].forEach(function(k) {
            var btn = document.getElementById('cf-' + k);
            if (!btn) return;
            if (k === f) {
                btn.className = btn.className.replace('border-white/10 text-gray-500', 'bg-ufcRed/15 border-ufcRed/50 text-white');
            } else {
                btn.className = btn.className.replace('bg-ufcRed/15 border-ufcRed/50 text-white', 'border-white/10 text-gray-500');
            }
        });
        renderFeed();
    }

    function toggleWriter() { document.getElementById('write-panel').classList.toggle('hidden'); }

    function renderFeed() {
        const feed = document.getElementById('community-feed');
        if(!feed) return;
        const filtered = posts.filter(p => {
            if (communityFilter === 'pick') return !!p.isPickShare;
            if (communityFilter === 'post') return !p.isPickShare;
            return true;
        });

        if (filtered.length === 0) {
            feed.innerHTML = '<div class="glass-card p-10 text-center text-gray-600 oswald-sharp text-xs italic uppercase tracking-widest rounded-2xl">표시할 게시글이 없습니다</div>';
            return;
        }

        feed.innerHTML = filtered.map((p, idx) => {
            const belt = escapeHtml(p.belt);
            const author = escapeHtml(p.author);
            const date = escapeHtml(p.date);
            const title = escapeHtml(p.title);
            const content = escapeHtml(p.content);
            const pickTag = p.isPickShare
                ? `<span class="oswald-sharp text-[8px] bg-ufcRed/10 border border-ufcRed/20 text-ufcRed px-2 py-0.5 rounded-lg font-black italic uppercase ml-2">🎯 픽 공유</span>`
                : '';
            // Use original post index for like/comment
            const origIdx = posts.indexOf(p);
            const commentsHtml = (p.comments || []).map(c => {
                const isSelf = c.user === getDisplayUsername();
                const battleBtn = (!isSelf && currentUser)
                    ? `<button onclick="requestBattle('${escapeHtml(c.user).replace(/'/g,"\\'")}', event)"
                          class="oswald-sharp text-[8px] text-gray-600 hover:text-ufcRed border border-white/5 hover:border-ufcRed/40 px-2 py-0.5 rounded-lg italic uppercase font-black tracking-widest transition ml-2 flex-shrink-0">⚡ 옥타곤</button>`
                    : '';
                return `
                            <div class="bg-black/40 p-4 lg:p-5 rounded-2xl border-l-4 border-ufcRed uppercase italic font-bold">
                                <div class="flex items-center justify-between mb-1">
                                    <span class="oswald-sharp text-[8px] lg:text-[10px] text-gray-500 font-black italic uppercase tracking-tighter">${escapeHtml(c.user)}</span>
                                    ${battleBtn}
                                </div>
                                <p class="text-gray-300 font-light text-xs lg:text-sm italic tracking-tight">${escapeHtml(c.text)}</p>
                            </div>`;
            }).join('');

            return `
            <div class="glass-card p-6 lg:p-10 rounded-[2rem] hover:border-ufcRed/50 transition-all duration-500 uppercase italic font-bold">
                <div class="flex justify-between items-start mb-4 lg:mb-6">
                    <div class="flex items-center space-x-3 lg:space-x-4">
                        <span class="oswald-sharp text-[8px] lg:text-[10px] bg-white text-black px-2 lg:px-3 py-1 rounded-full font-black italic uppercase">${belt}</span>
                        <span class="oswald-sharp text-sm lg:text-xl italic font-black text-gray-200 tracking-tighter uppercase">${author}</span>
                        ${pickTag}
                    </div>
                    <span class="oswald-sharp text-[8px] lg:text-xs italic text-gray-600 tracking-widest uppercase">${date}</span>
                </div>
                <h4 class="oswald-sharp text-xl lg:text-3xl font-black italic mb-4 lg:mb-6 text-white tracking-tight uppercase tracking-tighter italic">${title}</h4>
                <p class="text-gray-400 font-light leading-relaxed mb-6 lg:mb-8 border-l-2 border-white/5 pl-4 lg:pl-6 text-sm lg:text-lg italic uppercase">${content}</p>
                <div class="flex items-center space-x-6 lg:space-x-10 border-t border-white/5 pt-6 lg:pt-8 text-xs uppercase italic oswald-sharp">
                    <button onclick="likePost(${origIdx})" class="flex items-center space-x-2 text-ufcRed transition group uppercase italic font-bold">
                        <span class="group-hover:scale-125 transition font-black tracking-widest">🔥 Recommend</span> <span>${p.likes}</span>
                    </button>
                    <button onclick="toggleComArea(${origIdx})" class="text-gray-500 hover:text-white transition font-bold tracking-widest uppercase italic font-bold">💬 Discussion ${p.comments.length}</button>
                </div>
                <div id="com-area-${origIdx}" class="hidden mt-6 lg:mt-8 space-y-4 lg:space-y-5 pt-6 lg:pt-8 border-t border-white/5">
                    <div id="com-list-${origIdx}" class="space-y-4 uppercase italic font-bold">${commentsHtml}</div>
                    <div class="flex space-x-3 mt-6 uppercase italic font-bold">
                        <input type="text" id="com-in-${origIdx}" class="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 lg:px-5 py-2 lg:py-3 text-xs lg:text-sm focus:outline-none focus:border-ufcRed font-light" placeholder="의견을 남겨주세요...">
                        <button onclick="postCom(${origIdx})" class="oswald-sharp bg-ufcRed text-white px-6 lg:px-8 py-2 lg:py-3 rounded-xl text-[10px] lg:text-xs font-black uppercase italic italic tracking-widest">SEND</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    function likePost(i) {
        posts[i].likes++;
        likePostInDB(posts[i].dbId);
        save();
        renderFeed();
    }

    // 롤링 랭킹: 최근 10경기 기반 점수 계산
    function getRollingScore() {
        const recent = state.history
            .filter(h => h.res !== 'PENDING')
            .slice(0, 10);
        if (recent.length === 0) return 0;
        const wins = recent.filter(h => h.res === 'WIN').length;
        const acc = wins / recent.length;
        const baseScore = recent.reduce((s, h) => s + (h.res === 'WIN' ? (h.payout || 0) : 0), 0);
        return Math.round(baseScore * (0.5 + acc * 0.5));
    }

    function getBeltInfo(pts) {
        if(pts > 10000) return { name: "Black", color: "#d20a0a", bg: "bg-ufcRed", text: "text-white" };
        if(pts > 5000)  return { name: "Brown", color: "#92400e", bg: "bg-yellow-800", text: "text-white" };
        if(pts > 2000)  return { name: "Purple", color: "#7c3aed", bg: "bg-purple-700", text: "text-white" };
        if(pts > 1000)  return { name: "Blue", color: "#2563eb", bg: "bg-blue-600", text: "text-white" };
        return { name: "White", color: "#ffffff", bg: "bg-white", text: "text-black" };
    }
