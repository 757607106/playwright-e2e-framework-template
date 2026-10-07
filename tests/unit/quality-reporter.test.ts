import assert from 'node:assert/strict';
import test from 'node:test';
import { executionCounts, executionSummary } from '../reporters/quality-reporter';

test('retry history remains visible and recovery is counted separately from stable passes', () => {
  const recovered = executionSummary([
    { retry: 0, status: 'failed', duration: 10 }, { retry: 1, status: 'passed', duration: 15 },
  ], 'flaky');
  assert.equal(recovered.status, 'passed');
  assert.equal(recovered.outcome, 'flaky');
  assert.equal(recovered.attempts[0].status, 'failed');
  assert.deepEqual(executionCounts([
    { id: 'recovered', title: 'Recovered', ...recovered },
    { id: 'stable', title: 'Stable', ...executionSummary([{ retry: 0, status: 'passed', duration: 5 }], 'expected') },
    { id: 'not-run', title: 'Not run', ...executionSummary([], 'skipped') },
  ]), { found: 3, passed: 1, flaky: 1, failed: 0, skipped: 0, notRun: 1 });
});

test('unexpected native outcomes cannot be counted as passes', () => {
  assert.equal(executionCounts([{ id: 'unexpected', title: 'Unexpected pass', status: 'passed', outcome: 'unexpected' }]).failed, 1);
  assert.equal(executionCounts([{ id: 'unexpected', title: 'Unexpected pass', status: 'passed', outcome: 'unexpected' }]).passed, 0);
});
