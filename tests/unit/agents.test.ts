import assert from 'node:assert/strict';
import test from 'node:test';

const { adaptDefinition } = require('../../scripts/init-agents.cjs') as {
  adaptDefinition: (source: string, role: string) => string;
};
const definition = `name = "playwright_test_healer"
description = "Official role"
sandbox_mode = "workspace-write"
developer_instructions = """
Run the whole suite. Mark test.fixme() if the application is broken.
"""
[mcp_servers.playwright-test]
command = "npx"
args = ["playwright", "run-test-mcp-server"]
enabled_tools = ["test_debug", "test_run"]
`;

test('healer adaptation removes upstream skipping and broad execution instructions', () => {
  const adapted = adaptDefinition(definition, 'healer');
  assert.doesNotMatch(adapted, /Mark test\.fixme\(\)|Run the whole suite/);
  assert.match(adapted, /three evidence-backed attempts/);
  assert.match(adapted, /Only repair confirmed test-script defects/);
  assert.match(adapted, /enabled_tools = \["test_debug", "test_run"\]/);
});
test('unsupported upstream formats fail instead of silently dropping guardrails', () => {
  assert.throws(() => adaptDefinition('unexpected format', 'healer'), /Unsupported official Agent format/);
  assert.throws(() => adaptDefinition(definition, 'unknown'), /Unknown Agent role/);
});
test('planner keeps the upstream workflow with read-only workspace access', () => {
  const adapted = adaptDefinition(definition.replace('Run the whole suite. Mark test.fixme() if the application is broken.', 'Invoke planner_setup_page.'), 'planner');
  assert.match(adapted, /Invoke planner_setup_page/);
  assert.match(adapted, /sandbox_mode = "read-only"/);
  assert.match(adapted, /Return a plan for review before generation/);
});
