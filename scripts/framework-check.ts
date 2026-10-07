import { existsSync, readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join, relative } from 'node:path';
import { checkTestSource } from '../tests/support/framework-rules';
import ts from 'typescript';
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap(name => {
    const file = join(dir, name);
    const stat = lstatSync(file);
    return stat.isSymbolicLink() ? [] : stat.isDirectory() ? walk(file) : [file];
  });
}
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
if (parsed.errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(parsed.errors, {
  getCanonicalFileName: file => file, getCurrentDirectory: process.cwd, getNewLine: () => '\n',
}));
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const errors = ['tests', 'examples/tests'].flatMap(dir => walk(dir)).filter(file => file.endsWith('.ts')).flatMap(file => {
  const source = program.getSourceFile(file);
  return checkTestSource(source ?? readFileSync(file, 'utf8'), relative(process.cwd(), file).replaceAll('\\', '/'), source ? checker : undefined)
    .map(error => `${file}: ${error}`);
});
errors.forEach(error => console.error(error));
console.log(`Framework check: ${errors.length} error(s)`);
if (errors.length) process.exitCode = 1;
