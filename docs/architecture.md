# Framework boundaries

This public branch is a clean-root snapshot. Its Git history is separate from the internal application test repository so removed files cannot be recovered through this branch's parent commits.

| Layer | Public template | Application integration |
| --- | --- | --- |
| Runner | Playwright configuration, artifacts, run ID, worker guard | Project names, dependencies, login state |
| Test API | Unified fixture export, coverage annotations | Authentication and domain-specific fixtures |
| HTTP | Status/code/schema-aware request helper | Verified endpoints, auth headers, response schemas |
| Data lifecycle | Resource registry and reverse-order cleanup contract | Data factories and exact-ID delete/restore calls |
| Coverage | Stable scenario mapping, discovery check, report | Pages, requirement IDs, business assertions |
| Change impact | Conservative scenario selector | Requirement and API diff producers |
| Quality | Typecheck, framework check, public-content check, CI, reports | Real environment regression and failure triage |

The demo has no external side effects. It shows how to connect an annotated Playwright test to the coverage registry. Application modules should be added only after checking their own UI, network traffic, API contract, account isolation, and cleanup behavior.

## Publication steps

1. Run `npm run quality:ci` and `npm run test:smoke` from a clean install.
2. Inspect the staged file list and run `npm run public:check` again before committing.
3. Check the MIT copyright holder and third-party notices with the repository owner.
4. Commit this root snapshot. Publish it to a dedicated public repository or an explicitly selected remote branch after repository visibility and disclosure have been reviewed.

Do not merge this branch into the internal test branch: it intentionally has unrelated history and a different scope.
