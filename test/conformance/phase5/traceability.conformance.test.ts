import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRunTimelineSnapshot } from '../../../src/runtime/run-timeline.ts';
import { buildConformanceHarness, validRawIntent } from '../shared/fixtures.ts';

const REQUIRED_AUDIT_TYPES = [
  'overlord.intent_received',
  'overlord.capability_check',
  'overlord.cognition_invoked',
  'overlord.cognition_decided',
  'overlord.plan_generated',
  'overlord.workflow_submitted',
  'overlord.workflow_completed',
] as const;

test('phase5/traceability: audit records propagate one runId and actor across the full successful path', async () => {
  const { orchestrator, platform } = buildConformanceHarness();

  await orchestrator.processRawIntent(validRawIntent({
    actorId: 'phase5-user',
    payload: { title: 'phase5 full traceability path' },
  }));

  const audits = platform.getAuditTrail();
  assert.ok(audits.length >= REQUIRED_AUDIT_TYPES.length);

  const runIds = new Set(audits.map((audit) => audit.runId));
  assert.equal(runIds.size, 1);

  const [runId] = [...runIds];
  assert.match(runId ?? '', /^corr-/);

  const actorIds = new Set(audits.map((audit) => audit.actorId));
  assert.deepEqual([...actorIds], ['phase5-user']);

  for (const requiredType of REQUIRED_AUDIT_TYPES) {
    assert.ok(audits.some((audit) => audit.eventType === requiredType));
  }

  for (const audit of audits) {
    assert.equal(audit.runId, runId);
    assert.equal(audit.actorId, 'phase5-user');
    assert.equal(typeof audit.policyVersion, 'string');
    assert.ok(Number.isFinite(Date.parse(audit.ts)));
  }
});

test('phase5/traceability: one-intent timeline can be reconstructed from audit log events', async () => {
  const { orchestrator, platform } = buildConformanceHarness();

  await orchestrator.processRawIntent(validRawIntent({
    actorId: 'phase5-reconstruct',
    payload: { title: 'phase5 timeline reconstruction' },
  }));

  const audits = platform.getAuditTrail();
  assert.ok(audits.length >= REQUIRED_AUDIT_TYPES.length);

  const runId = audits[0]?.runId;
  assert.ok(runId);

  const timeline = buildRunTimelineSnapshot(runId, await platform.readAllEvents(), audits);
  assert.equal(timeline.correlationId, runId);
  assert.ok(timeline.entries.length >= REQUIRED_AUDIT_TYPES.length);

  const eventTypes = timeline.entries.filter((entry) => entry.source === 'audit').map((entry) => entry.type);
  for (const requiredType of REQUIRED_AUDIT_TYPES) {
    assert.ok(eventTypes.includes(requiredType));
  }

  assert.ok(eventTypes.indexOf('overlord.intent_received') < eventTypes.indexOf('overlord.workflow_completed'));
});
