import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import test from 'node:test';
import { cleanupResources, readResources, registerResource, registryPath, summaryPath, type Resource } from '../support/resource-registry';
import { assertCleanupComplete } from '../support/resource-tracker';

test('an empty run never calls cleanup', async () => {
  let called = false;
  const results = await cleanupResources('empty-unit-run', async (_resource: Resource) => {
    called = true;
  });
  assert.equal(called, false);
  assert.deepEqual(results, []);
});

test('a stalled deletion times out, persists progress and does not block remaining IDs', async () => {
  const runId = `timeout-${process.pid}-${Date.now()}`;
  const options = { runId, scopeId: 'attempt' };
  let aborted = false;
  try {
    registerResource({ kind: 'example', id: 'remaining' }, options);
    registerResource({ kind: 'example', id: 'stalled' }, options);
    const seen: string[] = [];
    const results = await cleanupResources(runId, async (resource, signal) => {
      seen.push(resource.id);
      if (resource.id === 'stalled') {
        signal.addEventListener('abort', () => { aborted = true; });
        await new Promise<void>(() => {});
      } else {
        const progress = JSON.parse(readFileSync(summaryPath(runId, options.scopeId), 'utf8'));
        assert.equal(progress.results[0].status, 'unresolved');
        assert.equal(progress.pending, 1);
      }
    }, options.scopeId, { timeoutMs: 20, totalTimeoutMs: 500 });
    assert.deepEqual(seen, ['stalled', 'remaining']);
    assert.equal(aborted, true);
    assert.deepEqual(results.map(result => result.status), ['unresolved', 'cleaned']);
    assert.throws(() => assertCleanupComplete(results), /remain unresolved/);
    assert.equal(JSON.parse(readFileSync(summaryPath(runId, options.scopeId), 'utf8')).pending, 0);
  } finally { rmSync(dirname(registryPath(runId)), { recursive: true, force: true }); }
});

test('corrupt and mismatched records stay visible while validated exact IDs are cleaned', async () => {
  const runId = `corrupt-${process.pid}-${Date.now()}`;
  try {
    registerResource({ kind: 'example', id: 'valid' }, { runId });
    appendFileSync(registryPath(runId), '{incomplete\n' + JSON.stringify({ runId: 'another-run', kind: 'example', id: 'foreign', createdAt: new Date().toISOString() }) + '\n');
    assert.throws(() => readResources(runId), /invalid entry/);
    const seen: string[] = [];
    const results = await cleanupResources(runId, async resource => { seen.push(resource.id); });
    assert.deepEqual(seen, ['valid']);
    assert.equal(results.filter(result => result.status === 'unresolved').length, 2);
    assert.throws(() => assertCleanupComplete(results), /remain unresolved/);
    const report = JSON.parse(readFileSync(summaryPath(runId), 'utf8'));
    assert.equal(report.pending, 0);
    assert.doesNotMatch(JSON.stringify(report), /incomplete|foreign|another-run/);
  } finally { rmSync(dirname(registryPath(runId)), { recursive: true, force: true }); }
});

test('an exhausted cleanup budget reports every unattempted resource', async () => {
  const runId = `budget-${process.pid}-${Date.now()}`;
  try {
    registerResource({ kind: 'example', id: 'unattempted' }, { runId });
    registerResource({ kind: 'example', id: 'stalled' }, { runId });
    const seen: string[] = [];
    const results = await cleanupResources(runId, async resource => { seen.push(resource.id); await new Promise<void>(() => {}); }, undefined,
      { timeoutMs: 100, totalTimeoutMs: 20 });
    assert.deepEqual(seen, ['stalled']);
    assert.deepEqual(results.map(result => result.status), ['unresolved', 'unresolved']);
    assert.match(results[1].detail ?? '', /budget exhausted/);
  } finally { rmSync(dirname(registryPath(runId)), { recursive: true, force: true }); }
});

test('cleanup runs in reverse creation order and records unresolved IDs', async () => {
  const runId = `unit-${process.pid}-${Date.now()}`;
  const previous = process.env.E2E_RUN_ID;
  process.env.E2E_RUN_ID = runId;
  try {
    registerResource({ kind: 'example', id: 'first' });
    registerResource({ kind: 'example', id: 'second' });
    const seen: string[] = [];
    const results = await cleanupResources(runId, async (resource) => {
      seen.push(resource.id);
      if (resource.id === 'first') throw new Error('cleanup refused');
    });
    assert.deepEqual(seen, ['second', 'first']);
    assert.deepEqual(results.map((result) => result.status), ['cleaned', 'unresolved']);
    assert.equal(results[1].id, 'first');
  } finally {
    if (previous === undefined) delete process.env.E2E_RUN_ID;
    else process.env.E2E_RUN_ID = previous;
    rmSync(dirname(registryPath(runId)), { recursive: true, force: true });
  }
});
