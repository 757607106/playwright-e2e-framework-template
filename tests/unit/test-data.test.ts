import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { recipe } from '../../examples/data/counter.recipe';
import { defineDataRecipe, datasetPath, saveDataset, type SemanticProvider } from '../support/data-generation';
import { TestDataReader } from '../support/data-generation/fixture';
import { canonicalJSON, digest, TestDataError } from '../support/data-generation/validation';

test('offline batches are reproducible across independent Faker contexts; seed changes inputs', async () => {
  const first = await recipe.generate({ seed: 100, perCase: 2 });
  const second = await recipe.generate({ seed: 100, perCase: 2 });
  assert.deepEqual(first.rows, second.rows);
  assert.equal(first.manifest.datasetId, second.manifest.datasetId);
  assert.notEqual(first.manifest.datasetId, (await recipe.generate({ seed: 101, perCase: 2 })).manifest.datasetId);
  assert.equal(first.manifest.source.mode, 'offline');
  assert.equal(first.rows.length, 8);
  assert.equal(first.rows.find(row => row.caseId === 'minimum')?.payload.initialValue, 0);
  assert.equal(first.rows.find(row => row.caseId === 'maximum')?.payload.initialValue, 100);
  assert.deepEqual(first.rows.find(row => row.caseId === 'below-minimum')?.expectedViolations, ['initial-range']);
});
test('semantic provider is restricted to schema fields, with bounded validation repair', async () => {
  const feedback: string[][] = [];
  const provider: SemanticProvider = {
    identity: { name: 'unit', model: 'mock' },
    async generate(request) {
      feedback.push([...request.feedback]);
      return { value: feedback.length === 1 ? { label: 'Synthetic label', initialValue: 99999 } : { label: 'Synthetic label' }, totalTokens: 7 };
    },
  };
  const data = await recipe.generate({ provider, caseIds: ['maximum'] });
  assert.equal(data.rows[0].attempts, 2);
  assert.equal(data.rows[0].payload.initialValue, 100);
  assert.equal(data.manifest.totalTokens, 14);
  assert.equal(data.manifest.usageComplete, true);
  assert.deepEqual(feedback, [[], ['semantic:invalid-schema']]);
});
test('rule validation repair receives IDs and never rejected payloads', async () => {
  const feedback: string[][] = [];
  const provider: SemanticProvider = {
    identity: { name: 'unit', model: 'mock' },
    async generate(request) {
      feedback.push([...request.feedback]);
      return { value: { label: ' ' } };
    },
  };
  await assert.rejects(recipe.generate({ provider, caseIds: ['normal'], maxAttempts: 2 }), /exhausted validation attempts/);
  assert.equal(feedback.length, 2);
  assert.match(feedback[1][0], /label-length/);
});
test('negative samples must break exactly the named rules; accidental extra violations fail', async () => {
  const broken = defineDataRecipe({ ...recipe, version: 'broken', cases: [{ id: 'negative', description: 'Controlled negative', expectedViolations: ['initial-range'], mutate: payload => ({ ...payload, initialValue: -1, label: '' }) }] });
  await assert.rejects(broken.generate(), /label-length/);
  assert.throws(() => defineDataRecipe({ ...recipe, cases: [{ id: 'bad', description: 'Unknown rule', expectedViolations: ['unknown'], mutate: payload => payload }] }), /valid, unique expected rule IDs/);
});
test('provider transport errors fail once and redact server text; ignored aborts are bounded', async () => {
  let calls = 0;
  const provider: SemanticProvider = { identity: { name: 'unit', model: 'mock' }, async generate() { calls += 1; throw new Error('PRIVATE_SERVER_BODY'); } };
  await assert.rejects(recipe.generate({ provider }), error => error instanceof TestDataError && error.code === 'PROVIDER' && !error.message.includes('PRIVATE_SERVER_BODY'));
  assert.equal(calls, 1);
  let signal: AbortSignal | undefined;
  const hanging: SemanticProvider = { identity: provider.identity, generate(request) { signal = request.signal; return new Promise(() => {}); } };
  await assert.rejects(recipe.generate({ provider: hanging, timeoutMs: 20 }), error => error instanceof TestDataError && error.code === 'TIMEOUT');
  assert.equal(signal?.aborted, true);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(recipe.generate({ provider, signal: controller.signal }), /cancelled/);
  assert.equal(calls, 1);
});
test('generation rejects invalid limits, selections and moving reference dates', async () => {
  for (const options of [{ perCase: 0 }, { maxAttempts: 4 }, { seed: -1 }, { maxOutputTokens: 10 }, { caseIds: ['missing'] }, { caseIds: ['normal', 'normal'] }, { refDate: '2026-01-01' }]) {
    await assert.rejects(recipe.generate(options), error => error instanceof TestDataError && error.code === 'CONFIG');
  }
});
test('dates are deterministic and JSON conversion cannot silently lose data', async () => {
  const dateRecipe = defineDataRecipe({
    id: 'dated', version: '1', schema: z.strictObject({ date: z.string(), text: z.string() }),
    semantic: { schema: z.strictObject({ text: z.string() }), prompt: 'Synthetic text', version: '1', offline: () => ({ text: 'Synthetic' }) },
    build: ({ faker }, semantic) => ({ ...semantic, date: faker.date.soon().toISOString() }), rules: [], cases: [{ id: 'normal', description: 'Relative date' }],
  });
  assert.deepEqual((await dateRecipe.generate()).rows, (await dateRecipe.generate()).rows);
  assert.equal(canonicalJSON({ z: 1, a: 2 }), canonicalJSON({ a: 2, z: 1 }));
  for (const value of [{ missing: undefined }, NaN, new Date(), [, 1], () => {}]) assert.throws(() => canonicalJSON(value), /JSON/);
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  assert.throws(() => canonicalJSON(cyclic), /depth/);
});
test('immutable save/replay reuses identical content; missing/tampered/stale batches fail closed', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'test-data-store-'));
  try {
    const data = await recipe.generate();
    const file = saveDataset(data, directory);
    const bytes = readFileSync(file, 'utf8');
    assert.equal(saveDataset(await recipe.generate(), directory), file);
    assert.equal(readFileSync(file, 'utf8'), bytes);
    assert.deepEqual(recipe.load(file), data);
    assert.throws(() => recipe.load(join(directory, 'missing.json')), /provision the batch/);
    assert.throws(() => defineDataRecipe({ ...recipe, version: '2' }).load(file), /version changed/);
    assert.throws(() => defineDataRecipe({ ...recipe, semantic: { ...recipe.semantic, prompt: 'Changed prompt' } }).load(file), /version changed/);
    data.rows[0].payload.initialValue = 42;
    writeFileSync(file, JSON.stringify(data));
    assert.throws(() => recipe.load(file), /integrity/);
    assert.throws(() => saveDataset(awaitedCopy(bytes), directory), /integrity/);
    assert.equal(readdirSync(directory).filter(name => name.startsWith('.pending')).length, 0);
    assert.throws(() => datasetPath('../outside', directory), /IDs must use/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
function awaitedCopy(text: string): Awaited<ReturnType<typeof recipe.generate>> {
  return JSON.parse(text) as Awaited<ReturnType<typeof recipe.generate>>;
}
test('replay revalidates business rules, identities and negative intent even with recomputed hashes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'test-data-revalidation-'));
  try {
    const data = await recipe.generate();
    data.rows[0].payload.initialValue = -1;
    const { datasetId: _datasetId, createdAt: _createdAt, contentHash: _contentHash, ...manifest } = data.manifest;
    data.manifest.contentHash = digest({ manifest, rows: data.rows });
    data.manifest.datasetId = `${recipe.id}-${data.manifest.contentHash.slice(0, 32)}`;
    const file = saveDataset(data, directory);
    assert.throws(() => recipe.load(file), /initial-range/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('fixture only replays and attaches manifest metadata, without payloads', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'test-data-fixture-'));
  const attachments: string[] = [];
  const reader = new TestDataReader(async (_name, body) => { attachments.push(body); });
  try {
    const dataset = await recipe.generate();
    const file = saveDataset(dataset, directory);
    const replayed = await reader.load(recipe, { file });
    assert.equal(replayed.rows.length, 4);
    assert.equal(attachments.length, 1);
    assert.ok(!attachments[0].includes(dataset.rows[0].payload.label));
    assert.equal(typeof reader.load, 'function');
    assert.ok(!('generate' in reader));
    await assert.rejects(reader.load(recipe, { file, datasetId: dataset.manifest.datasetId }), /not both/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
