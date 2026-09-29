# Development rules

- Keep framework code independent of one application. Put verified application routes, credentials, business data, and business tests in an application repository.
- Import `test` and `expect` from `tests/fixtures` in E2E specs.
- Register stable `pageId/scenarioId` coverage for each business scenario. Classify support tests explicitly.
- Assert observable business outcomes for real E2E tests. A toast or clickable button alone is insufficient.
- Avoid fixed waits, forced clicks, unbounded `any`, and `test.only`.
- Use a run ID or backend ID for data created by a test. Cleanup must target exact IDs and report unresolved resources.
- Never commit `.env`, authentication state, generated reports, API snapshots, or production data.
- Run `npm run quality:ci` for framework changes. Run affected Playwright projects when a real environment is available.
