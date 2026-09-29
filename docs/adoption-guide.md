# Adopt the framework in another test project

The template is deliberately independent of a target application. Start with the local demo, then add only modules that the target system actually needs.

## 1. Keep a clear dependency direction

```text
Application tests
  -> application fixtures, page actions, assertions, routes, data factories
  -> reusable fixtures, coverage, HTTP helper, resource registry, reports
  -> Playwright
```

Framework modules must not import application routes, accounts, data factories, or product page models. Application modules may import framework modules. This makes upgrades and reuse possible without copying one product's assumptions.

## 2. Configure projects and identity

Edit `playwright.config.ts` to define projects for the application's real test stages. Add setup dependencies only when a stage needs them. Keep browser state under ignored `artifacts/`; create it in the application setup project and load it only in dependent projects.

Start with one worker. Increase the count only when each worker has an isolated account, browser state, and data scope. The runner enforces an explicit isolation flag for parallel work.

## 3. Build the application adapter

Add these modules outside the reusable core:

| Application module | Responsibility |
| --- | --- |
| `tests/support/api/routes.ts` | Paths verified against the target's live contract and real network traffic |
| `tests/support/application-model.ts` | Real page routes, labels, and stable UI contracts |
| `tests/fixtures/auth.fixture.ts` | Login and authenticated browser state for the target |
| `tests/support/page-actions/` | Reusable actions based on observed DOM and network state |
| `tests/support/business-assertions.ts` | Outcome checks that prove the target's business behavior |
| `tests/support/data/` | Per-run data factories and target-specific cleanup mapping |

The template's API client does not assume a particular response envelope, success code, or authentication mechanism. The application integration supplies those verified contracts.

## 4. Define coverage before writing a scenario

Register a stable page ID and scenario ID in `tests/coverage/page-coverage.ts`. Add the scenario level, operations, and real requirement IDs when available. Bind the test with `coverageScenario`. Titles remain readable and can change without breaking the mapping.

L0 and L1 cover reachability and UI interaction. L2 requires a business result; L3 and L4 cover connected workflows. A discovered or mapped test is not a passed regression. The quality report records the actual execution state separately.

## 5. Manage test data and cleanup

Derive created data from `E2E_RUN_ID` or use backend-returned IDs. Register each created resource in the run registry. Implement an application cleanup callback that receives the exact resource ID, runs in reverse creation order, and records failures. Never widen a failed cleanup to a bulk deletion.

Keep destructive, payment, callback, and shared-configuration scenarios behind application-specific sandbox rules. The reusable core intentionally defines no such actions.

## 6. Verify and publish

Run `npm run quality:ci` after framework changes. Run the affected real Playwright project after application tests change. Review the JSON/Markdown quality report, traces, API responses, and cleanup summary. Only actual browser execution against the target can establish a product E2E result.

Before publishing a fork, inspect `git ls-files`, run `npm run public:check`, and review Git history. Removing a secret from the latest tree does not remove it from earlier commits. A new public repository should start from a clean-root snapshot or a carefully rewritten history.
