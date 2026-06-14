import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('manifest is valid JSON with minimal permissions and existing icons', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.toSorted(), ['activeTab', 'alarms', 'storage']);
  assert.equal(manifest.host_permissions.includes('<all_urls>'), false);
  assert.equal(manifest.background.type, 'module');
  assert.equal(manifest.content_scripts.length, 1);

  for (const path of Object.values(manifest.icons)) {
    assert.equal(existsSync(join(root, path)), true, `${path} should exist`);
  }
});
