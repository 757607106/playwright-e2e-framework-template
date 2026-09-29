export type ReportMetadata = {
  runId?: string;
  startedAt?: string;
  generatedAt?: string;
  baseUrl?: string;
  environment?: string;
};

export function safeReportSegment(value: string | undefined, fallback: string): string {
  const normalized = value?.trim().replace(/[^A-Za-z0-9._-]/g, '_');
  return normalized || fallback;
}

export function resolveReportEnvironment(
  baseUrl = process.env.BASE_URL,
  configuredEnvironment = process.env.REPORT_ENV,
): string {
  if (configuredEnvironment?.trim()) {
    return safeReportSegment(configuredEnvironment, 'local');
  }

  if (baseUrl?.trim()) {
    try {
      return safeReportSegment(new URL(baseUrl).hostname, 'local');
    } catch {
      return safeReportSegment(baseUrl, 'local');
    }
  }

  return 'local';
}

export function formatReportTimestamp(value?: string | number | Date): string {
  const date = value === undefined ? new Date() : new Date(value);
  const validDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const iso = validDate.toISOString();
  return `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}`;
}

export function buildReportArchiveName(metadata: ReportMetadata = {}): string {
  const timestamp = formatReportTimestamp(metadata.startedAt ?? metadata.generatedAt);
  const environment = safeReportSegment(
    metadata.environment ?? resolveReportEnvironment(metadata.baseUrl, undefined),
    'local',
  );
  const runId = safeReportSegment(metadata.runId, 'unknown-run');
  return `${timestamp}_${environment}_${runId}`;
}
