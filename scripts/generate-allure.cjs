const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { withReportLock } = require('./report-lock.cjs');

withReportLock(resolve(__dirname, '../artifacts'), () => {
  for (const args of [
    [resolve(__dirname, 'promote-allure-videos.js'), 'artifacts/allure-results'],
    [require.resolve('allure-commandline/bin/allure'), 'generate', 'artifacts/allure-results', '-o', 'artifacts/allure-report', '--clean'],
  ]) {
    const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) { process.exitCode = result.status ?? 1; return; }
  }
});
