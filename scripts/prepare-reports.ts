import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'fs';
import { join, resolve } from 'path';
import {
  ALLURE_HISTORY_DIR,
  ALLURE_REPORT_DIR,
  ARTIFACTS_DIR,
  REPORT_HISTORY_DIR,
} from '../tests/support/paths';
import {
  buildReportArchiveName,
  type ReportMetadata,
} from '../tests/support/report-naming';

export const ACTIVE_REPORT_DIRECTORIES = [
  'allure-results',
  'allure-report',
  'test-results',
  'playwright-report',
  'quality-report',
] as const;

type ArchiveOptions = {
  artifactsDir: string;
  historyDir: string;
  directories?: readonly string[];
  historyLimit?: number;
};

function previousReportMetadata(artifactsDir: string): ReportMetadata {
  const qualityJson = join(artifactsDir, 'quality-report', 'quality-report.json');
  if (existsSync(qualityJson)) {
    try {
      return JSON.parse(readFileSync(qualityJson, 'utf8')) as ReportMetadata;
    } catch {
      // 损坏的旧报告也必须被保留，使用当前时间和默认环境命名即可。
    }
  }
  return {};
}

function uniqueDestination(historyDir: string, preferredName: string) {
  let destination = join(historyDir, preferredName);
  let suffix = 2;
  while (existsSync(destination)) {
    destination = join(historyDir, `${preferredName}-${suffix}`);
    suffix += 1;
  }
  return destination;
}

function moveDirectory(source: string, destination: string) {
  try {
    renameSync(source, destination);
  } catch {
    cpSync(source, destination, { recursive: true });
    rmSync(source, { recursive: true, force: true });
  }
}

function pruneHistory(historyDir: string, historyLimit: number) {
  if (historyLimit <= 0 || !existsSync(historyDir)) return [];
  const entries = readdirSync(historyDir)
    .map((name) => ({ name, path: join(historyDir, name) }))
    .filter((entry) => statSync(entry.path).isDirectory())
    .sort((a, b) => statSync(b.path).mtimeMs - statSync(a.path).mtimeMs);
  const removed = entries.slice(historyLimit);
  for (const entry of removed) {
    rmSync(entry.path, { recursive: true, force: true });
  }
  return removed.map((entry) => entry.name);
}

export function archiveReports(options: ArchiveOptions) {
  const directories = options.directories ?? ACTIVE_REPORT_DIRECTORIES;
  const existing = directories.filter((name) =>
    existsSync(join(options.artifactsDir, name)),
  );
  if (existing.length === 0) {
    return { destination: null, archived: [], pruned: [] };
  }

  mkdirSync(options.historyDir, { recursive: true });
  const destination = uniqueDestination(
    options.historyDir,
    buildReportArchiveName(previousReportMetadata(options.artifactsDir)),
  );
  mkdirSync(destination, { recursive: true });
  for (const name of existing) {
    moveDirectory(join(options.artifactsDir, name), join(destination, name));
  }

  return {
    destination,
    archived: existing,
    pruned: pruneHistory(options.historyDir, options.historyLimit ?? 20),
  };
}

function preserveAllureHistory() {
  const source = join(ALLURE_REPORT_DIR, 'history');
  if (!existsSync(source)) return;
  mkdirSync(ALLURE_HISTORY_DIR, { recursive: true });
  cpSync(source, ALLURE_HISTORY_DIR, { recursive: true, force: true });
}

if (require.main === module) {
  preserveAllureHistory();
  const configuredLimit = Number(process.env.REPORT_HISTORY_LIMIT ?? '20');
  const historyLimit = Number.isFinite(configuredLimit)
    ? Math.max(0, Math.floor(configuredLimit))
    : 20;
  const result = archiveReports({
    artifactsDir: ARTIFACTS_DIR,
    historyDir: REPORT_HISTORY_DIR,
    historyLimit,
  });
  if (!result.destination) {
    console.log('[Reports] 没有上一轮报告需要归档。');
  } else {
    console.log(
      `[Reports] 已归档 ${result.archived.length} 个报告目录到 ${resolve(result.destination)}`,
    );
    if (result.pruned.length > 0) {
      console.log(
        `[Reports] 按 REPORT_HISTORY_LIMIT=${historyLimit} 移除旧归档: ${result.pruned.join(', ')}`,
      );
    }
  }
}
