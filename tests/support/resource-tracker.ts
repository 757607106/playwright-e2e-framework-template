import { cleanupResources, registerResource, type CleanupCallback, type CleanupOptions, type CleanupResult, type Resource } from './resource-registry';

/** One tracker per test attempt; callbacks must delete only the supplied exact ID. */
export class ResourceTracker {
  private readonly callbacks = new Map<string, CleanupCallback>();
  constructor(readonly runId: string, readonly scopeId: string) {}
  track(input: Pick<Resource, 'kind' | 'id'>, cleanup: CleanupCallback): Resource {
    const key = JSON.stringify([input.kind, input.id]);
    if (this.callbacks.has(key)) throw new Error('Resource already registered in this test attempt');
    const resource = registerResource(input, { runId: this.runId, scopeId: this.scopeId });
    this.callbacks.set(key, cleanup);
    return resource;
  }
  cleanup(options?: CleanupOptions): Promise<CleanupResult[]> {
    return cleanupResources(this.runId, async (resource, signal) => {
      const callback = this.callbacks.get(JSON.stringify([resource.kind, resource.id]));
      if (!callback) throw new Error('No exact-ID cleanup adapter registered');
      await callback(resource, signal);
    }, this.scopeId, options);
  }
}
export function assertCleanupComplete(results: CleanupResult[]): void {
  const unresolved = results.filter(result => result.status === 'unresolved');
  if (unresolved.length) throw new Error(`${unresolved.length} cleanup issue(s) remain unresolved; see cleanup-summary attachment`);
}
