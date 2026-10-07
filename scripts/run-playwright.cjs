#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { withReportLock } = require('./report-lock.cjs');

function runNode(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error) console.error(result.error);
  return result.status ?? 1;
}

withReportLock(resolve(__dirname, '../artifacts'), () => {
  const preparationStatus = runNode(['--import', 'tsx', resolve(__dirname, 'prepare-reports.ts')]);
  if (preparationStatus) { process.exitCode = preparationStatus; return; }
  const testStatus = runNode([
    require.resolve('@playwright/test/cli'),
    'test',
    ...process.argv.slice(2),
  ]);

  // 测试失败时也保留完整附件；进程退出码仍反映测试失败。
  const attachmentStatus = runNode([
    resolve(__dirname, 'promote-allure-videos.js'),
    'artifacts/allure-results',
  ]);
  process.exitCode = testStatus || attachmentStatus;
});
