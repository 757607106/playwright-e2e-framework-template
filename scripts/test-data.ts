import { resolve } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { datasetPath, saveDataset, TestDataError, type Dataset, type GenerateOptions } from '../tests/support/data-generation';
import { safeId } from '../tests/support/data-generation/validation';

type CliRecipe = { id: string; generate(options?: GenerateOptions): Promise<Dataset<unknown>>; load(file: string): Dataset<unknown> };
const HELP = `Test data: independent preparation and read-only replay
  npm run data:init -- --name purchase
  npm run data:generate -- [--recipe path.ts] [--mode offline|llm] [--model-config path.ts] [--seed 42] [--per-case 1] [--cases normal,minimum]
  npm run data:validate -- --dataset <datasetId> [--recipe path.ts]
  npm run data:inspect -- --dataset <datasetId> [--recipe path.ts]
Options: --ref-date ISO-UTC --max-attempts 1..3 --timeout-ms N --total-timeout-ms N --max-output-tokens N
         --directory path (default artifacts/test-data) --file path (replay only)
Default recipe: examples/data/counter.recipe.ts. Default mode: offline; no credentials/network required.
LLM mode: configure MODEL_NAME, API_BASE_URL and API_KEY in .env or model.config.ts.
MODEL_PROVIDER selects the adapter; MODEL_PROTOCOL and MODEL_OUTPUT_MODE select its capabilities.
Inspect prints metadata only. Review the saved JSON privately before provisioning it in CI.`;
function parse(args: string[]): { command: string; flags: Map<string, string> } {
  if (args.includes('--help')) return { command: 'help', flags: new Map() };
  const [command = 'help', ...rest] = args;
  if (!['init', 'generate', 'validate', 'inspect', 'help', '--help'].includes(command)) throw new TestDataError('CONFIG', 'Unknown command; use --help');
  const flags = new Map<string, string>();
  const known = ['name', 'recipe', 'mode', 'model-config', 'seed', 'per-case', 'cases', 'ref-date', 'max-attempts', 'timeout-ms', 'total-timeout-ms', 'max-output-tokens', 'directory', 'dataset', 'file'];
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index].replace(/^--/, '');
    const value = rest[index + 1];
    if (!rest[index].startsWith('--') || !known.includes(name) || flags.has(name) || !value || value.startsWith('--')) throw new TestDataError('CONFIG', 'Unknown, duplicated or incomplete option; use --help');
    flags.set(name, value);
  }
  return { command, flags };
}
export async function runTestDataCLI(args: string[]): Promise<void> {
  const { command, flags } = parse(args);
  if (command === 'help' || command === '--help') { console.log(HELP); return; }
  if (command === 'init') {
    if ([...flags.keys()].some(name => name !== 'name')) throw new TestDataError('CONFIG', 'init accepts only --name');
    const name = safeId(flags.get('name') ?? 'business');
    const directory = resolve('tests/support/data');
    const file = resolve(directory, `${name}.recipe.ts`);
    mkdirSync(directory, { recursive: true });
    try {
      const template = readFileSync(resolve(__dirname, 'templates/test-data-recipe.ts.template'), 'utf8');
      writeFileSync(file, template.replaceAll('__RECIPE_NAME__', name), { flag: 'wx' });
    } catch { throw new TestDataError('CONFIG', 'Cannot create recipe; existing files are never overwritten'); }
    console.log(JSON.stringify({ operation: 'init', file, next: `npm run data:generate -- --recipe tests/support/data/${name}.recipe.ts` }, null, 2));
    return;
  }
  if (flags.has('name')) throw new TestDataError('CONFIG', '--name applies only to init');
  const generationOnly = ['mode', 'model-config', 'seed', 'per-case', 'cases', 'ref-date', 'max-attempts', 'timeout-ms', 'total-timeout-ms', 'max-output-tokens'];
  if (command === 'generate' && (flags.has('dataset') || flags.has('file')) || command !== 'generate' && generationOnly.some(name => flags.has(name))) throw new TestDataError('CONFIG', 'Generation options cannot be used in replay, and replay options cannot be used in generation');
  const modulePath = resolve(flags.get('recipe') || 'examples/data/counter.recipe.ts');
  // Recipe modules are trusted application code, never obtained from model output.
  let imported: { recipe?: CliRecipe };
  try { imported = require(modulePath) as { recipe?: CliRecipe }; }
  catch { throw new TestDataError('CONFIG', 'Cannot load recipe; export a named recipe from a trusted TypeScript module'); }
  const recipe = imported.recipe;
  if (!recipe || typeof recipe.generate !== 'function' || typeof recipe.load !== 'function') throw new TestDataError('CONFIG', 'Recipe module must export recipe = defineDataRecipe(...)');
  const directory = flags.has('directory') ? resolve(flags.get('directory')!) : undefined;
  let dataset: Dataset<unknown>;
  let file: string;
  if (command === 'generate') {
    const mode = flags.get('mode') ?? 'offline';
    if (!['offline', 'llm'].includes(mode)) throw new TestDataError('CONFIG', 'mode must be offline or llm');
    if (mode !== 'llm' && flags.has('model-config')) throw new TestDataError('CONFIG', '--model-config requires --mode llm');
    let provider: GenerateOptions['provider'];
    if (mode === 'llm') {
      dotenv.config({ quiet: true });
      const { loadSemanticProvider } = await import('../tests/support/data-generation/provider');
      provider = await loadSemanticProvider(flags.get('model-config'));
    }
    const numeric = (name: string) => flags.has(name) ? Number(flags.get(name)) : undefined;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    try {
      dataset = await recipe.generate({
        provider, seed: numeric('seed'), perCase: numeric('per-case'), refDate: flags.get('ref-date'),
        caseIds: flags.get('cases')?.split(','), maxAttempts: numeric('max-attempts'), timeoutMs: numeric('timeout-ms'),
        totalTimeoutMs: numeric('total-timeout-ms'), maxOutputTokens: numeric('max-output-tokens'), signal: controller.signal,
      });
      file = saveDataset(dataset, directory);
    } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
  } else {
    if (flags.has('file') === flags.has('dataset')) throw new TestDataError('CONFIG', 'Replay requires exactly one of --file or --dataset');
    file = flags.has('file') ? resolve(flags.get('file')!) : datasetPath(flags.get('dataset')!, directory);
    dataset = recipe.load(file);
  }
  console.log(JSON.stringify({ operation: command, file, datasetId: dataset.manifest.datasetId, recipeId: dataset.manifest.recipeId,
    source: dataset.manifest.source, seed: dataset.manifest.seed, rowCount: dataset.manifest.rowCount,
    cases: dataset.manifest.caseIds, totalTokens: dataset.manifest.totalTokens, usageComplete: dataset.manifest.usageComplete, valid: true }, null, 2));
}
if (require.main === module) runTestDataCLI(process.argv.slice(2)).catch(error => {
  console.error(error instanceof TestDataError ? error.message : '[Test data] Operation failed; inspect trusted recipe code privately');
  process.exitCode = 1;
});
