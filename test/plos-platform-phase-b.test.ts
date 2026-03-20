import test from 'node:test';
import assert from 'node:assert/strict';

import { SmoosAdapter } from '../adapters/plos/smoos_adapter.ts';
import { InMemoryExecutionProvider } from '../src/adapters/execution/in-memory-provider.ts';
import { OverlordOrchestrator } from '../src/runtime/orchestrator.ts';

const baseIntent = {
  id: 'intent-phase-b-1',
  timestamp: new Date().toISOString(),
  actorId: 'phase-b-user',
  correlationId: 'corr-phase-b-1',
  schemaVersion: 'v1',
  intentType: 'task.create',
  payload: { title: 'phase b' },
};

test('phase2/flows: processIntent appends intent, cognition, plan, workflow and audit events to the platform log', async () => {
  const platform = new SmoosAdapter();
  const orchestrator = new OverlordOrchestrator({
    platform,
    executionProvider: new InMemoryExecutionProvider(),
  });

  await orchestrator.processIntent(baseIntent);
  const events = await platform.readAllEvents();
  const eventTypes = events.map((event) => event.type);

  assert.ok(eventTypes.includes('overlord.intent/received'));
  assert.ok(eventTypes.includes('overlord.cognition/decision'));
  assert.ok(eventTypes.includes('overlord.cognition/exchange'));
  assert.ok(eventTypes.includes('overlord.plan/generated'));
  assert.ok(eventTypes.includes('overlord.workflow/submitted'));
  assert.ok(eventTypes.includes('overlord.workflow/completed'));
  assert.ok(eventTypes.includes('overlord.audit/event_emitted'));

  const cognitionDecision = events.find((event) => event.type === 'overlord.cognition/decision');
  assert.equal(cognitionDecision?.payload.route.selectedBackend, 'local');
});

test('phase2/flows: denial path appends a capability_denied audit record', async () => {
  const platform = new SmoosAdapter({ grantedCapabilities: ['audit:write'] });
  const orchestrator = new OverlordOrchestrator({
    platform,
    executionProvider: new InMemoryExecutionProvider(),
  });

  await assert.rejects(() => orchestrator.processIntent(baseIntent));

  const audits = platform.getAuditTrail();
  assert.ok(audits.some((audit) => audit.eventType === 'overlord.capability_denied'));

  const events = await platform.readAllEvents();
  assert.ok(events.some((event) => event.type === 'overlord.audit/event_emitted'));
});
