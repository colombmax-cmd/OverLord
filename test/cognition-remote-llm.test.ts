import test from 'node:test';
import assert from 'node:assert/strict';

import { EnvironmentSecretResolver } from '../src/secrets/env-resolver.ts';
import {
  readRemoteLlmProviderProfileFromEnv,
  readRemoteLlmSelectionFromPayload,
  resolveRemoteLlmProviderProfile,
} from '../src/cognition/provider-config.ts';
import { RemoteLlmCognitionBackend } from '../src/cognition/remote-llm-backend.ts';

const memoryView = {
  request: {
    userId: 'phase-online-user',
    agentId: 'overlord-runtime',
    sessionId: 'corr-online-1',
    capability: 'intent:read',
    scope: ['intent:phase-online-user'],
    reason: 'remote-LLM cognition test',
  },
  decision: 'allow' as const,
  effectiveScopes: ['intent:phase-online-user'],
  deniedScopes: [],
  context: {
    'intent:phase-online-user': { events: [] },
  },
  timestampMs: Date.now(),
};

test('phaseOnline/remote-llm: env profile reads configured xai provider and uses env secret ref by default', () => {
  const profile = readRemoteLlmProviderProfileFromEnv({
    XAI_API_KEY: 'test-key',
    OVERLORD_REMOTE_LLM_PROVIDER: 'xai',
    OVERLORD_REMOTE_LLM_MODEL: 'grok-4.20-beta-latest-non-reasoning',
  });

  assert.ok(profile);
  assert.equal(profile?.providerId, 'xai');
  assert.equal(profile?.modelId, 'grok-4.20-beta-latest-non-reasoning');
  assert.equal(profile?.baseUrl, 'https://api.x.ai/v1');
  assert.equal(profile?.apiKeySecretRef, 'product:xai_api_key');
  assert.equal(profile?.store, false);
});

test('phaseOnline/remote-llm: env profile can auto-detect openai from provider catalogue defaults', () => {
  const profile = readRemoteLlmProviderProfileFromEnv({
    OPENAI_API_KEY: 'openai-test-key',
  });

  assert.ok(profile);
  assert.equal(profile?.providerId, 'openai');
  assert.equal(profile?.modelId, 'gpt-4.1-mini');
  assert.equal(profile?.baseUrl, 'https://api.openai.com/v1');
  assert.equal(profile?.apiKeySecretRef, 'product:openai_api_key');
  assert.equal(profile?.store, false);
});

test('phaseOnline/remote-llm: payload selection supports nested and legacy override fields', () => {
  assert.deepEqual(
    readRemoteLlmSelectionFromPayload({ remoteLlm: { providerId: 'openai', modelId: 'gpt-user-choice' } }),
    { providerId: 'openai', modelId: 'gpt-user-choice' },
  );

  assert.deepEqual(
    readRemoteLlmSelectionFromPayload({ remoteLlmProvider: 'xai', remoteLlmModel: 'grok-legacy-choice' }),
    { providerId: 'xai', modelId: 'grok-legacy-choice' },
  );
});

test('phaseOnline/remote-llm: provider profile resolution reapplies provider defaults when the selected provider changes', () => {
  const baseProfile = readRemoteLlmProviderProfileFromEnv({
    XAI_API_KEY: 'test-key',
    OVERLORD_REMOTE_LLM_PROVIDER: 'xai',
    OVERLORD_REMOTE_LLM_MODEL: 'grok-default',
    OVERLORD_XAI_BASE_URL: 'https://custom.x.ai/v1',
  });
  assert.ok(baseProfile);

  const resolved = resolveRemoteLlmProviderProfile(baseProfile!, {
    remoteLlm: {
      providerId: 'openai',
    },
  });

  assert.equal(resolved.providerId, 'openai');
  assert.equal(resolved.modelId, 'gpt-4.1-mini');
  assert.equal(resolved.baseUrl, 'https://api.openai.com/v1');
  assert.equal(resolved.apiKeySecretRef, 'product:openai_api_key');
  assert.equal(resolved.store, false);
});

