import { deflateRawSync } from 'node:zlib';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, 'dist');
const manifestPath = join(root, 'manifest.json');
const packagePath = join(root, 'package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));

if (manifest.version !== packageJson.version) {
  throw new Error(`Version mismatch: manifest.json has ${manifest.version}, package.json has ${packageJson.version}.`);
}

const packageName = `xkcd-reading-tracker-v${manifest.version}.zip`;
const outputPath = join(distDir, packageName);
const packageRoots = [
  'manifest.json',
  'LICENSE',
  'assets/icons',
  'src',
];

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
 * @param {Date} date
 * @returns {{ time: number, date: number }}
 */
function toDosDateTime(date) {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  };
}

/**
 * @param {string} entryPath
 * @returns {string[]}
 */
function listPackageFiles(entryPath) {
  const absolute = join(root, entryPath);
  if (!existsSync(absolute)) {
    throw new Error(`Package entry does not exist: ${entryPath}`);
  }

  const stats = statSync(absolute);
  if (stats.isFile()) {
    return [entryPath];
  }

  if (!stats.isDirectory()) {
    return [];
  }

  return readdirSync(absolute, { withFileTypes: true })
    .flatMap((entry) => listPackageFiles(join(entryPath, entry.name)))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * @param {string[]} files
 * @returns {Buffer}
 */
function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { time, date } = toDosDateTime(new Date('2026-01-01T00:00:00.000Z'));

  for (const file of files) {
    const data = readFileSync(join(root, file));
    const compressed = deflateRawSync(data, { level: 9 });
    const name = file.replaceAll('\\', '/');
    const nameBuffer = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

/**
 * @param {Buffer} zip
 * @returns {string[]}
 */
function listZipEntries(zip) {
  const entries = [];

  for (let offset = 0; offset + 30 <= zip.length;) {
    const signature = zip.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      break;
    }

    const compressionMethod = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const fileNameLength = zip.readUInt16LE(offset + 26);
    const extraFieldLength = zip.readUInt16LE(offset + 28);
    const fileNameStart = offset + 30;
    const fileNameEnd = fileNameStart + fileNameLength;
    if (compressionMethod !== 8) {
      throw new Error(`Unexpected ZIP compression method ${compressionMethod}.`);
    }
    if (fileNameEnd > zip.length) {
      throw new Error('ZIP file name extends past the end of the archive.');
    }

    entries.push(zip.toString('utf8', fileNameStart, fileNameEnd));
    offset = fileNameEnd + extraFieldLength + compressedSize;
  }

  return entries;
}

/**
 * @param {Buffer} zip
 * @param {string[]} expectedFiles
 */
function verifyZipEntries(zip, expectedFiles) {
  const actual = listZipEntries(zip).toSorted();
  const expected = expectedFiles.toSorted();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Packaged ZIP contents differ from expected files.\nExpected: ${expected.join(', ')}\nActual: ${actual.join(', ')}`);
  }
}

const files = [...new Set(packageRoots.flatMap(listPackageFiles))]
  .map((file) => relative(root, join(root, file)).replaceAll('\\', '/'))
  .sort((a, b) => a.localeCompare(b));

mkdirSync(distDir, { recursive: true });
const zip = createZip(files);
verifyZipEntries(zip, files);
writeFileSync(outputPath, zip);

console.log(`Created ${relative(root, outputPath)} with ${files.length} files.`);
