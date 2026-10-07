import assert from 'node:assert/strict';
import test from 'node:test';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { ResourceTracker, assertCleanupComplete } from '../support/resource-tracker';
import { registryPath } from '../support/resource-registry';
test('test scopes clean independently, in reverse order, and reject duplicate IDs', async () => {
  const runId = `tracker-${process.pid}-${Date.now()}`;
  const first = new ResourceTracker(runId, 'first');
  const second = new ResourceTracker(runId, 'second');
  const seen: string[] = [];
  try {
    first.track({ kind: 'counter', id: 'one' }, async ({ id }) => { seen.push(id); });
    first.track({ kind: 'counter', id: 'two' }, async ({ id }) => { seen.push(id); });
    second.track({ kind: 'counter', id: 'other' }, async () => { throw new Error('Sensitive local failure text'); });
    assert.throws(() => first.track({ kind: 'counter', id: 'one' }, async () => {}), /already registered/);
    assertCleanupComplete(await first.cleanup());
    assert.deepEqual(seen, ['two', 'one']);
    const failed = await second.cleanup();
    assert.equal(failed[0].id, 'other');
    assert.equal(failed[0].status, 'unresolved');
    assert.doesNotMatch(JSON.stringify(failed), /Sensitive local failure text/);
    assert.throws(() => assertCleanupComplete(failed), /remain unresolved/);
  } finally { rmSync(dirname(registryPath(runId)), { recursive: true, force: true }); }
});
test('registry rejects traversal in run and scope IDs', () => {
  assert.throws(() => registryPath('..'), /Invalid run ID/);
  assert.throws(() => registryPath('safe', '../outside'), /Invalid run ID/);
});
