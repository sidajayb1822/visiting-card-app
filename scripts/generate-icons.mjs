/**
 * Generates the PWA icons into public/.
 *
 * Rolls a small PNG encoder on top of node:zlib rather than pulling in an image
 * library, since this runs once and the artwork is a few rectangles. Re-run with
 * `npm run icons` after changing the design.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const BLUE = [37, 99, 235]; // #2563eb, matches theme_color
const WHITE = [255, 255, 255];
const INK = [148, 163, 184];

/** Supersampling factor; the icon is rendered large and averaged down. */
const SS = 4;

// ---------------------------------------------------------------- PNG encoding

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // Each scanline is prefixed with its filter type; 0 means "none".
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------- Rendering

/**
 * Standard rounded-rectangle signed distance: collapse the point onto the inner
 * rect, then measure how far outside the corner radius it lands.
 */
function insideRoundedRect(x, y, rx, ry, rw, rh, radius) {
  const qx = Math.max(rx + radius - x, 0, x - (rx + rw - radius));
  const qy = Math.max(ry + radius - y, 0, y - (ry + rh - radius));
  return Math.hypot(qx, qy) <= radius;
}

/**
 * Paints one icon.
 *
 * `inset` is the fraction of the canvas kept clear around the artwork. Maskable
 * icons get a wide inset so the card survives whatever shape Android crops to.
 */
function renderIcon(size, { rounded, inset }) {
  const big = size * SS;
  const pixels = Buffer.alloc(big * big * 4);

  const bgRadius = rounded ? big * 0.22 : 0;

  // The card, centred, at business-card proportions.
  const cardW = big * (1 - inset * 2);
  const cardH = cardW * (55 / 85);
  const cardX = (big - cardW) / 2;
  const cardY = (big - cardH) / 2;
  const cardRadius = cardW * 0.06;

  for (let y = 0; y < big; y++) {
    for (let x = 0; x < big; x++) {
      const i = (y * big + x) * 4;
      const px = x + 0.5;
      const py = y + 0.5;

      let colour = null;

      if (insideRoundedRect(px, py, 0, 0, big, big, bgRadius)) {
        colour = BLUE;
      }

      if (colour && insideRoundedRect(px, py, cardX, cardY, cardW, cardH, cardRadius)) {
        colour = WHITE;

        // A photo square and three text lines, laid out off the card's own box
        // so they track the inset.
        const padding = cardW * 0.09;
        const photo = cardH * 0.34;
        const photoX = cardX + padding;
        const photoY = cardY + padding;

        if (
          px >= photoX &&
          px <= photoX + photo &&
          py >= photoY &&
          py <= photoY + photo
        ) {
          colour = BLUE;
        }

        const lineX = photoX + photo + padding * 0.8;
        const lineW = cardX + cardW - padding - lineX;
        const lineH = cardH * 0.08;

        for (let n = 0; n < 3; n++) {
          const lineY = photoY + n * lineH * 2.1;
          const width = n === 2 ? lineW * 0.6 : lineW;
          if (px >= lineX && px <= lineX + width && py >= lineY && py <= lineY + lineH) {
            colour = n === 0 ? BLUE : INK;
          }
        }

        // Bottom rule, standing in for the address line.
        const ruleY = cardY + cardH - padding - cardH * 0.07;
        if (
          px >= cardX + padding &&
          px <= cardX + cardW - padding &&
          py >= ruleY &&
          py <= ruleY + cardH * 0.07
        ) {
          colour = INK;
        }
      }

      if (colour) {
        pixels[i] = colour[0];
        pixels[i + 1] = colour[1];
        pixels[i + 2] = colour[2];
        pixels[i + 3] = 255;
      }
    }
  }

  // Average each SS×SS block down, which anti-aliases the curves.
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * big + (x * SS + sx)) * 4;
          const alpha = pixels[i + 3] / 255;
          r += pixels[i] * alpha;
          g += pixels[i + 1] * alpha;
          b += pixels[i + 2] * alpha;
          a += alpha;
        }
      }
      const samples = SS * SS;
      const o = (y * size + x) * 4;
      // Un-premultiply so edge pixels keep their colour rather than darkening.
      out[o] = a ? Math.round(r / a) : 0;
      out[o + 1] = a ? Math.round(g / a) : 0;
      out[o + 2] = a ? Math.round(b / a) : 0;
      out[o + 3] = Math.round((a / samples) * 255);
    }
  }

  return encodePng(size, size, out);
}

const ICONS = [
  { file: "icon-192.png", size: 192, rounded: true, inset: 0.19 },
  { file: "icon-512.png", size: 512, rounded: true, inset: 0.19 },
  // Maskable art must survive an aggressive crop, so it sits in the safe zone.
  { file: "icon-maskable-512.png", size: 512, rounded: false, inset: 0.27 },
  // iOS applies its own mask; a pre-rounded icon would get rounded twice.
  { file: "apple-touch-icon.png", size: 180, rounded: false, inset: 0.19 },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const { file, size, rounded, inset } of ICONS) {
  writeFileSync(join(OUT_DIR, file), renderIcon(size, { rounded, inset }));
  console.log(`wrote public/${file} (${size}x${size})`);
}
