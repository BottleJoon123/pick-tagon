/* modal-helpers.js — Extracted from index.html inline script (Phase 9D-2/3).
   Pure DOM modal close helpers. No Supabase / Auth / Octagon dependencies. */

function closeNewsDetail() {
    document.getElementById('news-detail-modal').classList.add('hidden');
    document.body.style.overflow = '';
}

function closeBetSlip() {
    document.getElementById('bet-slip-panel').classList.remove('bs-open');
    document.getElementById('bet-slip-backdrop').classList.remove('bs-open');
}

function closeMobileSidebar() {
    const drawer = document.getElementById('mobile-sidebar-drawer');
    const backdrop = document.getElementById('mobile-sidebar-backdrop');
    const panel = document.getElementById('mobile-sidebar-panel');
    if (!drawer) return;
    backdrop.classList.remove('opacity-100');
    backdrop.classList.add('opacity-0');
    backdrop.classList.add('pointer-events-none');
    panel.classList.remove('translate-x-0');
    panel.classList.add('translate-x-full');
    setTimeout(function() { drawer.classList.add('pointer-events-none'); }, 300);
}

function closeFactionSelectModal() {
    var modal = document.getElementById('faction-select-modal');
    if (modal) modal.classList.add('hidden');
    sessionStorage.setItem('factionModalDismissed', '1');
}
