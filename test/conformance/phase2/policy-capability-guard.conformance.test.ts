import test from 'node:test';
import assert from 'node:assert/strict';

import { PlosAccessDeniedError } from '../../../src/plos/errors.ts';
import { buildConformanceHarness, validRawIntent } from '../shared/fixtures.ts';

test('phase2/policy-guard: allows protected execution path when required capability exists', async () => {
  const { orchestrator, plos } = buildConformanceHarness({
    adapter: { grantedCapabilities: ['intent:read', 'audit:write'] },
  });

  const result = await orchestrator.processRawIntent(validRawIntent());
  assert.equal(result.workflowState, 'completed');

  const capabilityAudits = plos
    .getAuditTrail()
    .filter((audit) => audit.kind === 'capability_check' || audit.kind === 'capability_denied');

  assert.ok(capabilityAudits.length >= 1);
  assert.equal(capabilityAudits.some((audit) => audit.kind === 'capability_denied'), false);
});

test('phase2/policy-guard: denies by default when capability is missing and emits denial audit', async () => {
  const { orchestrator, plos } = buildConformanceHarness({
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

  const denialAudit = plos.getAuditTrail().find((audit) => audit.kind === 'capability_denied');
  assert.ok(denialAudit);
  assert.equal(denialAudit?.details.allowed, false);
  assert.equal(denialAudit?.details.capability, 'intent:read');
});
