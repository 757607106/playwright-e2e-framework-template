import { test as base, expect } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import { createHash } from 'node:crypto';
import { ResourceTracker, assertCleanupComplete } from '../support/resource-tracker';

type Fixtures = { runId: string; resources: ResourceTracker };
type WorkerFixtures = { workerStorageState: Awaited<ReturnType<BrowserContext['storageState']>> | undefined };

export const test = base.extend<Fixtures, WorkerFixtures>({
  workerStorageState: [undefined, { scope: 'worker' }],
  storageState: async ({ workerStorageState }, use) => { await use(workerStorageState); },
  runId: async ({}, use) => {
    await use(process.env.E2E_RUN_ID || 'local');
  },
  resources: async ({ runId, request }, use, testInfo) => {
    void request; // Cleanup callbacks may use this context; dispose it after resource teardown.
    const hash = createHash('sha256').update(testInfo.testId).digest('hex').slice(0, 20);
    const tracker = new ResourceTracker(runId, `${hash}-${testInfo.parallelIndex}-${testInfo.retry}-${testInfo.repeatEachIndex}`);
    try { await use(tracker); }
    finally {
      const results = await tracker.cleanup();
      await testInfo.attach('cleanup-summary', {
        body: JSON.stringify({ runId, scopeId: tracker.scopeId, results }, null, 2),
        contentType: 'application/json',
      });
      assertCleanupComplete(results);
    }
  },
});

export { expect };
