import { test, expect } from './fixtures';
import { coverageSupport } from '../../tests/support/annotations';
import { callApi } from '../../tests/support/api/client';
import { recipe } from '../data/counter.recipe';
import { createCounter } from '../data/counter.factory';
import { isCounterResource } from '../local-app/contracts';
import { EXAMPLE_ROUTES } from '../local-app/routes';

for (const dataCase of recipe.cases) {
  test(`Frozen test data: ${dataCase.id}`, coverageSupport('Local dataset replay / materialization demonstration; not product coverage'), async ({ page, request, resources, testData }) => {
    const dataset = await testData.load(recipe, { file: process.env.E2E_EXAMPLE_DATASET });
    const rows = dataset.rows.filter(row => row.caseId === dataCase.id);
    expect(rows.length, 'Provision a batch containing all demonstration cases').toBeGreaterThan(0);
    for (const row of rows) await test.step(row.id, async () => {
      if (row.expectedViolations.length) {
        const rejected = await callApi({ request, method: 'POST', path: EXAMPLE_ROUTES.resources, data: row.payload, expectedStatus: 422, expectedCode: 'INVALID_INPUT' });
        expect(rejected).not.toHaveProperty('id');
        return;
      }
      const created = await createCounter(row.payload, request, resources);
      expect(created.value).toBe(row.payload.initialValue);
      await page.goto(`/?resourceId=${encodeURIComponent(created.id)}`);
      await expect(page.getByLabel('Resource label', { exact: true })).toHaveText(row.payload.label);
      await expect(page.getByLabel('Count')).toHaveText(String(row.payload.initialValue));
      const updated = page.waitForResponse(response => response.url().endsWith(EXAMPLE_ROUTES.resource(created.id)) && response.request().method() === 'PATCH');
      await page.getByRole('button', { name: 'Increment' }).click();
      expect((await updated).status()).toBe(200);
      await expect(page.getByLabel('Count')).toHaveText(String(row.payload.initialValue + 1));
      const persisted = await callApi({ request, method: 'GET', path: EXAMPLE_ROUTES.resource(created.id), expectedStatus: 200, validate: isCounterResource });
      expect(persisted).toEqual({ id: created.id, value: row.payload.initialValue + 1, label: row.payload.label });
    });
  });
}
