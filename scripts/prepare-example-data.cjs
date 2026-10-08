const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

function prepareExampleData(args = []) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', resolve(__dirname, 'test-data.ts'), 'generate', ...args], {
    encoding: 'utf8', cwd: resolve(__dirname, '..'), env: process.env, maxBuffer: 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || 'Example data preparation failed');
  const summary = JSON.parse(result.stdout);
  process.env.E2E_EXAMPLE_DATASET = summary.file;
  console.log(`[Test data] Prepared ${summary.rowCount} ${summary.source.mode} rows: ${summary.datasetId}`);
  return summary;
}
module.exports = { prepareExampleData };
