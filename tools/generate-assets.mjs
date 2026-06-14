import { deflateSync, inflateSync } from 'node:zlib';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDir = join(root, 'assets', 'source');
const iconOutputDir = join(root, 'assets', 'icons');
const promoOutputDir = join(root, 'assets', 'store', 'promo');

const GENERATED_ASSETS = Object.freeze({
  icons: Object.freeze([
    { size: 16, output: join(iconOutputDir, 'icon16.png'), muted: false },
    { size: 32, output: join(iconOutputDir, 'icon32.png'), muted: false },
    { size: 48, output: join(iconOutputDir, 'icon48.png'), muted: false },
    { size: 128, output: join(iconOutputDir, 'icon128.png'), muted: false },
    { size: 16, output: join(iconOutputDir, 'icon-muted16.png'), muted: true },
    { size: 32, output: join(iconOutputDir, 'icon-muted32.png'), muted: true },
    { size: 48, output: join(iconOutputDir, 'icon-muted48.png'), muted: true },
    { size: 128, output: join(iconOutputDir, 'icon-muted128.png'), muted: true },
  ]),
  promos: Object.freeze([
    {
      source: join(sourceDir, 'small_promo.png'),
      output: join(promoOutputDir, 'small-promo-440x280.png'),
      width: 440,
      height: 280,
    },
    {
      source: join(sourceDir, 'marquee_promo.png'),
      output: join(promoOutputDir, 'marquee-promo-1400x560.png'),
      width: 1400,
      height: 560,
    },
  ]),
});

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
    Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * @param {Buffer} file
 * @returns {{ width: number, height: number, bitDepth: number, colorType: number, interlace: number, idat: Buffer }}
 */
function readPngChunks(file) {
  if (!file.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('Expected a PNG file.');
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatParts = [];

  for (let offset = PNG_SIGNATURE.length; offset < file.length;) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = file.subarray(dataStart, dataEnd);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idatParts.push(data);
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4;
  }

  return {
    width,
    height,
    bitDepth,
    colorType,
    interlace,
    idat: Buffer.concat(idatParts),
  };
}

/**
 * @param {number} colorType
 * @returns {number}
 */
function getChannelCount(colorType) {
  if (colorType === 0) {
    return 1;
  }
  if (colorType === 2) {
    return 3;
  }
  if (colorType === 4) {
    return 2;
  }
  if (colorType === 6) {
    return 4;
  }
  throw new Error(`Unsupported PNG color type: ${colorType}.`);
}

/**
 * @param {number} filter
 * @param {number} x
 * @param {Uint8Array} scanline
 * @param {Uint8Array} previous
 * @param {number} bytesPerPixel
 * @returns {number}
 */
function getFilterPrediction(filter, x, scanline, previous, bytesPerPixel) {
  const left = x >= bytesPerPixel ? scanline[x - bytesPerPixel] : 0;
  const up = previous[x] ?? 0;
  const upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] ?? 0 : 0;

  if (filter === 0) {
    return 0;
  }
  if (filter === 1) {
    return left;
  }
  if (filter === 2) {
    return up;
  }
  if (filter === 3) {
    return Math.floor((left + up) / 2);
  }
  if (filter === 4) {
    const p = left + up - upperLeft;
    const pa = Math.abs(p - left);
    const pb = Math.abs(p - up);
    const pc = Math.abs(p - upperLeft);
    if (pa <= pb && pa <= pc) {
      return left;
    }
    return pb <= pc ? up : upperLeft;
  }
  throw new Error(`Unsupported PNG filter: ${filter}.`);
}

/**
 * @param {string} path
 * @returns {{ width: number, height: number, pixels: Uint8ClampedArray }}
 */
