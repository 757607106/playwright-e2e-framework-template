import type { Faker } from '@faker-js/faker';
import type { z } from 'zod';
import type { ModelOutputMode } from '../llm/config';

export type DataContext = { faker: Faker; caseId: string; index: number; refDate: string };
export type DataCase<T> = {
  id: string;
  description: string;
  /** Named business rules intentionally broken by mutate; empty for positive cases. */
  expectedViolations?: readonly string[];
  mutate?: (payload: T, context: DataContext) => T;
};
export type DataRecipe<T, S> = {
  id: string;
  /** Bump when code, business rules or offline semantics change. */
  version: string;
  schema: z.ZodType<T>;
  semantic: {
    schema: z.ZodType<S>;
    prompt: string;
    version: string;
    offline: (context: DataContext) => S;
  };
  build: (context: DataContext, semantic: S) => T;
  rules: readonly { id: string; check: (payload: T) => boolean }[];
  cases: readonly DataCase<T>[];
};
export type SemanticRequest = {
  schema: z.ZodType;
  prompt: string;
  feedback: readonly string[];
  signal: AbortSignal;
  maxOutputTokens: number;
};
export interface SemanticProvider {
  readonly identity: { name: string; model: string; protocol?: string; outputMode?: ModelOutputMode };
  generate(request: SemanticRequest): Promise<{ value: unknown; totalTokens?: number }>;
}
export type GenerateOptions = {
  provider?: SemanticProvider;
  seed?: number;
  refDate?: string;
  perCase?: number;
  caseIds?: readonly string[];
  maxAttempts?: number;
  timeoutMs?: number;
  totalTimeoutMs?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};
export type DatasetRow<T, S = unknown> = {
  id: string;
  caseId: string;
  index: number;
  expectedViolations: string[];
  attempts: number;
  semantic: S;
  payload: T;
};
export type Dataset<T, S = unknown> = {
  manifest: {
    formatVersion: 1;
    datasetId: string;
    createdAt: string;
    recipeId: string;
    recipeVersion: string;
    recipeHash: string;
    promptVersion: string;
    generatorVersion: string;
    fakerVersion: string;
    source: { mode: 'offline' | 'llm'; name: string; model: string; protocol?: string; outputMode?: ModelOutputMode };
    seed: number;
    refDate: string;
    perCase: number;
    caseIds: string[];
    limits: { maxAttempts: number; timeoutMs: number; totalTimeoutMs: number; maxOutputTokens: number };
    rowCount: number;
    totalTokens: number;
    usageComplete: boolean;
    contentHash: string;
  };
  rows: DatasetRow<T, S>[];
};
export type DefinedRecipe<T, S> = DataRecipe<T, S> & {
  generate: (options?: GenerateOptions) => Promise<Dataset<T, S>>;
  load: (file: string) => Dataset<T, S>;
};
