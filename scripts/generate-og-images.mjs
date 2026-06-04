// Static OG image generator (dynamic share OG — Stage 2).
//
// Renders 1200x630 JPG share cards for individual fighters and fights into
// public/og/fighters/{id}.jpg and public/og/fights/{fight_id}.jpg, and writes
// functions/_utils/og-image-manifest.js listing which ids have a generated image.
//
// This is an ASSET GENERATION TOOL, not runtime app code. It is never bundled
// into the site or the Pages Functions; the Functions only read the manifest.
//
// Rendering uses the locally installed Chrome (via the repo's Playwright) and the
// canvas 2D API. No new npm packages, no Cloudflare runtime image generation.
//
// Data source:
//   - The fighter/fight display data below was sourced from Supabase via a
//     read-only SELECT and embedded so the tool runs offline (no .env.local here).
//   - To refresh from the live DB instead, set VITE_SUPABASE_URL +
//     VITE_SUPABASE_ANON_KEY (or SUPABASE_URL/SUPABASE_ANON_KEY) and pass --rest.
//     The anon key is NEVER hardcoded — it is read from the environment only.
//
// Usage:
//   node scripts/generate-og-images.mjs            # use embedded data
//   node scripts/generate-og-images.mjs --rest     # re-fetch from Supabase REST

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PIXEL_DIR = path.join(ROOT, 'public', 'fighters', 'pixel');
const OUT_FIGHTERS = path.join(ROOT, 'public', 'og', 'fighters');
const OUT_FIGHTS = path.join(ROOT, 'public', 'og', 'fights');
const MANIFEST_OUT = path.join(ROOT, 'functions', '_utils', 'og-image-manifest.js');

const WHITE_HOUSE_EVENT = 'bf300955-a088-4789-b73c-3ec99effe3d3';
const EVENT_LABEL = 'FREEDOM 250'; // UFC mark intentionally dropped (no trademark on the card)

// --- Embedded display data (from Supabase read-only SELECT) -----------------

