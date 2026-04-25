import test from 'node:test';
import assert from 'node:assert/strict';

import { DeterministicRemoteCognitionBackend } from '../src/cognition/remote-backend.ts';
import type { CognitionBackend } from '../src/cognition/interface.ts';
import { RoutedCognitionBackend } from '../src/cognition/router-backend.ts';

const memoryView = {
  request: {
    userId: 'phase-b-user',
    agentId: 'overlord-runtime',
    sessionId: 'corr-phase-b-1',
    capability: 'intent:read',
    scope: ['intent:phase-b-user'],
    reason: 'Phase B cognition test',
  },
  decision: 'allow' as const,
  effectiveScopes: ['intent:phase-b-user'],
  deniedScopes: [],
  context: {
    'intent:phase-b-user': { events: [] },
  },
  timestampMs: Date.now(),
};

function buildIntent(payload: Record<string, unknown>) {
  return {
    id: 'intent-phase-b-cognition',
    timestamp: new Date().toISOString(),
    actorId: 'phase-b-user',
    correlationId: 'corr-phase-b-cognition',
    schemaVersion: 'v1',
    intentType: 'task.create',
    payload,
  };
}

test('phaseB/cognition: router selects remote backend when online and remote is preferred', async () => {
  const backend = new RoutedCognitionBackend({ remoteBackend: new DeterministicRemoteCognitionBackend() });
  const decision = await backend.decide({
    connectivityStatus: 'online',
    intent: buildIntent({ title: 'route remote', cognitionPreference: 'remote' }),
    memoryView,
  });

  assert.equal(decision.backendKind, 'remote');
  assert.equal(decision.selectedModel.modelId, 'grok-4.20-beta-latest-non-reasoning');
  assert.equal(decision.route.selectedBackend, 'remote');
  assert.equal(decision.route.fallbackApplied, false);
  assert.deepEqual(decision.route.attemptedBackends, ['remote']);
});

test('phaseB/cognition: router falls back to local when remote is preferred but connectivity is offline', async () => {
  const backend = new RoutedCognitionBackend({ remoteBackend: new DeterministicRemoteCognitionBackend() });
  const decision = await backend.decide({
    connectivityStatus: 'offline',
    intent: buildIntent({ title: 'route local fallback', cognitionPreference: 'remote' }),
    memoryView,
  });

  assert.equal(decision.backendKind, 'local');
  assert.equal(decision.selectedModel.modelId, 'Qwen/Qwen2.5-1.5B-Instruct');
  assert.equal(decision.route.selectedBackend, 'local');
  assert.equal(decision.route.fallbackApplied, true);
  assert.deepEqual(decision.route.attemptedBackends, ['remote', 'local']);
});

test('phaseB/cognition: router returns no_action when remote cognition is required but unavailable', async () => {
  const backend = new RoutedCognitionBackend({ remoteBackend: new DeterministicRemoteCognitionBackend() });
  const decision = await backend.decide({
    connectivityStatus: 'degraded',
    intent: buildIntent({ title: 'must be remote', cognitionPreference: 'remote', requiresRemoteCognition: true }),
    memoryView,
  });

  assert.equal(decision.backendKind, 'local');
  assert.equal(decision.proposal.type, 'no_action');
  assert.equal(decision.route.fallbackApplied, true);
  assert.match(decision.route.reason, /required by payload/);
});

test('phaseB/cognition: router preserves local-runtime fallback reason for local/auto routing', async () => {
  const localBackend: CognitionBackend = {
    kind: 'local',
    defaultModel: {
      modelId: 'local-test',
      displayName: 'local-test',
      provider: 'Local Runtime',
      family: 'test',
      license: 'Apache-2.0',
      format: 'transformers',
      recommendedRuntime: 'local',
      minDeviceClass: 'cpu',
      supportsStructuredOutput: true,
      status: 'official',
      recommendedDefault: true,
    },
    getSupportedModels: () => [],
    decide: async () => ({
      proposal: {
        type: 'proposal',
        steps: [{ id: 's1', description: 'fallback proposal', capability: 'workflow:submit' }],
      },
      backendKind: 'local',
      connectivityStatus: 'offline',
      selectedModel: {
        modelId: 'local-test',
        displayName: 'local-test',
        provider: 'Local Runtime',
        family: 'test',
        license: 'Apache-2.0',
        format: 'transformers',
        recommendedRuntime: 'local',
        minDeviceClass: 'cpu',
        supportsStructuredOutput: true,
        status: 'official',
        recommendedDefault: true,
      },
      transcript: [],
      route: {
        requestedPreference: 'local',
        selectedBackend: 'local',
        reason: 'local runtime fallback: runtime_timeout',
        attemptedBackends: ['local'],
        fallbackApplied: true,
      },
    }),
  };

  const backend = new RoutedCognitionBackend({
    remoteBackend: new DeterministicRemoteCognitionBackend(),
    localBackend,
  });

  const decision = await backend.decide({
    connectivityStatus: 'offline',
    intent: buildIntent({ title: 'local runtime fallback route' }),
    memoryView,
  });

  assert.equal(decision.route.fallbackApplied, true);
  assert.equal(decision.route.reason, 'local runtime fallback: runtime_timeout');
});
