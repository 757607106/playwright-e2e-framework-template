const { mkdtempSync, cpSync, symlinkSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const root = process.cwd();
const target = mkdtempSync(join(tmpdir(), 'framework-adoption-'));
function run(args, expected = 0) {
  const result = spawnSync(process.execPath, args, { cwd: target, encoding: 'utf8', env: { ...process.env, E2E_SKIP_EXAMPLES: 'true' }, maxBuffer: 20 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== expected) throw new Error(`Adoption check failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  return result;
}
try {
  for (const name of ['tests', 'scripts', 'examples', 'docs', 'package.json', 'tsconfig.json', 'playwright.config.ts', '.env.example', 'README.md', 'AGENTS.md']) cpSync(join(root, name), join(target, name), { recursive: true });
  symlinkSync(resolve(root, 'node_modules'), join(target, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  for (const dir of ['tests/setup', 'tests/support/data']) {
    mkdirSync(join(target, dir), { recursive: true });
    writeFileSync(join(target, dir, 'index.ts'), 'export {};\n');
  }
  writeFileSync(join(target, 'tests/e2e/adoption-probe.spec.ts'), `import { test, expect } from '../fixtures';
import { coverageSupport } from '../support/annotations';
test('Adoption: new spec is discovered', coverageSupport('Consumer adoption verification'), async ({ page }) => {
  await page.setContent('<h1>Ready</h1>');
  await expect(page.getByRole('heading')).toHaveText('Ready');
});\n`);
  run([require.resolve('typescript/lib/tsc.js'), '--noEmit', '--noUnusedLocals', '--noUnusedParameters']);
  run(['scripts/run-unit-tests.cjs']);
  run(['--import', 'tsx', 'scripts/framework-check.ts']);
  run(['scripts/list-tests.cjs']);
  const list = readFileSync(join(target, 'artifacts/test-list.json'), 'utf8');
  if (!list.includes('Adoption: new spec is discovered')) throw new Error('New consumer spec was not discovered');
  run(['--import', 'tsx', 'scripts/check-coverage.ts']);
  run(['--import', 'tsx', 'scripts/public-safety-check.ts']);
  run([require.resolve('@playwright/test/cli'), 'test', 'adoption-probe.spec.ts', '--project=chromium', '--reporter=json']);
  // Ensure the archive fallback still detects credential files without printing values.
  writeFileSync(join(target, '.env'), 'PRIVATE_CONFIGURATION=local\n');
  run(['--import', 'tsx', 'scripts/public-safety-check.ts'], 1);
  rmSync(join(target, '.env'));
  // A leaked key-like value must fail, even in the example configuration file.
  writeFileSync(join(target, '.env.example'), 'KEY=' + 'gh' + 'p_' + 'A'.repeat(30));
  run(['--import', 'tsx', 'scripts/public-safety-check.ts'], 1);
  console.log('Adoption checks passed: no Git required, static quality passed, new spec executed, adapter directories allowed, sensitive files rejected.');
} finally {
  // Remove junction before deleting the temporary tree so dependencies cannot be traversed.
  if (existsSync(join(target, 'node_modules'))) rmSync(join(target, 'node_modules'), { force: true });
  rmSync(target, { recursive: true, force: true });
}
