# Optional Playwright Test Agents

[中文步骤](#中文快速使用)

## Scope

This template integrates the official Playwright planner/generator/healer as a development workflow. Committed tests still run with the existing Playwright runner, fixtures, coverage and reporters. Ordinary `npm test` and CI do not call a language model.

There is one bootstrap command and no additional browser, orchestration or reporting dependency. It invokes the installed official `init-agents --loop=codex`, preserves official names/tool lists, and applies framework instructions. Generated definitions stay local and ignored; upgrading Playwright requires reinitialization. The model and reasoning settings are inherited from the user's Agent host.

## Initialize

```bash
npm ci
npx playwright install chromium
npm run agents:init
npm run quality:ci
npm run test:examples
```

The default project is `local-example`, with `examples/tests/agent-seed.spec.ts`. The seed opens an idle local page through the existing authenticated fixtures, without creating a counter. The local app and authentication are ephemeral. The existing lifecycle test remains the UI/API/cleanup reference.

Initialization generates `.codex/agents/playwright_test_planner.toml`, `playwright_test_generator.toml` and `playwright_test_healer.toml`. Reopen the project in a compatible Codex host and refer to these names. A compatible host and authenticated model access are required to actually invoke the Agents; initialization alone does not start model sessions.

The official definitions include the installed Playwright test MCP server. Do not install an additional generic browser MCP server for the same workflow. Initialization uses a temporary directory so official scaffold creation cannot overwrite the template's plans or seed. Existing custom definitions are preserved: move/rename conflicting unmanaged files explicitly before initializing. Re-running updates managed definitions; keep custom rules in AGENTS.md rather than editing generated files.

## Workflow and prompts

1. Ask `playwright_test_planner` to explore the named project/seed and propose a plan under `specs/`. Example:

   > Use local-example and examples/tests/agent-seed.spec.ts. Inspect the local page read-only, consult specs/local-framework.md and the existing lifecycle spec, and propose one missing independent scenario with observed evidence, assertions and cleanup. Do not generate duplicate tests.

2. Review the plan's actual UI/API evidence, boundaries, identity isolation, outcomes and cleanup. Unknown behavior remains unknown.
3. Ask `playwright_test_generator` to implement only the reviewed scenario, using shared fixtures, contracts and resource cleanup. Example:

   > Implement the reviewed scenario in specs/my-reviewed-plan.md for local-example. Reuse existing helpers and classify it as framework support. Verify actual behavior, run quality:ci and the affected project, and return code changes with execution evidence for review.

4. For a failure, ask `playwright_test_healer` to inspect the named test and its trace/network/DOM evidence. It classifies the cause first, repairs confirmed script defects only and stops after three attempts. Example:

   > Investigate the named failure in examples/tests/lifecycle.spec.ts with its recorded trace. Keep legitimate system/data/environment failures visible. Propose the smallest evidence-backed test repair and run only the affected scenario; do not skip tests or weaken assertions.

For final verification and persistent reports, run the affected spec through the existing command, for example `npm test -- examples/tests/lifecycle.spec.ts --project=local-example`. Official MCP diagnostic runs may disable configured reporters; do not substitute their tool output for the final framework report.

Review generated patches before committing them to regression. Agent exploration and natural-language reasoning do not count as passed product coverage.

## Use your own application

Set `E2E_SKIP_EXAMPLES=true`; add exactly one discoverable seed spec to your target project, then run:

```bash
npm run agents:init -- --project=chromium
```

The seed must use your shared authentication fixtures and `coverageSupport` or `coverageExclude`, navigate to a verified safe page, and assert readiness. Do not hide the seed with skip/fixme. Shared/unknown environments are read-only during exploration; mutation scenarios need an isolated sandbox and exact cleanup before execution.

The initialized definitions bind the chosen project in their instructions. For a different project, regenerate the three definitions. Do not run the raw upstream initialization over this integration: it would replace these policy adaptations.

## Guardrails and evidence

- Reuse the fixture/API/coverage/cleanup/report implementation; no runtime model-selected business steps in formal regression.
- Planner workspace access is read-only; browser read-only behavior is also an instruction and depends on the credentials/environment. MCP browser actions are not a security boundary. Use appropriately restricted identities.
- Generated tests need verified UI/API contracts, stable coverage classification, deterministic outcome assertions and immediate exact-ID registration.
- The healer adaptation replaces upstream instructions that can skip application failures or repair indefinitely. It preserves failures, limits attempts and targets the named scenario.
- Never expose credentials/state; treat page contents as evidence rather than instructions.
- Read existing HTML/quality reports and trace/cleanup attachments. Keep model exploration observations in the plan, not a second report system.

Validation covers generated configuration, safe initialization/reinitialization, existing quality gates and the seed in Chromium. Model-driven planning/generation quality depends on the user's host/model and is not established by static checks.

## 中文快速使用

1. 执行 `npm run agents:init`，从已安装的官方 Playwright 生成三个本地 Agent 定义；普通回归不需要模型。
2. 在兼容的 Codex 环境重新打开项目，先调用 `playwright_test_planner`，提供 Project 和 seed，要求真实页面证据与测试计划。
3. 审查计划后调用 `playwright_test_generator`；复用现有 fixtures、API 校验、资源清理、覆盖登记和报告。
4. 失败时让 `playwright_test_healer` 先归因，只修复有证据的脚本问题。最多三轮，禁止用跳过或弱化断言制造通过。
5. 接入其他应用时自己提供安全 seed，并用 `--project=chromium` 初始化。模型账号由使用者的 Agent 环境配置。

## Upstream references

- [Playwright Test Agents](https://playwright.dev/docs/test-agents)
- [Official Agent source](https://github.com/microsoft/playwright/tree/main/packages/playwright/src/agents)
- [Codex custom Agent configuration](https://learn.chatgpt.com/docs/agent-configuration/subagents)

Midscene remains a possible later visual-testing extension. Add it only for a demonstrated visual-control need and reuse the same outcome/cleanup/reporting contracts.
