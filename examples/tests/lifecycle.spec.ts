import { test, expect } from './fixtures';
import { coverageSupport } from '../../tests/support/annotations';
import { callApi } from '../../tests/support/api/client';
import { EXAMPLE_ROUTES } from '../local-app/routes';
import { isCounterResource } from '../local-app/contracts';

const support = coverageSupport('Local framework lifecycle demonstration; not product coverage');

test('Counter: UI increment persists through API and cleans exact ID', support, async ({ page, request, resources }) => {
  const resource = await callApi({ request, method: 'POST', path: EXAMPLE_ROUTES.resources, expectedStatus: 201, validate: isCounterResource });
  resources.track({ kind: 'counter', id: resource.id }, async ({ id }) => {
    await callApi({ request, method: 'DELETE', path: EXAMPLE_ROUTES.resource(id), expectedStatus: 204, responseMode: 'empty' });
    await callApi({ request, method: 'GET', path: EXAMPLE_ROUTES.resource(id), expectedStatus: 404, expectedCode: 'NOT_FOUND' });
  });
  await page.goto(`/?resourceId=${encodeURIComponent(resource.id)}`);
  await expect(page.getByLabel('Count')).toHaveText('0');
  const changed = page.waitForResponse(response => response.url().endsWith(EXAMPLE_ROUTES.resource(resource.id)) && response.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Increment' }).click();
  expect((await changed).status()).toBe(200);
  await expect(page.getByLabel('Count')).toHaveText('1');
  const persisted = await callApi({ request, method: 'GET', path: EXAMPLE_ROUTES.resource(resource.id), expectedStatus: 200, validate: isCounterResource });
  expect(persisted).toEqual({ id: resource.id, value: 1 });
});

test('Session: unauthenticated context is rejected', support, async ({ playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try { await callApi({ request: anonymous, method: 'POST', path: EXAMPLE_ROUTES.resources, expectedStatus: 401, expectedCode: 'UNAUTHENTICATED' }); }
  finally { await anonymous.dispose(); }
});

test('Contract: mismatched runtime schema is rejected', support, async ({ request }) => {
  await expect(callApi({ request, method: 'GET', path: '/health', expectedStatus: 200, validate: isCounterResource })).rejects.toThrow('response schema did not match');
});

test('Session: another identity cannot read this test resource', support, async ({ request, playwright, baseURL, resources }) => {
  const resource = await callApi({ request, method: 'POST', path: EXAMPLE_ROUTES.resources, expectedStatus: 201, validate: isCounterResource });
  resources.track({ kind: 'counter', id: resource.id }, async ({ id }) => {
    await callApi({ request, method: 'DELETE', path: EXAMPLE_ROUTES.resource(id), expectedStatus: 204, responseMode: 'empty' });
  });
  const other = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    await callApi({ request: other, method: 'POST', path: EXAMPLE_ROUTES.session, expectedStatus: 201 });
    await callApi({ request: other, method: 'GET', path: EXAMPLE_ROUTES.resource(resource.id), expectedStatus: 404, expectedCode: 'NOT_FOUND' });
  } finally { await other.dispose(); }
});
