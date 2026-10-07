import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const ignored = new Set(['.git', 'node_modules', 'artifacts', 'dist', '.idea', '.vscode']);
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const file = join(dir, name);
    const stat = lstatSync(file);
    if (stat.isSymbolicLink() || ignored.has(name)) return [];
    return stat.isDirectory() ? walk(file) : [relative(root, file).replaceAll('\\', '/')];
  });
}
let paths: string[];
try {
  // A ZIP inside another Git checkout must still be treated as a standalone tree.
  const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  if (gitRoot.replaceAll('\\', '/') !== root.replaceAll('\\', '/')) throw new Error('Not repository root');
  paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).toString().split('\0').filter(Boolean);
} catch { paths = walk(root); }
const blockedPaths = [/^\.env(?:\.|$)/, /(?:^|\/)(?:\.auth|playwright\/\.auth)\//, /\.(?:pem|key)$/i];
const blockedText = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:ghp_|github_pat_|sk-)[A-Za-z0-9_-]{20,}/,
  /(?:password|api[_-]?key|access[_-]?token)\s*[:=]\s*['"][^'"\s]{12,}['"]/i,
];
const errors: string[] = [];
for (const file of paths) {
  if (!existsSync(file) || !lstatSync(file).isFile()) continue;
  if (file !== '.env.example' && blockedPaths.some(pattern => pattern.test(file))) errors.push(`Sensitive file: ${file}`);
  // Reports are ignored in archive scans; tracked reports must also fail a release gate.
  if (file.startsWith('artifacts/')) errors.push(`Generated report tracked: ${file}`);
  if (file === 'scripts/public-safety-check.ts') continue;
  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue;
  if (blockedText.some(pattern => pattern.test(bytes.toString('utf8')))) errors.push(`Possible secret in ${file}`);
}
for (const error of errors) console.error(error);
console.log(`Public safety check: ${paths.length} files, ${errors.length} finding(s)`);
if (errors.length) process.exitCode = 1;
