import type { LanguageModel } from 'ai';
import { type ModelConfig, type ModelOutputMode, type ResolvedModelConfig, validateBaseURL, validateModelConfig } from './config';
import { ModelError } from './errors';

/** Require an explicit SDK instance, avoiding implicit AI Gateway names/credentials. */
export type ModelInstance = Exclude<LanguageModel, string>;
export type ProviderContext = { fetch?: typeof globalThis.fetch };
export type ModelProviderDefinition = {
  defaultProtocol: string;
  /** First output mode is the default for that protocol. */
  protocols: Record<string, readonly ModelOutputMode[]>;
  defaultBaseURL?: string;
  requiresApiKey?: boolean;
  createModel: (config: ResolvedModelConfig, context: ProviderContext) => ModelInstance | Promise<ModelInstance>;
};
export class ModelProviderRegistry {
  private readonly definitions = new Map<string, ModelProviderDefinition>();
  register(name: string, definition: ModelProviderDefinition): this {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(name) || this.definitions.has(name)) throw new ModelError('CONFIG', 'Provider IDs must be valid and unique; existing providers cannot be overwritten');
    const protocols = Object.fromEntries(Object.entries(definition.protocols).map(([protocol, modes]) => [protocol, [...modes]]));
    if (!protocols[definition.defaultProtocol]?.length || Object.entries(protocols).some(([protocol, modes]) =>
      !/^[a-z][a-z0-9-]{0,63}$/.test(protocol) || !modes.length || new Set(modes).size !== modes.length || modes.some(mode => !['schema', 'json', 'text'].includes(mode)))
      || typeof definition.createModel !== 'function') throw new ModelError('CONFIG', 'Provider definition needs a default protocol, supported output modes and a model factory');
    this.definitions.set(name, { ...definition, protocols });
    return this;
  }
  list(): { provider: string; defaultProtocol: string; protocols: Record<string, readonly ModelOutputMode[]> }[] {
    return [...this.definitions].map(([provider, definition]) => ({ provider, defaultProtocol: definition.defaultProtocol,
      protocols: Object.fromEntries(Object.entries(definition.protocols).map(([protocol, modes]) => [protocol, [...modes]])),
    })).sort((a, b) => a.provider.localeCompare(b.provider));
  }
  async resolve(input: ModelConfig, context: ProviderContext = {}): Promise<{ model: ModelInstance; config: ResolvedModelConfig }> {
    const config = validateModelConfig(input);
    const definition = this.definitions.get(config.provider);
    if (!definition) throw new ModelError('CONFIG', 'Unknown MODEL_PROVIDER; register its SDK adapter in model.config.ts');
    const protocol = config.protocol ?? definition.defaultProtocol;
    const modes = definition.protocols[protocol];
    if (!modes) throw new ModelError('CONFIG', 'MODEL_PROTOCOL is not supported by the selected provider');
    const outputMode = config.outputMode ?? modes[0];
    if (!modes.includes(outputMode)) throw new ModelError('CONFIG', 'MODEL_OUTPUT_MODE is not supported by the selected protocol');
    const baseURL = config.baseURL ?? definition.defaultBaseURL;
    if (!baseURL) throw new ModelError('CONFIG', 'API_BASE_URL is required for this provider');
    if (definition.requiresApiKey && !config.apiKey) throw new ModelError('CONFIG', 'API_KEY is required for this provider');
    const resolved: ResolvedModelConfig = { ...config, protocol, outputMode, baseURL: validateBaseURL(baseURL) };
    try {
      const model = await definition.createModel(resolved, context);
      if (!model || typeof model !== 'object' || !['v2', 'v3', 'v4'].includes(model.specificationVersion) || typeof model.doGenerate !== 'function') throw new ModelError('CONFIG', 'Provider factory must return an explicit AI SDK language model instance');
      return { config: resolved, model };
    }
    catch (error) {
      if (error instanceof ModelError) throw error;
      throw new ModelError('CONFIG', 'Cannot initialize model adapter; check installed SDK and provider configuration privately');
    }
  }
}

/** Built-in SDKs load only when selected; offline tests never initialize a provider. */
export function createModelRegistry(): ModelProviderRegistry {
  return new ModelProviderRegistry()
    .register('openai-compatible', {
      defaultProtocol: 'chat-completions', protocols: { 'chat-completions': ['schema', 'json', 'text'] },
      async createModel(config, context) {
        const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
        return createOpenAICompatible({ name: config.provider, baseURL: config.baseURL, apiKey: config.apiKey,
          headers: config.headers, fetch: context.fetch, supportsStructuredOutputs: config.outputMode === 'schema',
        }).chatModel(config.model);
      },
    })
    .register('openai', {
      defaultProtocol: 'responses', defaultBaseURL: 'https://api.openai.com/v1', requiresApiKey: true,
      protocols: { responses: ['schema', 'json', 'text'], 'chat-completions': ['schema', 'json', 'text'], completions: ['text'] },
      async createModel(config, context) {
        const { createOpenAI } = await import('@ai-sdk/openai');
        const provider = createOpenAI({ baseURL: config.baseURL, apiKey: config.apiKey, headers: config.headers, fetch: context.fetch });
        if (config.protocol === 'responses') return provider.responses(config.model);
        if (config.protocol === 'completions') return provider.completion(config.model);
        return provider.chat(config.model);
      },
    })
    .register('anthropic', {
      defaultProtocol: 'messages', defaultBaseURL: 'https://api.anthropic.com/v1', requiresApiKey: true,
      protocols: { messages: ['schema', 'text'] },
      async createModel(config, context) {
        const { createAnthropic } = await import('@ai-sdk/anthropic');
        return createAnthropic({ baseURL: config.baseURL, apiKey: config.apiKey, headers: config.headers, fetch: context.fetch }).messages(config.model);
      },
    })
    .register('google', {
      defaultProtocol: 'generate-content', defaultBaseURL: 'https://generativelanguage.googleapis.com/v1beta', requiresApiKey: true,
      protocols: { 'generate-content': ['schema', 'json', 'text'] },
      async createModel(config, context) {
        const { createGoogle } = await import('@ai-sdk/google');
        return createGoogle({ baseURL: config.baseURL, apiKey: config.apiKey, headers: config.headers, fetch: context.fetch }).chat(config.model);
      },
    });
}
