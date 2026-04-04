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

test('phaseOnline/remote-llm: backend accepts fenced JSON responses and normalizes duplicate step ids', async () => {
  const backend = new RemoteLlmCognitionBackend({
    profile: {
      providerId: 'xai',
      modelId: 'grok-4.20-beta-latest-non-reasoning',
      baseUrl: 'https://api.x.ai/v1',
      apiKeySecretRef: 'env:XAI_API_KEY',
      store: false,
    },
    secretResolver: new EnvironmentSecretResolver({ XAI_API_KEY: 'xai-test-key' }),
    fetchImpl: async () => new Response(JSON.stringify({
      output_text: [
        '```json',
        JSON.stringify({
          type: 'proposal',
          steps: [
            { id: 'dup-step', description: 'First remote step', capability: 'workflow:submit' },
            { id: 'dup-step', description: 'Second remote step', capability: 'workflow:submit' },
          ],
        }),
        '```',
      ].join('\n'),
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });

  const decision = await backend.decide({
    connectivityStatus: 'online',
    intent: {
      id: 'intent-online-fenced-1',
      timestamp: new Date().toISOString(),
      actorId: 'phase-online-user',
      correlationId: 'corr-online-fenced-1',
      schemaVersion: 'v1',
      intentType: 'task.create',
      payload: { title: 'use fenced json' },
    },
    memoryView,
  });

  assert.equal(decision.proposal.type, 'proposal');
  if (decision.proposal.type === 'proposal') {
    assert.deepEqual(
      decision.proposal.steps.map((step) => step.id),
      ['dup-step', 'dup-step-2'],
    );
  }
  assert.match(decision.transcript[1]?.summary ?? '', /parser=remote_fenced_json/);
});

test('phaseOnline/remote-llm: backend falls back deterministically when remote schema is invalid', async () => {
  const backend = new RemoteLlmCognitionBackend({
    profile: {
      providerId: 'xai',
      modelId: 'grok-4.20-beta-latest-non-reasoning',
      baseUrl: 'https://api.x.ai/v1',
      apiKeySecretRef: 'env:XAI_API_KEY',
      store: false,
    },
    secretResolver: new EnvironmentSecretResolver({ XAI_API_KEY: 'xai-test-key' }),
    fetchImpl: async () => new Response(JSON.stringify({
      output_text: JSON.stringify({
        type: 'proposal',
        steps: [
          { id: 'broken-step', description: '   ', capability: 'workflow:submit' },
        ],
      }),
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });

  const decision = await backend.decide({
    connectivityStatus: 'online',
    intent: {
      id: 'intent-online-invalid-schema-1',
      timestamp: new Date().toISOString(),
      actorId: 'phase-online-user',
      correlationId: 'corr-online-invalid-schema-1',
      schemaVersion: 'v1',
      intentType: 'task.create',
      payload: { title: 'fallback task' },
    },
    memoryView,
  });

  assert.equal(decision.proposal.type, 'proposal');
  if (decision.proposal.type === 'proposal') {
    assert.equal(decision.proposal.steps[0].description, "Create task 'fallback task'");
  }
  assert.match(decision.transcript[1]?.summary ?? '', /parser=deterministic_fallback/);
  assert.match(decision.transcript[1]?.summary ?? '', /issue=invalid_remote_schema/);
});

test('phaseOnline/remote-llm: backend surfaces response status and body on HTTP failures', async () => {
  const backend = new RemoteLlmCognitionBackend({
    profile: {
      providerId: 'xai',
      modelId: 'grok-4.20-beta-latest-non-reasoning',
      baseUrl: 'https://api.x.ai/v1',
      apiKeySecretRef: 'env:XAI_API_KEY',
      store: false,
    },
    secretResolver: new EnvironmentSecretResolver({ XAI_API_KEY: 'xai-test-key' }),
    fetchImpl: async () => new Response(
      JSON.stringify({ error: { message: 'rate limited' } }),
      { status: 429, statusText: 'Too Many Requests', headers: { 'content-type': 'application/json' } },
    ),
  });

  await assert.rejects(
    () => backend.decide({
      connectivityStatus: 'online',
      intent: {
        id: 'intent-online-http-failure-1',
        timestamp: new Date().toISOString(),
        actorId: 'phase-online-user',
        correlationId: 'corr-online-http-failure-1',
        schemaVersion: 'v1',
        intentType: 'task.create',
        payload: { title: 'status failure' },
      },
      memoryView,
    }),
    /remote-LLM request failed .* status 429 Too Many Requests; body=\{"error":\{"message":"rate limited"\}\}/,
  );
});

test('phaseOnline/remote-llm: backend rejects malformed JSON payloads from the responses API', async () => {
  const backend = new RemoteLlmCognitionBackend({
    profile: {
      providerId: 'xai',
      modelId: 'grok-4.20-beta-latest-non-reasoning',
      baseUrl: 'https://api.x.ai/v1',
      apiKeySecretRef: 'env:XAI_API_KEY',
      store: false,
    },
    secretResolver: new EnvironmentSecretResolver({ XAI_API_KEY: 'xai-test-key' }),
    fetchImpl: async () => new Response(
      '{"output_text":',
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  });

  await assert.rejects(
    () => backend.decide({
      connectivityStatus: 'online',
      intent: {
        id: 'intent-online-invalid-json-1',
        timestamp: new Date().toISOString(),
        actorId: 'phase-online-user',
        correlationId: 'corr-online-invalid-json-1',
        schemaVersion: 'v1',
        intentType: 'task.create',
        payload: { title: 'malformed response' },
      },
      memoryView,
    }),
    /remote-LLM response was not valid JSON/,
  );
});

test('phaseOnline/remote-llm: backend forwards env proxy configuration to fetch when present', async () => {
  const originalHttpsProxy = process.env.HTTPS_PROXY;
  process.env.HTTPS_PROXY = 'http://proxy.internal:8080';

  let sawDispatcher = false;

  try {
    const backend = new RemoteLlmCognitionBackend({
      profile: {
        providerId: 'xai',
        modelId: 'grok-4.20-beta-latest-non-reasoning',
        baseUrl: 'https://api.x.ai/v1',
        apiKeySecretRef: 'env:XAI_API_KEY',
        store: false,
      },
      secretResolver: new EnvironmentSecretResolver({ XAI_API_KEY: 'xai-test-key' }),
      fetchImpl: async (_input, init) => {
        sawDispatcher = Boolean((init as Record<string, unknown> | undefined)?.dispatcher);
        return new Response(JSON.stringify({
          output_text: JSON.stringify({ type: 'no_action', reason: 'proxy path used' }),
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });

    await backend.decide({
      connectivityStatus: 'online',
      intent: {
        id: 'intent-online-proxy-1',
        timestamp: new Date().toISOString(),
        actorId: 'phase-online-user',
        correlationId: 'corr-online-proxy-1',
        schemaVersion: 'v1',
        intentType: 'task.create',
        payload: { title: 'proxy support' },
      },
      memoryView,
    });
  } finally {
    if (originalHttpsProxy === undefined) {
      delete process.env.HTTPS_PROXY;
    } else {
      process.env.HTTPS_PROXY = originalHttpsProxy;
    }
  }

  assert.equal(sawDispatcher, true);
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
