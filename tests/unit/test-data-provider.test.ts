import assert from 'node:assert/strict';
import test from 'node:test';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { recipe } from '../../examples/data/counter.recipe';
import { createAiSdkProvider, providerFromEnvironment } from '../support/data-generation/provider';
import { TestDataError } from '../support/data-generation';

test('real AI SDK adapter validates structured responses and repairs invalid JSON without hidden retries', async () => {
  const bodies: Record<string, unknown>[] = [];
  const model = createOpenAICompatible({ name: 'unit', baseURL: 'https://model.invalid/v1', supportsStructuredOutputs: true,
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ id: 'unit-response', object: 'chat.completion', created: 1, model: 'unit-model',
        choices: [{ index: 0, message: { role: 'assistant', content: bodies.length === 1 ? 'invalid-json' : JSON.stringify({ label: '模型演示库存' }) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  }).chatModel('unit-model');
  const data = await recipe.generate({ provider: createAiSdkProvider(model, { name: 'unit', model: 'unit-model' }), caseIds: ['normal'] });
  assert.equal(bodies.length, 2);
  assert.equal(data.rows[0].attempts, 2);
  assert.equal(data.rows[0].payload.label, '模型演示库存');
  assert.equal((bodies[0].response_format as { type: string }).type, 'json_schema');
  assert.equal(data.manifest.source.mode, 'llm');
  assert.equal(data.manifest.totalTokens, 36);
  assert.equal(data.manifest.usageComplete, true);
});
test('JSON mode receives the semantic schema in its prompt and still repairs invalid field shapes', async () => {
  const bodies: Record<string, unknown>[] = [];
  const model = createOpenAICompatible({ name: 'unit', baseURL: 'https://model.invalid/v1', supportsStructuredOutputs: false,
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ id: 'unit', created: 1, model: 'unit-model',
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(bodies.length === 1 ? { unrelated: 'bad' } : { label: 'JSON mode label' }) }, finish_reason: 'stop' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } });
    },
  }).chatModel('unit-model');
  const data = await recipe.generate({ provider: createAiSdkProvider(model, { name: 'unit', model: 'unit-model' }, 'json'), caseIds: ['normal'] });
  assert.equal(bodies.length, 2);
  assert.equal((bodies[0].response_format as { type: string }).type, 'json_object');
  const messages = bodies[0].messages as { role: string; content: string }[];
  assert.ok(messages.find(message => message.role === 'system')?.content.includes('"required":["label"]'));
  assert.equal(data.rows[0].payload.label, 'JSON mode label');
  assert.equal(data.manifest.usageComplete, false);
});

test('provider transport failures are redacted without retries', async () => {
  let requests = 0;
  const model = createOpenAICompatible({ name: 'unit', baseURL: 'https://model.invalid/v1', supportsStructuredOutputs: false,
    fetch: async () => { requests += 1; return new Response('PRIVATE_PROVIDER_RESPONSE', { status: 401 }); },
  }).chatModel('unit-model');
  await assert.rejects(recipe.generate({ provider: createAiSdkProvider(model, { name: 'unit', model: 'unit-model' }) }), error => error instanceof TestDataError && error.code === 'PROVIDER' && !error.message.includes('PRIVATE_PROVIDER_RESPONSE'));
  assert.equal(requests, 1);
});
test('environment configuration is explicit, never stores credentials or endpoint, and rejects unsafe URLs', async () => {
  await assert.rejects(providerFromEnvironment({}), /MODEL_NAME/);
  for (const baseURL of ['invalid', 'ftp://model.invalid/v1', 'https://user:pass@model.invalid/v1', 'https://model.invalid/v1?credential=private']) {
    await assert.rejects(providerFromEnvironment({ API_BASE_URL: baseURL, MODEL_NAME: 'unit-model' }), error => error instanceof TestDataError && error.code === 'CONFIG');
  }
  const provider = await providerFromEnvironment({ API_BASE_URL: 'http://192.168.0.2:9999/v1', MODEL_NAME: 'local-model' });
  assert.deepEqual(provider.identity, { name: 'openai-compatible', model: 'local-model', protocol: 'chat-completions', outputMode: 'schema' });
});
