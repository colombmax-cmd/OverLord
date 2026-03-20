import test from 'node:test';
import assert from 'node:assert/strict';

import { EnvironmentConnectivityProbe } from '../src/cognition/connectivity.ts';
import { DeterministicLocalCognitionBackend } from '../src/cognition/local-backend.ts';
import { getDefaultLocalModel, getDefaultRemoteLlmProvider, getDefaultRemoteModel, listSupportedRemoteLlmProviders } from '../src/cognition/model-registry.ts';

const memoryView = {
  request: {
    userId: 'phase-a-user',
    agentId: 'overlord-runtime',
    sessionId: 'corr-phase-a-1',
    capability: 'intent:read',
    scope: ['intent:phase-a-user'],
    reason: 'Phase A cognition test',
  },
  decision: 'allow' as const,
  effectiveScopes: ['intent:phase-a-user'],
  deniedScopes: [],
  context: {
    'intent:phase-a-user': { events: [] },
  },
  timestampMs: Date.now(),
};

test('phaseA/cognition: default model registry entries are stable for local and remote stacks', () => {
  const localModel = getDefaultLocalModel();
  const remoteProvider = getDefaultRemoteLlmProvider();
  const remoteModel = getDefaultRemoteModel();
  const remoteProviders = listSupportedRemoteLlmProviders();

  assert.equal(localModel.modelId, 'Qwen/Qwen2.5-1.5B-Instruct');
  assert.equal(localModel.recommendedDefault, true);
  assert.equal(localModel.supportsStructuredOutput, true);

  assert.equal(remoteProvider.providerId, 'xai');
  assert.equal(remoteModel.modelId, 'grok-4.20-beta-latest-non-reasoning');
  assert.equal(remoteModel.format, 'service');
  assert.deepEqual(remoteProviders.map((provider) => provider.providerId), ['xai', 'openai']);
});

test('phaseA/cognition: environment probe defaults to offline and accepts explicit connectivity overrides', () => {
  const previous = process.env.OVERLORD_CONNECTIVITY;
  delete process.env.OVERLORD_CONNECTIVITY;

  try {
    const probe = new EnvironmentConnectivityProbe();
    assert.equal(probe.getStatus(), 'offline');

    process.env.OVERLORD_CONNECTIVITY = 'degraded';
    assert.equal(probe.getStatus(), 'degraded');
  } finally {
    if (previous === undefined) {
      delete process.env.OVERLORD_CONNECTIVITY;
    } else {
      process.env.OVERLORD_CONNECTIVITY = previous;
    }
  }
});

test('phaseA/cognition: local backend records transcript and deterministic proposal metadata', async () => {
  const backend = new DeterministicLocalCognitionBackend();
  const decision = await backend.decide({
    connectivityStatus: 'offline',
    intent: {
      id: 'intent-phase-a-cognition',
      timestamp: new Date().toISOString(),
      actorId: 'phase-a-user',
      correlationId: 'corr-phase-a-cognition',
      schemaVersion: 'v1',
      intentType: 'task.create',
      payload: { title: 'draft phase A' },
    },
    memoryView,
  });

  assert.equal(decision.backendKind, 'local');
  assert.equal(decision.selectedModel.modelId, 'Qwen/Qwen2.5-1.5B-Instruct');
  assert.equal(decision.proposal.type, 'proposal');
  assert.equal(decision.transcript.length, 2);
  assert.equal(decision.route.selectedBackend, 'local');
  assert.match(decision.transcript[1].summary, /backend=local/);
});
