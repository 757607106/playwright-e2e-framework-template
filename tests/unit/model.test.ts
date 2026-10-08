import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createModelClient, createModelRegistry, loadModelClient, ModelError, readModelConfig,
  type ModelConfig, type ModelOutputMode } from '../support/llm';

const schema = z.strictObject({ label: z.string().min(1) });
const request = () => ({ schema, prompt: 'Invent a synthetic label', maxOutputTokens: 64, signal: AbortSignal.timeout(5000) });
function response(body: unknown): Response { return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }); }
function chat(text: string): unknown {
  return { id: 'unit', created: 1, model: 'unit-model', choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 } };
}
function apiResponse(protocol: string, text: string): unknown {
  if (protocol === 'responses') return { id: 'unit', created_at: 1, output: [{ id: 'message', role: 'assistant', type: 'message', content: [{ type: 'output_text', text, annotations: [] }] }], usage: { input_tokens: 10, output_tokens: 8, total_tokens: 18 } };
  if (protocol === 'messages') return { type: 'message', id: 'unit', model: 'unit-model', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 8 } };
  if (protocol === 'generate-content') return { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 8, totalTokenCount: 18 } };
  if (protocol === 'completions') return { choices: [{ text, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 } };
  return chat(text);
}

test('model settings use canonical fields, environment overrides defaults and model names are unrestricted', () => {
  const config = readModelConfig({ MODEL_NAME: ' organization/arbitrary-model:tag ', API_BASE_URL: 'http://10.1.2.3:8000/v1/', API_KEY: 'unit', MODEL_PROVIDER: 'openai-compatible', MODEL_OUTPUT_MODE: 'text', BASE_URL: 'invalid' },
    { model: 'default', baseURL: 'https://default.invalid', outputMode: 'json' });
  assert.deepEqual(config, { provider: 'openai-compatible', model: 'organization/arbitrary-model:tag', baseURL: 'http://10.1.2.3:8000/v1', apiKey: 'unit', outputMode: 'text' });
  assert.equal(readModelConfig({ MODEL_NAME: '' }, { model: 'default' }).model, 'default');
  assert.throws(() => readModelConfig({}), /MODEL_NAME/);
  assert.throws(() => readModelConfig({ MODEL_NAME: 'unit', MODEL_OUTPUT_MODE: 'false' }), /outputMode/);
  for (const baseURL of ['invalid', 'ftp://model.invalid', 'https://user:secret@model.invalid', 'https://model.invalid?key=secret', 'https://model.invalid/#secret']) {
    assert.throws(() => readModelConfig({ MODEL_NAME: 'unit', API_BASE_URL: baseURL }), error => error instanceof ModelError && error.code === 'CONFIG' && !error.message.includes('secret'));
  }
});

