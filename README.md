# Playwright E2E Framework Template

A reusable Playwright + TypeScript source template with native fixtures, typed API contracts, precise cleanup, coverage mapping and execution reports.

[中文说明](README.zh-CN.md) · [Adoption guide](docs/adoption-guide.md) · [Architecture](docs/architecture.md)

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
- Syntax-aware baseline checks and typed floating-promise checks, no-Git adoption checks, and Linux/Windows CI.

The local example proves framework behavior only. It does not establish any product's business coverage. This is a source template, not a published npm package.

## Optional test Agents

Run `npm run agents:init` to generate the official Playwright planner/generator/healer for a compatible Codex host. Follow the [Agent workflow](docs/agent-testing.md). They help explore, generate and diagnose tests; ordinary regression has no model calls. Existing fixtures, coverage and reports are reused.

## Business testing Skill

The repository includes [$playwright-business-testing](.agents/skills/playwright-business-testing/SKILL.md) under `.agents/skills/`. Keep that directory when adopting the template. In a compatible Codex host, invoke the Skill to connect verified application authentication/contracts, plan scenarios, implement tests, register coverage, clean exact resource IDs and validate results. It can also diagnose a named failure using existing evidence.

For example: “Use $playwright-business-testing to inspect our requirements and API contracts, connect authentication, and plan purchase approval tests. Do not execute mutations in this phase.” See the [usage guide and prompts](docs/business-testing-skill.md) (Chinese). Optional official test Agents are not required; ordinary Playwright regression remains unchanged.

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
| `npm run test:lifecycle` | Verify failed-body teardown, cleanup errors/timeouts and damaged ledgers; four intentional failures are checked by the harness |
| `npm run release:check` | Static quality plus publication safety scan |
| `npx playwright show-report artifacts/playwright-report` | View browser report |
| `npm run allure:generate` | Generate optional Allure HTML (requires Java) |

Reports and cleanup ledgers live under ignored `artifacts/`. `REPORT_HISTORY_LIMIT` controls previous-run archives. `public:check` is a heuristic publication gate; inspect the release files and Git history as well. It cannot guarantee the absence of every secret or business detail.

All tests bound to a scenario must pass for it to be `passed`; mixed execution is `partial`, and retry recovery is `flaky` with all attempts retained. Coverage IDs must be unique, and support/exclude annotations need a nonempty reason. Business-result assertions still require application review.

Cleanup defaults to 5 seconds per resource and 20 seconds per attempt, with an independent fixture timeout of 30 seconds. Each result is persisted immediately. Valid ledger records are cleaned even if another record is damaged; damaged entries and timeouts remain unresolved and fail the test. Cleanup adapters can observe the supplied `AbortSignal`; a timeout cannot cancel arbitrary adapter work that ignores it.

Report preparation, execution and Allure generation share an exclusive `artifacts/.report-lock`. Concurrent runs in the same checkout fail before altering reports; use separate checkouts to run concurrently. Normal exit releases the lock. After a hard kill, verify the recorded owner PID has exited before removing a leftover lock.

## License

MIT. See [LICENSE](LICENSE).
