import assert from 'node:assert/strict';
import test from 'node:test';
import { checkTestSource } from '../support/framework-rules';
import ts from 'typescript';
import { resolve } from 'node:path';
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

test('typed checks reject floating browser operations and assertions, while accepting returned or awaited promises', () => {
  const file = resolve('tests/e2e/typed-probe.spec.ts');
  const source = ts.createSourceFile(file, header + `
    declare const page: { click(selector: string): Promise<void> };
    declare function assertVisible(): Promise<void>;
    scenario('probe', async () => {
      page.click('unawaited');
      assertVisible();
      void page.click('discarded');
      await page.click('awaited');
      await Promise.all([page.click('first'), page.click('second')]);
    });
    const action = () => page.click('implicit return');
    function returned() { return page.click('explicit return'); }
  `, ts.ScriptTarget.Latest, true);
  const options: ts.CompilerOptions = { strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS };
  const host = ts.createCompilerHost(options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) => resolve(name) === file ? source
    : original(name, languageVersion, onError, shouldCreateNewSourceFile);
  const checker = ts.createProgram([file], options, host).getTypeChecker();
  assert.deepEqual(checkTestSource(source, 'tests/e2e/typed-probe.spec.ts', checker), ['floating promises must be awaited or returned']);
  const clean = ts.createSourceFile(file, header + `
    declare const page: { click(selector: string): Promise<void> };
    scenario('probe', async () => { await page.click('x'); await Promise.all([page.click('a'), page.click('b')]); });
    const action = () => page.click('implicit return');
    function returned() { return page.click('explicit return'); }
  `, ts.ScriptTarget.Latest, true);
  const cleanProgram = ts.createProgram([file], options, { ...host, getSourceFile: (name, languageVersion, onError, fresh) => resolve(name) === file ? clean : original(name, languageVersion, onError, fresh) });
  assert.deepEqual(checkTestSource(clean, 'tests/e2e/typed-probe.spec.ts', cleanProgram.getTypeChecker()), []);
});
