import { test as base, expect } from '../../tests/fixtures';
import { EXAMPLE_ROUTES } from '../local-app/routes';

export const test = base.extend({
  workerStorageState: [async ({ browser }, use, workerInfo) => {
    const context = await browser.newContext({ baseURL: workerInfo.project.use.baseURL, storageState: undefined });
    try {
      const response = await context.request.post(EXAMPLE_ROUTES.session);
      expect(response.status()).toBe(201);
      await response.dispose();
      await use(await context.storageState());
    } finally { await context.close(); }
  }, { scope: 'worker' }],
});
export { expect };
