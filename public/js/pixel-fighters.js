/* ==============================
   PIXEL FIGHTER PORTRAITS — shared manifest helper
   (global, no import/export — used by share-card.js and h2h.js)

   /fighters/pixel/manifest.json maps fighters.id → same-origin PNG path.
   Lazy-loaded once and cached. On any failure the manifest resolves to {}
   so callers silently fall back to their existing image/placeholder.
============================== */
(function() {
    var _manifest = null;   // cached parsed object once loaded ({} on failure)
    var _promise  = null;   // in-flight fetch promise (dedupe)

    // Lazy-load the manifest a single time. Always resolves (never rejects).
    function load() {
        if (_manifest) return Promise.resolve(_manifest);
        if (_promise)  return _promise;
        _promise = fetch('/fighters/pixel/manifest.json', { cache: 'force-cache' })
            .then(function(r) { return r.ok ? r.json() : {}; })
            .then(function(j) { _manifest = (j && typeof j === 'object') ? j : {}; return _manifest; })
            .catch(function() { _manifest = {}; return _manifest; });
        return _promise;
    }

    // Sync lookup against the cached manifest.
    // Accepts a fighter object ({ id }) or an id string. Returns path or null.
    function getPath(fighterOrId) {
        if (!_manifest || fighterOrId == null) return null;
        var id = (typeof fighterOrId === 'object') ? fighterOrId.id : fighterOrId;
        if (id == null || id === '') return null;
        var p = _manifest[String(id)];
        return (typeof p === 'string' && p) ? p : null;
    }

    // True once the manifest fetch has settled (success or fallback {}).
    function isReady() { return _manifest !== null; }

    window.PicktagonPixelFighters = { load: load, getPath: getPath, isReady: isReady };
    // convenience global per spec
    window.getFighterPixelPath = getPath;

    // kick off the lazy load at parse time (non-blocking)
    load();
})();
