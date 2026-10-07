import type {
  CoverageScenario,
  PageCoverage,
} from '../coverage/page-coverage';
import {
  hasCoverageClassification,
  coverageAnnotationErrors,
  isCoverageId,
  isCoverageOnlyClassification,
  scenarioKey,
  scenarioKeysFromAnnotations,
  type CoverageAnnotation,
} from './annotations';

export type ExecutionStatus =
  | 'passed'
  | 'failed'
  | 'timedOut'
  | 'skipped'
  | 'interrupted';

export type CoverageTest = {
  id: string;
  title: string;
  status?: ExecutionStatus;
  outcome?: 'expected' | 'unexpected' | 'flaky' | 'skipped';
  annotations?: CoverageAnnotation[];
};

export type ScenarioResult = {
  pageId: string;
  pageName: string;
  route: string;
  scenarioId: string;
  scenarioName: string;
  operations: string[];
  boundary?: string;
  level: CoverageScenario['level'];
  requirementIds: string[];
  implemented: boolean;
  status: 'passed' | 'failed' | 'flaky' | 'partial' | 'not_run' | 'skipped' | 'unmapped';
  matchedTests: string[];
  matchedTestIds: string[];
  missingEvidence: string[];
};

function leafTitle(title: string) {
  return title.split('›').pop()?.trim() ?? title.trim();
}

/**
 * Legacy evidence is intentionally exact. The old `includes` matching allowed
 * unrelated or duplicated titles to satisfy a scenario accidentally.
 */
export function titleMatchesEvidence(title: string, evidence: string) {
  const leaf = leafTitle(title);
  if (leaf === evidence) return true;

  // Data-driven titles can include a module prefix before the scenario title.
  const withoutModulePrefix = leaf.replace(/^[^：:]+\s*>\s*/, '');
  return withoutModulePrefix === evidence;
}

function isFailure(status: ExecutionStatus | undefined) {
  return ['failed', 'timedOut', 'interrupted'].includes(status ?? '');
}

function failedExecution(test: CoverageTest): boolean {
  return isFailure(test.status) || test.outcome === 'unexpected';
}

function executionStatus(tests: CoverageTest[]): ScenarioResult['status'] {
  if (tests.some(failedExecution)) return 'failed';
  if (tests.every(test => test.status === undefined)) return 'not_run';
  if (tests.every(test => test.status === 'skipped')) return 'skipped';
  if (!tests.every(test => test.status === 'passed')) return 'partial';
  return tests.some(test => test.outcome === 'flaky') ? 'flaky' : 'passed';
}

/** Reject ambiguous IDs before calculating a coverage denominator. */
export function assertCoverageDefinitions(pages: PageCoverage[]): void {
  const pageIds = new Set<string>();
  for (const page of pages) {
    if (!isCoverageId(page.id)) throw new Error('Invalid coverage page ID');
    if (pageIds.has(page.id)) throw new Error(`Duplicate coverage page ID: ${page.id}`);
    pageIds.add(page.id);
    const scenarioIds = new Set<string>();
    for (const scenario of page.scenarios) {
      const key = scenarioKey(page.id, scenario.id);
      if (scenarioIds.has(scenario.id)) throw new Error(`Duplicate coverage scenario ID: ${key}`);
      scenarioIds.add(scenario.id);
    }
  }
}

function scenarioResult(
  page: PageCoverage,
  current: CoverageScenario,
  tests: CoverageTest[],
): ScenarioResult {
  const key = scenarioKey(page.id, current.id);
  const annotatedTests = tests.filter((test) =>
    scenarioKeysFromAnnotations(test.annotations).includes(key),
  );
  const evidenceList = current.evidence ?? [];
  const evidenceGroups = evidenceList.map((evidence) => ({
    evidence,
    tests: tests.filter(
      (test) =>
        !isCoverageOnlyClassification(test.annotations) &&
        titleMatchesEvidence(test.title, evidence),
    ),
  }));
  const evidenceMode = current.evidenceMode ?? 'all';
  const legacyImplemented =
    evidenceList.length > 0 &&
    (evidenceMode === 'any'
      ? evidenceGroups.some((group) => group.tests.length > 0)
      : evidenceGroups.every((group) => group.tests.length > 0));
  const implemented = annotatedTests.length > 0 || legacyImplemented;
  const relevantGroups =
    evidenceMode === 'any'
      ? evidenceGroups.filter((group) => group.tests.length > 0)
      : evidenceGroups;
  const matched = [
    ...annotatedTests,
    ...relevantGroups.flatMap((group) => group.tests),
  ];
  const matchedById = new Map(matched.map((test) => [test.id, test]));
  const matchedTests = [...matchedById.values()];
  const missingEvidence = evidenceGroups
    .filter((group) => group.tests.length === 0)
    .map((group) => group.evidence);

  let status: ScenarioResult['status'] = 'unmapped';
  if (implemented) {
    // A failed supporting test must never be hidden by another passing test.
    if (matchedTests.some(failedExecution)) {
      status = 'failed';
    } else if (annotatedTests.length > 0) {
      status = executionStatus(matchedTests);
    } else {
      const groupStates = relevantGroups.map(group => executionStatus(group.tests));
      if (evidenceMode === 'any' && groupStates.includes('passed')) status = 'passed';
      else if (evidenceMode === 'any' && groupStates.includes('flaky')) status = 'flaky';
      else status = executionStatus(matchedTests);
    }
  }

  return {
    pageId: page.id,
    pageName: page.name,
    route: page.route,
    scenarioId: current.id,
    scenarioName: current.name,
    operations: current.operations,
    ...(current.boundary ? { boundary: current.boundary } : {}),
    level: current.level,
    requirementIds: current.requirementIds,
    implemented,
    status,
    matchedTests: matchedTests.map((test) => test.title),
    matchedTestIds: matchedTests.map((test) => test.id),
    missingEvidence,
  };
}

export function analyzeCoverage<T extends CoverageTest>(
  pages: PageCoverage[],
  tests: T[],
) {
  assertCoverageDefinitions(pages);
  const invalidCoverageAnnotations = tests.flatMap(test => coverageAnnotationErrors(test.annotations)
    .map(({ annotation, reason }) => ({ testId: test.id, title: test.title, ...annotation, reason })));
  const validTests = tests.filter(test => coverageAnnotationErrors(test.annotations).length === 0);
  const scenarios = pages.flatMap((page) =>
    page.scenarios.map((current) => scenarioResult(page, current, validTests)),
  );
  const validScenarioKeys = new Set(
    pages.flatMap((page) =>
      page.scenarios.map((current) => scenarioKey(page.id, current.id)),
    ),
  );
  const mappedTestIds = new Set(
    scenarios.flatMap((current) => current.matchedTestIds),
  );
  const invalidScenarioAnnotations = tests.flatMap((test) =>
    scenarioKeysFromAnnotations(test.annotations)
      .filter((key) => !validScenarioKeys.has(key))
      .map((key) => ({ testId: test.id, title: test.title, scenarioKey: key })),
  );
  const unclassifiedTests = tests.filter(
    (test) =>
      !mappedTestIds.has(test.id) &&
      !hasCoverageClassification(test.annotations),
  );

  return {
    scenarios,
    unclassifiedTests,
    invalidScenarioAnnotations,
    invalidCoverageAnnotations,
  };
}