test('phaseOnline/remote-llm: secret resolver reads env-backed and product-backed refs', async () => {
  const resolver = new EnvironmentSecretResolver({ XAI_API_KEY: 'secret-123' });
  assert.equal(await resolver.resolve('env:XAI_API_KEY'), 'secret-123');
  assert.equal(await resolver.resolve('product:xai_api_key'), 'secret-123');
});

test('phaseOnline/remote-llm: backend sends bearer auth to /responses and parses JSON proposal', async () => {
  let seenAuthHeader = '';
  let seenStore = true;
  let seenModel = '';
  let seenPath = '';

  const backend = new RemoteLlmCognitionBackend({
    profile: {
      providerId: 'xai',
      modelId: 'grok-4.20-beta-latest-non-reasoning',
      baseUrl: 'https://api.x.ai/v1',
      apiKeySecretRef: 'env:XAI_API_KEY',
      store: false,
    },
    secretResolver: new EnvironmentSecretResolver({ XAI_API_KEY: 'xai-test-key' }),
    fetchImpl: async (input, init) => {
      const url = String(input);
      seenPath = new URL(url).pathname;
      seenAuthHeader = String((init?.headers as Record<string, string>).authorization);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      seenStore = Boolean(body.store);
      seenModel = String(body.model);

      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          type: 'proposal',
          steps: [
            { id: 'remote-step-1', description: 'Create task via remote-LLM', capability: 'workflow:submit' },
          ],
        }),
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const decision = await backend.decide({
    connectivityStatus: 'online',
    intent: {
      id: 'intent-online-1',
      timestamp: new Date().toISOString(),
      actorId: 'phase-online-user',
      correlationId: 'corr-online-1',
      schemaVersion: 'v1',
      intentType: 'task.create',
      payload: { title: 'use remote llm' },
    },
    memoryView,
  });

  assert.equal(seenPath, '/v1/responses');
  assert.equal(seenAuthHeader, 'Bearer xai-test-key');
  assert.equal(seenStore, false);
  assert.equal(seenModel, 'grok-4.20-beta-latest-non-reasoning');
  assert.equal(decision.backendKind, 'remote');
  assert.equal(decision.selectedModel.modelId, 'grok-4.20-beta-latest-non-reasoning');
  assert.equal(decision.selectedModel.provider, 'xAI');
  assert.equal(decision.proposal.type, 'proposal');
  if (decision.proposal.type === 'proposal') {
    assert.equal(decision.proposal.steps[0].description, 'Create task via remote-LLM');
  }
});

test('phaseOnline/remote-llm: backend honors user-selected provider and model overrides from the intent payload', async () => {
  let seenUrl = '';
  let seenAuthHeader = '';
  let seenModel = '';

  const backend = new RemoteLlmCognitionBackend({
    profile: {
      providerId: 'xai',
      modelId: 'grok-default',
      baseUrl: 'https://api.x.ai/v1',
      apiKeySecretRef: 'env:XAI_API_KEY',
      store: false,
    },
    secretResolver: new EnvironmentSecretResolver({
      XAI_API_KEY: 'xai-test-key',
      OPENAI_API_KEY: 'openai-test-key',
    }),
    fetchImpl: async (input, init) => {
      seenUrl = String(input);
      seenAuthHeader = String((init?.headers as Record<string, string>).authorization);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      seenModel = String(body.model);
      return new Response(JSON.stringify({
        output_text: JSON.stringify({ type: 'no_action', reason: 'remote override accepted' }),
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const decision = await backend.decide({
    connectivityStatus: 'online',
    intent: {
      id: 'intent-online-override-1',
      timestamp: new Date().toISOString(),
      actorId: 'phase-online-user',
      correlationId: 'corr-online-override-1',
      schemaVersion: 'v1',
      intentType: 'task.create',
      payload: {
        title: 'use selected model',
        remoteLlm: {
          providerId: 'openai',
          modelId: 'gpt-user-choice',
        },
      },
    },
    memoryView,
  });

  assert.equal(seenUrl, 'https://api.openai.com/v1/responses');
  assert.equal(seenAuthHeader, 'Bearer openai-test-key');
  assert.equal(seenModel, 'gpt-user-choice');
  assert.equal(decision.selectedModel.modelId, 'gpt-user-choice');
  assert.equal(decision.selectedModel.provider, 'OpenAI');
  assert.equal(decision.proposal.type, 'no_action');
});
