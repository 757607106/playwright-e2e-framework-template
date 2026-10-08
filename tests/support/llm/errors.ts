/** Public diagnostics never retain SDK causes, response bodies or authentication headers. */
export class ModelError extends Error {
  constructor(
    readonly code: 'CONFIG' | 'VALIDATION' | 'PROVIDER' | 'TIMEOUT',
    readonly detail: string,
    readonly totalTokens?: number,
  ) {
    super(`[Model/${code}] ${detail}`);
    this.name = 'ModelError';
  }
}
