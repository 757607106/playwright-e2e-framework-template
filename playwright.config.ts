import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import {
  ALLURE_RESULTS_DIR,
  ARTIFACTS_TMP_DIR,
  PLAYWRIGHT_HTML_REPORT_DIR,
  PLAYWRIGHT_TEST_RESULTS_DIR,
} from './tests/support/paths';

dotenv.config({ path: join(__dirname, '.env') });
process.env.E2E_RUN_ID ||= new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
mkdirSync(ARTIFACTS_TMP_DIR, { recursive: true });

const workers = Number(process.env.TEST_WORKERS || 1);
function choice<const T extends readonly string[]>(name: string, values: T, fallback: T[number]): T[number] {
  const value = process.env[name];
  if (!value) return fallback;
  if (values.some((option) => option === value)) return value as T[number];
  throw new Error(`${name} must be one of: ${values.join(', ')}`);
}
if (!Number.isInteger(workers) || workers < 1) {
  throw new Error('TEST_WORKERS must be a positive integer');
}
if (workers > 1 && process.env.E2E_ISOLATED_WORKERS !== 'true') {
  throw new Error('Parallel execution requires E2E_ISOLATED_WORKERS=true and isolated accounts/data');
}

export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  workers,
  retries: 0,
  timeout: Number(process.env.TEST_TIMEOUT || 30_000),
  expect: { timeout: Number(process.env.EXPECT_TIMEOUT || 10_000) },
  outputDir: PLAYWRIGHT_TEST_RESULTS_DIR,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: PLAYWRIGHT_HTML_REPORT_DIR }],
    ['allure-playwright', { resultsDir: ALLURE_RESULTS_DIR }],
    ['./tests/reporters/quality-reporter.ts'],
  ],
  use: {
    baseURL: process.env.BASE_URL || undefined,
    headless: process.env.HEADLESS !== 'false',
    trace: choice('PLAYWRIGHT_TRACE', ['off', 'on', 'retain-on-failure', 'on-first-retry', 'retain-on-failure-and-retries'] as const, 'retain-on-failure'),
    screenshot: choice('PLAYWRIGHT_SCREENSHOT', ['off', 'on', 'only-on-failure'] as const, 'only-on-failure'),
    video: choice('PLAYWRIGHT_VIDEO', ['off', 'on', 'retain-on-failure', 'on-first-retry'] as const, 'retain-on-failure'),
  },
  projects: [
    {
      name: 'smoke',
      testMatch: /demo\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
