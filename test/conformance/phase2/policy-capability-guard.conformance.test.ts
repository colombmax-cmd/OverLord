import test from 'node:test';
import assert from 'node:assert/strict';

import { PlosAccessDeniedError } from '../../../src/plos/errors.ts';
import { buildConformanceHarness, validRawIntent } from '../shared/fixtures.ts';

test('phase2/policy-guard: allows protected execution path when required capability exists', async () => {
  const { orchestrator, platform } = buildConformanceHarness({
    adapter: { grantedCapabilities: ['intent:read', 'audit:write'] },
  });

  const result = await orchestrator.processRawIntent(validRawIntent());
  assert.equal(result.workflowState, 'completed');

  const capabilityAudits = platform
    .getAuditTrail()
    .filter((audit) => audit.eventType === 'overlord.capability_check' || audit.eventType === 'overlord.capability_denied');

  assert.ok(capabilityAudits.length >= 1);
  assert.equal(capabilityAudits.some((audit) => audit.eventType === 'overlord.capability_denied'), false);
});

test('phase2/policy-guard: denies by default when capability is missing and emits denial audit', async () => {
  const { orchestrator, platform } = buildConformanceHarness({
    adapter: { grantedCapabilities: ['audit:write'] },
  });

  await assert.rejects(
    async () => orchestrator.processRawIntent(validRawIntent()),
    (error: unknown) => {
      assert.ok(error instanceof PlosAccessDeniedError);
      assert.equal(error.capability, 'intent:read');
      return true;
    },
  );

  const denialAudit = platform.getAuditTrail().find((audit) => audit.eventType === 'overlord.capability_denied');
  assert.ok(denialAudit);
  assert.equal(denialAudit?.details?.allowed, false);
  assert.equal(denialAudit?.details?.capability, 'intent:read');
});