// Full pixel-portrait roster (32). Display data sourced from a read-only
// Supabase SELECT. The fighter render loop is driven by the pixel manifest keys;
// this array supplies each fighter's text. `--rest` refreshes these from the DB.
const FIGHTERS = [
  { id: 'aiemann-zahabi', name: 'Aiemann Zahabi', nickname: '', division: 'bw', rank: 6, wins: 14, losses: 2, draws: 0 },
  { id: 'alex-pereira', name: 'Alex Pereira', nickname: 'Poatan', division: 'hw', rank: 2, wins: 13, losses: 3, draws: 0 },
  { id: 'alexander-volkanovski', name: 'Alexander Volkanovski', nickname: 'The Great', division: 'fw', rank: 0, wins: 28, losses: 4, draws: 0 },
  { id: 'aljamain-sterling', name: 'Aljamain Sterling', nickname: 'Funk Master', division: 'fw', rank: 4, wins: 26, losses: 5, draws: 0 },
  { id: 'bo-nickal', name: 'Bo Nickal', nickname: '', division: 'mw', rank: null, wins: 8, losses: 1, draws: 0 },
  { id: 'charles-oliveira', name: 'Charles Oliveira', nickname: 'do Bronx', division: 'lw', rank: 3, wins: 37, losses: 11, draws: 0 },
  { id: 'ciryl-gane', name: 'Ciryl Gane', nickname: 'Bon Gamin', division: 'hw', rank: 1, wins: 13, losses: 2, draws: 0 },
  { id: 'derrick-lewis', name: 'Derrick Lewis', nickname: 'The Black Beast', division: 'hw', rank: 9, wins: 29, losses: 13, draws: 0 },
  { id: 'diego-lopes', name: 'Diego Lopes', nickname: '', division: 'fw', rank: 2, wins: 27, losses: 8, draws: 0 },
  { id: 'dricus-du-plessis', name: 'Dricus Du Plessis', nickname: 'Stillknocks', division: 'mw', rank: 2, wins: 23, losses: 3, draws: 0 },
  { id: 'ilia-topuria', name: 'Ilia Topuria', nickname: 'El Matador', division: 'lw', rank: 0, wins: 17, losses: 0, draws: 0 },
  { id: 'islam-makhachev', name: 'Islam Makhachev', nickname: '', division: 'ww', rank: 0, wins: 28, losses: 1, draws: 0 },
  { id: 'israel-adesanya', name: 'Israel Adesanya', nickname: 'The Last Stylebender', division: 'mw', rank: 9, wins: 24, losses: 6, draws: 0 },
  { id: 'jiri-prochazka', name: 'Jiří Procházka', nickname: 'Denisa', division: 'lhw', rank: 3, wins: 32, losses: 6, draws: 1 },
  { id: 'josh-hokit', name: 'Josh Hokit', nickname: 'The Incredible Hok', division: 'hw', rank: 5, wins: 9, losses: 0, draws: 0 },
  { id: 'justin-gaethje', name: 'Justin Gaethje', nickname: 'The Highlight', division: 'lw', rank: 1, wins: 27, losses: 5, draws: 0 },
  { id: 'khamzat-chimaev', name: 'Khamzat Chimaev', nickname: 'Borz', division: 'mw', rank: 1, wins: 15, losses: 0, draws: 0 },
  { id: 'kyle-daukaus', name: 'Kyle Daukaus', nickname: '', division: 'mw', rank: null, wins: 17, losses: 4, draws: 0 },
  { id: 'leon-edwards', name: 'Leon Edwards', nickname: 'Rocky', division: 'ww', rank: 7, wins: 22, losses: 6, draws: 0 },
  { id: 'mauricio-ruffy', name: 'Mauricio Ruffy', nickname: 'One Shot', division: 'lw', rank: 10, wins: 13, losses: 2, draws: 0 },
  { id: 'max-holloway', name: 'Max Holloway', nickname: 'Blessed', division: 'lw', rank: 4, wins: 27, losses: 9, draws: 0 },
  { id: 'merab-dvalishvili', name: 'Merab Dvalishvili', nickname: 'The Machine', division: 'bw', rank: 1, wins: 21, losses: 5, draws: 0 },
  { id: 'michael-chandler', name: 'Michael Chandler', nickname: 'Iron', division: 'lw', rank: 13, wins: 23, losses: 10, draws: 0 },
  { id: 'petr-yan', name: 'Petr Yan', nickname: 'No Mercy', division: 'bw', rank: 0, wins: 20, losses: 5, draws: 0 },
  { id: 'robert-whittaker', name: 'Robert Whittaker', nickname: 'The Reaper', division: 'lhw', rank: 10, wins: 27, losses: 9, draws: 0 },
  { id: 'sean-omalley', name: "Sean O'Malley", nickname: 'Suga', division: 'bw', rank: 3, wins: 19, losses: 3, draws: 0 },
  { id: 'sean-strickland', name: 'Sean Strickland', nickname: 'Tarzan', division: 'mw', rank: 0, wins: 31, losses: 7, draws: 0 },
  { id: 'shavkat-rakhmonov', name: 'Shavkat Rakhmonov', nickname: '', division: 'ww', rank: null, wins: 19, losses: 0, draws: 0 },
  { id: 'steve-garcia', name: 'Steve Garcia', nickname: 'Mean Machine', division: 'fw', rank: 9, wins: 19, losses: 5, draws: 0 },
  { id: 'tom-aspinall', name: 'Tom Aspinall', nickname: '', division: 'hw', rank: 0, wins: 15, losses: 3, draws: 0 },
  { id: 'valentina-shevchenko', name: 'Valentina Shevchenko', nickname: 'Bullet', division: 'wfw', rank: 0, wins: 26, losses: 4, draws: 1 },
  { id: 'weili-zhang', name: 'Zhang Weili', nickname: 'Magnum', division: 'wfw', rank: 1, wins: 26, losses: 4, draws: 0 }
];

