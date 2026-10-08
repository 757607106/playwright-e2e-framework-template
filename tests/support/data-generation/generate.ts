import { en, Faker } from '@faker-js/faker';
import packageJson from '../../../package.json';
import type { DataContext, DataRecipe, Dataset, DatasetRow, GenerateOptions } from './types';
import { assertPayload, digest, GENERATOR_VERSION, payloadIssues, recipeHash, TestDataError, validateRecipe } from './validation';

export const FAKER_VERSION = packageJson.devDependencies['@faker-js/faker'];
function bounded(value: number, min: number, max: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new TestDataError('CONFIG', `${name} must be an integer from ${min} to ${max}`);
  return value;
}
/** Contexts never share Faker state; relative dates always use the recorded reference time. */
function context(seed: number, caseId: string, index: number, refDate: string): DataContext {
  const faker = new Faker({ locale: en });
  faker.seed(parseInt(digest({ seed, caseId, index }).slice(0, 8), 16));
  faker.setDefaultRefDate(refDate);
  return { faker, caseId, index, refDate };
}
async function deadline<T>(task: (signal: AbortSignal) => Promise<T>, parent: AbortSignal, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent.addEventListener('abort', abort, { once: true });
  if (parent.aborted) controller.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: () => void = () => {};
  const expired = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(new TestDataError('TIMEOUT', 'Generation was cancelled or exceeded its deadline'));
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
    timer = setTimeout(() => controller.abort(), timeoutMs);
    if (controller.signal.aborted) rejectAbort();
  });
  try { return await Promise.race([expired, task(controller.signal)]); }
  finally {
    clearTimeout(timer);
    parent.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', rejectAbort);
  }
}
export async function generateDataset<T, S>(recipe: DataRecipe<T, S>, options: GenerateOptions = {}): Promise<Dataset<T, S>> {
  validateRecipe(recipe);
  const seed = bounded(options.seed ?? 42, 0, 0xffffffff, 'seed');
  const perCase = bounded(options.perCase ?? 1, 1, 100, 'perCase');
  const limits = {
    maxAttempts: bounded(options.maxAttempts ?? 3, 1, 3, 'maxAttempts'),
    timeoutMs: bounded(options.timeoutMs ?? 30_000, 1, 60_000, 'timeoutMs'),
    totalTimeoutMs: bounded(options.totalTimeoutMs ?? 120_000, 1, 300_000, 'totalTimeoutMs'),
    maxOutputTokens: bounded(options.maxOutputTokens ?? 1024, 64, 32768, 'maxOutputTokens'),
  };
  const refDate = options.refDate ?? '2026-01-01T00:00:00.000Z';
  if (!Number.isFinite(Date.parse(refDate)) || new Date(refDate).toISOString() !== refDate) throw new TestDataError('CONFIG', 'refDate must be an ISO UTC timestamp, including milliseconds');
  const selected = options.caseIds ?? recipe.cases.map(item => item.id);
  if (!selected.length || new Set(selected).size !== selected.length || selected.some(id => !recipe.cases.some(item => item.id === id))) throw new TestDataError('CONFIG', 'caseIds must select known, unique cases');
  const cases = recipe.cases.filter(item => selected.includes(item.id));
  if (cases.length * perCase > 1000) throw new TestDataError('CONFIG', 'A batch cannot exceed 1000 rows');
  const source = options.provider ? { mode: 'llm' as const, ...options.provider.identity } : { mode: 'offline' as const, name: 'faker', model: 'none' };
  const rows: DatasetRow<T, S>[] = [];
  let totalTokens = 0;
  let usageComplete = true;
  function recordUsage(tokens: number | undefined): void {
    if (tokens === undefined) usageComplete = false;
    else totalTokens += bounded(tokens, 0, Number.MAX_SAFE_INTEGER, 'provider totalTokens');
  }
  const signal = options.signal ?? new AbortController().signal;
  const end = Date.now() + limits.totalTimeoutMs;
  for (const item of cases) for (let index = 0; index < perCase; index += 1) {
    let feedback: string[] = [];
    let accepted = false;
    for (let attempt = 1; attempt <= (options.provider ? limits.maxAttempts : 1); attempt += 1) {
      if (signal.aborted || Date.now() >= end) throw new TestDataError('TIMEOUT', 'Batch generation was cancelled or exceeded its deadline');
      let value: unknown;
      if (options.provider) {
        try {
          const result = await deadline(abortSignal => options.provider!.generate({
            schema: recipe.semantic.schema,
            prompt: `${recipe.semantic.prompt}\nScenario: ${item.id}: ${item.description}\nSample: ${index + 1}. Reference time: ${refDate}.`,
            feedback, signal: abortSignal, maxOutputTokens: limits.maxOutputTokens,
          }), signal, Math.min(limits.timeoutMs, end - Date.now()));
          value = result.value;
          recordUsage(result.totalTokens);
        } catch (error) {
          if (error instanceof TestDataError && error.code === 'VALIDATION') {
            recordUsage(error.totalTokens);
            feedback = ['semantic:invalid-structured-output'];
            continue;
          }
          if (error instanceof TestDataError) throw error;
          // Provider errors may contain credentials, request bodies or response text.
          throw new TestDataError('PROVIDER', `Provider failed for case ${item.id}; check credentials, model and endpoint privately`);
        }
      } else value = recipe.semantic.offline(context(seed, item.id, index, refDate));
      const semantic = recipe.semantic.schema.safeParse(value);
      if (!semantic.success) {
        feedback = ['semantic:invalid-schema'];
        continue;
      }
      const base = recipe.build(context(seed, item.id, index, refDate), semantic.data);
      feedback = payloadIssues(recipe, base, []);
      if (feedback.length) continue;
      const payload = assertPayload(recipe, item.mutate ? item.mutate(base, context(seed, item.id, index, refDate)) : base, item);
      rows.push({ id: `${item.id}-${index + 1}`, caseId: item.id, index, expectedViolations: [...(item.expectedViolations ?? [])], attempts: attempt, semantic: semantic.data, payload });
      accepted = true;
      break;
    }
    if (!accepted) throw new TestDataError('VALIDATION', `Case ${item.id} exhausted validation attempts: ${feedback.join('; ')}`);
  }
  const manifest = {
    formatVersion: 1 as const, recipeId: recipe.id, recipeVersion: recipe.version,
    recipeHash: recipeHash(recipe), promptVersion: recipe.semantic.version,
    generatorVersion: GENERATOR_VERSION, fakerVersion: FAKER_VERSION, source, seed, refDate,
    perCase, caseIds: cases.map(item => item.id), limits, rowCount: rows.length, totalTokens, usageComplete,
  };
  const contentHash = digest({ manifest, rows });
  return { manifest: { ...manifest, datasetId: `${recipe.id.slice(0, 48)}-${contentHash.slice(0, 32)}`, createdAt: new Date().toISOString(), contentHash }, rows };
}
