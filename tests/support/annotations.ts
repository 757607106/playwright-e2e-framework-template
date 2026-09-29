export const SCENARIO_ANNOTATION = 'scenario';
export const COVERAGE_ANNOTATION = 'coverage';

export type CoverageAnnotation = {
  type: string;
  description?: string;
};

export function scenarioKey(pageId: string, scenarioId: string) {
  return `${pageId}/${scenarioId}`;
}

/**
 * Bind a test to one or more stable coverage scenarios.
 *
 * Test titles remain human-readable and may change without breaking reporting.
 */
export function coverageScenario(
  ...scenarios: Array<readonly [pageId: string, scenarioId: string]>
) {
  return {
    annotation: scenarios.map(([pageId, scenarioId]) => ({
      type: SCENARIO_ANNOTATION,
      description: scenarioKey(pageId, scenarioId),
    })),
  };
}

/** Explicitly classify a useful supporting test that is not a coverage denominator. */
export function coverageSupport(reason: string) {
  return {
    annotation: {
      type: COVERAGE_ANNOTATION,
      description: `support:${reason}`,
    },
  };
}

/** Explicitly classify setup/diagnostic tests that are outside product coverage. */
export function coverageExclude(reason: string) {
  return {
    annotation: {
      type: COVERAGE_ANNOTATION,
      description: `exclude:${reason}`,
    },
  };
}

export function scenarioKeysFromAnnotations(
  annotations: readonly CoverageAnnotation[] = [],
) {
  return annotations
    .filter(
      (annotation) =>
        annotation.type === SCENARIO_ANNOTATION &&
        Boolean(annotation.description),
    )
    .map((annotation) => annotation.description!);
}

export function hasCoverageClassification(
  annotations: readonly CoverageAnnotation[] = [],
) {
  return annotations.some(
    (annotation) =>
      annotation.type === SCENARIO_ANNOTATION ||
      annotation.type === COVERAGE_ANNOTATION,
  );
}

export function isCoverageOnlyClassification(
  annotations: readonly CoverageAnnotation[] = [],
) {
  return annotations.some(
    (annotation) => annotation.type === COVERAGE_ANNOTATION,
  );
}