const FIGHTS = [
  { id: 'bfea2ebe-c8e9-46f9-a82f-4edbbe20bceb', red_id: 'ilia-topuria', red_name: 'Ilia Topuria', blue_id: 'justin-gaethje', blue_name: 'Justin Gaethje', weight_class: 'lw', card_segment: 'main', is_main_event: true },
  { id: 'bc0d19f3-9e5d-4fb6-a7bb-707b663c89e3', red_id: 'alex-pereira', red_name: 'Alex Pereira', blue_id: 'ciryl-gane', blue_name: 'Ciryl Gane', weight_class: 'hw', card_segment: 'main', is_main_event: false },
  { id: '51c99f0b-ea57-40d1-9444-cbc6dfca3933', red_id: 'sean-omalley', red_name: "Sean O'Malley", blue_id: 'aiemann-zahabi', blue_name: 'Aiemann Zahabi', weight_class: 'bw', card_segment: 'main', is_main_event: false },
  { id: 'b40532d1-1105-4414-8605-b7d9e13298cb', red_id: 'josh-hokit', red_name: 'Josh Hokit', blue_id: 'derrick-lewis', blue_name: 'Derrick Lewis', weight_class: 'hw', card_segment: 'main', is_main_event: false },
  { id: '2ad9ee77-aff1-4946-be85-2ca936e5cfad', red_id: 'mauricio-ruffy', red_name: 'Mauricio Ruffy', blue_id: 'michael-chandler', blue_name: 'Michael Chandler', weight_class: 'lw', card_segment: 'main', is_main_event: false },
  { id: '09c38fab-587d-4a52-b133-1494a2a365f1', red_id: 'bo-nickal', red_name: 'Bo Nickal', blue_id: 'kyle-daukaus', blue_name: 'Kyle Daukaus', weight_class: 'mw', card_segment: 'main', is_main_event: false },
  { id: '4827d390-22b0-4a73-9a24-961657262dd7', red_id: 'diego-lopes', red_name: 'Diego Lopes', blue_id: 'steve-garcia', blue_name: 'Steve Garcia', weight_class: 'fw', card_segment: 'main', is_main_event: false }
];

// --- Labels (mirror functions/_utils/og.js) ---------------------------------

function divisionLabel(code) {
  if (!code) return '';
  const m = {
    flw: 'FLYWEIGHT', bw: 'BANTAMWEIGHT', fw: 'FEATHERWEIGHT', lw: 'LIGHTWEIGHT',
    ww: 'WELTERWEIGHT', mw: 'MIDDLEWEIGHT', lhw: 'LIGHT HEAVYWEIGHT', hw: 'HEAVYWEIGHT',
    wsw: "WOMEN'S STRAWWEIGHT", wflw: "WOMEN'S FLYWEIGHT", wfw: "WOMEN'S FLYWEIGHT",
    wbw: "WOMEN'S BANTAMWEIGHT"
  };
  const k = String(code).toLowerCase().trim();
  return m[k] || String(code).toUpperCase();
}
function rankLabel(rank) {
  if (rank === 0 || rank === '0') return 'CHAMPION';
  if (rank == null || rank === '') return 'UNRANKED';
  return '#' + rank;
}
function segmentLabel(seg, isMain) {
  if (isMain === true) return 'MAIN EVENT';
  const m = { main: 'MAIN CARD', prelim: 'PRELIMS', prelims: 'PRELIMS' };
  return m[String(seg || '').toLowerCase().trim()] || 'MAIN CARD';
}
function recordOf(f) {
  return (f.wins || 0) + '-' + (f.losses || 0) + (f.draws ? '-' + f.draws : '');
}

// --- Optional REST refresh --------------------------------------------------