const contracts: { provider: string; protocol: string; modes: ModelOutputMode[]; path: string; auth: string }[] = [
  { provider: 'openai-compatible', protocol: 'chat-completions', modes: ['schema', 'json', 'text'], path: '/chat/completions', auth: 'authorization' },
  { provider: 'openai', protocol: 'chat-completions', modes: ['schema', 'json', 'text'], path: '/chat/completions', auth: 'authorization' },
  { provider: 'openai', protocol: 'responses', modes: ['schema', 'json', 'text'], path: '/responses', auth: 'authorization' },
  { provider: 'openai', protocol: 'completions', modes: ['text'], path: '/completions', auth: 'authorization' },
  { provider: 'anthropic', protocol: 'messages', modes: ['schema', 'text'], path: '/messages', auth: 'x-api-key' },
  { provider: 'google', protocol: 'generate-content', modes: ['schema', 'json', 'text'], path: '/models/unit-model:generateContent', auth: 'x-goog-api-key' },
];
for (const contract of contracts) for (const outputMode of contract.modes) {
  test(`${contract.provider}/${contract.protocol}/${outputMode} uses its native wire contract and local validation`, async () => {
    const calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
    const client = await createModelClient({ provider: contract.provider, model: 'unit-model', apiKey: 'unit', baseURL: 'https://model.invalid/v1', protocol: contract.protocol, outputMode,
      headers: { 'x-unit': 'yes' }, providerOptions: contract.provider === 'anthropic' ? { anthropic: { structuredOutputMode: 'outputFormat' } } : undefined }, {
      fetch: async (url, init) => {
        calls.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return response(apiResponse(contract.protocol, JSON.stringify({ label: 'synthetic' })));
      },
    });
    const result = await client.generateObject(request());
    assert.deepEqual(result.value, { label: 'synthetic' });
    assert.equal(result.totalTokens, 18);
    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.equal(call.url, `https://model.invalid/v1${contract.path}`);
    assert.equal(call.headers.get('x-unit'), 'yes');
    assert.equal(call.headers.get(contract.auth), contract.auth === 'authorization' ? 'Bearer unit' : 'unit');
    assert.deepEqual(client.identity, { provider: contract.provider, model: 'unit-model', protocol: contract.protocol, outputMode });
    assert.ok(!JSON.stringify(client.identity).includes('model.invalid'));
    if (contract.protocol === 'chat-completions') {
      assert.equal(call.body.model, 'unit-model');
      assert.equal((call.body.response_format as { type: string } | undefined)?.type, outputMode === 'schema' ? 'json_schema' : outputMode === 'json' ? 'json_object' : undefined);
    } else if (contract.protocol === 'responses') {
      assert.equal(((call.body.text as { format?: { type: string } } | undefined)?.format)?.type, outputMode === 'schema' ? 'json_schema' : outputMode === 'json' ? 'json_object' : undefined);
    } else if (contract.protocol === 'generate-content') {
      const generation = call.body.generationConfig as { responseMimeType?: string; responseJsonSchema?: unknown };
      assert.equal(generation.responseMimeType, outputMode === 'text' ? undefined : 'application/json');
      assert.equal(Boolean(generation.responseJsonSchema), outputMode === 'schema');
    } else if (contract.protocol === 'messages') {
      const output = call.body.output_config as { format?: { type: string } } | undefined;
      assert.equal(output?.format?.type, outputMode === 'schema' ? 'json_schema' : undefined);
    }
  });
}

test('unsupported protocols, modes, missing credentials and unknown providers fail before network requests', async () => {
  let calls = 0;
  const invalid: ModelConfig[] = [
    { provider: 'unknown', model: 'unit' }, { provider: 'openai', model: 'unit' },
    { provider: 'google', model: 'unit' }, { provider: 'anthropic', model: 'unit' },
    { provider: 'openai-compatible', model: 'unit' },
    { provider: 'openai-compatible', model: 'unit', baseURL: 'https://model.invalid', protocol: 'responses' },
    { provider: 'anthropic', model: 'unit', apiKey: 'unit', outputMode: 'json' },
    { provider: 'openai', model: 'unit', apiKey: 'unit', protocol: 'completions', outputMode: 'schema' },
  ];
  for (const config of invalid) await assert.rejects(createModelClient(config, { fetch: async () => { calls += 1; return response({}); } }), error => error instanceof ModelError && error.code === 'CONFIG');
  assert.equal(calls, 0);
  const native = await createModelClient({ provider: 'openai', model: 'arbitrary-model', apiKey: 'unit' });
  assert.equal(native.identity.protocol, 'responses');
});

test('text output parses one JSON value or one fenced block and rejects prose, malformed JSON and wrong fields', async () => {
  for (const content of ['{"label":"ok"}', '```json\n{"label":"ok"}\n```', '```\n{"label":"ok"}\n```', 'Here is {"label":"bad"}', '{invalid}', '{"label":42}', '{"label":"ok","extra":true}']) {
    const client = await createModelClient({ provider: 'openai-compatible', model: 'unit', baseURL: 'http://127.0.0.1:9999/v1', outputMode: 'text' }, { fetch: async () => response(chat(content)) });
    if (content.startsWith('{"label":"ok"}') || content.startsWith('```')) assert.equal((await client.generateObject(request())).value.label, 'ok');
    else await assert.rejects(client.generateObject(request()), error => error instanceof ModelError && error.code === 'VALIDATION' && error.totalTokens === 18);
  }
});

