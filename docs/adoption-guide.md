# Adopt the framework in another test project

## 1. Verify the source template

Use Node 22 or 24, run `npm ci`, install Chromium, then run `npm run quality:ci` and `npm test`. The default projects are `chromium` (all specs under `tests/e2e/`) and `local-example` (the loopback demonstration).

A ZIP checkout works without Git. `npm run test:adoption` creates a temporary no-Git copy, runs static quality, adds and executes a new consumer spec, accepts adapter directories and verifies secret detection. It shares the installed dependencies and requires Chromium.

When connecting your own application, copy `.env.example` to `.env`, set `BASE_URL` and `E2E_SKIP_EXAMPLES=true`. Alternatively keep examples enabled: they always use their own loopback URL. `EXAMPLE_PORT` changes the local port; an occupied port fails rather than silently attaching to an unrelated server.

## 2. Maintain one dependency direction

```text
Application specs -> application fixtures/actions/contracts/data
                  -> reusable fixtures/HTTP/coverage/cleanup/reports
                  -> Playwright
```

Keep verified application routes in `tests/support/api/routes.ts`. Add page actions under `tests/support/page-actions/`, data factories under `tests/support/data/`, and authentication under `tests/fixtures/` or `tests/setup/`. These directories are allowed by the public-content gate. The reusable core must not import application routes or accounts.

## 3. Implement authentication

The shared fixtures expose `workerStorageState`. Extend it using the target's verified login behavior. The local [authentication fixture](../examples/tests/fixtures.ts) is a working example of API-cookie authentication:

```ts
import { test as base, expect } from './index';
export const test = base.extend({
  workerStorageState: [async ({ browser }, use, workerInfo) => {
    const context = await browser.newContext({
      baseURL: workerInfo.project.use.baseURL,
      storageState: undefined,
    });
    try {
      // Perform verified UI/API login here. Allocate an isolated account using
      // workerInfo.parallelIndex when tests modify shared server-side state.
      // Assert successful login before reading authenticated state.
      await use(await context.storageState());
    } finally {
      await context.close();
    }
  }, { scope: 'worker' }],
});
export { expect };
```

This skeleton does not log in by itself. Replace the comments with the application's real login flow. Local storage/cookie authentication can reuse `storageState`; sessionStorage-based authentication needs an application-specific initialization hook. Do not log or commit credentials/state. Prefer CI secrets and ignored `artifacts/` if persistent state is required.

Each test still receives a separate BrowserContext. That does not isolate server-side state. Start with one worker; supply independent identities/data scopes before setting `TEST_WORKERS` above one and `E2E_ISOLATED_WORKERS=true`. The flag does not allocate accounts or prove isolation.

A setup project with dependent projects is also supported through native Playwright configuration when shared read-only authentication is appropriate. Avoid overriding both that configuration and `workerStorageState` for the same project.

## 4. Validate API responses at runtime

Supply an application-verified type guard to receive typed JSON:

```ts
const resource = await callApi({
  request,
  method: 'POST',
  path: API_ROUTES.createResource,
  expectedStatus: 201,
  validate: isResource,
});
```

Without `validate`, JSON is returned as `unknown`. HTTP and optional `expectedCode` assertions apply before validation. `expectedCode` refers to a top-level string `code`; use a custom validator for a different envelope. For an empty response, use `responseMode: 'empty'` and omit `expectedCode`. The helper disposes each APIResponse after reading it; retain parsed data rather than a response handle.

Verify target method/path/parameters/body/status and schema from the live API contract and browser traffic before writing an adapter. The generic helper does not invent these contracts.

## 5. Register data immediately and verify cleanup

Use the test-scoped `resources` fixture:

```ts
resources.track({ kind: 'resource', id: created.id }, async ({ id }) => {
  await deleteByExactId(request, id);
  await assertResourceAbsent(request, id);
});
```

The application supplies those operations. Register immediately after creation, before subsequent assertions. Cleanup executes in reverse registration order during teardown, including failed test bodies. The API request context remains alive until resource teardown completes. Duplicate kind/ID registration in a test attempt is rejected.

