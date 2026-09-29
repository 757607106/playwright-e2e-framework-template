import { test as base, expect } from '@playwright/test';

type Fixtures = { runId: string };

export const test = base.extend<Fixtures>({
  runId: async ({}, use) => {
    await use(process.env.E2E_RUN_ID || 'local');
  },
});

export { expect };
