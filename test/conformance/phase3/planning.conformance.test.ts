import test from 'node:test';
import assert from 'node:assert/strict';

import { buildConformanceHarness, validRawIntent } from '../shared/fixtures.ts';

test('phase3/cognition: returns clarification when task.create title is missing', async () => {
  const { orchestrator, platform } = buildConformanceHarness();
  const result = await orchestrator.processRawIntent(validRawIntent({ payload: {} }));

  assert.equal(result.outcome, 'clarification_required');
  assert.equal(result.clarificationQuestion, 'What title should be used for this task?');
  assert.equal(result.cognition?.modelId, 'Qwen/Qwen2.5-1.5B-Instruct');
  assert.equal(result.cognition?.routeReason, 'auto routing defaults to local-first cognition');
  assert.ok(platform.getAuditTrail().some((audit) => audit.eventType === 'overlord.cognition_decided'));
  assert.ok(platform.getAuditTrail().some((audit) => audit.eventType === 'overlord.clarification_requested'));
});

test('phase3/cognition: returns scope_request when payload asks for a missing capability', async () => {
  const { orchestrator, platform } = buildConformanceHarness();
  const result = await orchestrator.processRawIntent(
    validRawIntent({ payload: { title: 'needs more scope', requiredCapability: 'intent:write' } }),
  );

  assert.equal(result.outcome, 'scope_request');
  assert.equal(result.missingCapability, 'intent:write');
  assert.ok(platform.getAuditTrail().some((audit) => audit.eventType === 'overlord.scope_requested'));
});

test('phase3/cognition: returns no_action when payload requests no action', async () => {
  const { orchestrator, platform } = buildConformanceHarness();
  const result = await orchestrator.processRawIntent(
    validRawIntent({ payload: { title: 'skip me', noAction: true } }),
  );

  assert.equal(result.outcome, 'no_action');
  assert.equal(result.reason, 'explicit no-action requested by payload');
  assert.ok(platform.getAuditTrail().some((audit) => audit.eventType === 'overlord.no_action'));
});
