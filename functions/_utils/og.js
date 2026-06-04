// Shared helpers for the dynamic share OG Pages Functions (Stage 1).
// Read-only: Supabase REST SELECT only. No DB writes, no app logic.
// OG image stays the static /og-pickt-v3.png in this stage; only title/description/url
// are dynamic. Clicking the link meta-refreshes into the existing in-app deep link.

import { OG_FIGHTER_IDS, OG_FIGHT_IDS } from './og-image-manifest.js';

const SITE = 'https://pick-tagon.com';
const OG_IMAGE = SITE + '/og-pickt-v3.png';

// Per-target static OG image (Stage 2). If a generated JPG exists for this id
// (tracked in og-image-manifest.js), use it; otherwise the static fallback.
// Files live at public/og/{fighters,fights}/{id}.jpg — all 1200x630.
export function fighterOgImage(id) {
  return (id && OG_FIGHTER_IDS.has(String(id)))
    ? SITE + '/og/fighters/' + encodeURIComponent(String(id)) + '.jpg'
    : OG_IMAGE;
}
export function fightOgImage(id) {
  return (id && OG_FIGHT_IDS.has(String(id)))
    ? SITE + '/og/fights/' + encodeURIComponent(String(id)) + '.jpg'
    : OG_IMAGE;
}

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Resolve Supabase REST credentials from the Pages Function runtime env.
// Falls back across the SUPABASE_* and VITE_SUPABASE_* names.
export function resolveEnv(env) {
  env = env || {};
  return {
    url: env.SUPABASE_URL || env.VITE_SUPABASE_URL || '',
    key: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''
  };
}

// Single-row REST SELECT by id. Returns the row object or null. Never throws.
export async function restSelectOne(env, table, select, idValue) {
  const cfg = resolveEnv(env);
  if (!cfg.url || !cfg.key || !idValue) return null;
  try {
    const url = cfg.url.replace(/\/+$/, '') + '/rest/v1/' + table
      + '?select=' + encodeURIComponent(select)
      + '&id=eq.' + encodeURIComponent(idValue)
      + '&limit=1';
    const res = await fetch(url, {
      headers: {
        apikey: cfg.key,
        authorization: 'Bearer ' + cfg.key,
        accept: 'application/json'
      }
    });
    if (!res || !res.ok) return null;
    const rows = await res.json();
    return (Array.isArray(rows) && rows.length) ? rows[0] : null;
  } catch (e) {
    return null;
  }
}

// Division code → readable label. Unknown codes pass through uppercased.
export function divisionLabel(code) {
  if (!code) return '';
  const m = {
    flw: 'FLYWEIGHT', bw: 'BANTAMWEIGHT', fw: 'FEATHERWEIGHT', lw: 'LIGHTWEIGHT',
    ww: 'WELTERWEIGHT', mw: 'MIDDLEWEIGHT', lhw: 'LIGHT HEAVYWEIGHT', hw: 'HEAVYWEIGHT',
    wsw: "WOMEN'S STRAWWEIGHT", 'w-sw': "WOMEN'S STRAWWEIGHT",
    wflw: "WOMEN'S FLYWEIGHT", wfw: "WOMEN'S FLYWEIGHT",
    wbw: "WOMEN'S BANTAMWEIGHT", wmw: "WOMEN'S"
  };
  const k = String(code).toLowerCase().trim();
  return m[k] || String(code).toUpperCase();
}

export function rankLabel(rank) {
  if (rank === 0 || rank === '0') return 'CHAMPION';
  if (rank == null || rank === '') return 'UNRANKED';
  return '#' + rank;
}

// Card segment → label. Main event takes precedence.
export function segmentLabel(seg, isMain) {
  if (isMain === true || isMain === 'true') return 'MAIN EVENT';
  if (!seg) return '';
  const m = {
    main: 'MAIN CARD', 'main-card': 'MAIN CARD',
    prelim: 'PRELIMS', prelims: 'PRELIMS',
    'early-prelim': 'EARLY PRELIMS', 'early-prelims': 'EARLY PRELIMS'
  };
  const k = String(seg).toLowerCase().trim();
  return m[k] || String(seg).toUpperCase();
}

// Build the minimal OG HTML document. All dynamic text is HTML-escaped here.
export function ogHtml(opts) {
  opts = opts || {};
  const title = escapeHtml(opts.title || 'PICK-TAGON');
  const desc = escapeHtml(opts.description || 'UFC 예측과 파이터 데이터를 확인하세요');
  const appUrl = escapeHtml(opts.appUrl || (SITE + '/'));
  const canonical = escapeHtml(opts.canonical || (SITE + '/'));
  const image = escapeHtml(opts.image || OG_IMAGE);
  return '<!DOCTYPE html><html lang="ko"><head>'
    + '<meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta name="robots" content="noindex">'
    + '<title>' + title + '</title>'
    + '<meta name="description" content="' + desc + '">'
    + '<link rel="canonical" href="' + canonical + '">'
    + '<meta property="og:type" content="website">'
    + '<meta property="og:title" content="' + title + '">'
    + '<meta property="og:description" content="' + desc + '">'
    + '<meta property="og:image" content="' + image + '">'
    + '<meta property="og:image:width" content="1200">'
    + '<meta property="og:image:height" content="630">'
    + '<meta property="og:url" content="' + canonical + '">'
    + '<meta name="twitter:card" content="summary_large_image">'
    + '<meta name="twitter:title" content="' + title + '">'
    + '<meta name="twitter:description" content="' + desc + '">'
    + '<meta name="twitter:image" content="' + image + '">'
    + '<meta http-equiv="refresh" content="0;url=' + appUrl + '">'
    + '</head><body style="margin:0;background:#0a0a0c;color:#f4f4f5;font-family:system-ui,sans-serif;text-align:center;padding:48px 20px">'
    + '<p style="opacity:.7">PICK-TAGON으로 이동 중…</p>'
    + '<p><a href="' + appUrl + '" style="color:#E10600;font-weight:700;text-decoration:none">PICK-TAGON으로 이동 →</a></p>'
    + '</body></html>';
}

export function htmlResponse(html) {
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300'
    }
  });
}

export const SITE_URL = SITE;
