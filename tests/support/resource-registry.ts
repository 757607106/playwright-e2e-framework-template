import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { RUN_DATA_DIR } from './paths';

export type Resource = {
  runId: string;
  kind: string;
  id: string;
  createdAt: string;
};

export type CleanupResult = Resource & {
  status: 'cleaned' | 'unresolved';
  detail?: string;
};

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

export function readResources(runId: string, scopeId?: string): Resource[] {
  const file = registryPath(runId, scopeId);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => {
    const resource = JSON.parse(line) as Resource;
    if (resource.runId !== runId || !resource.id || !resource.kind) {
      throw new Error('Resource registry contains an invalid entry');
    }
    return resource;
  });
}

/** The application integration supplies exact-ID cleanup; failures remain visible. */
export async function cleanupResources(
  runId: string,
  cleanup: (resource: Resource) => Promise<void>,
  scopeId?: string,
): Promise<CleanupResult[]> {
  const results: CleanupResult[] = [];
  for (const resource of readResources(runId, scopeId).reverse()) {
    try {
      await cleanup(resource);
      results.push({ ...resource, status: 'cleaned' });
    } catch {
      results.push({
        ...resource,
        status: 'unresolved',
        detail: 'Cleanup callback failed; inspect exact resource and adapter locally',
      });
    }
  }
  const file = summaryPath(runId, scopeId);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ runId, results }, null, 2));
  return results;
}
