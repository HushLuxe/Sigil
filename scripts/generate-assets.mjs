// Generate Sigil icon (512x512) and banner (1280x640) as PNGs.
// Pure Node, zero dependencies. Hand-rolled minimal PNG encoder
// (unindexed RGBA + deflate via zlib). Writes:
//   assets/icon.png
//   assets/banner.png
//
// Design: a stylized "S" sigil mark on a dark midnight background,
// with a subtle radial gradient and a ring. The banner adds the
// project name and tagline.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- minimal PNG encoder (RGBA, 8-bit, no interlace) ----------

function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(width, height, rgba) {
  // Add a 0x00 filter byte at the start of every scanline.
  const stride = width * 4;
  const filtered = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    filtered[y * (stride + 1)] = 0;
    rgba.copy(filtered, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(filtered, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- design helpers ----------

function rgbaAt(buf, x, y, w) {
  const i = (y * w + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
}
function setPx(buf, x, y, w, r, g, b, a) {
  const i = (y * w + x) * 4;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
}
function blend(dst, x, y, w, r, g, b, a) {
  if (a === 0) return;
  const i = (y * w + x) * 4;
  const dr = dst[i], dg = dst[i + 1], db = dst[i + 2], da = dst[i + 3];
  const sa = a / 255;
  const ia = 1 - sa;
  dst[i]     = Math.round(r * sa + dr * ia);
  dst[i + 1] = Math.round(g * sa + dg * ia);
  dst[i + 2] = Math.round(b * sa + db * ia);
  dst[i + 3] = Math.max(da, a);
}

function inDisc(x, y, cx, cy, r) {
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function inRing(x, y, cx, cy, rOuter, rInner) {
  const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
  return d2 <= rOuter * rOuter && d2 >= rInner * rInner;
}
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 - r || x > x1 + r || y < y0 - r || y > y1 + r) return false;
  if (x >= x0 && x <= x1 && y >= y0 - r && y <= y1 + r) return true;
  if (x >= x0 - r && x <= x1 + r && y >= y0 && y <= y1) return true;
  // corner checks
  const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
  for (const [cx, cy] of corners) {
    if (inDisc(x, y, cx, cy, r)) return true;
  }
  return false;
}

// ---------- Sigil "S" mark (stylised) ----------
// Drawn as two arcs + a middle bar so it reads as a sigil/seal even at icon size.
function drawSigilMark(buf, w, h, cx, cy, radius, color) {
  const r = radius;
  // outer ring
  for (let y = Math.max(0, cy - r - 2); y < Math.min(h, cy + r + 2); y++) {
    for (let x = Math.max(0, cx - r - 2); x < Math.min(w, cx + r + 2); x++) {
      if (inRing(x, y, cx, cy, r, r - 4)) {
        blend(buf, x, y, w, color[0], color[1], color[2], 255);
      }
    }
  }
  // the "S" — three filled segments (top arc, middle bar, bottom arc)
  // drawn as filled shapes that together read as a stylised S
  const r1 = r * 0.62;   // outer arc radius
  const r2 = r * 0.38;   // inner arc radius
  const t  = Math.max(2, Math.round(r * 0.18));  // stroke thickness

  // top arc (C opening down-right)
  for (let y = Math.max(0, cy - r1 - t); y < Math.min(h, cy + 1); y++) {
    for (let x = Math.max(0, cx - r1 - t); x < Math.min(w, cx + r1 + t); x++) {
      const dx = x - cx, dy = y - cy;
      const d2 = dx * dx + dy * dy;
      const inOuter = d2 <= (r1 + t / 2) * (r1 + t / 2);
      const inInner = d2 <= (r1 - t / 2) * (r1 - t / 2);
      const aboveMid = dy < 0;
      const onRight  = dx > 0;
      if (inOuter && !inInner && aboveMid && onRight) {
        blend(buf, x, y, w, color[0], color[1], color[2], 255);
      }
    }
  }
  // bottom arc (C opening up-left)
  for (let y = Math.max(0, cy); y < Math.min(h, cy + r1 + t); y++) {
    for (let x = Math.max(0, cx - r1 - t); x < Math.min(w, cx + r1 + t); x++) {
      const dx = x - cx, dy = y - cy;
      const d2 = dx * dx + dy * dy;
      const inOuter = d2 <= (r1 + t / 2) * (r1 + t / 2);
      const inInner = d2 <= (r1 - t / 2) * (r1 - t / 2);
      const belowMid = dy > 0;
      const onLeft   = dx < 0;
      if (inOuter && !inInner && belowMid && onLeft) {
        blend(buf, x, y, w, color[0], color[1], color[2], 255);
      }
    }
  }
  // middle diagonal bar
  const barLen = Math.round(r1 * 1.4);
  const barT   = Math.max(3, Math.round(r * 0.20));
  for (let i = -barLen / 2; i <= barLen / 2; i++) {
    for (let dy2 = -barT / 2; dy2 <= barT / 2; dy2++) {
      const x = Math.round(cx + i);
      const y = Math.round(cy + dy2 + i * 0.18); // slight tilt
      if (x >= 0 && x < w && y >= 0 && y < h) {
        blend(buf, x, y, w, color[0], color[1], color[2], 255);
      }
    }
  }
}

// ---------- background gradients ----------

function fillVerticalGradient(buf, w, h, top, bottom) {
  for (let y = 0; y < h; y++) {
    const t = h === 1 ? 0 : y / (h - 1);
    const r = Math.round(top[0] + (bottom[0] - top[0]) * t);
    const g = Math.round(top[1] + (bottom[1] - top[1]) * t);
    const b = Math.round(top[2] + (bottom[2] - top[2]) * t);
    for (let x = 0; x < w; x++) setPx(buf, x, y, w, r, g, b, 255);
  }
}

function addRadialGlow(buf, w, h, cx, cy, r, color) {
  for (let y = Math.max(0, cy - r); y < Math.min(h, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x < Math.min(w, cx + r); x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= r) continue;
      const a = Math.max(0, 1 - d / r);
      blend(buf, x, y, w, color[0], color[1], color[2], Math.round(180 * a * a));
    }
  }
}

// ---------- 5x7 bitmap font for the wordmark ----------
// Each glyph is 5 cols x 7 rows. 1 = pixel, 0 = empty.

const FONT = {
  "S": ["01110","10001","10000","01110","00001","00001","11110"],
  "I": ["11111","00100","00100","00100","00100","00100","11111"],
  "G": ["01110","10001","10000","10111","10001","10001","01110"],
  "L": ["10000","10000","10000","10000","10000","10000","11111"],
  "P": ["11110","10001","10001","11110","10000","10000","10000"],
  "R": ["11110","10001","10001","11110","10100","10010","10001"],
  "V": ["10001","10001","10001","10001","10001","01010","00100"],
  "A": ["01110","10001","10001","11111","10001","10001","10001"],
  "E": ["11111","10000","10000","11110","10000","10000","11111"],
  "T": ["11111","00100","00100","00100","00100","00100","00100"],
  "C": ["01110","10001","10000","10000","10000","10001","01110"],
  "O": ["01110","10001","10001","10001","10001","10001","01110"],
  "Y": ["10001","10001","01010","00100","00100","00100","00100"],
  "N": ["10001","11001","10101","10011","10001","10001","10001"],
  "D": ["11110","10001","10001","10001","10001","10001","11110"],
  "U": ["10001","10001","10001","10001","10001","10001","01110"],
  "Z": ["11111","00001","00010","00100","01000","10000","11111"],
  "M": ["10001","11011","10101","10001","10001","10001","10001"],
  "B": ["11110","10001","10001","11110","10001","10001","11110"],
  "F": ["11111","10000","10000","11110","10000","10000","10000"],
  "H": ["10001","10001","10001","11111","10001","10001","10001"],
  "W": ["10001","10001","10001","10001","10101","11011","10001"],
  "K": ["10001","10010","10100","11000","10100","10010","10001"],
  "Q": ["01110","10001","10001","10001","10101","10010","01101"],
  "X": ["10001","10001","01010","00100","01010","10001","10001"],
  "J": ["00001","00001","00001","00001","10001","10001","01110"],
  "0": ["01110","10001","10011","10101","11001","10001","01110"],
  "1": ["00100","01100","00100","00100","00100","00100","01110"],
  "2": ["01110","10001","00001","00010","00100","01000","11111"],
  "3": ["11110","00001","00001","01110","00001","00001","11110"],
  "4": ["00010","00110","01010","10010","11111","00010","00010"],
  "5": ["11111","10000","11110","00001","00001","10001","01110"],
  "6": ["00110","01000","10000","11110","10001","10001","01110"],
  "7": ["11111","00001","00010","00100","01000","01000","01000"],
  "8": ["01110","10001","10001","01110","10001","10001","01110"],
  "9": ["01110","10001","10001","01111","00001","00010","01100"],
  " ": ["00000","00000","00000","00000","00000","00000","00000"],
  "-": ["00000","00000","00000","11111","00000","00000","00000"],
  ".": ["00000","00000","00000","00000","00000","00110","00110"],
  ",": ["00000","00000","00000","00000","00110","00110","01000"],
  ":": ["00000","00110","00110","00000","00110","00110","00000"],
  "/": ["00001","00010","00010","00100","01000","01000","10000"],
  "(": ["00010","00100","01000","01000","01000","00100","00010"],
  ")": ["01000","00100","00010","00010","00010","00100","01000"],
  "&": ["01100","10010","10100","01000","10101","10010","01101"],
};

function drawText(buf, w, h, text, x0, y0, scale, color) {
  const charW = 5, charH = 7;
  const adv  = charW + 1; // 1 px tracking
  let cx = x0;
  for (const ch of text.toUpperCase()) {
    const g = FONT[ch] || FONT[" "];
    for (let row = 0; row < charH; row++) {
      for (let col = 0; col < charW; col++) {
        if (g[row][col] === "1") {
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              const px = cx + col * scale + dx;
              const py = y0 + row * scale + dy;
              if (px >= 0 && px < w && py >= 0 && py < h) {
                blend(buf, px, py, w, color[0], color[1], color[2], 255);
              }
            }
          }
        }
      }
    }
    cx += adv * scale;
  }
  return cx; // returns the x where text ended (for measuring)
}

