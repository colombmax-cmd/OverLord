import test from 'node:test';
import assert from 'node:assert/strict';

import { SmoosAdapter } from '../adapters/plos/smoos_adapter.ts';
import { InMemoryExecutionProvider } from '../src/adapters/execution/in-memory-provider.ts';
import { OverlordOrchestrator } from '../src/runtime/orchestrator.ts';

test('processIntent builds and submits a workflow plan', async () => {
  const plos = new SmoosAdapter();
  const executionProvider = new InMemoryExecutionProvider();
  const orchestrator = new OverlordOrchestrator({ plos, executionProvider });

  const intent = {
    id: 'intent-test-ts-1',
    timestamp: new Date().toISOString(),
    actorId: 'user-test',
    correlationId: 'corr-test-ts-1',
    schemaVersion: 'v1',
    intentType: 'task.create',
    payload: { title: 'run e2e scaffold ts' },
  };

  const result = await orchestrator.processIntent(intent);
  assert.equal(result.workflowState, 'completed');
});
