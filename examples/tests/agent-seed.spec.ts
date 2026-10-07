import { test, expect } from './fixtures';
import { coverageSupport } from '../../tests/support/annotations';

// The official planner/generator reuse this project's authentication and browser fixtures.
test('Framework: open the local app for Agent exploration', coverageSupport('Agent environment seed; no product coverage'), async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Counter', exact: true })).toBeVisible();
});
