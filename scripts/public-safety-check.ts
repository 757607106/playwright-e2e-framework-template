import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
  .toString('utf8').split('\0').filter(Boolean);
const blockedPaths = [
  /^\.env(?:\.|$)/,
  /^artifacts\//,
  /^docs\/(?:api|product)\//,
  /^specs\//,
  /^tests\/(?:setup|web)\//,
  /^tests\/support\/data\//,
];
const blockedText = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:ghp_|github_pat_|sk-)[A-Za-z0-9_-]{20,}/,
  /(?:password|api[_-]?key|access[_-]?token)\s*[:=]\s*['"][^'"\s]{12,}['"]/i,
];
const errors: string[] = [];
for (const file of paths) {
  if (file === '.env.example') continue;
  if (blockedPaths.some((pattern) => pattern.test(file))) {
    errors.push(`Internal path: ${file}`);
    continue;
  }
  if (file === 'scripts/public-safety-check.ts') continue;
  if (/\.(?:png|jpg|jpeg|webm|zip|pdf|xlsx)$/i.test(file)) continue;
  const source = readFileSync(file, 'utf8');
  for (const pattern of blockedText) {
    if (pattern.test(source)) errors.push(`Internal text in ${file}: ${pattern.source}`);
  }
}
for (const error of errors) console.error(error);
console.log(`Public safety check: ${paths.length} files, ${errors.length} finding(s)`);
if (errors.length) process.exitCode = 1;
