const { mkdtempSync, cpSync, symlinkSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const root = process.cwd();
const target = mkdtempSync(join(tmpdir(), 'framework-adoption-'));
function run(args, expected = 0, examples = false, extraEnv = {}) {
  const result = spawnSync(process.execPath, args, { cwd: target, encoding: 'utf8', env: { ...process.env, E2E_SKIP_EXAMPLES: examples ? 'false' : 'true', ...extraEnv }, maxBuffer: 20 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== expected) throw new Error(`Adoption check failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  return result;
}
try {
  for (const name of ['tests', 'scripts', 'examples', 'docs', 'specs', '.agents', 'package.json', 'package-lock.json', 'tsconfig.json', 'playwright.config.ts', 'model.config.ts', '.env.example', 'README.md', 'README.zh-CN.md', 'CONTRIBUTING.md', 'LICENSE', 'AGENTS.md']) cpSync(join(root, name), join(target, name), { recursive: true });
  symlinkSync(resolve(root, 'node_modules'), join(target, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  for (const dir of ['tests/setup', 'tests/support/data']) {
    mkdirSync(join(target, dir), { recursive: true });
    writeFileSync(join(target, dir, 'index.ts'), 'export {};\n');
  }
  // Consumers scaffold and run their own recipe without Git, a model account or changes to core.
  run(['--import', 'tsx', 'scripts/test-data.ts', 'generate', '--help']);
  run(['--import', 'tsx', 'scripts/test-data.ts', 'init', '--name', 'adoption']);
  const recipeFile = 'tests/support/data/adoption.recipe.ts';
  const originalRecipe = readFileSync(join(target, recipeFile), 'utf8');
  run(['--import', 'tsx', 'scripts/test-data.ts', 'init', '--name', 'adoption'], 1);
  if (readFileSync(join(target, recipeFile), 'utf8') !== originalRecipe) throw new Error('Consumer recipe was overwritten');
  const generated = JSON.parse(run(['--import', 'tsx', 'scripts/test-data.ts', 'generate', '--recipe', recipeFile, '--per-case', '2']).stdout);
  if (generated.rowCount !== 6 || generated.source.mode !== 'offline') throw new Error('Consumer recipe did not generate an offline batch');
  run(['--import', 'tsx', 'scripts/test-data.ts', 'validate', '--recipe', recipeFile, '--dataset', generated.datasetId]);
  run(['--import', 'tsx', 'scripts/test-data.ts', 'inspect', '--recipe', recipeFile, '--dataset', generated.datasetId], 0, false,
    { API_BASE_URL: 'invalid', MODEL_NAME: 'must-not-be-called' });
  run(['--import', 'tsx', 'scripts/test-data.ts', 'validate', '--recipe', recipeFile, '--dataset', 'missing'], 1);
  run(['--import', 'tsx', 'scripts/test-data.ts', 'generate', '--seed', 'NaN'], 1);
  run(['--import', 'tsx', 'scripts/test-data.ts', 'generate', '--mode', 'llm'], 1, false,
    { API_BASE_URL: 'invalid', MODEL_NAME: 'unit' });
  // A consumer adds a provider in configuration; the CLI uses it without core edits or a live service.
  writeFileSync(join(target, 'consumer-model.config.ts'), `import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createModelRegistry, defineModelConfig } from './tests/support/llm';
export default defineModelConfig({ provider: 'consumer', model: 'arbitrary-model', outputMode: 'text' });
export const providers = createModelRegistry().register('consumer', {
  defaultProtocol: 'private', defaultBaseURL: 'https://model.invalid/v1', protocols: { private: ['text'] },
  createModel: config => createOpenAICompatible({ name: config.provider, baseURL: config.baseURL,
    fetch: async () => new Response(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ title: 'Synthetic consumer product' }) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 } }), { headers: { 'content-type': 'application/json' } }),
  }).chatModel(config.model),
});\n`);
  const modelEnv = { MODEL_NAME: '', API_BASE_URL: '', API_KEY: '', MODEL_PROVIDER: '', MODEL_PROTOCOL: '', MODEL_OUTPUT_MODE: '' };
  const checked = JSON.parse(run(['--import', 'tsx', 'scripts/model-check.ts', '--config', 'consumer-model.config.ts'], 0, false, modelEnv).stdout);
  if (!checked.valid || checked.onlineVerified || checked.provider !== 'consumer') throw new Error('Consumer model config did not load independently');
  const modeled = JSON.parse(run(['--import', 'tsx', 'scripts/test-data.ts', 'generate', '--recipe', recipeFile, '--mode', 'llm', '--model-config', 'consumer-model.config.ts', '--per-case', '2'], 0, false, modelEnv).stdout);
  if (modeled.rowCount !== 6 || modeled.source.name !== 'consumer' || modeled.source.outputMode !== 'text' || modeled.totalTokens !== 108) throw new Error('Consumer provider did not prepare validated data');
  run(['--import', 'tsx', 'scripts/test-data.ts', 'validate', '--recipe', recipeFile, '--dataset', modeled.datasetId], 0, false, { MODEL_NAME: 'must-not-be-called', API_BASE_URL: 'invalid' });
  run(['--import', 'tsx', 'scripts/test-data.ts', 'validate', '--recipe', recipeFile, '--dataset', modeled.datasetId, '--model-config', 'consumer-model.config.ts'], 1);
  rmSync(join(target, 'consumer-model.config.ts'));
  writeFileSync(join(target, 'tests/e2e/adoption-probe.spec.ts'), `import { test, expect } from '../fixtures';
