export type CoverageLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

export type CoverageScenario = {
  id: string;
  name: string;
  operations: string[];
  level: CoverageLevel;
  requirementIds: string[];
  evidence?: string[];
  evidenceMode?: 'all' | 'any';
  boundary?: string;
  ruleRefs?: string[];
  apiRouteSymbols?: string[];
};

export type PageCoverage = {
  id: string;
  module: string;
  name: string;
  route: string;
  scenarios: CoverageScenario[];
};

// Replace this demo entry after connecting the template to your application.
export const PAGE_COVERAGE: PageCoverage[] = [
  {
    id: 'demo',
    module: 'Example',
    name: 'Counter',
    route: '/demo',
    scenarios: [
      {
        id: 'increment',
        name: 'Increment updates the displayed value',
        operations: ['increment'],
        level: 'L1',
        requirementIds: [],
      },
    ],
  },
];
