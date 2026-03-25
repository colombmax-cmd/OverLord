import test from 'node:test';
import assert from 'node:assert/strict';

import { EnvironmentSecretResolver } from '../src/secrets/env-resolver.ts';
import { readRemoteLlmProviderProfileFromEnv } from '../src/cognition/provider-config.ts';
import { RemoteLlmCognitionBackend } from '../src/cognition/remote-llm-backend.ts';

const profile = readRemoteLlmProviderProfileFromEnv({
  ...process.env,
  OVERLORD_REMOTE_LLM_PROVIDER: process.env.OVERLORD_REMOTE_LLM_PROVIDER,
  OVERLORD_REMOTE_LLM_MODEL: process.env.OVERLORD_REMOTE_LLM_MODEL,
  OVERLORD_REMOTE_LLM_STORE: process.env.OVERLORD_REMOTE_LLM_STORE ?? '0',
});
const secretResolver = new EnvironmentSecretResolver(process.env);


function hasProxyEnv(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.HTTPS_PROXY?.trim()
      || env.https_proxy?.trim()
      || env.HTTP_PROXY?.trim()
      || env.http_proxy?.trim(),
  );
}

async function canLoadUndici(): Promise<boolean> {
  try {
    await import('undici');
    return true;
  } catch {
    return false;
  }
}

test('remote-llm/live: backend can reach the configured remote-LLM with env configuration', async (t) => {
  if (process.env.RUN_LIVE_LLM_TESTS !== '1') {
    t.skip('set RUN_LIVE_LLM_TESTS=1 to enable live remote-LLM smoke tests');
    return;
  }

  if (hasProxyEnv(process.env) && !(await canLoadUndici())) {
    t.skip('proxy environment detected but undici is unavailable to provide proxy dispatch support for live smoke tests');
    return;
  }

  if (!profile) {
    t.skip('set OVERLORD_REMOTE_LLM_PROVIDER or provide a supported provider secret to enable live remote-LLM smoke tests');
    return;
  }

  try {
    await secretResolver.resolve(profile.apiKeySecretRef);
  } catch (error) {
    t.skip(`configure ${profile.apiKeySecretRef} so the selected remote provider can authenticate: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const backend = new RemoteLlmCognitionBackend({
    profile,
    secretResolver,
  });

  const decision = await backend.decide({
    connectivityStatus: 'online',
    intent: {
      id: 'intent-remote-llm-live-1',
      timestamp: new Date().toISOString(),
      actorId: 'live-user',
      correlationId: 'corr-remote-llm-live-1',
      schemaVersion: 'v1',
      intentType: 'task.create',
      payload: { title: 'live smoke task' },
    },
    memoryView: {
      request: {
        userId: 'live-user',
        agentId: 'overlord-runtime',
        sessionId: 'corr-remote-llm-live-1',
        capability: 'intent:read',
        scope: ['intent:live-user'],
        reason: 'live remote-LLM smoke test',
      },
      decision: 'allow',
      effectiveScopes: ['intent:live-user'],
      deniedScopes: [],
      context: { 'intent:live-user': { events: [] } },
      timestampMs: Date.now(),
    },
  });

  assert.equal(decision.backendKind, 'remote');
  assert.equal(decision.selectedModel.modelId, profile.modelId);
  assert.ok(['proposal', 'clarification', 'scope_request', 'no_action'].includes(decision.proposal.type));
});
