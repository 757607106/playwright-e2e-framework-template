import type { PageCoverage } from '../coverage/page-coverage';

export type ApiChange = {
  key: string;
  routeSymbols: string[];
};

export type ImpactInput = {
  changedRequirementIds: string[];
  changedRuleRefs: string[];
  changedApiOperations: ApiChange[];
  requirementsComparisonAvailable: boolean;
  apiComparisonAvailable: boolean;
};

/** Recommend scenarios conservatively; missing mappings require broader regression. */
export function selectRegressionScenarios(pages: PageCoverage[], input: ImpactInput) {
  const selected = pages.flatMap((page) => page.scenarios.flatMap((scenario) => {
    const requirements = scenario.requirementIds.filter((id) => input.changedRequirementIds.includes(id));
    const rules = (scenario.ruleRefs || []).filter((id) => input.changedRuleRefs.includes(id));
    const operations = input.changedApiOperations.filter((change) =>
      change.routeSymbols.some((symbol) => scenario.apiRouteSymbols?.includes(symbol)),
    );
    const fixedCore = scenario.level === 'L3' || scenario.level === 'L4';
    if (!requirements.length && !rules.length && !operations.length && !fixedCore) return [];
    return [{
      pageId: page.id,
      scenarioId: scenario.id,
      level: scenario.level,
      reasons: [
        ...requirements.map((id) => `requirement:${id}`),
        ...rules.map((id) => `rule:${id}`),
        ...operations.map((change) => `api:${change.key}`),
        ...(fixedCore ? ['fixed-core'] : []),
      ],
    }];
  }));
  const mappedRequirements = new Set(pages.flatMap((page) =>
    page.scenarios.flatMap((scenario) => scenario.requirementIds),
  ));
  const unmappedRequirementIds = input.changedRequirementIds.filter((id) => !mappedRequirements.has(id));
  const selectedApiKeys = new Set(selected.flatMap((scenario) => scenario.reasons
    .filter((reason) => reason.startsWith('api:')).map((reason) => reason.slice(4))));
  const unmappedApiOperations = input.changedApiOperations.filter((change) => !selectedApiKeys.has(change.key));
  const mappedRules = new Set(pages.flatMap(page => page.scenarios.flatMap(scenario => scenario.ruleRefs || [])));
  const unmappedRuleRefs = input.changedRuleRefs.filter(rule => !mappedRules.has(rule));
  const comparisonComplete = input.requirementsComparisonAvailable && input.apiComparisonAvailable;
  return {
    selected,
    unmappedRequirementIds,
    unmappedRuleRefs,
    unmappedApiOperations,
    requiresBroadRegression: !comparisonComplete || Boolean(unmappedRequirementIds.length || unmappedRuleRefs.length || unmappedApiOperations.length),
  };
}
