const { mkdirSync, writeFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--list', '--reporter=json'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) { process.exitCode = result.status ?? 1; }
else {
  JSON.parse(result.stdout);
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/test-list.json', result.stdout);
}
