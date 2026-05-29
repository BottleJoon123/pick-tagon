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
  // Admin UI gate: client-side only — controls nav visibility only.
  // Actual admin operations are secured server-side via SECURITY DEFINER RPCs and users.is_admin.
  // Fallback applies when VITE_ADMIN_EMAILS env var is unset (e.g. Cloudflare Pages without env config).
  var ADMIN_FALLBACK = ['joonbyoung@naver.com'];
  ADMIN_EMAILS = adminRaw ? adminRaw.split(',').map(function(e) { return e.trim(); }) : ADMIN_FALLBACK;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('[PICKTAGON] Supabase config missing. Create .env.local — see docs/ENV_CONFIG_MIGRATION_PLAN.md');
  }
}());
