# Playwright E2E Framework Template

A small Playwright + TypeScript foundation for real end-to-end tests. This branch contains framework code and a self-contained counter demo. It contains no application accounts, API snapshot, business data, or product test scenarios.

## Included

- Playwright configuration with one worker by default, a run ID, trace/video/screenshot artifacts, and HTML/Allure reporting.
- Stable `pageId/scenarioId` coverage annotations and a check that every discovered test is classified.
- JSON and Markdown quality reports with discovered, passed, failed, skipped, and not-run counts.
- An API client that checks HTTP status and accepts application-defined business-code and schema checks.
- A run-scoped resource registry. Application code supplies exact-ID cleanup behavior.
- A conservative regression selector that maps requirement and API changes to scenario IDs.
- Report archiving, static framework checks, a public-content check, and GitHub Actions quality gates.

## Quick start

```bash
npm ci
npx playwright install chromium
npm run quality:ci
npm run test:smoke
```

The demo is local and does not call a real service. Its passing result proves only that this template runs. It is not evidence of any application's business behavior.

## Connect an application

1. Copy `.env.example` to `.env` and set `BASE_URL` to an isolated test environment. Keep credentials in local environment variables or CI secrets.
2. Define verified paths in `tests/support/api/routes.ts`. Check the live API contract and browser requests before adding API calls.
3. Add authentication, page actions, and test-data fixtures under `tests/fixtures` and `tests/support`. Keep these application modules outside the reusable core.
4. Replace `tests/e2e/demo.spec.ts` and its entry in `tests/coverage/page-coverage.ts` with application scenarios. Bind each business test with `coverageScenario(['pageId', 'scenarioId'])`.
5. Use the run ID or returned resource IDs for test data. Register every created resource with `registerResource`; connect an exact-ID cleanup function to `cleanupResources` in your application teardown.
6. Run `npm run quality:ci`, then the affected Playwright project against the real environment. Inspect traces and the quality report. Static checks and test discovery do not count as an E2E pass.

The reusable boundaries are described in [docs/architecture.md](docs/architecture.md). Follow [docs/adoption-guide.md](docs/adoption-guide.md) when connecting another application.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run quality:ci` | Typecheck, unit checks, framework rules, coverage mapping, and public-content scan |
| `npm run test:list` | Show discovered tests |
| `npm run test:smoke` | Run the local demo in Chromium |
| `npm test` | Run configured projects |
| `npm run allure:generate` | Build an Allure report from the latest results |

Reports are written under ignored `artifacts/`. The previous run is archived before a new run; `REPORT_HISTORY_LIMIT` controls how many archives are kept.

Parallel execution is disabled by default. Set `E2E_ISOLATED_WORKERS=true` only after each worker has independent authentication, data, and cleanup scope.

## License

MIT. See [LICENSE](LICENSE).
