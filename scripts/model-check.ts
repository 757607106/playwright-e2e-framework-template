import dotenv from 'dotenv';
import { createModelRegistry, loadModelClient, ModelError } from '../tests/support/llm';

async function main(args: string[]): Promise<void> {
  if (args.length === 1 && args[0] === '--help') {
    console.log('npm run model:check -- [--config path.ts | --list]\nValidate model settings and initialize the adapter without a model request. Never prints keys, headers or URLs.');
    return;
  }
  if (args.length === 1 && args[0] === '--list') { console.log(JSON.stringify(createModelRegistry().list(), null, 2)); return; }
  if (args.length && !(args.length === 2 && args[0] === '--config' && args[1] && !args[1].startsWith('--'))) throw new ModelError('CONFIG', 'Use --config path.ts, --list or --help');
  dotenv.config({ quiet: true });
  const client = await loadModelClient({ configFile: args[1] });
  console.log(JSON.stringify({ valid: true, ...client.identity, checked: 'configuration-and-adapter', onlineVerified: false }, null, 2));
}
main(process.argv.slice(2)).catch(error => {
  console.error(error instanceof ModelError ? error.message : '[Model] Cannot load trusted model configuration; inspect it privately');
  process.exitCode = 1;
});
