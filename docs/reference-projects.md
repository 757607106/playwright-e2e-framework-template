# Reference projects and framework decisions

Reviewed on 2026-10-07. Strengths below describe upstream capabilities. Costs and the decisions for this template are our engineering assessment; they are not upstream defects.

| Reference | Useful capability | Adoption cost or limitation | Decision here |
| --- | --- | --- | --- |
| [Microsoft Playwright authentication](https://github.com/microsoft/playwright/blob/main/docs/src/auth.md) and [fixtures](https://github.com/microsoft/playwright/blob/main/docs/src/test-fixtures-js.md) | Native fixture teardown, isolated contexts, authentication per worker for shared-state writes | Context isolation alone cannot isolate server-side accounts or data; consumers must implement their own identity allocation | Keep the native runner; expose `workerStorageState`; provide exact-ID cleanup in a test-scoped fixture |
| [Serenity/JS Playwright template](https://github.com/serenity-js/serenity-js-playwright-test-template) | Reusable domain tasks, UI/API examples, reports that explain behavior | Screenplay introduces additional concepts and dependencies; small projects may need a simpler entry point | Keep domain actions in application adapters; ship a complete local UI/API lifecycle example using native fixtures |
| [MSW](https://github.com/mswjs/msw) | Controlled network behavior with reusable request handlers | Mock responses need contract maintenance and cannot prove a real backend implements a feature | Use a tiny loopback HTTP app for deterministic framework checks; consumers can add MSW when interception is needed |
| [Playwright ESLint plugin](https://github.com/mskelton/eslint-plugin-playwright) | Syntax-aware rules for missing awaits, focused tests, forced actions and other test mistakes | Needs ESLint configuration matching custom fixtures; all rules may not fit every project | Replace regex scanning with a small TypeScript AST guard using an existing dependency; recommend the plugin for a fuller lint policy |

## Implemented priorities

1. Adoption: ZIP downloads do not require Git; new `*.spec.ts` files are discovered; adapter directories are allowed. Node entry scripts replace shell globs and directory creation commands.
2. Lifecycle: per-worker login extension, per-test cleanup scope, reverse-order cleanup, unresolved IDs fail the test. Hard process termination still requires recovery from the persisted ledger.
3. API contracts: typed responses require a runtime validator; raw JSON is `unknown`; empty 204 responses are explicit; responses are disposed in `finally`.
4. Evidence: a local app demonstrates UI + API verification, anonymous/other-identity rejection, runtime schema rejection and exact deletion. These checks are classified as support, not product coverage.
5. Regression selection: an unmapped changed rule now requests broader regression.
6. CI: Linux/Node 22 and Windows/Node 24 check adoption, failure teardown and local browser execution.

## Next priorities

- Add real target integration examples only when their public UI/API contracts and isolated accounts can be maintained.
- Add opt-in Firefox/WebKit projects when consumers need browser compatibility coverage.
- For growing suites, adopt the Playwright ESLint plugin and typed lint rules, including missing-await checks. The current AST guard is deliberately a baseline and does not perform data-flow analysis.
- Add schema-based validation of coverage definitions and requirement imports before adding more change-selection automation.
- Version reusable core modules separately once multiple independent consumers demonstrate a stable API. For now this is a source template, not a published npm library.

No source code from these projects was copied. Their design principles informed the changes; this repository keeps its MIT license.
