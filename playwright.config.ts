import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import {
  ALLURE_RESULTS_DIR,
  ARTIFACTS_DIR,
  ARTIFACTS_TMP_DIR,
  PLAYWRIGHT_HTML_REPORT_DIR,
  PLAYWRIGHT_TEST_RESULTS_DIR,
} from './tests/support/paths';
import { acquireReportLock } from './scripts/report-lock.cjs';

dotenv.config({ path: join(__dirname, '.env') });
process.env.E2E_RUN_ID ||= `${Date.now()}-${randomUUID()}`;
// Listing is read-only; execution must acquire ownership before Playwright clears output directories.
if (!process.argv.includes('--list')) acquireReportLock(ARTIFACTS_DIR);
mkdirSync(ARTIFACTS_TMP_DIR, { recursive: true });

const workers = Number(process.env.TEST_WORKERS || 1);
const examplesEnabled = process.env.E2E_SKIP_EXAMPLES !== 'true';
const examplePort = Number(process.env.EXAMPLE_PORT || 4173);
if (!Number.isInteger(examplePort) || examplePort < 1024 || examplePort > 65535) {
  throw new Error('EXAMPLE_PORT must be an integer between 1024 and 65535');
}
const exampleURL = `http://127.0.0.1:${examplePort}`;
function positiveNumber(name: string, fallback: number): number {
  const value = Number(process.env[name] || fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive`);
  return value;
}
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
  timeout: positiveNumber('TEST_TIMEOUT', 30_000),
  expect: { timeout: positiveNumber('EXPECT_TIMEOUT', 10_000) },
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
      name: 'chromium',
      testMatch: '**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    ...(examplesEnabled ? [{
      name: 'local-example', testDir: './examples/tests', testMatch: '**/*.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: exampleURL },
    }] : []),
  ],
  webServer: examplesEnabled ? {
    command: 'node --import tsx examples/local-app/server.ts',
    url: `${exampleURL}/health`, reuseExistingServer: false, timeout: 15_000,
    env: { EXAMPLE_PORT: String(examplePort) },
  } : undefined,
});
