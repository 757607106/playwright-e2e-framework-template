import { existsSync, readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join, relative } from 'node:path';
import { checkTestSource } from '../tests/support/framework-rules';
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap(name => {
    const file = join(dir, name);
    const stat = lstatSync(file);
    return stat.isSymbolicLink() ? [] : stat.isDirectory() ? walk(file) : [file];
  });
}
const errors = ['tests', 'examples/tests'].flatMap(dir => walk(dir)).filter(file => file.endsWith('.ts')).flatMap(file =>
  checkTestSource(readFileSync(file, 'utf8'), relative(process.cwd(), file).replaceAll('\\', '/')).map(error => `${file}: ${error}`));
errors.forEach(error => console.error(error));
console.log(`Framework check: ${errors.length} error(s)`);
if (errors.length) process.exitCode = 1;
