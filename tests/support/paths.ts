import { resolve } from 'node:path';

export const PROJECT_ROOT = resolve(__dirname, '../..');
export const ARTIFACTS_DIR = resolve(PROJECT_ROOT, 'artifacts');
export const ARTIFACTS_TMP_DIR = resolve(ARTIFACTS_DIR, 'tmp');
export const PLAYWRIGHT_TEST_RESULTS_DIR = resolve(ARTIFACTS_DIR, 'test-results');
export const PLAYWRIGHT_HTML_REPORT_DIR = resolve(ARTIFACTS_DIR, 'playwright-report');
export const ALLURE_RESULTS_DIR = resolve(ARTIFACTS_DIR, 'allure-results');
export const ALLURE_REPORT_DIR = resolve(ARTIFACTS_DIR, 'allure-report');
export const ALLURE_HISTORY_DIR = resolve(ARTIFACTS_DIR, 'allure-history');
export const QUALITY_REPORT_DIR = resolve(ARTIFACTS_DIR, 'quality-report');
export const REPORT_HISTORY_DIR = resolve(ARTIFACTS_DIR, 'history');
export const RUN_DATA_DIR = resolve(ARTIFACTS_DIR, 'run-data');
