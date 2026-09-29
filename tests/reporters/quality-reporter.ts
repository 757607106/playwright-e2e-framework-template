import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase } from '@playwright/test/reporter';
import { PAGE_COVERAGE } from '../coverage/page-coverage';
import { QUALITY_REPORT_DIR } from '../support/paths';
import { analyzeCoverage, type CoverageTest, type ExecutionStatus } from '../support/scenario-analysis';
import { resolveReportEnvironment } from '../support/report-naming';

type TestRecord = CoverageTest & { project: string; file: string };

function record(test: TestCase): TestRecord {
  const result = test.results.at(-1);
  const status = result?.status as ExecutionStatus | undefined;
  return {
    id: test.id,
    title: test.title,
    project: test.parent.project()?.name || '',
    file: test.location.file,
    status,
    annotations: test.annotations,
  };
}

export default class QualityReporter implements Reporter {
  private tests: TestCase[] = [];
  private startedAt = '';

  onBegin(_config: FullConfig, suite: Suite): void {
    this.startedAt = new Date().toISOString();
    this.tests = suite.allTests();
  }

  onEnd(result: FullResult): void {
    const tests = this.tests.map(record);
    const coverage = analyzeCoverage(PAGE_COVERAGE, tests);
    const counts = {
      found: tests.length,
      passed: tests.filter((test) => test.status === 'passed').length,
      failed: tests.filter((test) => ['failed', 'timedOut', 'interrupted'].includes(test.status || '')).length,
      skipped: tests.filter((test) => test.status === 'skipped').length,
      notRun: tests.filter((test) => test.status === undefined).length,
    };
    const report = {
      runId: process.env.E2E_RUN_ID || '',
      startedAt: this.startedAt,
      generatedAt: new Date().toISOString(),
      environment: resolveReportEnvironment(),
      result: result.status,
      counts,
      scenarios: coverage.scenarios,
      unclassifiedTests: coverage.unclassifiedTests.map((test) => test.title),
      invalidScenarioAnnotations: coverage.invalidScenarioAnnotations,
      tests,
    };
    mkdirSync(QUALITY_REPORT_DIR, { recursive: true });
    writeFileSync(join(QUALITY_REPORT_DIR, 'quality-report.json'), JSON.stringify(report, null, 2));
    const lines = [
      '# E2E quality report',
      '',
      `Run: ${report.runId || 'unknown'}`,
      `Result: ${report.result}`,
      `Discovered: ${counts.found}; passed: ${counts.passed}; failed: ${counts.failed}; skipped: ${counts.skipped}; not run: ${counts.notRun}`,
      '',
      '## Scenarios',
      '',
      ...coverage.scenarios.map((scenario) => `- ${scenario.pageId}/${scenario.scenarioId}: ${scenario.status}`),
      '',
    ];
    writeFileSync(join(QUALITY_REPORT_DIR, 'quality-report.md'), lines.join('\n'));
  }
}
