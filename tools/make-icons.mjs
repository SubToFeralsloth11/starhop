// Rasterize the app icon (planet, ring, orbit and ship) into PNGs with no dependencies.
// Run: npm run icons
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = { 'icon-180.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 };
const SS = 4; // supersampling per axis

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * Math.min(1, Math.max(0, t)));
const over = (dst, src, alpha) => mix(dst, src, alpha);

const BG_IN = hex('#4a24b8');
const BG_OUT = hex('#0b0630');
const P_LIGHT = hex('#fff3b0');
const P_MID = hex('#ffa51f');
const P_DARK = hex('#8f2f00');
const RING = hex('#ffe9a8');
const ORBIT = hex('#ffffff');
const SHIP = hex('#7df9ff');
const CX = 0.47;
const CY = 0.56;
const PR = 0.2;
const ORBIT_R = 0.33;
const TILT = -0.35;
const SHIP_ANG = -0.95;
const STARS = [
  [0.18, 0.2, 0.012],
  [0.8, 0.16, 0.009],
  [0.86, 0.72, 0.011],
  [0.12, 0.78, 0.008],
  [0.66, 0.08, 0.007],
];

function ringDist(x, y) {
  const dx = x - CX;
  const dy = y - CY;
  const c = Math.cos(TILT);
  const s = Math.sin(TILT);
  const rx = dx * c - dy * s;
  const ry = dx * s + dy * c;
  return { d: Math.abs(Math.hypot(rx / 0.33, ry / 0.085) - 1), front: ry > 0 };
}

function inTriangle(px, py, a, b, c) {
  const s = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const p = [px, py];
  const d1 = s(p, a, b);
  const d2 = s(p, b, c);
  const d3 = s(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

const shipX = CX + Math.cos(SHIP_ANG) * ORBIT_R;
const shipY = CY + Math.sin(SHIP_ANG) * ORBIT_R;
const tx = -Math.sin(SHIP_ANG);
const ty = Math.cos(SHIP_ANG);
const nx = -ty;
const ny = tx;
const L = 0.075;
// Nose points along the orbit tangent; the two tail corners sit behind it.
const SHIP_TRI = [
  [shipX + tx * L * 1.1, shipY + ty * L * 1.1],
  [shipX - tx * L * 0.9 + nx * L * 0.6, shipY - ty * L * 0.9 + ny * L * 0.6],
  [shipX - tx * L * 0.9 - nx * L * 0.6, shipY - ty * L * 0.9 - ny * L * 0.6],
];

function shade(x, y) {
  let col = mix(BG_IN, BG_OUT, Math.hypot(x - 0.5, y - 0.42) / 0.75);
  for (const [sx, sy, r] of STARS) {
    const d = Math.hypot(x - sx, y - sy);
    if (d < r * 3) col = over(col, [255, 255, 255], Math.max(0, 1 - d / (r * 3)) ** 2);
  }
  // Dashed orbit ring.
  const od = Math.abs(Math.hypot(x - CX, y - CY) - ORBIT_R);
  const ang = Math.atan2(y - CY, x - CX);
  if (od < 0.009 && Math.sin(ang * 14) > -0.2) col = over(col, ORBIT, 0.55);
  const ring = ringDist(x, y);
  if (!ring.front && ring.d < 0.12) col = over(col, RING, 0.55);
  // Planet glow and body.
  const pd = Math.hypot(x - CX, y - CY);
  if (pd < PR * 1.5) col = over(col, P_MID, Math.max(0, 1 - (pd - PR) / (PR * 0.5)) * 0.35);
  if (pd < PR) {
    const l = Math.hypot(x - (CX - PR * 0.4), y - (CY - PR * 0.45)) / (PR * 1.6);
    col = l < 0.5 ? mix(P_LIGHT, P_MID, l * 2) : mix(P_MID, P_DARK, (l - 0.5) * 2);
    const band = Math.sin((y - CY + (x - CX) * 0.3) * 60);
    if (band > 0.6) col = mix(col, P_LIGHT, 0.15);
  }
  if (ring.front && ring.d < 0.12) col = over(col, RING, 0.85);
  // Ship with glow.
  const sd = Math.hypot(x - shipX, y - shipY);
  if (sd < 0.12) col = over(col, SHIP, Math.max(0, 1 - sd / 0.12) ** 2 * 0.6);
  if (inTriangle(x, y, ...SHIP_TRI)) col = mix(SHIP, [255, 255, 255], 0.35);
  return col;
}

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  }));
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
          acc[0] += c[0];
          acc[1] += c[1];
          acc[2] += c[2];
        }
      }
      const o = py * (size * 3 + 1) + 1 + px * 3;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(acc[i] / (SS * SS));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(join(root, 'icons'), { recursive: true });
for (const [name, size] of Object.entries(SIZES)) {
  writeFileSync(join(root, 'icons', name), png(size));
  console.log('wrote', name);
}
