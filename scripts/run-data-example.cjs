const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { prepareExampleData } = require('./prepare-example-data.cjs');

try {
  // Preparation is a separate process before Playwright starts; never a test/fixture model call.
  prepareExampleData(process.argv.slice(2));
  const result = spawnSync(process.execPath, [resolve(__dirname, 'run-playwright.cjs'), 'generated-data.spec.ts', '--project=local-example'], {
    stdio: 'inherit', env: { ...process.env, E2E_SKIP_EXAMPLES: 'false' },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Example data preparation failed');
  process.exitCode = 1;
}
