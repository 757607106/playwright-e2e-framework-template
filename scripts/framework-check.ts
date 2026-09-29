import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const errors: string[] = [];
const root = process.cwd();

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const file = join(dir, name);
    return statSync(file).isDirectory() ? walk(file) : [file];
  });
}

for (const file of walk(join(root, 'tests')).filter((name) => name.endsWith('.ts'))) {
  const name = relative(root, file).replaceAll('\\', '/');
  const source = readFileSync(file, 'utf8');
  if (name.endsWith('.spec.ts') && !/^[a-z0-9]+(?:-[a-z0-9]+)*\.spec\.ts$/.test(name.split('/').at(-1) || '')) {
    errors.push(`${name}: spec name must use kebab-case`);
  }
  if (name.startsWith('tests/e2e/') && name.endsWith('.spec.ts') && !/from ['"][^'"]*fixtures['"]/.test(source)) {
    errors.push(`${name}: import test/expect from tests/fixtures`);
  }
  for (const [pattern, message] of [
    [/\b(?:test|describe)\.only\s*\(/g, 'exclusive tests are forbidden'],
    [/\.waitForTimeout\s*\(/g, 'fixed waits are forbidden'],
    [/\bas any\b/g, 'unbounded any casts are forbidden'],
  ] as const) {
    if (pattern.test(source)) errors.push(`${name}: ${message}`);
  }
  if (name.startsWith('tests/e2e/') && /\bforce\s*:\s*true\b/.test(source)) {
    errors.push(`${name}: forced clicks are forbidden`);
  }
}

for (const error of errors) console.error(error);
console.log(`Framework check: ${errors.length} error(s)`);
if (errors.length) process.exitCode = 1;
