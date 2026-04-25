import test from 'node:test';
import assert from 'node:assert/strict';

import { startIntentWebServer } from '../src/web/intent-web-server.ts';

test('intent-web-server: serves health, models and intent run endpoints', async () => {
  const captured: Array<Record<string, unknown>> = [];
  const server = await startIntentWebServer({
    orchestrator: {
      async processRawIntent(rawIntent: Record<string, unknown>) {
        captured.push(rawIntent);
        return {
          outcome: 'proposal',
          plan: {
            id: 'p1',
            timestamp: new Date().toISOString(),
            actorId: 'user-1',
            correlationId: 'corr-web-1',
            schemaVersion: 'v1',
            intentId: 'intent-web-1',
            steps: [],
            planVersion: 1,
            frozenAt: new Date().toISOString(),
            planHash: 'hash-web-1',
          },
          steps: [],
          cognition: {
            backendKind: 'local',
            connectivityStatus: 'offline',
            modelId: 'Qwen/Qwen2.5-1.5B-Instruct',
            proposalType: 'proposal',
            selectedBackend: 'local',
            transcriptLength: 1,
            routeReason: 'test route',
            requestedPreference: 'auto',
            attemptedBackends: ['local'],
            fallbackApplied: false,
          },
        };
      },
    } as never,
    connectivityProbe: {
      getStatus() {
        return 'offline';
      },
    },
    platform: {
      async readAllEvents() {
        return [];
      },
    } as never,
  }, { port: 8899 });

  try {
    const health = await fetch('http://127.0.0.1:8899/api/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { connectivity: 'offline' });

    const models = await fetch('http://127.0.0.1:8899/api/models');
    assert.equal(models.status, 200);
    const modelData = await models.json() as { localDefaultModelId: string };
    assert.equal(typeof modelData.localDefaultModelId, 'string');

    const run = await fetch('http://127.0.0.1:8899/api/intent/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'web ux intent',
        cognitiveOnly: true,
        cognitionPreference: 'local',
      }),
    });
    assert.equal(run.status, 200);
    const runData = await run.json() as { runId: string; result: { outcome: string } };
    assert.equal(runData.result.outcome, 'proposal');
    assert.equal(runData.runId, 'corr-web-1');

    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0], {
      actorId: 'user-1',
      intentType: 'task.create',
      payload: {
        title: 'web ux intent',
        cognitionPreference: 'local',
        sessionMode: 'cognitive',
        cognitiveOnly: true,
      },
    });
  } finally {
    await server.close();
  }
});