function measureText(text, scale) {
  return text.length * (5 + 1) * scale;
}

// ---------- MARK (1024x1024) — the icon, no text ----------

function makeMark() {
  const W = 1024, H = 1024;
  const buf = Buffer.alloc(W * H * 4);
  fillVerticalGradient(buf, W, H, [14, 18, 48], [4, 6, 18]);
  addRadialGlow(buf, W, H, W / 2, H / 2, W * 0.45, [88, 110, 220]);
  drawSigilMark(buf, W, H, W / 2, H / 2, W * 0.36, [232, 240, 255]);
  return encodePNG(W, H, buf);
}

// ---------- ICON (512x512) — same mark, smaller ----------

function makeIcon() {
  const W = 512, H = 512;
  const buf = Buffer.alloc(W * H * 4);
  fillVerticalGradient(buf, W, H, [14, 18, 48], [4, 6, 18]);
  addRadialGlow(buf, W, H, W / 2, H / 2, W * 0.45, [88, 110, 220]);
  drawSigilMark(buf, W, H, W / 2, H / 2, W * 0.36, [232, 240, 255]);
  return encodePNG(W, H, buf);
}

// ---------- LOGO (1600x600) — mark + wordmark side by side ----------

function makeLogo() {
  const W = 1600, H = 600;
  const buf = Buffer.alloc(W * H * 4);
  fillVerticalGradient(buf, W, H, [16, 20, 56], [4, 6, 18]);
  addRadialGlow(buf, W, H, 360, 300, 420, [70, 96, 220]);
  addRadialGlow(buf, W, H, 1240, 300, 360, [120, 80, 220]);

  // the mark, left
  drawSigilMark(buf, W, H, 360, 300, 180, [232, 240, 255]);

  // wordmark, right
  const wordX = 640;
  const text  = [240, 244, 255];
  const dim   = [170, 180, 210];

  // SIGIL — big
  const sigilText  = "SIGIL";
  const sigilScale = 22;
  drawText(buf, W, H, sigilText, wordX, 200, sigilScale, text);

  // divider rule
  const ruleY = 200 + 7 * sigilScale + 18;
  for (let x = wordX; x < wordX + 760; x++) {
    blend(buf, x, ruleY, W, 120, 140, 200, 120);
  }

  // tagline
  const tag     = "EVERY ACTION BEARS A SIGIL";
  const tagScale = 5;
  drawText(buf, W, H, tag, wordX, ruleY + 18, tagScale, dim);

  return encodePNG(W, H, buf);
}