test('SDK transport failures never leak SDK response bodies or retry, and cancellation takes precedence', async () => {
  let calls = 0;
  const client = await createModelClient({ provider: 'openai-compatible', model: 'unit', baseURL: 'https://model.invalid', outputMode: 'text' }, {
    fetch: async () => { calls += 1; return new Response('PRIVATE_RESPONSE', { status: 429 }); },
  });
  await assert.rejects(client.generateObject(request()), error => error instanceof ModelError && error.code === 'PROVIDER' && !error.message.includes('PRIVATE_RESPONSE'));
  assert.equal(calls, 1);
  await assert.rejects(client.generateObject({ ...request(), signal: AbortSignal.abort() }), error => error instanceof ModelError && error.code === 'TIMEOUT');
  await assert.rejects(client.generateObject({ ...request(), maxOutputTokens: 0 }), /maxOutputTokens/);
  assert.equal(calls, 1);
});

test('custom provider registration preserves arbitrary model IDs, copies capability declarations and protects built-ins', async () => {
  const registry = createModelRegistry();
  const modes: ModelOutputMode[] = ['text'];
  registry.register('private', { defaultProtocol: 'custom', defaultBaseURL: 'https://model.invalid/v1', protocols: { custom: modes },
    createModel: (config, context) => createOpenAICompatible({ name: config.provider, baseURL: config.baseURL, fetch: context.fetch }).chatModel(config.model),
  });
  modes.push('json');
  const listed = registry.list().find(item => item.provider === 'private')!;
  assert.deepEqual(listed.protocols.custom, ['text']);
  listed.protocols.custom = ['schema'];
  assert.deepEqual(registry.list().find(item => item.provider === 'private')!.protocols.custom, ['text']);
  assert.throws(() => registry.register('openai', { defaultProtocol: 'custom', protocols: { custom: modes }, createModel: () => createOpenAICompatible({ name: 'unit', baseURL: 'https://model.invalid' }).chatModel('unit') }), /unique/);
  let wireModel: unknown;
  const client = await createModelClient({ provider: 'private', model: 'team/arbitrary-model:tag' }, { registry,
    fetch: async (_url, init) => { wireModel = (JSON.parse(String(init?.body)) as Record<string, unknown>).model; return response(chat('{"label":"custom"}')); },
  });
  assert.equal((await client.generateObject(request())).value.label, 'custom');
  assert.equal(wireModel, 'team/arbitrary-model:tag');
  assert.ok(!createModelRegistry().list().some(item => item.provider === 'private'));
});

test('trusted model config loader validates canonical environment without making a request', async () => {
  let calls = 0;
  const client = await loadModelClient({ env: { MODEL_NAME: 'unit', API_BASE_URL: 'https://model.invalid/v1', MODEL_OUTPUT_MODE: 'text' }, fetch: async () => { calls += 1; return response({}); } });
  assert.equal(client.identity.outputMode, 'text');
  assert.equal(calls, 0);
  await assert.rejects(loadModelClient({ configFile: 'missing.config.ts', env: {} }), /Cannot load model.config/);
});

test('schemas that cannot represent JSON fail as configuration errors before a request', async () => {
  let calls = 0;
  const client = await createModelClient({ provider: 'openai-compatible', model: 'unit', baseURL: 'https://model.invalid' }, {
    fetch: async () => { calls += 1; return response({}); },
  });
  await assert.rejects(client.generateObject({ ...request(), schema: z.date() }), error => error instanceof ModelError && error.code === 'CONFIG');
  assert.equal(calls, 0);
});
