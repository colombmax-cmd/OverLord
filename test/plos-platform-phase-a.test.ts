import test from 'node:test';
import assert from 'node:assert/strict';

import { SmoosAdapter } from '../adapters/plos/smoos_adapter.ts';
import { DefaultPolicyCapabilityGuard } from '../src/policy/guard.ts';
import { OverlordOrchestrator } from '../src/runtime/orchestrator.ts';
import { InMemoryExecutionProvider } from '../src/adapters/execution/in-memory-provider.ts';

const baseIntent = {
  id: 'intent-phase-a-1',
  timestamp: new Date().toISOString(),
  actorId: 'phase-a-user',
  correlationId: 'corr-phase-a-1',
  schemaVersion: 'v1',
  intentType: 'task.create',
  payload: { title: 'phase a' },
};

test('phaseA/contracts: policy guard emits a Smo.OS-like memory view request', () => {
  const guard = new DefaultPolicyCapabilityGuard();
  const request = guard.planMemoryAccess(baseIntent);

  assert.equal(request.capability, 'intent:read');
  assert.deepEqual(request.memoryViewRequest, {
    userId: 'phase-a-user',
    agentId: 'overlord-runtime',
    sessionId: 'corr-phase-a-1',
    capability: 'intent:read',
    scope: ['intent:phase-a-user'],
    reason: 'Process intent task.create',
  });
});

test('phaseA/contracts: SmoosAdapter exposes an authorized memory view shape directly', async () => {
  const platform = new SmoosAdapter();

  const memoryView = await platform.getAuthorizedMemoryView({
    userId: 'phase-a-user',
    agentId: 'overlord-runtime',
    sessionId: 'corr-phase-a-1',
    capability: 'intent:read',
    scope: ['intent:phase-a-user'],
    reason: 'Phase A contract test',
  });

  assert.equal(memoryView.decision, 'allow');
  assert.deepEqual(memoryView.effectiveScopes, ['intent:phase-a-user']);
  assert.deepEqual(Object.keys(memoryView.context), ['intent:phase-a-user']);
});

test('phaseA/contracts: orchestrator depends directly on the platform port', async () => {
  const platform = new SmoosAdapter();
  const orchestrator = new OverlordOrchestrator({
    platform,
    executionProvider: new InMemoryExecutionProvider(),
  });

  const result = await orchestrator.processIntent(baseIntent);
  assert.equal(result.workflowState, 'completed');
});
