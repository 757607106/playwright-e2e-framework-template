import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { acquireReportLock, withReportLock } from '../../scripts/report-lock.cjs';

test('independent runs are rejected before touching reports; owned subprocesses can borrow', () => {
  const directory = mkdtempSync(join(tmpdir(), 'report-lock-'));
  const lock = join(directory, '.report-lock');
  const script = `const {acquireReportLock} = require(${JSON.stringify(resolve('scripts/report-lock.cjs'))}); acquireReportLock(${JSON.stringify(directory)})();`;
  const release = acquireReportLock(directory);
  try {
    const before = readFileSync(lock, 'utf8');
    const independent = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', env: { ...process.env, E2E_REPORT_LOCK_TOKEN: '' } });
    assert.equal(independent.status, 1);
    assert.match(independent.stderr, /Reports are locked/);
    assert.equal(readFileSync(lock, 'utf8'), before);
    const owned = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
    assert.equal(owned.status, 0, owned.stderr);
    assert.equal(readFileSync(lock, 'utf8'), before);
  } finally { release(); }
  assert.equal(existsSync(lock), false);
  assert.throws(() => withReportLock(directory, () => { throw new Error('Run failed'); }), /Run failed/);
  assert.equal(existsSync(lock), false);
  rmSync(directory, { recursive: true, force: true });
});

test('orphaned or malformed locks require explicit recovery instead of unsafe stealing', () => {
  const directory = mkdtempSync(join(tmpdir(), 'report-orphan-'));
  try {
    for (const content of ['incomplete', JSON.stringify({ pid: 999999, token: 'old' })]) {
      writeFileSync(join(directory, '.report-lock'), content);
      assert.throws(() => acquireReportLock(directory), /Reports are locked/);
      assert.equal(readFileSync(join(directory, '.report-lock'), 'utf8'), content);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