// ---------- BANNER (1280x640) — social card / submission cover ----------

function makeBanner() {
  const W = 1280, H = 640;
  const buf = Buffer.alloc(W * H * 4);
  fillVerticalGradient(buf, W, H, [16, 20, 56], [4, 6, 18]);
  addRadialGlow(buf, W, H, 360, 320, 420, [70, 96, 220]);
  addRadialGlow(buf, W, H, 980, 360, 360, [120, 80, 220]);

  // the mark, left side
  drawSigilMark(buf, W, H, 360, 320, 170, [232, 240, 255]);

  // wordmark + tagline, right side
  const textX = 600;
  const textColor = [240, 244, 255];
  const dim      = [170, 180, 210];

  // SIGIL — big
  const sigilText = "SIGIL";
  const sigilScale = 14;
  drawText(buf, W, H, sigilText, textX, 200, sigilScale, textColor);

  // tagline
  const tag = "EVERY ACTION BEARS A SIGIL";
  const tagScale = 4;
  drawText(buf, W, H, tag, textX, 200 + 7 * sigilScale + 28, tagScale, dim);

  // URL line
  const url = "GITHUB.COM / HUSHLUXE / SIGIL";
  const urlScale = 3;
  drawText(buf, W, H, url, textX, 200 + 7 * sigilScale + 28 + 7 * tagScale + 36, urlScale, [140, 160, 210]);

  return encodePNG(W, H, buf);
}

// ---------- write ----------

const outDir = path.join(__dirname, "..", "assets");
fs.mkdirSync(outDir, { recursive: true });

const mark = makeMark();
fs.writeFileSync(path.join(outDir, "mark.png"), mark);
const icon = makeIcon();
fs.writeFileSync(path.join(outDir, "icon.png"), icon);
const logo = makeLogo();
fs.writeFileSync(path.join(outDir, "logo.png"), logo);
const banner = makeBanner();
fs.writeFileSync(path.join(outDir, "banner.png"), banner);

console.log("wrote", path.join(outDir, "mark.png"),   "(" + mark.length   + " bytes)");
console.log("wrote", path.join(outDir, "icon.png"),   "(" + icon.length   + " bytes)");
console.log("wrote", path.join(outDir, "logo.png"),   "(" + logo.length   + " bytes)");
console.log("wrote", path.join(outDir, "banner.png"), "(" + banner.length + " bytes)");