function decodePng(path) {
  const { width, height, bitDepth, colorType, interlace, idat } = readPngChunks(readFileSync(path));
  if (bitDepth !== 8) {
    throw new Error(`${relative(root, path)} uses unsupported PNG bit depth ${bitDepth}; expected 8.`);
  }
  if (interlace !== 0) {
    throw new Error(`${relative(root, path)} uses unsupported PNG interlacing.`);
  }

  const channels = getChannelCount(colorType);
  const stride = width * channels;
  const raw = inflateSync(idat);
  const pixels = new Uint8ClampedArray(width * height * 4);
  let rawOffset = 0;
  let previous = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset];
    rawOffset += 1;
    const scanline = new Uint8Array(stride);
    for (let x = 0; x < stride; x += 1) {
      scanline[x] = (raw[rawOffset + x] + getFilterPrediction(filter, x, scanline, previous, channels)) & 0xff;
    }
    rawOffset += stride;

    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      if (colorType === 0) {
        pixels[target] = scanline[source];
        pixels[target + 1] = scanline[source];
        pixels[target + 2] = scanline[source];
        pixels[target + 3] = 255;
      } else if (colorType === 2) {
        pixels[target] = scanline[source];
        pixels[target + 1] = scanline[source + 1];
        pixels[target + 2] = scanline[source + 2];
        pixels[target + 3] = 255;
      } else if (colorType === 4) {
        pixels[target] = scanline[source];
        pixels[target + 1] = scanline[source];
        pixels[target + 2] = scanline[source];
        pixels[target + 3] = scanline[source + 1];
      } else {
        pixels[target] = scanline[source];
        pixels[target + 1] = scanline[source + 1];
        pixels[target + 2] = scanline[source + 2];
        pixels[target + 3] = scanline[source + 3];
      }
    }
    previous = scanline;
  }

  return { width, height, pixels };
}

/**
 * @param {{ width: number, height: number, pixels: Uint8ClampedArray }} image
 * @param {{ minimumChannel: number, maximumSpread: number }} options
 */
function clearLightEdgeBackground(image, options) {
  const queue = [];
  const visited = new Uint8Array(image.width * image.height);

  const isBackground = (x, y) => {
    const offset = (y * image.width + x) * 4;
    const red = image.pixels[offset];
    const green = image.pixels[offset + 1];
    const blue = image.pixels[offset + 2];
    return Math.min(red, green, blue) >= options.minimumChannel
      && Math.max(red, green, blue) - Math.min(red, green, blue) <= options.maximumSpread;
  };

  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
      return;
    }
    const index = y * image.width + x;
    if (visited[index] || !isBackground(x, y)) {
      return;
    }
    visited[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < image.width; x += 1) {
    enqueue(x, 0);
    enqueue(x, image.height - 1);
  }
  for (let y = 0; y < image.height; y += 1) {
    enqueue(0, y);
    enqueue(image.width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % image.width;
    const y = Math.floor(index / image.width);
    image.pixels[index * 4 + 3] = 0;
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }
}

/**
 * @param {{ width: number, height: number, pixels: Uint8ClampedArray }} image
 * @param {number} targetWidth
 * @param {number} targetHeight
 * @returns {{ width: number, height: number, pixels: Uint8ClampedArray }}
 */
function centerCrop(image, targetWidth, targetHeight) {
  const sourceRatio = image.width / image.height;
  const targetRatio = targetWidth / targetHeight;
  const cropWidth = sourceRatio > targetRatio ? Math.round(image.height * targetRatio) : image.width;
  const cropHeight = sourceRatio > targetRatio ? image.height : Math.round(image.width / targetRatio);
  const cropX = Math.floor((image.width - cropWidth) / 2);
  const cropY = Math.floor((image.height - cropHeight) / 2);
  const pixels = new Uint8ClampedArray(cropWidth * cropHeight * 4);

  for (let y = 0; y < cropHeight; y += 1) {
    const sourceOffset = ((cropY + y) * image.width + cropX) * 4;
    const targetOffset = y * cropWidth * 4;
    pixels.set(image.pixels.subarray(sourceOffset, sourceOffset + cropWidth * 4), targetOffset);
  }

  return { width: cropWidth, height: cropHeight, pixels };
}

/**
 * @param {{ width: number, height: number, pixels: Uint8ClampedArray }} image
 * @param {number} targetWidth
 * @param {number} targetHeight
 * @returns {{ width: number, height: number, pixels: Uint8ClampedArray }}
 */
