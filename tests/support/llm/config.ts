import { z } from 'zod';
import { ModelError } from './errors';

export const OUTPUT_MODES = ['schema', 'json', 'text'] as const;
export type ModelOutputMode = typeof OUTPUT_MODES[number];
export const MODEL_ENVIRONMENT = {
  provider: 'MODEL_PROVIDER', model: 'MODEL_NAME', baseURL: 'API_BASE_URL', apiKey: 'API_KEY',
  protocol: 'MODEL_PROTOCOL', outputMode: 'MODEL_OUTPUT_MODE',
} as const;
const modelConfigSchema = z.strictObject({
  provider: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/).default('openai-compatible'),
  model: z.string().trim().min(1),
  baseURL: z.string().min(1).optional(), apiKey: z.string().min(1).optional(),
  protocol: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/).optional(),
  outputMode: z.enum(OUTPUT_MODES).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  providerOptions: z.record(z.string(), z.record(z.string(), z.json().optional())).optional(),
});
export type ModelConfig = z.infer<typeof modelConfigSchema>;
export type ResolvedModelConfig = ModelConfig & { baseURL: string; protocol: string; outputMode: ModelOutputMode };

/** Nonsecret defaults and advanced provider options belong in model.config.ts. */
export function defineModelConfig(config: Partial<ModelConfig>): Partial<ModelConfig> { return config; }

export function validateModelConfig(value: unknown): ModelConfig {
  const parsed = modelConfigSchema.safeParse(value);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map(issue => issue.path[0] ?? 'configuration'))];
    throw new ModelError('CONFIG', `Invalid model configuration: ${fields.join(', ')}. Set MODEL_NAME and check the documented fields`);
  }
  const config = parsed.data;
  if (config.baseURL) config.baseURL = validateBaseURL(config.baseURL);
  try { if (config.headers) new Headers(config.headers); }
  catch { throw new ModelError('CONFIG', 'Invalid model request headers'); }
  return config;
}
export function validateBaseURL(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new ModelError('CONFIG', 'API_BASE_URL must be an absolute HTTP(S) API prefix'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new ModelError('CONFIG', 'API_BASE_URL must use HTTP(S) without URL credentials, query or fragment');
  }
  return url.href.replace(/\/$/, '');
}
/** Explicit field mapping; unrelated environment variables never become model settings. */
export function readModelConfig(env: NodeJS.ProcessEnv = process.env, defaults: Partial<ModelConfig> = {}): ModelConfig {
  const input: Record<string, unknown> = { ...defaults };
  for (const [field, key] of Object.entries(MODEL_ENVIRONMENT)) {
    const value = env[key]?.trim();
    if (value) input[field] = value;
  }
  return validateModelConfig(input);
}
