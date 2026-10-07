import assert from 'node:assert/strict';
import test from 'node:test';
import { checkTestSource } from '../support/framework-rules';
const header = "import { test as scenario } from '../fixtures';\n";
test('AST guard detects aliased nested focused tests and forced actions', () => {
  const result = checkTestSource(header + "scenario.describe.only('x', () => {}); page.click('x', { force: true });", 'tests/e2e/sample.spec.ts');
  assert.deepEqual(result.sort(), ['exclusive tests are forbidden', 'forced UI actions are forbidden'].sort());
});
test('AST guard ignores comments, strings and filesystem force flags', () => {
  const result = checkTestSource(header + "// test.only('x')\nconst text = 'page.waitForTimeout(100)'; rmSync(text, { force: true });", 'tests/e2e/sample.spec.ts');
  assert.deepEqual(result, []);
});
test('AST guard catches literal bracket focus and unsafe casts', () => {
  assert.deepEqual(checkTestSource(header + "scenario['only']('x', () => {}); const x = value as any;", 'tests/e2e/sample.spec.ts').sort(), ['exclusive tests are forbidden', 'unbounded any casts are forbidden'].sort());
});

test('consumer fixtures under the shared directory are accepted', () => {
  assert.deepEqual(checkTestSource("import { test } from '../fixtures/auth.fixture'; test('x', () => {});", 'tests/e2e/sample.spec.ts'), []);
});
