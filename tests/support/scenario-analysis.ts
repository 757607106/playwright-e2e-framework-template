import type {
  CoverageScenario,
  PageCoverage,
} from '../coverage/page-coverage';
import {
  hasCoverageClassification,
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
  status: 'passed' | 'failed' | 'not_run' | 'skipped' | 'unmapped';
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
  const statuses = matchedTests
    .map((test) => test.status)
    .filter((status): status is ExecutionStatus => Boolean(status));
  const missingEvidence = evidenceGroups
    .filter((group) => group.tests.length === 0)
    .map((group) => group.evidence);

  let status: ScenarioResult['status'] = 'unmapped';
  if (implemented) {
    // A failed supporting test must never be hidden by another passing test.
    if (statuses.some(isFailure)) {
      status = 'failed';
    } else if (annotatedTests.length > 0) {
      if (statuses.includes('passed')) status = 'passed';
      else if (statuses.length > 0) status = 'skipped';
      else status = 'not_run';
    } else {
      const groupStates = relevantGroups.map((group) => {
        const groupStatuses = group.tests
          .map((test) => test.status)
          .filter((value): value is ExecutionStatus => Boolean(value));
        return {
          passed: groupStatuses.includes('passed'),
          skipped:
            groupStatuses.length > 0 &&
            groupStatuses.every((value) => value === 'skipped'),
          executed: groupStatuses.length > 0,
        };
      });
      if (groupStates.every((group) => group.passed)) status = 'passed';
      else if (groupStates.every((group) => group.skipped)) status = 'skipped';
      else if (groupStates.some((group) => group.executed)) status = 'skipped';
      else status = 'not_run';
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
  const scenarios = pages.flatMap((page) =>
    page.scenarios.map((current) => scenarioResult(page, current, tests)),
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
  };
}
