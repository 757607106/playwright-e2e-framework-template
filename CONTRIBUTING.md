# Contributing

This repository maintains a reusable source template. Keep real application endpoints, identities, input data and product scenarios in a consuming application repository. Bundled localhost examples should demonstrate framework behavior using disposable synthetic resources.

## Local setup

Use Node.js 22.13+ (22.x) or 24+ and npm. Keep `package-lock.json` in sync with dependency changes.

```bash
npm ci
npx playwright install chromium
npm run release:check
npm test
```

On Linux, use `npx playwright install --with-deps chromium`. Java is required only for optional Allure HTML generation. The repository can also run from a ZIP checkout without Git. See [README](README.md), [architecture](docs/architecture.md) and [configuration](docs/configuration.md).

## Change boundaries

- Keep execution in native Playwright and reuse unified fixtures, coverage, reporters and resource tracking.
- Add application adapters through typed interfaces; core modules must not depend on one business application.
- Keep model connections in the shared model layer. Declare protocols and output modes accurately; do not add feature-specific model environment fields or a hardcoded model whitelist.
- Run model requests only during explicit preparation. Formal tests replay reviewed data and assert real observable outcomes.
- Track returned resource IDs immediately. Cleanup must target those exact IDs, verify deletion/restoration and report unresolved objects.
- Do not use focused tests, forced UI actions, fixed waits, unbounded `any`, swallowed failures or weakened assertions to make a test pass.
- Keep `.env`, authentication state, generated datasets/reports, real API snapshots, private keys and production data out of commits. Public scanning is heuristic and still needs file review.

## Relevant verification

All framework changes require `npm run quality:ci`. Before a release or a change to public configuration/setup, run:

```bash
npm run release:check
npm run test:adoption
npm run test:lifecycle
npm test
```

`test:lifecycle` contains intentional failures that its harness verifies; a successful harness run is the expected result. Unit model tests exercise real SDKs with mocked HTTP and require no model keys. CI configures Linux/Node 22 and Windows/Node 24; report which checks you actually ran locally.

| Change | Evidence to add |
| --- | --- |
| Model provider or protocol | Wire-format/authentication contract, supported output modes, local schema rejection, redacted errors and no hidden transport retries |
| Shared configuration | Defaults/precedence, invalid values and custom consumer configuration |
| Input generation/replay | Deterministic structural fields, controlled negatives, bounded repair, immutable storage, version/integrity checks and replay with no model access |
| Resource lifecycle | Failed-body teardown, exact IDs, callback errors/deadlines and unresolved ledger preservation |
| Fixtures, scripts or template entry points | No-Git consumer adoption and affected bundled browser scenarios |
| Coverage/reporting | Discovery, stable IDs, mixed execution and retry outcomes |

Avoid tests that only mirror an implementation. Target behavior, public contracts and meaningful failure boundaries. If a real environment is available, execute affected application projects and record its result separately from static/local examples. Live model validation must be an explicit preparation operation using permitted synthetic context.

## Documentation and compatibility

Update `.env.example`, [configuration](docs/configuration.md), [architecture](docs/architecture.md), relevant guides and bilingual README entry points when public behavior changes. Keep repository Skill references aligned with current commands. Document limitations accurately; mocked protocol validation does not establish every service's online compatibility.

Version recipes when their builders, offline semantics, rules or mutations change. Preserve saved-dataset compatibility when possible; version incompatible format changes and document regeneration/migration. Dependency upgrades must keep declared Node support and protocol tests working.

Keep a pull request focused. Explain the triggering problem, resulting behavior, relevant tests and remaining validation limits. Include concrete before/after examples for public configuration changes. Avoid committing unrelated generated files. Contributions use the repository's [MIT license](LICENSE).
