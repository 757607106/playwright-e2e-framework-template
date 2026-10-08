import { existsSync, linkSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { DATASET_DIR } from '../paths';
import type { DataRecipe, Dataset } from './types';
import { assertPayload, canonicalJSON, digest, GENERATOR_VERSION, MAX_DATASET_BYTES, recipeHash, safeId, TestDataError, validateRecipe } from './validation';

const manifestSchema = z.strictObject({
  formatVersion: z.literal(1), datasetId: z.string(), createdAt: z.iso.datetime(),
  recipeId: z.string(), recipeVersion: z.string(), recipeHash: z.string().regex(/^[a-f0-9]{64}$/),
  promptVersion: z.string(), generatorVersion: z.string(), fakerVersion: z.string(),
  source: z.strictObject({ mode: z.enum(['offline', 'llm']), name: z.string(), model: z.string(),
    protocol: z.string().optional(), outputMode: z.enum(['schema', 'json', 'text']).optional() }),
  seed: z.number().int().min(0).max(0xffffffff), refDate: z.iso.datetime(),
  perCase: z.number().int().min(1).max(100), caseIds: z.array(z.string()).min(1).max(100),
  limits: z.strictObject({ maxAttempts: z.number().int().min(1).max(3), timeoutMs: z.number().int().min(1).max(60000), totalTimeoutMs: z.number().int().min(1).max(300000), maxOutputTokens: z.number().int().min(64).max(32768) }),
  rowCount: z.number().int().min(1).max(1000), totalTokens: z.number().int().nonnegative(), usageComplete: z.boolean(), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});
const envelopeSchema = z.strictObject({
  manifest: manifestSchema,
  rows: z.array(z.strictObject({ id: z.string(), caseId: z.string(), index: z.number().int().nonnegative(), expectedViolations: z.array(z.string()), attempts: z.number().int().min(1).max(3), semantic: z.unknown(), payload: z.unknown() })).min(1).max(1000),
});
export function datasetPath(datasetId: string, directory = DATASET_DIR): string {
  return join(directory, `${safeId(datasetId)}.json`);
}
function assertIntegrity(value: unknown): z.infer<typeof envelopeSchema> {
  const parsed = envelopeSchema.safeParse(value);
  if (!parsed.success) throw new TestDataError('REPLAY', 'Dataset envelope is malformed');
  const dataset = parsed.data;
  const { datasetId, contentHash, createdAt: _createdAt, ...manifest } = dataset.manifest;
  if (digest({ manifest, rows: dataset.rows }) !== contentHash || datasetId !== `${manifest.recipeId.slice(0, 48)}-${contentHash.slice(0, 32)}`
    || manifest.rowCount !== dataset.rows.length || new Set(manifest.caseIds).size !== manifest.caseIds.length
    || manifest.caseIds.length * manifest.perCase !== dataset.rows.length) throw new TestDataError('REPLAY', 'Dataset integrity or row count does not match');
  safeId(datasetId);
  return dataset;
}
/** Immutable content-addressed cache. Hard-link publication is atomic and never overwrites. */
export function saveDataset<T, S>(dataset: Dataset<T, S>, directory = DATASET_DIR): string {
  assertIntegrity(dataset);
  const file = datasetPath(dataset.manifest.datasetId, directory);
  const content = canonicalJSON(dataset);
  if (Buffer.byteLength(content + '\n') > MAX_DATASET_BYTES) throw new TestDataError('STORAGE', 'Dataset exceeds 10 MiB');
  const temporary = join(directory, `.pending-${randomUUID()}`);
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(temporary, content + '\n', { flag: 'wx', mode: 0o600 });
    try { linkSync(temporary, file); }
    catch (error) {
      if (!existsSync(file)) throw error;
      const existing = assertIntegrity(readDataset(file));
      if (existing.manifest.contentHash !== dataset.manifest.contentHash) throw new TestDataError('STORAGE', 'Existing immutable dataset differs');
    }
  } catch (error) {
    if (error instanceof TestDataError) throw error;
    throw new TestDataError('STORAGE', 'Cannot publish dataset; check directory access and filesystem hard-link support');
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  return file;
}
function readDataset(file: string): unknown {
  try {
    if (statSync(file).size > MAX_DATASET_BYTES) throw new TestDataError('REPLAY', 'Dataset exceeds 10 MiB');
    return JSON.parse(readFileSync(file, 'utf8')) as unknown;
  } catch (error) {
    if (error instanceof TestDataError) throw error;
    throw new TestDataError('REPLAY', 'Cannot read dataset JSON; generate or provision the batch before regression');
  }
}
/** Replay is synchronous and has no provider or generation fallback. */
export function loadDataset<T, S>(recipe: DataRecipe<T, S>, file: string): Dataset<T, S> {
  validateRecipe(recipe);
  const data = assertIntegrity(readDataset(file));
  const manifest = data.manifest;
  if (manifest.recipeId !== recipe.id || manifest.recipeVersion !== recipe.version || manifest.recipeHash !== recipeHash(recipe)
    || manifest.generatorVersion !== GENERATOR_VERSION) throw new TestDataError('REPLAY', 'Recipe/schema/prompt or generator version changed; regenerate and review the batch');
  const ids = new Set<string>();
  const rows = data.rows.map(row => {
    const item = recipe.cases.find(candidate => candidate.id === row.caseId);
    if (!item || !manifest.caseIds.includes(row.caseId) || row.index >= manifest.perCase || row.id !== `${row.caseId}-${row.index + 1}` || ids.has(row.id)
      || canonicalJSON(row.expectedViolations) !== canonicalJSON(item.expectedViolations ?? []) || row.attempts > manifest.limits.maxAttempts) throw new TestDataError('REPLAY', 'Dataset case selection or row identity changed');
    ids.add(row.id);
    const semantic = recipe.semantic.schema.safeParse(row.semantic);
    if (!semantic.success) throw new TestDataError('REPLAY', 'Dataset semantic fields no longer match schema');
    return { ...row, semantic: semantic.data, payload: assertPayload(recipe, row.payload, item) };
  });
  return { manifest, rows };
}
