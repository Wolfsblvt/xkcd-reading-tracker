import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('manifest is valid JSON with minimal permissions and existing icons', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, packageJson.version);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(typeof manifest.name, 'string');
  assert.equal(typeof manifest.description, 'string');
  assert.equal(packageJson.type, 'module');
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.scripts.package, 'node tools/package-extension.mjs');
  assert.deepEqual(manifest.permissions.toSorted(), ['alarms', 'storage']);
  assert.equal(manifest.host_permissions.includes('<all_urls>'), false);
  assert.deepEqual(manifest.host_permissions.toSorted(), ['https://www.xkcd.com/*', 'https://xkcd.com/*']);
  assert.equal(manifest.minimum_chrome_version, '120');
  assert.equal(manifest.background.type, 'module');
  assert.equal(manifest.background.service_worker, 'src/background/service-worker.js');
  assert.equal(manifest.action.default_popup, 'src/popup/popup.html');
  assert.equal(manifest.options_page, 'src/dashboard/dashboard.html');
  assert.equal(manifest.content_security_policy.extension_pages.includes("script-src 'self'"), true);
  assert.equal(manifest.content_security_policy.extension_pages.includes('https://imgs.xkcd.com'), true);
  assert.equal(manifest.content_scripts.length, 1);

  for (const path of Object.values(manifest.icons)) {
    assert.equal(existsSync(join(root, path)), true, `${path} should exist`);
  }

  for (const path of Object.values(manifest.action.default_icon)) {
    assert.equal(existsSync(join(root, path)), true, `${path} should exist`);
  }
});
