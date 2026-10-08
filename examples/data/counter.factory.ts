import type { APIRequestContext } from '@playwright/test';
import { callApi } from '../../tests/support/api/client';
import type { ResourceTracker } from '../../tests/support/resource-tracker';
import { isCounterResource } from '../local-app/contracts';
import { EXAMPLE_ROUTES } from '../local-app/routes';
import type { CounterInput } from './counter.recipe';

/** Application adapters own HTTP contracts and returned IDs; generation owns only candidate input. */
export async function createCounter(input: CounterInput, request: APIRequestContext, resources: ResourceTracker) {
  const created = await callApi({ request, method: 'POST', path: EXAMPLE_ROUTES.resources,
    data: input, expectedStatus: 201, validate: isCounterResource });
  resources.track({ kind: 'counter', id: created.id }, async resource => {
    await callApi({ request, method: 'DELETE', path: EXAMPLE_ROUTES.resource(resource.id), expectedStatus: 204, responseMode: 'empty' });
    await callApi({ request, method: 'GET', path: EXAMPLE_ROUTES.resource(resource.id), expectedStatus: 404, expectedCode: 'NOT_FOUND' });
  });
  return created;
}
