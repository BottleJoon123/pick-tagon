'use strict';
/**
 * gen-favicon.js — Pure Node.js favicon generator (no external deps)
 * Outputs: public/favicon-32x32.png, favicon-192x192.png,
 *          apple-touch-icon.png (180px), favicon.ico
 * Design: dark bg + red octagon outline + white checkmark
 */

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── Colors ───────────────────────────────────────────────────────────
const BG    = [8, 9, 11, 255];      // #08090b
const RED   = [225, 6, 0, 255];     // #E10600
const WHITE = [255, 255, 255, 255]; // #FFFFFF

// ── CRC32 (PNG requires it) ───────────────────────────────────────────
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff >>> 0;
    for (const b of buf) c = (CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)) >>> 0;
    return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const tb = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
    return Buffer.concat([len, tb, data, crc]);
}

// ── Pixel canvas ──────────────────────────────────────────────────────
function makeCanvas(size) {
    // RGBA flat array
    const buf = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
        buf[i*4]   = BG[0]; buf[i*4+1] = BG[1];
        buf[i*4+2] = BG[2]; buf[i*4+3] = BG[3];
    }
    return buf;
}

function blendPixel(buf, size, px, py, color, alpha) {
    const ix = Math.floor(px), iy = Math.floor(py);
    if (ix < 0 || ix >= size || iy < 0 || iy >= size) return;
    const idx = (iy * size + ix) * 4;
    const a = Math.min(1, Math.max(0, alpha));
    buf[idx]   = Math.round(buf[idx]   + (color[0] - buf[idx])   * a);
    buf[idx+1] = Math.round(buf[idx+1] + (color[1] - buf[idx+1]) * a);
    buf[idx+2] = Math.round(buf[idx+2] + (color[2] - buf[idx+2]) * a);
    buf[idx+3] = 255;
}

function distToSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx*dx + dy*dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / lenSq));
    return Math.hypot(px - (ax + t*dx), py - (ay + t*dy));
}

// Antialiased thick line via distance-to-segment
function drawLine(buf, size, ax, ay, bx, by, color, sw) {
    const half = sw / 2;
    const x0 = Math.max(0, Math.floor(Math.min(ax,bx) - half - 1));
    const x1 = Math.min(size-1, Math.ceil(Math.max(ax,bx) + half + 1));
    const y0 = Math.max(0, Math.floor(Math.min(ay,by) - half - 1));
    const y1 = Math.min(size-1, Math.ceil(Math.max(ay,by) + half + 1));
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            const d = distToSeg(x + 0.5, y + 0.5, ax, ay, bx, by);
            // Smooth falloff over 1px for antialiasing
            const alpha = Math.min(1, Math.max(0, half + 0.7 - d));
            if (alpha > 0) blendPixel(buf, size, x, y, color, alpha);
        }
    }
}

// ── Octagon + Checkmark ───────────────────────────────────────────────
function drawOctagon(buf, size, sw) {
    const cx = size / 2, cy = size / 2;
    const r  = size * 0.43;
    const pts = [];
    for (let i = 0; i < 8; i++) {
        const a = (22.5 + 45 * i) * Math.PI / 180;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    for (let i = 0; i < 8; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i+1) % 8];
        drawLine(buf, size, ax, ay, bx, by, RED, sw);
    }
}

function drawCheck(buf, size, sw) {
    const cx = size / 2, cy = size / 2;
    const s  = size * 0.29;
    // Three points of the check: left tip, bottom bend, right tip
    const p1 = [cx - s * 0.85, cy + s * 0.05];
    const p2 = [cx - s * 0.05, cy + s * 0.78];
    const p3 = [cx + s * 0.95, cy - s * 0.62];
    drawLine(buf, size, p1[0], p1[1], p2[0], p2[1], WHITE, sw);
    drawLine(buf, size, p2[0], p2[1], p3[0], p3[1], WHITE, sw);
}

// ── PNG encode ────────────────────────────────────────────────────────
function encodePNG(buf, size) {
    const rowLen = 1 + size * 4;          // filter byte + RGBA pixels
    const raw    = Buffer.alloc(size * rowLen);
    for (let y = 0; y < size; y++) {
        raw[y * rowLen] = 0;               // filter: None
        for (let x = 0; x < size; x++) {
            const si = (y * size + x) * 4;
            const di = y * rowLen + 1 + x * 4;
            raw[di]   = buf[si];
            raw[di+1] = buf[si+1];
            raw[di+2] = buf[si+2];
            raw[di+3] = buf[si+3];
        }
    }
    const compressed = zlib.deflateSync(raw, { level: 9 });

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;   // bit depth
    ihdr[9] = 6;   // RGBA
    // compression, filter, interlace = 0

    const SIG = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
    return Buffer.concat([
        SIG,
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', compressed),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

// ── ICO format (RFC 5756 / Windows ICO with embedded PNG) ─────────────
function createICO(png32buf) {
    const HEADER_SZ    = 6;
    const DIR_ENTRY_SZ = 16;
    const imgOffset    = HEADER_SZ + DIR_ENTRY_SZ;
    const ico = Buffer.alloc(imgOffset + png32buf.length);

    ico.writeUInt16LE(0, 0);  // reserved
    ico.writeUInt16LE(1, 2);  // type 1 = ICO
    ico.writeUInt16LE(1, 4);  // 1 image

    // ICONDIRENTRY
    ico[6]  = 32;  // width  (0 means 256)
    ico[7]  = 32;  // height
    ico[8]  = 0;   // color count
    ico[9]  = 0;   // reserved
    ico.writeUInt16LE(1, 10);  // planes
    ico.writeUInt16LE(32, 12); // bpp
    ico.writeUInt32LE(png32buf.length, 14);
    ico.writeUInt32LE(imgOffset, 18);

    png32buf.copy(ico, imgOffset);
    return ico;
}

// ── Generate ──────────────────────────────────────────────────────────
function generate(size, octSwRatio, chkSwRatio) {
    const canvas = makeCanvas(size);
    drawOctagon(canvas, size, size * octSwRatio);
    drawCheck(canvas, size, size * chkSwRatio);
    return encodePNG(canvas, size);
}

const OUT = path.join(__dirname, '..', 'public');

const png32  = generate(32,  0.13, 0.115);
const png192 = generate(192, 0.057, 0.052);
const png180 = generate(180, 0.057, 0.052);

fs.writeFileSync(path.join(OUT, 'favicon-32x32.png'),    png32);
fs.writeFileSync(path.join(OUT, 'favicon-192x192.png'),  png192);
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), png180);
fs.writeFileSync(path.join(OUT, 'favicon.ico'),          createICO(png32));

console.log('✓ public/favicon-32x32.png');
console.log('✓ public/favicon-192x192.png');
console.log('✓ public/apple-touch-icon.png');
console.log('✓ public/favicon.ico');
