import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * @param {string} path
 * @returns {{ width: number, height: number }}
 */
function getPngDimensions(path) {
  const file = readFileSync(join(root, path));
  assert.equal(file.subarray(0, pngSignature.length).equals(pngSignature), true, `${path} should be a PNG`);
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
  };
}

test('generated extension icons have Chrome-required dimensions', () => {
  for (const size of [16, 32, 48, 128]) {
    for (const path of [
      `assets/icons/icon${size}.png`,
      `assets/icons/icon-muted${size}.png`,
    ]) {
      assert.equal(existsSync(join(root, path)), true, `${path} should exist`);
      assert.deepEqual(getPngDimensions(path), { width: size, height: size });
    }
  }
});

test('store promo assets have Chrome-required dimensions', () => {
  assert.deepEqual(getPngDimensions('assets/store/promo/small-promo-440x280.png'), { width: 440, height: 280 });
  assert.deepEqual(getPngDimensions('assets/store/promo/marquee-promo-1400x560.png'), { width: 1400, height: 560 });
});

test('GitHub social preview has recommended dimensions and upload size', () => {
  const path = 'assets/social/github-social-preview.png';
  assert.equal(existsSync(join(root, path)), true, `${path} should exist`);
  assert.deepEqual(getPngDimensions(path), { width: 1280, height: 640 });
  assert.equal(statSync(join(root, path)).size < 1024 * 1024, true, `${path} should be under 1 MB`);
});

test('store screenshots have Chrome-required dimensions', () => {
  for (const path of [
    'assets/store/screenshots/01-comic-page.png',
    'assets/store/screenshots/02-popup.png',
    'assets/store/screenshots/03-dashboard-overview.png',
    'assets/store/screenshots/04-dashboard-favorites.png',
    'assets/store/screenshots/05-dashboard-settings.png',
    'assets/store/screenshots/06-dashboard-diagnostics.png',
    'assets/store/screenshots/07-dark-mode-support.png',
  ]) {
    assert.equal(existsSync(join(root, path)), true, `${path} should exist`);
    assert.deepEqual(getPngDimensions(path), { width: 1280, height: 800 });
  }
});
