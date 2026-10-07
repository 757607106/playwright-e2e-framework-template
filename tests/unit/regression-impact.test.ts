import assert from 'node:assert/strict';
import test from 'node:test';
import type { PageCoverage } from '../coverage/page-coverage';
import { selectRegressionScenarios } from '../support/regression-impact';

const pages: PageCoverage[] = [{
  id: 'example', module: 'Example', name: 'Example', route: '/example',
  scenarios: [{
    id: 'save', name: 'Save', operations: ['save'], level: 'L2',
    requirementIds: ['REQ-1'], apiRouteSymbols: ['API_ROUTES.example.save'],
  }],
}];

test('selects mapped changes without claiming a regression has run', () => {
  const result = selectRegressionScenarios(pages, {
    changedRequirementIds: ['REQ-1'], changedRuleRefs: [],
    changedApiOperations: [{ key: 'POST /example', routeSymbols: ['API_ROUTES.example.save'] }],
    requirementsComparisonAvailable: true, apiComparisonAvailable: true,
  });
  assert.deepEqual(result.selected[0].reasons, ['requirement:REQ-1', 'api:POST /example']);
  assert.equal(result.requiresBroadRegression, false);
});

test('unknown API changes require broader regression', () => {
  const result = selectRegressionScenarios(pages, {
    changedRequirementIds: [], changedRuleRefs: [],
    changedApiOperations: [{ key: 'DELETE /other', routeSymbols: ['API_ROUTES.other.delete'] }],
    requirementsComparisonAvailable: true, apiComparisonAvailable: true,
  });
  assert.equal(result.requiresBroadRegression, true);
  assert.equal(result.unmappedApiOperations.length, 1);
});

test('unknown rule changes require broader regression', () => {
  const result = selectRegressionScenarios([], {
    changedRequirementIds: [], changedRuleRefs: ['unmapped-rule'], changedApiOperations: [],
    requirementsComparisonAvailable: true, apiComparisonAvailable: true,
  });
  assert.equal(result.requiresBroadRegression, true);
  assert.deepEqual(result.unmappedRuleRefs, ['unmapped-rule']);
});
