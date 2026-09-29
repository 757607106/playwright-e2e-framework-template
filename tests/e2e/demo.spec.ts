import { test, expect } from '../fixtures';
import { coverageScenario } from '../support/annotations';

test('Counter: increment updates the displayed value', coverageScenario(['demo', 'increment']), async ({ page }) => {
  await page.setContent(`
    <main>
      <output aria-label="Count">0</output>
      <button type="button" onclick="document.querySelector('output').textContent = '1'">Increment</button>
    </main>
  `);

  await page.getByRole('button', { name: 'Increment' }).click();
  await expect(page.getByRole('status', { name: 'Count' })).toHaveText('1');
});
