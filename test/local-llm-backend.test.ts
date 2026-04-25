import test from 'node:test';
import assert from 'node:assert/strict';

import { LocalLlmCognitionBackend } from '../src/cognition/local-llm-backend.ts';
import { createDefaultLocalCognitionBackend } from '../src/cognition/default-local-backend.ts';

const context = {
  intent: {
    id: 'intent-local-1',
    timestamp: new Date().toISOString(),
    actorId: 'user-1',
    correlationId: 'corr-local-1',
    schemaVersion: 'v1',
    intentType: 'task.create',
    payload: { title: 'local llm' },
  },
  memoryView: {
    request: {
      userId: 'user-1',
      agentId: 'overlord',
      sessionId: 'session-1',
      capability: 'intent:read',
      scope: ['intent:user-1'],
      reason: 'test',
    },
    decision: 'allow' as const,
    effectiveScopes: ['intent:user-1'],
    deniedScopes: [],
    context: {},
    timestampMs: Date.now(),
  },
  connectivityStatus: 'offline' as const,
};

test('local-llm backend parses structured proposal response', async () => {
  const backend = new LocalLlmCognitionBackend({
    env: {
      OVERLORD_LOCAL_LLM_BASE_URL: 'http://local-llm:11434',
      OVERLORD_LOCAL_LLM_MODEL: 'qwen2.5:1.5b-instruct',
    },
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.model, 'qwen2.5:1.5b-instruct');
      return new Response(JSON.stringify({
        response: JSON.stringify({
          type: 'proposal',
          steps: [{ id: 's1', description: 'Créer la tâche', capability: 'workflow:submit' }],
        }),
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const decision = await backend.decide(context);
  assert.equal(decision.backendKind, 'local');
  assert.equal(decision.proposal.type, 'proposal');
  if (decision.proposal.type === 'proposal') {
    assert.equal(decision.proposal.steps.length, 1);
  }
});

test('local-llm backend accepts fenced JSON responses', async () => {
  const backend = new LocalLlmCognitionBackend({
    env: {
      OVERLORD_LOCAL_LLM_BASE_URL: 'http://local-llm:11434',
      OVERLORD_LOCAL_LLM_MODEL: 'qwen2.5:1.5b-instruct',
    },
    fetchImpl: async () => new Response(JSON.stringify({
      response: [
        '```json',
        '{"type":"no_action","reason":"fenced"}',
        '```',
      ].join('\n'),
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });

  const decision = await backend.decide(context);
  assert.equal(decision.proposal.type, 'no_action');
  if (decision.proposal.type === 'no_action') {
    assert.equal(decision.proposal.reason, 'fenced');
  }
});

test('local-llm backend retries once before succeeding', async () => {
  let attempts = 0;
  const backend = new LocalLlmCognitionBackend({
    env: {
      OVERLORD_LOCAL_LLM_BASE_URL: 'http://local-llm:11434',
      OVERLORD_LOCAL_LLM_MODEL: 'qwen2.5:1.5b-instruct',
      OVERLORD_LOCAL_LLM_RETRY_MAX: '1',
      OVERLORD_LOCAL_LLM_RETRY_BACKOFF_MS: '1',
    },
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('connect ECONNREFUSED');
      }

      return new Response(JSON.stringify({
        response: '{"type":"no_action","reason":"retry-ok"}',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const decision = await backend.decide(context);
  assert.equal(attempts, 2);
  assert.equal(decision.proposal.type, 'no_action');
});

test('local-llm backend fails with normalized timeout error when request exceeds timeout', async () => {
  const backend = new LocalLlmCognitionBackend({
    env: {
      OVERLORD_LOCAL_LLM_BASE_URL: 'http://local-llm:11434',
      OVERLORD_LOCAL_LLM_MODEL: 'qwen2.5:1.5b-instruct',
      OVERLORD_LOCAL_LLM_TIMEOUT_MS: '5',
      OVERLORD_LOCAL_LLM_RETRY_MAX: '0',
    },
    fetchImpl: async (_input, init) => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      if (init?.signal && 'aborted' in init.signal && init.signal.aborted) {
        const timeoutError = new Error('aborted');
        timeoutError.name = 'AbortError';
        throw timeoutError;
      }

      return new Response(JSON.stringify({ response: '{"type":"no_action","reason":"late"}' }), { status: 200 });
    },
  });

  await assert.rejects(
    () => backend.decide(context),
    /local-llm runtime request failed.*timeout/i,
  );
});

test('local-llm backend exposes nested fetch cause details in runtime errors', async () => {
  const backend = new LocalLlmCognitionBackend({
    env: {
      OVERLORD_LOCAL_LLM_BASE_URL: 'http://local-llm:11434',
      OVERLORD_LOCAL_LLM_MODEL: 'qwen2.5:1.5b-instruct',
      OVERLORD_LOCAL_LLM_RETRY_MAX: '0',
    },
    fetchImpl: async () => {
      throw new Error('fetch failed', { cause: new Error('ECONNREFUSED 127.0.0.1:11434') });
    },
  });

  await assert.rejects(
    () => backend.decide(context),
    /local-llm runtime request failed.*ECONNREFUSED 127.0.0.1:11434/i,
  );
});

test('default local backend falls back deterministically when local runtime fails', async () => {
  const backend = createDefaultLocalCognitionBackend({
    OVERLORD_LOCAL_LLM_ENABLED: '1',
    OVERLORD_LOCAL_LLM_BASE_URL: 'http://local-llm:11434',
    OVERLORD_LOCAL_LLM_MODEL: 'qwen2.5:1.5b-instruct',
  });

  const failingBackend = backend as unknown as { decide(ctx: typeof context): Promise<unknown> };
  // monkey patch runtime fetch path through prototype by replacing global fetch is not needed;
  // instead assert fallback by invoking with unreachable endpoint.
  const decision = await failingBackend.decide(context) as { proposal: { type: string }; transcript: Array<{ summary: string }> };
  assert.equal(decision.proposal.type, 'proposal');
  assert.ok(decision.transcript.some((entry) => entry.summary.includes('fallback activated')));
  const routeAwareDecision = decision as unknown as { route: { fallbackApplied: boolean; reason: string } };
  assert.equal(routeAwareDecision.route.fallbackApplied, true);
  assert.match(routeAwareDecision.route.reason, /local runtime fallback:/);
});
