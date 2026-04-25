import test from 'node:test';
import assert from 'node:assert/strict';

import { SmoosAdapter } from '../adapters/plos/smoos_adapter.ts';
import { InMemoryExecutionProvider } from '../src/adapters/execution/in-memory-provider.ts';
import { DeterministicLocalCognitionBackend } from '../src/cognition/local-backend.ts';
import { listSupportedLocalModels, listSupportedRemoteLlmProviders, listSupportedRemoteModels } from '../src/cognition/model-registry.ts';
import { RoutedCognitionBackend } from '../src/cognition/router-backend.ts';
import { OverlordOrchestrator } from '../src/runtime/orchestrator.ts';

const baseIntent = {
  id: 'intent-phase-c-1',
  timestamp: new Date().toISOString(),
  actorId: 'phase-c-user',
  correlationId: 'corr-phase-c-1',
  schemaVersion: 'v1',
  intentType: 'task.create',
  payload: { title: 'phase c task' },
};

test('phase3/cognition: supported registries expose official local defaults and a multi-provider remote catalogue', () => {
  const localModels = listSupportedLocalModels();
  const remoteModels = listSupportedRemoteModels();
  const remoteProviders = listSupportedRemoteLlmProviders();

  assert.equal(localModels.length, 1);
  assert.equal(localModels[0].modelId, 'Qwen/Qwen2.5-1.5B-Instruct');
  assert.equal(localModels[0].status, 'official');
  assert.equal(localModels[0].recommendedDefault, true);

  assert.equal(remoteProviders.length, 2);
  assert.deepEqual(remoteProviders.map((provider) => provider.providerId), ['xai', 'openai']);
  assert.equal(remoteModels.length, 2);
  assert.equal(remoteModels[0].modelId, 'grok-4.20-beta-latest-non-reasoning');
  assert.equal(remoteModels[0].status, 'official');
  assert.equal(remoteModels[1].modelId, 'gpt-4.1-mini');
  assert.equal(remoteModels[1].provider, 'OpenAI');
});

test('phase3/cognition: successful proposal path still submits a workflow through the local backend', async () => {
  const platform = new SmoosAdapter();
  const orchestrator = new OverlordOrchestrator({
    platform,
    executionProvider: new InMemoryExecutionProvider(),
    cognitionBackend: new DeterministicLocalCognitionBackend(),
  });

  const result = await orchestrator.processIntent(baseIntent);
  assert.equal(result.outcome, 'workflow_submitted');
  assert.equal(result.workflowState, 'completed');
  assert.equal(result.plan?.steps[0].description, "Create task 'phase c task'");
  assert.equal(result.cognition?.modelId, 'Qwen/Qwen2.5-1.5B-Instruct');
  assert.equal(result.cognition?.connectivityStatus, 'offline');
  assert.equal(result.cognition?.selectedBackend, 'local');
  assert.equal(result.cognition?.fallbackReason, undefined);
});

test('phase3/cognition: router selects remote backend metadata when online preference is remote', async () => {
  const platform = new SmoosAdapter();
  const remoteBackend = new (await import('../src/cognition/remote-llm-backend.ts')).RemoteLlmCognitionBackend({
    profile: {
      providerId: 'xai',
      modelId: 'grok-4.20-beta-latest-non-reasoning',
      baseUrl: 'https://api.x.ai/v1',
      apiKeySecretRef: 'env:XAI_API_KEY',
      store: false,
    },
    secretResolver: new (await import('../src/secrets/env-resolver.ts')).EnvironmentSecretResolver({ XAI_API_KEY: 'test-key' }),
    fetchImpl: async () => new Response(JSON.stringify({
      output_text: JSON.stringify({
        type: 'proposal',
        steps: [
          { id: 'phase-c-remote-step-1', description: 'Create task via remote cognition', capability: 'workflow:submit' },
        ],
      }),
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  const orchestrator = new OverlordOrchestrator({
    platform,
    executionProvider: new InMemoryExecutionProvider(),
    cognitionBackend: new RoutedCognitionBackend({ remoteBackend }),
    connectivityProbe: { getStatus: () => 'online' },
  });

  const result = await orchestrator.processIntent({
    ...baseIntent,
    payload: { title: 'phase c remote', cognitionPreference: 'remote' },
  });

  assert.equal(result.outcome, 'workflow_submitted');
  assert.equal(result.cognition?.backendKind, 'remote');
  assert.equal(result.cognition?.modelId, 'grok-4.20-beta-latest-non-reasoning');
  assert.equal(result.cognition?.requestedPreference, 'remote');
  assert.equal(result.cognition?.selectedBackend, 'remote');
  assert.equal(result.cognition?.fallbackApplied, false);
  assert.equal(result.cognition?.fallbackReason, undefined);
});

test('phase3/cognition: user-selected remote model is reflected in orchestrator cognition metadata', async () => {
  const platform = new SmoosAdapter();
  const remoteBackend = new (await import('../src/cognition/remote-llm-backend.ts')).RemoteLlmCognitionBackend({
    profile: {
      providerId: 'xai',
      modelId: 'grok-default',
      baseUrl: 'https://api.x.ai/v1',
      apiKeySecretRef: 'env:XAI_API_KEY',
      store: false,
    },
    secretResolver: new (await import('../src/secrets/env-resolver.ts')).EnvironmentSecretResolver({ XAI_API_KEY: 'test-key' }),
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ output_text: JSON.stringify({ type: 'no_action', reason: String(body.model) }) }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const orchestrator = new OverlordOrchestrator({
    platform,
    executionProvider: new InMemoryExecutionProvider(),
    cognitionBackend: new RoutedCognitionBackend({ remoteBackend }),
    connectivityProbe: { getStatus: () => 'online' },
  });

  const result = await orchestrator.processIntent({
    ...baseIntent,
    payload: {
      title: 'phase c selected remote',
      cognitionPreference: 'remote',
      remoteLlm: { providerId: 'xai', modelId: 'grok-user-choice' },
    },
  });

  assert.equal(result.outcome, 'no_action');
  assert.equal(result.reason, 'grok-user-choice');
  assert.equal(result.cognition?.modelId, 'grok-user-choice');
});

test('phase3/cognition: clarification path appends cognition and planning events into the platform log', async () => {
  const platform = new SmoosAdapter();
  const orchestrator = new OverlordOrchestrator({
    platform,
    executionProvider: new InMemoryExecutionProvider(),
  });

  const result = await orchestrator.processIntent({
    ...baseIntent,
    payload: {},
  });

  assert.equal(result.outcome, 'clarification_required');

  const events = await platform.readAllEvents();
  assert.ok(events.some((event) => event.type === 'overlord.cognition/decision'));
  assert.ok(events.some((event) => event.type === 'overlord.cognition/exchange'));
  assert.ok(events.some((event) => event.type === 'overlord.planning/clarification_requested'));
});
