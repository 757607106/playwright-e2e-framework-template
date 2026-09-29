#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

function runNode(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error) console.error(result.error);
  return result.status ?? 1;
}

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
