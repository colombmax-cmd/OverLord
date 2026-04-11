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
});
