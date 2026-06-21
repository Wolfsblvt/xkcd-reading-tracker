import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

mkdirSync('coverage', { recursive: true });

const result = spawnSync(process.execPath, [
  '--test',
  '--experimental-test-coverage',
  '--test-reporter=spec',
  '--test-reporter-destination=stdout',
  '--test-reporter=lcov',
  '--test-reporter-destination=coverage/lcov.info',
  ...process.argv.slice(2),
], {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