function resizeImage(image, targetWidth, targetHeight) {
  if (image.width === targetWidth && image.height === targetHeight) {
    return { width: targetWidth, height: targetHeight, pixels: new Uint8ClampedArray(image.pixels) };
  }

  const pixels = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const scaleX = image.width / targetWidth;
  const scaleY = image.height / targetHeight;

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceYStart = Math.floor(y * scaleY);
    const sourceYEnd = Math.max(sourceYStart + 1, Math.ceil((y + 1) * scaleY));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceXStart = Math.floor(x * scaleX);
      const sourceXEnd = Math.max(sourceXStart + 1, Math.ceil((x + 1) * scaleX));
      let alphaSum = 0;
      let redSum = 0;
      let greenSum = 0;
      let blueSum = 0;
      let count = 0;

      for (let sourceY = sourceYStart; sourceY < sourceYEnd; sourceY += 1) {
        for (let sourceX = sourceXStart; sourceX < sourceXEnd; sourceX += 1) {
          const sourceOffset = (sourceY * image.width + sourceX) * 4;
          const alpha = image.pixels[sourceOffset + 3];
          redSum += image.pixels[sourceOffset] * alpha;
          greenSum += image.pixels[sourceOffset + 1] * alpha;
          blueSum += image.pixels[sourceOffset + 2] * alpha;
          alphaSum += alpha;
          count += 1;
        }
      }

      const targetOffset = (y * targetWidth + x) * 4;
      pixels[targetOffset] = alphaSum ? Math.round(redSum / alphaSum) : 0;
      pixels[targetOffset + 1] = alphaSum ? Math.round(greenSum / alphaSum) : 0;
      pixels[targetOffset + 2] = alphaSum ? Math.round(blueSum / alphaSum) : 0;
      pixels[targetOffset + 3] = Math.round(alphaSum / count);
    }
  }

  return { width: targetWidth, height: targetHeight, pixels };
}

/**
 * @param {{ width: number, height: number, pixels: Uint8ClampedArray }} image
 * @returns {{ width: number, height: number, pixels: Uint8ClampedArray }}
 */
function muteIcon(image) {
  const pixels = new Uint8ClampedArray(image.pixels);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const alpha = pixels[offset + 3];
    if (alpha === 0) {
      continue;
    }

    const luminance = Math.round(
      pixels[offset] * 0.299
      + pixels[offset + 1] * 0.587
      + pixels[offset + 2] * 0.114
    );
    const muted = Math.round(luminance * 0.72 + 132 * 0.28);
    pixels[offset] = muted;
    pixels[offset + 1] = muted;
    pixels[offset + 2] = muted;
    pixels[offset + 3] = Math.round(alpha * 0.58);
  }

  return { width: image.width, height: image.height, pixels };
}

/**
 * @param {string} path
 * @returns {{ width: number, height: number }}
 */
function getPngDimensions(path) {
  const file = readFileSync(path);
  if (!file.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error(`${relative(root, path)} is not a PNG file.`);
  }
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
  };
}

/**
 * @param {string} path
 * @returns {string}
 */
function prettyPath(path) {
  return relative(root, path).replaceAll('\\', '/');
}

/**
 * @param {{ log?: boolean }} [options]
 * @returns {Promise<void>}
 */
export async function generateAssets({ log = true } = {}) {
  mkdirSync(iconOutputDir, { recursive: true });
  mkdirSync(promoOutputDir, { recursive: true });

  const iconSourcePath = join(sourceDir, 'icon.png');
  const iconSource = centerCrop(decodePng(iconSourcePath), 1, 1);
  clearLightEdgeBackground(iconSource, { minimumChannel: 235, maximumSpread: 18 });

  for (const icon of GENERATED_ASSETS.icons) {
    const resized = resizeImage(iconSource, icon.size, icon.size);
    const output = icon.muted ? muteIcon(resized) : resized;
    writeFileSync(icon.output, encodePng(output.width, output.height, output.pixels));
    if (log) {
      console.log(`Generated ${prettyPath(icon.output)} (${icon.size}x${icon.size}).`);
    }
  }

  for (const promo of GENERATED_ASSETS.promos) {
    const dimensions = getPngDimensions(promo.source);
    if (dimensions.width === promo.width && dimensions.height === promo.height) {
      copyFileSync(promo.source, promo.output);
    } else {
      const resized = resizeImage(centerCrop(decodePng(promo.source), promo.width, promo.height), promo.width, promo.height);
      writeFileSync(promo.output, encodePng(resized.width, resized.height, resized.pixels));
    }
    if (log) {
      console.log(`Generated ${prettyPath(promo.output)} (${promo.width}x${promo.height}).`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generateAssets();
}