Each attempt has a ledger and summary at `artifacts/run-data/<runId>/<scopeId>/`. `scopeId` contains the test hash, worker slot, retry and repeat index. The summary is also attached to the test report. Unresolved cleanup fails the test; other registered resources still get a cleanup attempt. Error messages are not copied into the ledger because they may contain response secrets; inspect the exact ID and local cleanup adapter when recovering.

Cleanup has a 5-second per-resource timeout and a 20-second overall budget, within a separate 30-second resources-fixture timeout. Results are persisted atomically after each attempt; resources left when the overall budget expires remain unresolved. A callback can accept a second `AbortSignal` argument to stop work on timeout. Arbitrary work ignoring the signal may continue, so adapters should also bound their own requests. Direct recovery callers can pass `{ timeoutMs, totalTimeoutMs }` as the fourth argument of `cleanupResources`.

Damaged ledger entries are reported with line numbers and without raw contents or inferred IDs. Validated records from the same run are still cleaned, and any damaged entry makes cleanup fail. `readResources` remains strict and rejects a damaged ledger; `cleanupResources` handles recovery of validated entries. Cleanup results may include a `kind: 'ledger'` issue without a resource ID.

Hard kills, machine shutdowns, and a failure between backend creation and ID receipt cannot guarantee automatic cleanup. Build an application recovery tool that reads the persisted ledger with `readResources(runId, scopeId)` and uses exact-ID, idempotent cleanup. Never widen deletion criteria after a failure. The older `registerResource`/`cleanupResources` functions remain available for run-wide application teardown; do not also register the same object in the fixture tracker.

## 6. Bind meaningful coverage

Register stable page/scenario IDs in `tests/coverage/page-coverage.ts`; import `coverageScenario` for real scenarios. Replace the demo and its coverage entry together. Support/framework checks use `coverageSupport('reason')`; they do not fill the product coverage denominator.

L0/L1 describe reachability/interaction, L2 requires an actual business result, L3/L4 connected workflows. Mapped/discovered tests are not passed tests. Review the separate execution counts in `artifacts/quality-report/`.

Page IDs and scenario IDs accept letters, digits, dots, underscores and hyphens, beginning with a letter or digit. Duplicate IDs and invalid/empty classification annotations fail the quality gate. A test cannot combine a product scenario with support/exclude classification. All bound tests must pass; mixed passed/skipped/not-run states are `partial`. Retry recovery is `flaky`; reports retain each retry, status and duration. The legacy `evidenceMode: 'any'` remains an explicit alternative for title-based evidence.

The selector requests broader regression when requirements, API changes or rule changes are unmapped. It recommends scope; it does not run tests or prove selected coverage is sufficient.

## 7. Verify changes and publish

Run `npm run quality:ci`, the affected real projects and inspect trace/API/cleanup evidence. Run `npm run test:lifecycle` after lifecycle changes; its harness asserts four intentional failures rather than adding failed tests to ordinary regression reports. CI exercises Linux/Node 22 and Windows/Node 24.

Run preparation, native execution and Allure generation acquire the same report lock before changing report directories. Subprocesses of the owner borrow its token; unrelated runs are rejected. Use separate checkouts for simultaneous runs. After a hard kill, verify the owner PID recorded in `artifacts/.report-lock` is no longer running before removing the lock. Do not bypass the guard by copying its token into another invocation.

Before public release, run `npm run release:check` and inspect both files and Git history. The public scan is heuristic; confidential product information and undetected secrets still need review. Reports may contain sensitive target data, so review CI artifact settings when adopting the workflow for a real system.

## Migration from the initial snapshot

- The demo-only `smoke` project is now `chromium`; `npm run test:smoke` retains its meaning. Update direct `--project=smoke` commands.
- `npm test` also executes local examples by default. Set `E2E_SKIP_EXAMPLES=true` for application-only runs.
- Explicit `callApi<MyType>(...)` requires a runtime validator. Add the actual contract guard or keep the result `unknown`.
- Publication scanning moved from `quality:ci` to `release:check`; ordinary consumer quality checks permit application adapters.
