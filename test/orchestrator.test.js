import test from 'node:test';
import assert from 'node:assert/strict';

import { SmoosAdapter } from '../adapters/plos/smoos_adapter.js';
import { InMemoryExecutionProvider } from '../src/adapters/execution/in-memory-provider.js';
import { OverlordOrchestrator } from '../src/runtime/orchestrator.js';

test('processIntent builds and submits a workflow plan', async () => {
  const plos = new SmoosAdapter();
  const executionProvider = new InMemoryExecutionProvider();
  const orchestrator = new OverlordOrchestrator({ plos, executionProvider });

  const intent = {
    id: 'intent-test-1',
    timestamp: new Date().toISOString(),
    actorId: 'user-test',
    correlationId: 'corr-test-1',
    schemaVersion: 'v1',
    intentType: 'task.create',
    payload: { title: 'run e2e scaffold' },
  };

  const result = await orchestrator.processIntent(intent);

  assert.equal(result.workflowState, 'completed');
  assert.equal(result.plan.intentId, intent.id);
  assert.equal(result.plan.steps.length, 1);
  assert.equal(plos.getAuditTrail().length, 5);
});