import { coverageSupport } from '../support/annotations';
import { recipe } from '../support/data/adoption.recipe';
test('Adoption: new spec is discovered', coverageSupport('Consumer adoption verification'), async ({ page, testData }) => {
  const batch = await testData.load(recipe, { datasetId: '${generated.datasetId}' });
  expect(batch.rows).toHaveLength(6);
  for (const row of batch.rows) expect(row.payload.totalCents).toBe(row.payload.quantity * row.payload.unitPriceCents);
  await page.setContent('<h1>Ready</h1>');
  await expect(page.getByRole('heading')).toHaveText('Ready');
});\n`);
  run([require.resolve('typescript/lib/tsc.js'), '--noEmit', '--noUnusedLocals', '--noUnusedParameters']);
  run(['scripts/run-unit-tests.cjs']);
  run(['--import', 'tsx', 'scripts/framework-check.ts']);
  run(['scripts/list-tests.cjs']);
  const list = readFileSync(join(target, 'artifacts/test-list.json'), 'utf8');
  if (!list.includes('Adoption: new spec is discovered')) throw new Error('New consumer spec was not discovered');
  run(['--import', 'tsx', 'scripts/check-coverage.ts']);
  run(['--import', 'tsx', 'scripts/public-safety-check.ts']);
  run([require.resolve('@playwright/test/cli'), 'test', 'adoption-probe.spec.ts', '--project=chromium', '--reporter=json']);
  writeFileSync(join(target, 'tests/e2e/retry-probe.spec.ts'), `import { test, expect } from '../fixtures';
import { coverageSupport } from '../support/annotations';
test('Adoption: retry history is visible', coverageSupport('Intentional retry reporter verification'), async ({}, testInfo) => {
  expect(testInfo.retry).toBe(1);
});\n`);
  run([require.resolve('@playwright/test/cli'), 'test', 'retry-probe.spec.ts', '--project=chromium', '--retries=1']);
  const retryReport = JSON.parse(readFileSync(join(target, 'artifacts/quality-report/quality-report.json'), 'utf8'));
  if (retryReport.counts.flaky !== 1 || retryReport.counts.passed !== 0
    || retryReport.tests[0].outcome !== 'flaky' || retryReport.tests[0].attempts.length !== 2
    || retryReport.tests[0].attempts[0].status !== 'failed') throw new Error('Retry recovery was reported as a stable pass');
  run(['scripts/init-agents.cjs', '--project=chromium'], 1);
  if (existsSync(join(target, 'tests/e2e/seed.spec.ts'))) throw new Error('Initialization silently created a consumer seed');
  // Initialize in the no-Git consumer copy; preserve custom definitions.
  run(['scripts/init-agents.cjs'], 0, true);
  const agentPath = join(target, '.codex/agents/playwright_test_healer.toml');
  const initialized = readFileSync(agentPath, 'utf8');
  if (initialized.includes('mark this test as test.fixme()') || !initialized.includes('three evidence-backed attempts')) throw new Error('Healer guardrails were not applied');
  run(['scripts/init-agents.cjs'], 0, true);
  if (readFileSync(agentPath, 'utf8') !== initialized) throw new Error('Repeated Agent initialization was not stable');
  writeFileSync(agentPath, '# Consumer-owned custom definition\n');
  run(['scripts/init-agents.cjs'], 1, true);
  if (readFileSync(agentPath, 'utf8') !== '# Consumer-owned custom definition\n') throw new Error('Custom Agent was overwritten');
  // Ensure the archive fallback still detects credential files without printing values.
  writeFileSync(join(target, '.env'), 'PRIVATE_CONFIGURATION=local\n');
  run(['--import', 'tsx', 'scripts/public-safety-check.ts'], 1);
  rmSync(join(target, '.env'));
  // A leaked key-like value must fail, even in the example configuration file.
  writeFileSync(join(target, '.env.example'), 'KEY=' + 'gh' + 'p_' + 'A'.repeat(30));
  run(['--import', 'tsx', 'scripts/public-safety-check.ts'], 1);
  console.log('Adoption checks passed: no Git required, consumer recipes and a registered SDK provider prepared/replayed data without a live model service, static quality passed, new spec executed, adapter directories allowed, sensitive files rejected, Agent initialization preserves custom definitions.');
} finally {
  // Remove junction before deleting the temporary tree so dependencies cannot be traversed.
  if (existsSync(join(target, 'node_modules'))) rmSync(join(target, 'node_modules'), { force: true });
  rmSync(target, { recursive: true, force: true });
}
