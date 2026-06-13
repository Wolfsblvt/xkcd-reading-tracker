import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDir = join(root, 'assets', 'icons');

const sizes = [16, 32, 48, 128];

/**
 * @param {Buffer} buffer
 * @returns {number}
 */
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * @param {string} type
 * @param {Buffer} data
 * @returns {Buffer}
 */
function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Uint8ClampedArray} pixels
 * @returns {Buffer}
 */
function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * @param {Uint8ClampedArray} pixels
 * @param {number} size
 * @param {number} x
 * @param {number} y
 * @param {[number, number, number, number]} color
 */
function setPixel(pixels, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }
  const offset = (Math.round(y) * size + Math.round(x)) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

/**
 * @param {Uint8ClampedArray} pixels
 * @param {number} size
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {number} thickness
 * @param {[number, number, number, number]} color
 */
function drawLine(pixels, size, x1, y1, x2, y2, thickness, color) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2;
  for (let step = 0; step <= steps; step += 1) {
    const t = steps === 0 ? 0 : step / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    for (let dx = -thickness; dx <= thickness; dx += 1) {
      for (let dy = -thickness; dy <= thickness; dy += 1) {
        if (dx * dx + dy * dy <= thickness * thickness) {
          setPixel(pixels, size, x + dx, y + dy, color);
        }
      }
    }
  }
}

/**
 * @param {Uint8ClampedArray} pixels
 * @param {number} size
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {[number, number, number, number]} color
 */
function fillRect(pixels, size, x, y, width, height, color) {
  for (let yy = y; yy < y + height; yy += 1) {
    for (let xx = x; xx < x + width; xx += 1) {
      setPixel(pixels, size, xx, yy, color);
    }
  }
}

/**
 * @param {number} size
 * @returns {Buffer}
 */
function createIcon(size) {
  const pixels = new Uint8ClampedArray(size * size * 4);
  const white = [255, 255, 255, 255];
  const black = [0, 0, 0, 255];
  const blue = [150, 168, 200, 255];
  const green = [47, 123, 76, 255];

  fillRect(pixels, size, 0, 0, size, size, white);

  const border = Math.max(1, Math.round(size * 0.055));
  fillRect(pixels, size, 0, 0, size, border, black);
  fillRect(pixels, size, 0, size - border, size, border, black);
  fillRect(pixels, size, 0, 0, border, size, black);
  fillRect(pixels, size, size - border, 0, border, size, black);

  const barY = Math.round(size * 0.24);
  fillRect(pixels, size, Math.round(size * 0.18), barY, Math.round(size * 0.64), Math.max(2, Math.round(size * 0.12)), blue);
  fillRect(pixels, size, Math.round(size * 0.18), Math.round(size * 0.46), Math.round(size * 0.48), Math.max(1, Math.round(size * 0.075)), black);
  fillRect(pixels, size, Math.round(size * 0.18), Math.round(size * 0.61), Math.round(size * 0.36), Math.max(1, Math.round(size * 0.075)), black);

  const thickness = Math.max(1, Math.round(size * 0.035));
  drawLine(pixels, size, size * 0.53, size * 0.68, size * 0.65, size * 0.80, thickness, green);
  drawLine(pixels, size, size * 0.65, size * 0.80, size * 0.84, size * 0.52, thickness, green);

  return encodePng(size, size, pixels);
}

mkdirSync(outputDir, { recursive: true });
for (const size of sizes) {
  writeFileSync(join(outputDir, `icon${size}.png`), createIcon(size));
}

