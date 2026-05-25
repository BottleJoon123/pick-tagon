// Reads from window.PICKTAGON_CONFIG injected by index.html Vite env bridge.
// See docs/ENV_CONFIG_MIGRATION_PLAN.md for setup instructions.
var SUPABASE_URL, SUPABASE_KEY, ADMIN_EMAILS;
(function () {
  var cfg = window.PICKTAGON_CONFIG || {};
  var ph  = /^%VITE_/;
  function v(x) { return (x && !ph.test(x)) ? x : ''; }

  SUPABASE_URL = v(cfg.supabaseUrl);
  SUPABASE_KEY = v(cfg.supabaseKey);

  var adminRaw = v(cfg.adminEmails);
  // Admin UI gate: client-side only. 실제 보안은 DB SECURITY DEFINER RPC에 의존.
  ADMIN_EMAILS = adminRaw ? adminRaw.split(',').map(function(e) { return e.trim(); }) : [];

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('[PICKTAGON] Supabase config missing. Create .env.local — see docs/ENV_CONFIG_MIGRATION_PLAN.md');
  }
}());
