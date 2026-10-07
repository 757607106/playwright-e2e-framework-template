const { mkdtempSync, writeFileSync, readdirSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const target = mkdtempSync(join(tmpdir(), 'framework-lifecycle-'));
const runId = `lifecycle-${process.pid}-${Date.now()}`;
const quote = value => JSON.stringify(value.replaceAll('\\', '/'));
try {
  writeFileSync(join(target, 'failure.spec.ts'), `import { test } from ${quote(resolve('tests/fixtures'))};
  test('Interrupted body still cleans', async ({ resources }) => {
    resources.track({kind: 'probe', id: 'created-before-failure'}, async () => {});
    throw new Error('Expected body failure');
  });
  test('Unresolved cleanup fails an otherwise passing test', async ({ resources }) => {
    resources.track({kind: 'probe', id: 'cleanup-fails'}, async () => { throw new Error('Expected cleanup failure'); });
  });`);
  writeFileSync(join(target, 'playwright.config.ts'), `export default { testDir: '.', workers: 1, retries: 0, reporter: 'json' };`);
  const result = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config', join(target, 'playwright.config.ts'), '--output', join(target, 'results')], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, E2E_RUN_ID: runId }, maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 1) throw new Error(`Expected two intentional failures; exit ${result.status}\n${result.stderr}`);
  const report = JSON.parse(result.stdout);
  if (report.stats.unexpected !== 2 || report.stats.expected !== 0) throw new Error('Lifecycle probes did not produce two failing tests');
  const dataDir = resolve('artifacts/run-data', runId);
  const summaries = readdirSync(dataDir).flatMap(scope => JSON.parse(readFileSync(join(dataDir, scope, 'cleanup-summary.json'), 'utf8')).results);
  if (!summaries.some(item => item.id === 'created-before-failure' && item.status === 'cleaned')) throw new Error('Failed test did not clean its resource');
  if (!summaries.some(item => item.id === 'cleanup-fails' && item.status === 'unresolved')) throw new Error('Cleanup failure was hidden');
  const tests = report.suites.flatMap(suite => suite.specs || []).flatMap(spec => spec.tests || []);
  if (!tests.some(test => test.results.some(result => result.errors.some(error => error.message.includes('remain unresolved'))))) throw new Error('Cleanup failure did not fail the test');
  console.log('Lifecycle checks passed: failed bodies still clean; unresolved cleanup fails the test. Two intentional failures were verified.');
} finally {
  rmSync(target, { recursive: true, force: true });
  rmSync(resolve('artifacts/run-data', runId), { recursive: true, force: true });
}
