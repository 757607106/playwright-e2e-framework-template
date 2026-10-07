import assert from 'node:assert/strict';
import test from 'node:test';
import type { PageCoverage } from '../coverage/page-coverage';
import { analyzeCoverage } from '../support/scenario-analysis';
import { COVERAGE_ANNOTATION, SCENARIO_ANNOTATION, coverageScenario, coverageSupport, coverageExclude } from '../support/annotations';

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

test('a passed branch does not hide skipped or unexecuted branches', () => {
  const annotations = [{ type: SCENARIO_ANNOTATION, description: 'example/submit' }];
  for (const status of ['skipped', undefined] as const) {
    const result = analyzeCoverage(pages, [
      { id: 'pass', title: 'Primary', status: 'passed', annotations },
      { id: 'other', title: 'Other branch', status, annotations },
    ]);
    assert.equal(result.scenarios[0].status, 'partial');
  }
});

test('all bound tests must pass; unexecuted and skipped scenarios stay distinct', () => {
  const annotations = [{ type: SCENARIO_ANNOTATION, description: 'example/submit' }];
  for (const [status, expected] of [['passed', 'passed'], ['skipped', 'skipped'], [undefined, 'not_run']] as const) {
    assert.equal(analyzeCoverage(pages, [
      { id: 'one', title: 'One', status, annotations }, { id: 'two', title: 'Two', status, annotations },
    ]).scenarios[0].status, expected);
  }
});

test('malformed and conflicting classifications cannot satisfy coverage', () => {
  for (const annotations of [
    [{ type: SCENARIO_ANNOTATION }],
    [{ type: SCENARIO_ANNOTATION, description: 'example/ ' }],
    [{ type: COVERAGE_ANNOTATION, description: 'mistyped' }],
    [{ type: COVERAGE_ANNOTATION, description: 'support:   ' }],
    [{ type: SCENARIO_ANNOTATION, description: 'example/submit' }, { type: COVERAGE_ANNOTATION, description: 'support:probe' }],
  ]) {
    const result = analyzeCoverage(pages, [{ id: 'one', title: 'Business', status: 'passed', annotations }]);
    assert.equal(result.scenarios[0].status, 'unmapped');
    assert.equal(result.unclassifiedTests.length, 1);
    assert.ok(result.invalidCoverageAnnotations.length);
  }
  assert.throws(() => coverageScenario(), /At least one/);
  assert.throws(() => coverageScenario(['example', 'bad/id']), /Invalid/);
  assert.throws(() => coverageSupport(' '), /reason/);
  assert.throws(() => coverageExclude(' '), /reason/);
});

test('duplicate IDs cannot inflate the coverage denominator', () => {
  assert.throws(() => analyzeCoverage([pages[0], pages[0]], []), /Duplicate coverage page ID/);
  assert.throws(() => analyzeCoverage([{ ...pages[0], scenarios: [pages[0].scenarios[0], pages[0].scenarios[0]] }], []), /Duplicate coverage scenario ID/);
});

test('legacy all/any evidence modes respect execution completeness', () => {
  const tests = [{ id: 'one', title: 'Primary', status: 'passed' as const }, { id: 'two', title: 'Secondary', status: 'skipped' as const }];
  const scenario = { ...pages[0].scenarios[0], evidence: ['Primary', 'Secondary'] };
  assert.equal(analyzeCoverage([{ ...pages[0], scenarios: [scenario] }], tests).scenarios[0].status, 'partial');
  assert.equal(analyzeCoverage([{ ...pages[0], scenarios: [{ ...scenario, evidenceMode: 'any' }] }], tests).scenarios[0].status, 'passed');
});

test('retry recovery is reported as flaky scenario coverage', () => {
  assert.equal(analyzeCoverage(pages, [{ id: 'one', title: 'Recovered', status: 'passed', outcome: 'flaky',
    annotations: [{ type: SCENARIO_ANNOTATION, description: 'example/submit' }],
  }]).scenarios[0].status, 'flaky');
});
