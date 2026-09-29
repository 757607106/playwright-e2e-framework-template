import { existsSync, readFileSync } from 'node:fs';
import { PAGE_COVERAGE } from '../tests/coverage/page-coverage';
import { analyzeCoverage, type CoverageTest } from '../tests/support/scenario-analysis';
import type { CoverageAnnotation } from '../tests/support/annotations';

type ListedTest = { annotations?: CoverageAnnotation[] };
type ListedSpec = { id?: string; file?: string; line?: number; title?: string; tests?: ListedTest[] };
type ListedSuite = { specs?: ListedSpec[]; suites?: ListedSuite[] };

const file = 'artifacts/test-list.json';
if (!existsSync(file)) throw new Error(`Missing ${file}; run npm run test:list:json`);
const list = JSON.parse(readFileSync(file, 'utf8')) as { suites?: ListedSuite[] };
const tests: CoverageTest[] = [];

function collect(suite: ListedSuite): void {
  for (const spec of suite.specs || []) {
    tests.push({
      id: spec.id || `${spec.file}:${spec.line}:${spec.title}`,
      title: spec.title || '',
      annotations: (spec.tests || []).flatMap((test) => test.annotations || []),
    });
  }
  for (const child of suite.suites || []) collect(child);
}
for (const suite of list.suites || []) collect(suite);

const coverage = analyzeCoverage(PAGE_COVERAGE, tests);
const missing = coverage.scenarios.filter((scenario) => !scenario.implemented);
console.log(`Discovered ${tests.length} tests; missing scenarios ${missing.length}; unclassified tests ${coverage.unclassifiedTests.length}; invalid annotations ${coverage.invalidScenarioAnnotations.length}`);
for (const item of missing) console.error(`Missing: ${item.pageId}/${item.scenarioId}`);
for (const item of coverage.unclassifiedTests) console.error(`Unclassified: ${item.title}`);
for (const item of coverage.invalidScenarioAnnotations) console.error(`Invalid: ${item.title} => ${item.scenarioKey}`);
if (missing.length || coverage.unclassifiedTests.length || coverage.invalidScenarioAnnotations.length) process.exitCode = 1;
