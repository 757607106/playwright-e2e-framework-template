export function acquireReportLock(artifactsDir: string): () => void;
export function withReportLock<T>(artifactsDir: string, action: () => T): T;
