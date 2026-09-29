import assert from 'node:assert/strict';
import test from 'node:test';
import type { PageCoverage } from '../coverage/page-coverage';
import { analyzeCoverage } from '../support/scenario-analysis';
import { COVERAGE_ANNOTATION, SCENARIO_ANNOTATION } from '../support/annotations';

const pages: PageCoverage[] = [{
  id: 'example', module: 'Example', name: 'Example', route: '/example',
  scenarios: [{ id: 'submit', name: 'Submit', operations: ['submit'], level: 'L1', requirementIds: [] }],
}];

test('stable annotations map a renamed test', () => {
  const result = analyzeCoverage(pages, [{
    id: 'one', title: 'A changed title', status: 'passed',
    annotations: [{ type: SCENARIO_ANNOTATION, description: 'example/submit' }],
  }]);
  assert.equal(result.scenarios[0].status, 'passed');
  assert.equal(result.unclassifiedTests.length, 0);
});

test('a failed test wins over a passing test in the same scenario', () => {
  const annotations = [{ type: SCENARIO_ANNOTATION, description: 'example/submit' }];
  const result = analyzeCoverage(pages, [
    { id: 'pass', title: 'Pass', status: 'passed', annotations },
    { id: 'fail', title: 'Fail', status: 'failed', annotations },
  ]);
  assert.equal(result.scenarios[0].status, 'failed');
});

test('support tests are classified without satisfying coverage', () => {
  const result = analyzeCoverage(pages, [{
    id: 'support', title: 'Fixture probe', status: 'passed',
    annotations: [{ type: COVERAGE_ANNOTATION, description: 'support:fixture' }],
  }]);
  assert.equal(result.scenarios[0].status, 'unmapped');
  assert.equal(result.unclassifiedTests.length, 0);
});
