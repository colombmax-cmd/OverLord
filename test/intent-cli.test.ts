import test from 'node:test';
import assert from 'node:assert/strict';

import { runIntentCli } from '../src/cli/intent-cli.ts';

function createIo() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      stdout(message: string) {
        out.push(message);
      },
      stderr(message: string) {
        err.push(message);
      },
    },
  };
}

test('intent-cli: pretty mode renders proposal summary for cognitive-only run', async () => {
  const { out, err, io } = createIo();
  let receivedIntent: Record<string, unknown> | null = null;

  const exitCode = await runIntentCli(
    ['--title', 'alpha ux', '--cognitive-only', 'true'],
    io,
    {
      async executeIntent(rawIntent) {
        receivedIntent = rawIntent;
        return {
          outcome: 'proposal',
          steps: [{ id: 's1', description: 'step 1', capability: 'workflow:submit' }],
          plan: {
            id: 'p1',
            timestamp: new Date().toISOString(),
            actorId: rawIntent.actorId,
            correlationId: 'corr-1',
            schemaVersion: 'v1',
            intentId: 'intent-1',
            steps: [{ id: 's1', description: 'step 1', capability: 'workflow:submit' }],
            planVersion: 1,
            frozenAt: new Date().toISOString(),
            planHash: 'hash-1',
          },
          cognition: {
            backendKind: 'local',
            connectivityStatus: 'offline',
            modelId: 'Qwen/Qwen2.5-1.5B-Instruct',
            proposalType: 'proposal',
            selectedBackend: 'local',
            transcriptLength: 2,
            routeReason: 'auto routing defaults to local-first cognition',
            requestedPreference: 'auto',
            attemptedBackends: ['local'],
            fallbackApplied: false,
          },
        };
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(err.length, 0);
  assert.match(out.join('\n'), /Outcome: proposal/);
  assert.match(out.join('\n'), /Outcome label: PROPOSAL_READY/);
  assert.match(out.join('\n'), /Session mode: cognitive-only/);
  assert.match(out.join('\n'), /Connectivity: offline/);
  assert.match(out.join('\n'), /Routing badge: LOCAL/);
  assert.match(out.join('\n'), /Model panel/);
  assert.match(out.join('\n'), /Local default: Qwen\/Qwen2.5-1.5B-Instruct/);
  assert.deepEqual(receivedIntent, {
    actorId: 'user-1',
    intentType: 'task.create',
    payload: {
      title: 'alpha ux',
      sessionMode: 'cognitive',
      cognitiveOnly: true,
    },
  });
});

test('intent-cli: json mode prints machine-readable result', async () => {
  const { out, err, io } = createIo();

  const exitCode = await runIntentCli(
    ['--title', 'json mode', '--output', 'json'],
    io,
    {
      async executeIntent() {
        return { outcome: 'no_action', reason: 'test json output' };
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(err.length, 0);
  const rendered = JSON.parse(out[0] ?? '{}') as Record<string, unknown>;
  assert.equal(rendered.outcome, 'no_action');
  assert.equal(rendered.reason, 'test json output');
});

test('intent-cli: validates required title unless no-action is requested', async () => {
  const { out, err, io } = createIo();

  const exitCode = await runIntentCli(
    ['--output', 'pretty'],
    io,
    {
      async executeIntent() {
        return { outcome: 'no_action', reason: 'unused' };
      },
    },
  );

  assert.equal(exitCode, 1);
  assert.equal(out.length, 0);
  assert.match(err.join('\n'), /missing required flag --title/);
  assert.match(err.join('\n'), /Usage:/);
});

test('intent-cli: pretty mode can append timeline view', async () => {
  const { out, err, io } = createIo();

  const exitCode = await runIntentCli(
    ['--title', 'timeline mode', '--show-timeline', 'true'],
    io,
    {
      async executeIntent() {
        return {
          outcome: 'workflow_submitted',
          workflowId: 'wf-1',
          workflowState: 'completed',
          plan: {
            id: 'p2',
            timestamp: new Date().toISOString(),
            actorId: 'user-1',
            correlationId: 'corr-2',
            schemaVersion: 'v1',
            intentId: 'intent-2',
            steps: [{ id: 's2', description: 'step 2', capability: 'workflow:submit' }],
            planVersion: 1,
            frozenAt: new Date().toISOString(),
            planHash: 'hash-2',
          },
        };
      },
      async readTimeline() {
        return {
          correlationId: 'corr-2',
          entries: [
            {
              at: new Date().toISOString(),
              source: 'audit',
              type: 'overlord.intent_received',
              summary: 'overlord.intent_received',
            },
          ],
        };
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(err.length, 0);
  assert.match(out.join('\n'), /Run Timeline \(corr-2\)/);
  assert.match(out.join('\n'), /\[audit\] overlord.intent_received/);
  assert.match(out.join('\n'), /:: overlord.intent_received/);
});

test('intent-cli: pretty mode highlights fallback guidance when fallback is applied', async () => {
  const { out, err, io } = createIo();
  const exitCode = await runIntentCli(
    ['--title', 'fallback test'],
    io,
    {
      async executeIntent() {
        return {
          outcome: 'no_action',
          reason: 'remote cognition unavailable while required by payload',
          cognition: {
            backendKind: 'local',
            connectivityStatus: 'offline',
            modelId: 'Qwen/Qwen2.5-1.5B-Instruct',
            proposalType: 'no_action',
            selectedBackend: 'local',
            transcriptLength: 3,
            routeReason: 'remote cognition required by payload but unavailable while not online',
            fallbackReason: 'remote cognition required by payload but unavailable while not online',
            requestedPreference: 'remote',
            attemptedBackends: ['remote', 'local'],
            fallbackApplied: true,
          },
        };
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.equal(err.length, 0);
  assert.match(out.join('\n'), /Fallback: yes/);
  assert.match(out.join('\n'), /Routing badge: FALLBACK:LOCAL/);
});
