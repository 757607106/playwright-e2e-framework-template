# Local framework Agent reference plan

Status: framework reference, verified against the bundled source and existing executable tests. Not product coverage. Review any expanded plan before executing new actions.

- Project: `local-example`
- Seed: `examples/tests/agent-seed.spec.ts`
- Existing executable evidence: `examples/tests/lifecycle.spec.ts`
- Contracts/routes: `examples/local-app/contracts.ts`, `examples/local-app/routes.ts`
- Environment: ephemeral HTTP app bound to loopback, started by the existing Playwright webServer.

## Planner scope

Open the seed page and observe the Counter heading, Count output, disabled Increment button and idle message. The seed has no counter resource and creates no product data. Do not interpret the disabled button as a defect: the lifecycle scenario prepares the resource through API first.

Record real DOM and network observations, unresolved questions and proposed checks. Never infer product requirement IDs from this example.

## Approved reference scenario: UI increment persists

1. Reuse the example authenticated fixtures.
2. Create a counter through `EXAMPLE_ROUTES.resources`; assert HTTP 201 and `isCounterResource`.
3. Immediately register its returned ID through `resources.track`.
4. Navigate to the root page with that resource ID in the query.
5. Assert Count is 0; click Increment and await the actual PATCH response with HTTP 200.
6. Assert Count is 1 and an API GET returns the same ID/value.
7. At fixture teardown, delete that exact ID with an empty HTTP 204 response; verify a subsequent GET returns 404 / NOT_FOUND.

Classification: `coverageSupport`, as in the existing executable scenario. Do not add another copy of this test; use it to learn the generation pattern or propose one missing independent scenario.

## Existing negative checks

The existing lifecycle spec verifies anonymous access rejection, another identity's rejection and runtime contract mismatch. Reuse these tests as evidence instead of duplicating them.

## Failure review

Preserve business/environment/data/requirement failures. Repair only a confirmed script mismatch. Report exact-ID cleanup outcomes through the existing fixture and reporters; do not create a new Agent report format.
