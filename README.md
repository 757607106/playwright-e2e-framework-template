# Playwright E2E Framework Template

A reusable Playwright + TypeScript source template with native fixtures, typed API contracts, precise cleanup, coverage mapping and execution reports.

[中文说明](README.zh-CN.md) · [Adoption guide](docs/adoption-guide.md) · [Architecture](docs/architecture.md) · [Reference project analysis](docs/reference-projects.md)

## Start locally

Use Node.js **22 or 24** and npm. CI covers Linux/Node 22 and Windows/Node 24; macOS is also verified locally. No application account or external service is needed for bundled tests.

```bash
npm ci
npx playwright install chromium
npm run quality:ci
npm test
```

On Linux, install browser system dependencies with `npx playwright install --with-deps chromium`. Allure HTML generation is optional and requires Java; the standard Playwright HTML and JSON/Markdown reports do not.

Clone the repository or download a ZIP. ZIP usage does not require Git. Keep the lockfile and use `npm ci`.

## Included

- Discover all `tests/e2e/**/*.spec.ts` with the `chromium` project.
- Local example: worker login → API preparation → UI action → backend verification → exact-ID cleanup. Separate contexts verify anonymous and other-identity rejection.
- `workerStorageState` extension and a new isolated browser context per test.
- `resources.track(...)` fixture: per-test-attempt ledger, reverse-order cleanup, summary attachment, failed cleanup fails the test.
- API status/business-code assertions, runtime schema validators, explicit empty responses and response disposal.
- Stable `pageId/scenarioId` mapping, execution-state reports and conservative regression selection.
- HTML/Allure reports, trace/video/screenshots and previous-run report archives.
- Syntax-aware baseline checks, no-Git adoption checks, and Linux/Windows CI.

The local example proves framework behavior only. It does not establish any product's business coverage. This is a source template, not a published npm package.

## Optional test Agents

Run `npm run agents:init` to generate the official Playwright planner/generator/healer for a compatible Codex host. Follow the [Agent workflow](docs/agent-testing.md). They help explore, generate and diagnose tests; ordinary regression has no model calls. Existing fixtures, coverage and reports are reused.

## Connect your application

1. Copy `.env.example` to `.env`; set `BASE_URL` to an isolated test environment and `E2E_SKIP_EXAMPLES=true`.
2. Add your own verified routes, response validators, page actions and authentication adapter. See the [working example](examples/tests/lifecycle.spec.ts) and [authentication fixture](examples/tests/fixtures.ts).
3. Put new tests under `tests/e2e/`. Use the shared fixtures; register real scenarios in `tests/coverage/page-coverage.ts`. Remove the demo and its coverage entry together when replacing it.
4. Register every created resource immediately with `resources.track({ kind, id }, cleanup)`. The callback must delete/restore only that exact ID and verify the outcome.
5. Run static gates, inspect discovered tests, then execute your actual target tests and review evidence.

Start with one worker. `E2E_ISOLATED_WORKERS=true` is an explicit acknowledgment, not proof of isolation. Increase workers only after implementing independent accounts/data scopes. See the [adoption guide](docs/adoption-guide.md) for concrete examples and recovery limitations.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run agents:init` | Initialize optional official test Agents for the local example |
| `npm run quality:ci` | Typecheck, unit tests, AST rules, coverage mapping |
| `npm run test:list` | Show discovered tests |
| `npm run test:smoke` | Run the counter demo |
| `npm run test:examples` | Run local authentication/UI/API/cleanup examples |
| `npm test` | Run all enabled projects |
| `npm run test:adoption` | Verify ZIP usage, new-spec discovery and secret gate behavior |
| `npm run test:lifecycle` | Verify teardown after a failed body and failure on unresolved cleanup; two expected failures are checked by the harness |
| `npm run release:check` | Static quality plus publication safety scan |
| `npx playwright show-report artifacts/playwright-report` | View browser report |
| `npm run allure:generate` | Generate optional Allure HTML (requires Java) |

Reports and cleanup ledgers live under ignored `artifacts/`. `REPORT_HISTORY_LIMIT` controls previous-run archives. `public:check` is a heuristic publication gate; inspect the release files and Git history as well. It cannot guarantee the absence of every secret or business detail.

## License

MIT. See [LICENSE](LICENSE).
