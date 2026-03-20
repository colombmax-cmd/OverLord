import test from 'node:test';
import assert from 'node:assert/strict';

import { buildConformanceHarness, validRawIntent } from '../shared/fixtures.ts';

test('phase0/runtime: orchestrator processes a valid raw intent end-to-end', async () => {
  const { orchestrator, platform } = buildConformanceHarness();

  const result = await orchestrator.processRawIntent(validRawIntent());

  assert.equal(result.workflowState, 'completed');
  assert.equal(result.plan.steps.length, 1);
  assert.equal(result.plan.intentId, result.plan.id.replace(':plan', ''));
  assert.ok(platform.getAuditTrail().length >= 5);
});
