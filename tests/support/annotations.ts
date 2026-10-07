export const SCENARIO_ANNOTATION = 'scenario';
export const COVERAGE_ANNOTATION = 'coverage';

export type CoverageAnnotation = {
  type: string;
  description?: string;
};

export function isCoverageId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

export function scenarioKey(pageId: string, scenarioId: string) {
  if (!isCoverageId(pageId) || !isCoverageId(scenarioId)) throw new Error('Invalid page/scenario ID');
  return `${pageId}/${scenarioId}`;
}

export function coverageAnnotationErrors(annotations: readonly CoverageAnnotation[] = []) {
  const relevant = annotations.filter(annotation => [SCENARIO_ANNOTATION, COVERAGE_ANNOTATION].includes(annotation.type));
  const errors = relevant.flatMap(annotation => {
    const description = annotation.description ?? '';
    const valid = annotation.type === SCENARIO_ANNOTATION
      ? description.split('/').length === 2 && description.split('/').every(isCoverageId)
      : /^(support|exclude):\S[\s\S]*$/.test(description);
    return valid ? [] : [{ annotation, reason: 'Invalid coverage classification or missing reason' }];
  });
  if (relevant.some(annotation => annotation.type === SCENARIO_ANNOTATION)
    && relevant.some(annotation => annotation.type === COVERAGE_ANNOTATION)) {
    errors.push({ annotation: relevant[0], reason: 'Scenario and support/exclude classifications cannot be combined' });
  }
  return errors;
}

/**
 * Bind a test to one or more stable coverage scenarios.
 *
 * Test titles remain human-readable and may change without breaking reporting.
 */
export function coverageScenario(
  ...scenarios: Array<readonly [pageId: string, scenarioId: string]>
) {
  if (!scenarios.length) throw new Error('At least one coverage scenario is required');
  return {
    annotation: scenarios.map(([pageId, scenarioId]) => ({
      type: SCENARIO_ANNOTATION,
      description: scenarioKey(pageId, scenarioId),
    })),
  };
}

/** Explicitly classify a useful supporting test that is not a coverage denominator. */
export function coverageSupport(reason: string) {
  if (!reason.trim()) throw new Error('Coverage support reason is required');
  return {
    annotation: {
      type: COVERAGE_ANNOTATION,
      description: `support:${reason.trim()}`,
    },
  };
}

/** Explicitly classify setup/diagnostic tests that are outside product coverage. */
export function coverageExclude(reason: string) {
  if (!reason.trim()) throw new Error('Coverage exclusion reason is required');
  return {
    annotation: {
      type: COVERAGE_ANNOTATION,
      description: `exclude:${reason.trim()}`,
    },
  };
}

export function scenarioKeysFromAnnotations(
  annotations: readonly CoverageAnnotation[] = [],
) {
  if (coverageAnnotationErrors(annotations).length) return [];
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
  return coverageAnnotationErrors(annotations).length === 0 && annotations.some(
    (annotation) =>
      annotation.type === SCENARIO_ANNOTATION ||
      annotation.type === COVERAGE_ANNOTATION,
  );
}

export function isCoverageOnlyClassification(
  annotations: readonly CoverageAnnotation[] = [],
) {
  return hasCoverageClassification(annotations) && annotations.some(
    (annotation) => annotation.type === COVERAGE_ANNOTATION,
  );
}
