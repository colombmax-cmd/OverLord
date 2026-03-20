import test from 'node:test';
import assert from 'node:assert/strict';

import { SmoosAdapter } from '../adapters/plos/smoos_adapter.ts';
import { InMemoryExecutionProvider } from '../src/adapters/execution/in-memory-provider.ts';
import { OverlordOrchestrator } from '../src/runtime/orchestrator.ts';

test('processIntent builds and submits a workflow plan with route-aware cognition metadata', async () => {
  const platform = new SmoosAdapter();
  const executionProvider = new InMemoryExecutionProvider();
  const orchestrator = new OverlordOrchestrator({ platform, executionProvider });

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
  assert.equal(result.cognition?.modelId, 'Qwen/Qwen2.5-1.5B-Instruct');
  assert.equal(result.cognition?.proposalType, 'proposal');
  assert.equal(result.cognition?.requestedPreference, 'auto');
  assert.equal(result.cognition?.fallbackApplied, false);
});
