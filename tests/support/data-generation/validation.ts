import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { DataCase, DataRecipe } from './types';

export class TestDataError extends Error {
  constructor(readonly code: 'CONFIG' | 'VALIDATION' | 'PROVIDER' | 'TIMEOUT' | 'REPLAY' | 'STORAGE', message: string, readonly totalTokens?: number) {
    super(`[Test data/${code}] ${message}`);
    this.name = 'TestDataError';
  }
}
export const GENERATOR_VERSION = '1';
export const MAX_DATASET_BYTES = 10 * 1024 * 1024;
export function safeId(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(value)) throw new TestDataError('CONFIG', 'IDs must use 1–96 letters, digits, underscores or hyphens');
  return value;
}
/** Refuse lossy JSON conversion (undefined, NaN, Date, functions, cycles). */
export function canonicalJSON(value: unknown, depth = 0): string {
  if (depth > 32) throw new TestDataError('VALIDATION', 'Payload must be finite JSON with depth <= 32');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${Array.from(value, item => canonicalJSON(item, depth + 1)).join(',')}]`;
  if (typeof value === 'object' && value !== null && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJSON((value as Record<string, unknown>)[key], depth + 1)}`).join(',')}}`;
  }
  throw new TestDataError('VALIDATION', 'Payload must contain only JSON values');
}
export function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJSON(value)).digest('hex');
}
export function recipeHash<T, S>(recipe: DataRecipe<T, S>): string {
  return digest({
    id: recipe.id, version: recipe.version,
    schema: z.toJSONSchema(recipe.schema), semanticSchema: z.toJSONSchema(recipe.semantic.schema),
    prompt: recipe.semantic.prompt, promptVersion: recipe.semantic.version,
    cases: recipe.cases.map(item => ({ id: item.id, description: item.description, expectedViolations: item.expectedViolations ?? [] })),
    rules: recipe.rules.map(rule => rule.id),
  });
}
export function validateRecipe<T, S>(recipe: DataRecipe<T, S>): void {
  safeId(recipe.id);
  if (!recipe.version || !recipe.semantic.version || !recipe.semantic.prompt.trim()) throw new TestDataError('CONFIG', 'Recipe and prompt versions and prompt are required');
  if (!recipe.cases.length || recipe.cases.length > 100) throw new TestDataError('CONFIG', 'A recipe needs 1–100 cases');
  const caseIds = recipe.cases.map(item => safeId(item.id));
  const ruleIds = recipe.rules.map(item => safeId(item.id));
  if (new Set(caseIds).size !== caseIds.length || new Set(ruleIds).size !== ruleIds.length) throw new TestDataError('CONFIG', 'Case and rule IDs must be unique');
  for (const item of recipe.cases) {
    const expected = item.expectedViolations ?? [];
    if (!item.description.trim() || new Set(expected).size !== expected.length || expected.some(id => !ruleIds.includes(id))
      || (expected.length > 0 && !item.mutate)) throw new TestDataError('CONFIG', 'Each case needs a description and valid, unique expected rule IDs; negative cases need mutate');
  }
  // Wire schemas must be representable as JSON Schema; transforms belong in build.
  recipeHash(recipe);
}
export function payloadIssues<T, S>(recipe: DataRecipe<T, S>, value: unknown, expected: readonly string[]): string[] {
  const parsed = recipe.schema.safeParse(value);
  if (!parsed.success) return [...new Set(parsed.error.issues.map(issue => `schema:${issue.path.join('.') || '$'}:${issue.code}`))];
  // Reject schemas that silently strip/coerce data; persisted payload and validated input must match.
  if (canonicalJSON(value) !== canonicalJSON(parsed.data)) return ['schema:lossy-parse'];
  const broken = recipe.rules.filter(rule => !rule.check(parsed.data)).map(rule => rule.id).sort();
  return canonicalJSON(broken) === canonicalJSON([...expected].sort()) ? [] : [`rules:${broken.join(',') || 'none'};expected:${[...expected].sort().join(',') || 'none'}`];
}
export function assertPayload<T, S>(recipe: DataRecipe<T, S>, value: unknown, dataCase: DataCase<T>): T {
  const issues = payloadIssues(recipe, value, dataCase.expectedViolations ?? []);
  if (issues.length) throw new TestDataError('VALIDATION', `Case ${dataCase.id} failed: ${issues.join('; ')}`);
  return recipe.schema.parse(value);
}