async function maybeRefreshFromRest() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || !key) {
    console.log('[og] --rest requested but no env credentials found; using embedded data.');
    return;
  }
  const base = url.replace(/\/+$/, '') + '/rest/v1/';
  const h = { apikey: key, authorization: 'Bearer ' + key, accept: 'application/json' };
  const ids = FIGHTERS.map((f) => f.id);
  const fRes = await fetch(base + 'fighters?select=id,name,name_en,nickname,division,rank,wins,losses,draws&id=in.(' + ids.join(',') + ')', { headers: h });
  const fRows = await fRes.json();
  for (const row of fRows) {
    const t = FIGHTERS.find((x) => x.id === row.id);
    if (t) Object.assign(t, { name: row.name_en || row.name, nickname: row.nickname || '', division: row.division, rank: row.rank, wins: row.wins, losses: row.losses, draws: row.draws });
  }
  const mRes = await fetch(base + 'matchups?select=id,red_fighter_id,red_fighter_name,blue_fighter_id,blue_fighter_name,weight_class,card_segment,is_main_event&event_id=eq.' + WHITE_HOUSE_EVENT, { headers: h });
  const mRows = await mRes.json();
  for (const row of mRows) {
    const t = FIGHTS.find((x) => x.id === row.id);
    if (t) Object.assign(t, { red_name: row.red_fighter_name, blue_name: row.blue_fighter_name, weight_class: row.weight_class, card_segment: row.card_segment, is_main_event: row.is_main_event });
  }
  console.log('[og] Refreshed display data from Supabase REST.');
}

// --- Pixel portrait loading -------------------------------------------------

