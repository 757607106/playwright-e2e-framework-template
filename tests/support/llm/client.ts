import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from 'ai';
import { z } from 'zod';
import type { ModelConfig, ModelOutputMode } from './config';
import { ModelError } from './errors';
import { createModelRegistry, type ModelInstance, type ModelProviderRegistry, type ProviderContext } from './registry';

type ProviderOptions = Parameters<typeof generateText>[0]['providerOptions'];

export type ModelIdentity = { provider: string; model: string; protocol: string; outputMode: ModelOutputMode };
export type StructuredModelRequest<T> = {
  schema: z.ZodType<T>; prompt: string; system?: string; signal: AbortSignal; maxOutputTokens: number;
};
export interface ModelClient {
  readonly identity: ModelIdentity;
  generateObject<T>(request: StructuredModelRequest<T>): Promise<{ value: T; totalTokens?: number }>;
}
function parseText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return JSON.parse(fenced ? fenced[1] : trimmed) as unknown;
}
function describeSchema(schema: z.ZodType) {
  try { return z.toJSONSchema(schema); }
  catch { throw new ModelError('CONFIG', 'Requested schema must describe JSON values and be representable as JSON Schema'); }
}
/** One request per call. Retry, batch orchestration and domain rules belong to the caller. */
export function createSdkModelClient(model: ModelInstance, identity: ModelIdentity, providerOptions?: ProviderOptions): ModelClient {
  return {
    identity: { ...identity },
    async generateObject(request) {
      if (!Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens < 1 || request.maxOutputTokens > 32768) throw new ModelError('CONFIG', 'maxOutputTokens must be an integer from 1 to 32768');
      if (request.signal.aborted) throw new ModelError('TIMEOUT', 'Model request was cancelled');
      let totalTokens: number | undefined;
      try {
        const jsonSchema = describeSchema(request.schema);
        const settings = {
          model, system: `${request.system ?? 'Return the requested structured information.'}\nReturn JSON matching this schema:\n${JSON.stringify(jsonSchema)}`,
          prompt: request.prompt, maxRetries: 0, maxOutputTokens: request.maxOutputTokens, abortSignal: request.signal,
          providerOptions,
        };
        let value: unknown;
        if (identity.outputMode === 'schema') {
          const result = await generateText({ ...settings, output: Output.object({ schema: request.schema }) });
          totalTokens = result.totalUsage.totalTokens;
          value = result.output;
        } else if (identity.outputMode === 'json') {
          const result = await generateText({ ...settings, output: Output.json() });
          totalTokens = result.totalUsage.totalTokens;
          value = result.output;
        } else {
          const result = await generateText({ ...settings, output: Output.text() });
          totalTokens = result.totalUsage.totalTokens;
          try { value = parseText(result.text); }
          catch { throw new ModelError('VALIDATION', 'Model text did not contain one valid JSON value', totalTokens); }
        }
        const parsed = request.schema.safeParse(value);
        if (!parsed.success) throw new ModelError('VALIDATION', 'Model output did not match the requested schema', totalTokens);
        return { value: parsed.data, totalTokens };
      } catch (error) {
        if (request.signal.aborted) throw new ModelError('TIMEOUT', 'Model request was cancelled or timed out');
        if (error instanceof ModelError) throw error;
        if (NoObjectGeneratedError.isInstance(error)) throw new ModelError('VALIDATION', 'Model output did not match the requested schema', error.usage?.totalTokens);
        if (NoOutputGeneratedError.isInstance(error)) throw new ModelError('VALIDATION', 'Model did not produce a complete structured response', totalTokens);
        throw new ModelError('PROVIDER', 'Model request failed; check credentials, endpoint, protocol and model privately');
      }
    },
  };
}
export async function createModelClient(config: ModelConfig, options: ProviderContext & { registry?: ModelProviderRegistry } = {}): Promise<ModelClient> {
  const resolved = await (options.registry ?? createModelRegistry()).resolve(config, options);
  return createSdkModelClient(resolved.model, { provider: resolved.config.provider, model: resolved.config.model,
    protocol: resolved.config.protocol, outputMode: resolved.config.outputMode }, resolved.config.providerOptions);
}
