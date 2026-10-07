import { cleanupResources, registerResource, type CleanupResult, type Resource } from './resource-registry';

/** One tracker per test attempt; callbacks must delete only the supplied exact ID. */
export class ResourceTracker {
  private readonly callbacks = new Map<string, (resource: Resource) => Promise<void>>();
  constructor(readonly runId: string, readonly scopeId: string) {}
  track(input: Pick<Resource, 'kind' | 'id'>, cleanup: (resource: Resource) => Promise<void>): Resource {
    const key = JSON.stringify([input.kind, input.id]);
    if (this.callbacks.has(key)) throw new Error('Resource already registered in this test attempt');
    const resource = registerResource(input, { runId: this.runId, scopeId: this.scopeId });
    this.callbacks.set(key, cleanup);
    return resource;
  }
  cleanup(): Promise<CleanupResult[]> {
    return cleanupResources(this.runId, async resource => {
      const callback = this.callbacks.get(JSON.stringify([resource.kind, resource.id]));
      if (!callback) throw new Error('No exact-ID cleanup adapter registered');
      await callback(resource);
    }, this.scopeId);
  }
}
export function assertCleanupComplete(results: CleanupResult[]): void {
  const unresolved = results.filter(result => result.status === 'unresolved');
  if (unresolved.length) throw new Error(`${unresolved.length} resource(s) remain unresolved; see cleanup-summary attachment`);
}
