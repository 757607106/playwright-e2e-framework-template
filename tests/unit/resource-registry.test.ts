import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { dirname } from 'node:path';
import test from 'node:test';
import { cleanupResources, registerResource, registryPath, type Resource } from '../support/resource-registry';

test('an empty run never calls cleanup', async () => {
  let called = false;
  const results = await cleanupResources('empty-unit-run', async (_resource: Resource) => {
    called = true;
  });
  assert.equal(called, false);
  assert.deepEqual(results, []);
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
