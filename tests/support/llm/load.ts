import { resolve } from 'node:path';
import { PROJECT_ROOT } from '../paths';
import { createModelClient, type ModelClient } from './client';
import { readModelConfig, type ModelConfig } from './config';
import { ModelError } from './errors';
import { createModelRegistry, ModelProviderRegistry, type ProviderContext } from './registry';

type ModelModule = { default?: Partial<ModelConfig>; providers?: ModelProviderRegistry };
/** The config module is trusted, typed application code; replay never loads it. */
export async function loadModelClient(options: ProviderContext & { configFile?: string; env?: NodeJS.ProcessEnv } = {}): Promise<ModelClient> {
  const file = options.configFile ? resolve(options.configFile) : resolve(PROJECT_ROOT, 'model.config.ts');
  let module: ModelModule;
  try { module = require(file) as ModelModule; }
  catch { throw new ModelError('CONFIG', 'Cannot load model.config.ts; check the trusted configuration module privately'); }
  if (!module.default || typeof module.default !== 'object' || module.providers && !(module.providers instanceof ModelProviderRegistry)) throw new ModelError('CONFIG', 'Model config must export default settings and an optional providers registry');
  return createModelClient(readModelConfig(options.env ?? process.env, module.default), {
    registry: module.providers ?? createModelRegistry(), fetch: options.fetch,
  });
}