let PIXEL_MANIFEST = {};
async function loadPixelManifest() {
  try {
    PIXEL_MANIFEST = JSON.parse(await readFile(path.join(PIXEL_DIR, 'manifest.json'), 'utf8'));
  } catch { PIXEL_MANIFEST = {}; }
}
async function pixelDataUrl(id) {
  const rel = PIXEL_MANIFEST[id];
  if (!rel) return null;
  const file = path.join(ROOT, 'public', rel.replace(/^\//, ''));
  if (!existsSync(file)) return null;
  const buf = await readFile(file);
  const mime = file.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/png';
  return 'data:' + mime + ';base64,' + buf.toString('base64');
}

// --- Rendering (runs in the browser page) -----------------------------------

function pageRender(spec) {
  const W = 1200, H = 630;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  function loadImg(src) {
    return new Promise((res) => {
      if (!src) return res(null);
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });
  }
  function drawPixel(img, dx, dy, dw, dh) {
    // Fit (contain) the square-ish portrait into the box, keep pixel crispness.
    ctx.imageSmoothingEnabled = false;
    const s = Math.min(dw / img.width, dh / img.height);
    const w = img.width * s, h = img.height * s;
    ctx.drawImage(img, dx + (dw - w) / 2, dy + (dh - h) / 2, w, h);
    ctx.imageSmoothingEnabled = true;
  }
  function radial(cx, cy, r, color) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function wordmark(cx, y) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = '800 26px system-ui, Arial';
    ctx.fillStyle = '#E10600'; const a = 'PICK';
    ctx.font = '800 26px system-ui, Arial';
    const wA = ctx.measureText(a).width;
    const b = 'TAGON'; const wB = ctx.measureText(b).width;
    const total = wA + wB + 4;
    let x = cx - total / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#E10600'; ctx.fillText(a, x, y);
    ctx.fillStyle = '#f4f4f5'; ctx.fillText(b, x + wA + 4, y);
    ctx.textAlign = 'center';
  }
  function fitFont(text, weight, maxPx, minPx, maxWidth) {
    let px = maxPx;
    while (px > minPx) {
      ctx.font = weight + ' ' + px + 'px system-ui, Arial';
      if (ctx.measureText(text).width <= maxWidth) break;
      px -= 2;
    }
    return px;
  }

  // background
  ctx.fillStyle = '#08090b'; ctx.fillRect(0, 0, W, H);

  return (async () => {
    if (spec.type === 'fighter') {
      radial(900, 150, 620, 'rgba(225,6,0,0.16)');
      // border frame
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
      ctx.strokeRect(24, 24, W - 48, H - 48);

      // portrait on the right
      const img = await loadImg(spec.portrait);
      if (img) drawPixel(img, 690, 70, 460, 490);

      // left text column
      const lx = 76;
      ctx.textAlign = 'left';
      // wordmark top-left
      ctx.font = '800 24px system-ui, Arial';
      ctx.fillStyle = '#E10600'; ctx.fillText('PICK', lx, 92);
      const pw = ctx.measureText('PICK').width;
      ctx.fillStyle = '#f4f4f5'; ctx.fillText('TAGON', lx + pw + 4, 92);

      // division · rank
      ctx.font = '700 24px system-ui, Arial';
      ctx.fillStyle = '#E10600';
      ctx.fillText(spec.tag, lx, 210);

      // name (up to two lines)
      ctx.fillStyle = '#f8f8f8';
      const maxW = 600;
      const parts = spec.name.split(' ');
      let line1 = spec.name, line2 = '';
      // try one line; if too wide, split into two
      let px = fitFont(spec.name, '800', 76, 40, maxW);
      ctx.font = '800 ' + px + 'px system-ui, Arial';
      if (ctx.measureText(spec.name).width > maxW && parts.length > 1) {
        const mid = Math.ceil(parts.length / 2);
        line1 = parts.slice(0, mid).join(' ');
        line2 = parts.slice(mid).join(' ');
        px = Math.min(fitFont(line1, '800', 76, 36, maxW), fitFont(line2, '800', 76, 36, maxW));
        ctx.font = '800 ' + px + 'px system-ui, Arial';
        ctx.fillText(line1, lx, 290);
        ctx.fillText(line2, lx, 290 + px + 6);
      } else {
        ctx.fillText(line1, lx, 290);
      }
      const nameBottom = line2 ? 290 + px + 6 : 290;

      // nickname
      let y = nameBottom + 56;
      if (spec.nickname) {
        const nickText = '"' + spec.nickname + '"';
        const npx = fitFont(nickText, 'italic 700', 34, 22, 600);
        ctx.font = 'italic 700 ' + npx + 'px system-ui, Arial';
        ctx.fillStyle = '#cfcfd4';
        ctx.fillText(nickText, lx, y);
        y += 56;
      } else {
        y += 8;
      }

      // record
      ctx.font = '800 44px system-ui, Arial';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(spec.record, lx, y);
      const rw = ctx.measureText(spec.record).width;
      ctx.font = '600 20px system-ui, Arial';
      ctx.fillStyle = '#8a8a90';
      ctx.fillText('W-L' + (spec.record.split('-').length > 2 ? '-D' : ''), lx + rw + 16, y);

      // footer
      ctx.font = '700 22px system-ui, Arial';
      ctx.fillStyle = '#E10600';
      ctx.fillText('pick-tagon.com', lx, H - 56);
    } else {
      // FIGHT
      radial(220, 320, 520, 'rgba(225,6,0,0.16)');
      radial(980, 320, 520, 'rgba(45,120,255,0.16)');
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
      ctx.strokeRect(24, 24, W - 48, H - 48);

      // header: event + segment
      wordmark(W / 2, 78);
      ctx.textAlign = 'center';
      ctx.font = '800 30px system-ui, Arial';
      ctx.fillStyle = '#f4f4f5';
      ctx.fillText(spec.eventLabel, W / 2, 134);
      ctx.font = '700 20px system-ui, Arial';
      ctx.fillStyle = '#E10600';
      ctx.fillText(spec.segment + '  ·  ' + spec.weight, W / 2, 168);

      // portraits
      const [rImg, bImg] = await Promise.all([loadImg(spec.red.portrait), loadImg(spec.blue.portrait)]);
      const band = { y: 196, h: 300, w: 360 };
      if (rImg) drawPixel(rImg, 60, band.y, band.w, band.h);
      if (bImg) drawPixel(bImg, W - 60 - band.w, band.y, band.w, band.h);

      // VS badge center
      ctx.font = '900 92px system-ui, Arial';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#E10600'; ctx.fillText('V', W / 2 - 26, 380);
      ctx.fillStyle = '#3a7bff'; ctx.fillText('S', W / 2 + 26, 380);

      // names under portraits
      ctx.textBaseline = 'alphabetic';
      function name(text, cx, color) {
        const maxW = 380;
        let px = fitFont(text, '800', 38, 22, maxW);
        ctx.font = '800 ' + px + 'px system-ui, Arial';
        ctx.fillStyle = color;
        ctx.fillText(text, cx, 540);
      }
      name(spec.red.name, 60 + band.w / 2, '#ff6b6b');
      name(spec.blue.name, W - 60 - band.w / 2, '#7aa6ff');

      // footer
      ctx.font = '700 24px system-ui, Arial';
      ctx.fillStyle = '#f4f4f5';
      ctx.textAlign = 'center';
      ctx.fillText('승부 예측하기  ·  pick-tagon.com', W / 2, H - 44);
    }
    return canvas.toDataURL('image/jpeg', 0.9);
  })();
}

// --- Main -------------------------------------------------------------------

async function main() {
  if (process.argv.includes('--rest')) await maybeRefreshFromRest();
  await loadPixelManifest();
  await mkdir(OUT_FIGHTERS, { recursive: true });
  await mkdir(OUT_FIGHTS, { recursive: true });

  const pw = await import(pathToFileURL(path.join(ROOT, 'node_modules', 'playwright', 'index.js')).href);
  const chromium = pw.chromium || (pw.default && pw.default.chromium);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent('<!doctype html><html><body style="margin:0"></body></html>');

  const doneFighters = [];
  const doneFights = [];
  const sizes = [];

  // Drive the fighter roster from the pixel manifest (every portrait gets an OG card).
  const dataById = Object.fromEntries(FIGHTERS.map((f) => [f.id, f]));
  const fighterIds = Object.keys(PIXEL_MANIFEST).sort();
  const missingData = fighterIds.filter((id) => !dataById[id]);
  if (missingData.length) console.warn('[og] WARNING: no display data for: ' + missingData.join(', '));

  for (const id of fighterIds) {
    const f = dataById[id] || { id, name: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), nickname: '', division: '', rank: null, wins: null, losses: null, draws: 0 };
    const spec = {
      type: 'fighter',
      name: f.name,
      nickname: f.nickname || '',
      tag: [divisionLabel(f.division), rankLabel(f.rank)].filter(Boolean).join('  ·  '),
      record: (f.wins != null) ? recordOf(f) : '',
      portrait: await pixelDataUrl(id)
    };
    const dataUrl = await page.evaluate(pageRender, spec);
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    const out = path.join(OUT_FIGHTERS, id + '.jpg');
    await writeFile(out, buf);
    doneFighters.push(id);
    sizes.push(['fighters/' + id + '.jpg', buf.length]);
    console.log('  fighter', id, (buf.length / 1024).toFixed(0) + 'KB', spec.portrait ? '' : '(no portrait)');
  }

  for (const m of FIGHTS) {
    const spec = {
      type: 'fight',
      eventLabel: EVENT_LABEL,
      segment: segmentLabel(m.card_segment, m.is_main_event),
      weight: divisionLabel(m.weight_class),
      red: { name: m.red_name, portrait: await pixelDataUrl(m.red_id) },
      blue: { name: m.blue_name, portrait: await pixelDataUrl(m.blue_id) }
    };
    const dataUrl = await page.evaluate(pageRender, spec);
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    const out = path.join(OUT_FIGHTS, m.id + '.jpg');
    await writeFile(out, buf);
    doneFights.push(m.id);
    sizes.push(['fights/' + m.id + '.jpg', buf.length]);
    console.log('  fight', m.id, (buf.length / 1024).toFixed(0) + 'KB');
  }

  await browser.close();

  // Write the manifest the Pages Functions read to decide og:image.
  const manifest =
    '// AUTO-GENERATED by scripts/generate-og-images.mjs — do not edit by hand.\n' +
    '// Lists the fighter/fight ids that have a static OG image under public/og/.\n' +
    '// The Pages Functions use this to pick a per-target og:image, else the static fallback.\n' +
    'export const OG_FIGHTER_IDS = new Set(' + JSON.stringify(doneFighters.sort()) + ');\n' +
    'export const OG_FIGHT_IDS = new Set(' + JSON.stringify(doneFights.sort()) + ');\n';
  await writeFile(MANIFEST_OUT, manifest);

  console.log('\n[og] Generated ' + doneFighters.length + ' fighter + ' + doneFights.length + ' fight images.');
  console.log('[og] Manifest written to functions/_utils/og-image-manifest.js');
  const max = sizes.reduce((a, s) => Math.max(a, s[1]), 0);
  console.log('[og] Largest file: ' + (max / 1024).toFixed(0) + 'KB');
}

main().catch((e) => { console.error(e); process.exit(1); });
