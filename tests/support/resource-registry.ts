import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { RUN_DATA_DIR } from './paths';

export type Resource = {
  runId: string;
  kind: string;
  id: string;
  createdAt: string;
};

type ResourceCleanupResult = Resource & {
  status: 'cleaned' | 'unresolved';
  detail?: string;
};
type LedgerIssue = {
  runId: string;
  kind: 'ledger';
  id?: never;
  createdAt?: never;
  status: 'unresolved';
  line: number;
  detail: string;
};
export type CleanupResult = ResourceCleanupResult | LedgerIssue;
export type CleanupOptions = { timeoutMs?: number; totalTimeoutMs?: number };
export type CleanupCallback = (resource: Resource, signal: AbortSignal) => Promise<void>;

function safeRunId(runId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId)) throw new Error('Invalid run ID');
  return runId;
}

export function registryPath(runId: string, scopeId?: string): string {
  return resolve(RUN_DATA_DIR, safeRunId(runId), ...(scopeId ? [safeRunId(scopeId)] : []), 'resources.jsonl');
}

export function summaryPath(runId: string, scopeId?: string): string {
  return resolve(RUN_DATA_DIR, safeRunId(runId), ...(scopeId ? [safeRunId(scopeId)] : []), 'cleanup-summary.json');
}

/** Record only resources created in the current run; never store credentials. */
export function registerResource(input: Pick<Resource, 'kind' | 'id'>, options: { runId?: string; scopeId?: string } = {}): Resource {
  const runId = options.runId || process.env.E2E_RUN_ID;
  if (!runId) throw new Error('E2E_RUN_ID is required to register a resource');
  if (!input.kind.trim() || !input.id.trim()) throw new Error('Resource kind and ID are required');
  const resource = { ...input, runId, createdAt: new Date().toISOString() };
  const file = registryPath(runId, options.scopeId);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(resource)}\n`, 'utf8');
  return resource;
}

function readLedger(runId: string, scopeId?: string): { resources: Resource[]; issues: LedgerIssue[] } {
  const file = registryPath(runId, scopeId);
  const resources: Resource[] = [];
  const issues: LedgerIssue[] = [];
  if (!existsSync(file)) return { resources, issues };
  for (const [index, line] of readFileSync(file, 'utf8').split('\n').entries()) {
    if (!line.trim()) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (!value || typeof value !== 'object' || !('runId' in value) || value.runId !== runId
        || !('id' in value) || typeof value.id !== 'string' || !value.id.trim()
        || !('kind' in value) || typeof value.kind !== 'string' || !value.kind.trim()
        || !('createdAt' in value) || typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt))) {
        throw new Error('Invalid resource record');
      }
      resources.push({ runId, id: value.id, kind: value.kind, createdAt: value.createdAt });
    } catch {
      // Never infer IDs from a broken record or copy its potentially sensitive content.
      issues.push({ runId, kind: 'ledger', status: 'unresolved', line: index + 1, detail: 'Invalid ledger entry; inspect this line locally' });
    }
  }
  return { resources, issues };
}

/** Strict reads remain appropriate for callers that cannot recover invalid entries. */
export function readResources(runId: string, scopeId?: string): Resource[] {
  const { resources, issues } = readLedger(runId, scopeId);
  if (issues.length) throw new Error(`Resource registry contains ${issues.length} invalid entry(s)`);
  return resources;
}

function positiveTimeout(value: number | undefined, fallback: number): number {
  const timeout = value ?? fallback;
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 2_147_483_647) throw new Error('Cleanup timeout must be a positive timer duration');
  return timeout;
}

class CleanupTimeoutError extends Error {}

async function boundedCleanup(cleanup: CleanupCallback, resource: Resource, timeoutMs: number): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(() => cleanup(resource, controller.signal)),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new CleanupTimeoutError('Cleanup timed out'));
        }, timeoutMs);
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

/** The application integration supplies exact-ID cleanup; failures remain visible. */
export async function cleanupResources(
  runId: string,
  cleanup: CleanupCallback,
  scopeId?: string,
  options: CleanupOptions = {},
): Promise<CleanupResult[]> {
  const timeoutMs = positiveTimeout(options.timeoutMs, 5_000);
  const totalTimeoutMs = positiveTimeout(options.totalTimeoutMs, 20_000);
  const { resources, issues } = readLedger(runId, scopeId);
  const results: CleanupResult[] = [...issues];
  const file = summaryPath(runId, scopeId);
  mkdirSync(dirname(file), { recursive: true });
  const save = () => {
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify({ runId, results, pending: resources.length - (results.length - issues.length) }, null, 2));
    renameSync(temporary, file);
  };
  save();
  const deadline = Date.now() + totalTimeoutMs;
  let exhausted = false;
  for (const resource of resources.reverse()) {
    const remaining = deadline - Date.now();
    if (exhausted || remaining <= 0) {
      results.push({ ...resource, status: 'unresolved', detail: 'Cleanup budget exhausted before this resource was attempted' });
      save();
      continue;
    }
    try {
      await boundedCleanup(cleanup, resource, Math.min(timeoutMs, remaining));
      results.push({ ...resource, status: 'cleaned' });
    } catch (error) {
      if (error instanceof CleanupTimeoutError && remaining <= timeoutMs) exhausted = true;
      results.push({
        ...resource,
        status: 'unresolved',
        detail: error instanceof CleanupTimeoutError ? 'Cleanup callback timed out' : 'Cleanup callback failed; inspect exact resource and adapter locally',
      });
    }
    save();
  }
  return results;
}
