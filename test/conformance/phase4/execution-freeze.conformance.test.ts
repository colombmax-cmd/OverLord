import test from 'node:test';
import assert from 'node:assert/strict';

import { buildConformanceHarness, validRawIntent } from '../shared/fixtures.ts';

test('phase4/execution-freeze: generated plan is frozen with version/hash metadata', async () => {
  const { orchestrator } = buildConformanceHarness();
  const result = await orchestrator.processRawIntent(validRawIntent());

  assert.equal(result.outcome, 'workflow_submitted');
  assert.equal(result.plan?.planVersion, 1);
  assert.equal(typeof result.plan?.planHash, 'string');
  assert.ok((result.plan?.planHash?.length ?? 0) > 10);
  assert.equal(typeof result.plan?.frozenAt, 'string');
});

test('phase4/execution-freeze: provider emits submitted then completed transitions', async () => {
  const { orchestrator, executionProvider } = buildConformanceHarness();
  const result = await orchestrator.processRawIntent(validRawIntent());

  assert.ok(result.workflowId);
  const states: string[] = [];
  for await (const event of executionProvider.subscribeEvents(result.workflowId!)) {
    states.push(event.state);
  }

  assert.deepEqual(states, ['submitted', 'completed']);
});
